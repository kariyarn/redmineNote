"""자동 가져오기 서버 로직 시험 (임시 데이터 · 가짜 가져오기만 사용).  실행: python tests/test_autosync.py <프로젝트 폴더>"""
import os, sys, tempfile, json, datetime as D
os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
os.environ["REDMINE_NOTES_NO_APPWIN"] = "1"
sys.path.insert(0, sys.argv[1])   # 프로젝트 폴더(rnotes 가 있는 곳)
from rnotes import storage, autosync as A, config
from rnotes import holiday_api as HA
def no_network(url):
    raise AssertionError("시험에서 실제 공휴일 API 를 부르면 안 돼요")
HA._http_get = no_network
from rnotes.redmine import SyncError
storage.init_db()
ok = fail = 0
def t(name, cond):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name)
def put(**kv):
    with storage.db() as c:
        for k, v in kv.items():
            c.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, str(v)))
def last_sync(at):
    put(last_sync=json.dumps({"at": at.strftime("%Y-%m-%d %H:%M"), "from": "", "to": ""}))
NOON = D.datetime(2026, 10, 13, 12, 0)

# 1. 설정값 읽기: 간격(분)은 0 = 끔, 1~4 는 5, 최대 1440 / 기간(일)은 1~7, 비었거나 잘못되면 7
t("interval", [A.interval_min({"auto_sync_min": v}) for v in ("", "0", "3", "10", "99999", "abc", "-5")] == [0, 0, 5, 10, 1440, 0, 0])
t("interval missing", A.interval_min({}) == 0)
t("days", [A.range_days({"auto_sync_days": v}) for v in ("", "1", "3", "9", "0", "x")] == [7, 1, 3, 7, 7, 7] and A.range_days({}) == 7)
# 2. 업무 시간 08:30 ~ 18:30
t("window", [A.in_window(NOON.replace(hour=h, minute=m)) for h, m in ((8, 29), (8, 30), (12, 0), (18, 30), (18, 31), (23, 0))] == [False, True, True, True, False, False])

# 3. 할 때인가
put(auto_sync_min="5")
t("not configured -> no", not A.due(NOON, storage.get_settings()) and not A.enabled())
config.conn.url, config.conn.key = "http://127.0.0.1:1", "test-key"   # 연결된 것으로 (실제로 부르지 않는다)
t("never synced -> no", not A.due(NOON, storage.get_settings()))
t("enabled when interval set", A.enabled())
last_sync(NOON - D.timedelta(minutes=10))
t("due after interval", A.due(NOON, storage.get_settings()))
t("not due before interval", not A.due(NOON - D.timedelta(minutes=6), storage.get_settings()))
t("not due outside work hours", not A.due(NOON.replace(hour=19), storage.get_settings()) and not A.due(NOON.replace(hour=7), storage.get_settings()))
put(auto_sync_min="0")
t("off -> no", not A.due(NOON, storage.get_settings()) and not A.enabled())
put(auto_sync_min="5")

# 4. 한 번 가져오기: 기간은 최근 N일, 결과는 번호(seq)를 붙여 쌓는다
calls = []
def fake_sync(f, to):
    calls.append((f, to))
    return {"added_ids": [11], "changed_ids": [22, 33], "failed": [], "aborted": None}
A.sync = fake_sync
put(auto_sync_days="3")
r = A.run_once(NOON)
t("run range = 최근 3일", calls == [("2026-10-11", "2026-10-13")])
t("run result", r and r["seq"] == 1 and r["added_ids"] == [11] and r["changed_ids"] == [22, 33] and r["error"] == "")
t("no retry right after a try", A.run_once(NOON + D.timedelta(minutes=1)) is None and len(calls) == 1)
put(auto_sync_days="1")
r2 = A.run_once(NOON + D.timedelta(minutes=6))
t("today only when days=1", calls[-1] == ("2026-10-13", "2026-10-13") and r2["seq"] == 2)

# 5. 실패해도 결과로 남기고, 간격마다 한 번만 다시 시도
def bad_sync(f, to):
    raise SyncError("'담당자' 목록을 가져오지 못했어요 — 레드마인에 연결할 수 없어요. VPN·네트워크를 확인하고 다시 가져오세요")
A.sync = bad_sync
r3 = A.run_once(NOON + D.timedelta(minutes=12))
t("error kept", r3 and r3["seq"] == 3 and "가져오지 못했어요" in r3["error"] and r3["added_ids"] == [])
t("error: wait an interval", A.run_once(NOON + D.timedelta(minutes=13)) is None)

# 6. 다른 가져오기가 돌고 있으면 기다리지 않고 건너뛴다
A.sync = fake_sync
with A.SYNC_LOCK:
    t("skip while another sync runs", A.run_once(NOON + D.timedelta(minutes=30)) is None)

# 7. 화면용 상태: since 뒤의 결과만, 다음 예정 시각은 업무 시간 안으로
st = A.status(None, NOON)
t("status without since has no runs", st["runs"] == [] and st["seq"] == 3 and st["enabled"] and st["minutes"] == 5 and st["days"] == 1 and st["window"] == ["08:30", "18:30"])
t("status since", [x["seq"] for x in A.status(0, NOON)["runs"]] == [1, 2, 3] and [x["seq"] for x in A.status(2, NOON)["runs"]] == [3])
A._STATE["try"] = 0
last_sync(D.datetime(2026, 10, 13, 12, 0)); put(auto_sync_min="30")
t("next in window", A.next_at(D.datetime(2026, 10, 13, 12, 10), storage.get_settings()) == D.datetime(2026, 10, 13, 12, 30))
last_sync(D.datetime(2026, 10, 13, 18, 20))
t("next after window -> tomorrow 08:30", A.next_at(D.datetime(2026, 10, 13, 18, 25), storage.get_settings()) == D.datetime(2026, 10, 14, 8, 30))
last_sync(D.datetime(2026, 10, 12, 18, 0))
t("next before window -> today 08:30", A.next_at(D.datetime(2026, 10, 13, 7, 0), storage.get_settings()) == D.datetime(2026, 10, 13, 8, 30))
put(auto_sync_min="0")
t("next when off", A.next_at(NOON, storage.get_settings()) is None and A.status(None, NOON)["next"] == "")

# 8. 켜져 있으면 창이 없어도 서버가 스스로 꺼지지 않는다 (자동 종료 감시가 같은 판단을 쓴다)
from rnotes import lifecycle
put(auto_sync_min="10")
t("idle watchdog keeps server while enabled", lifecycle.autosync_enabled() is True)
put(auto_sync_min="0")
t("idle watchdog may stop when off", lifecycle.autosync_enabled() is False)

# 9. 토 · 일 · 공휴일은 쉰다 (내장 공휴일 표 · 설정의 추가 휴일 · 공휴일 API 로 받은 날)
put(auto_sync_min="5"); A._STATE["try"] = 0
def due_at(y, m, d, h=12):
    now = D.datetime(y, m, d, h, 0); last_sync(now - D.timedelta(minutes=10)); return A.due(now, storage.get_settings())
t("weekday due", due_at(2026, 10, 14))
t("saturday / sunday off", not due_at(2026, 10, 17) and not due_at(2026, 10, 18))
t("built-in holiday off (한글날)", not due_at(2026, 10, 9))
put(holiday_extra="2026-10-14")
t("extra holiday off", not due_at(2026, 10, 14))
put(holiday_extra="")
last_sync(D.datetime(2026, 10, 16, 18, 20)); put(auto_sync_min="30")
t("next skips weekend -> monday 08:30", A.next_at(D.datetime(2026, 10, 16, 18, 25), storage.get_settings()) == D.datetime(2026, 10, 19, 8, 30))
put(holiday_extra="2026-10-19")
t("next skips weekend + holiday -> tuesday", A.next_at(D.datetime(2026, 10, 16, 18, 25), storage.get_settings()) == D.datetime(2026, 10, 20, 8, 30))
put(holiday_extra="", auto_sync_min="5")

# 10. 공휴일 API 응답 읽기 (실제 API 는 부르지 않는다: 가짜 _http_get)
def item(ds, name, hol="Y"):
    return {"dateKind": "01", "dateName": name, "isHoliday": hol, "locdate": int(ds.replace("-", "")), "seq": 1}
def ok_json(items):
    body = {"items": {"item": items}} if items != "" else {"items": ""}
    return 200, json.dumps({"response": {"header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."}, "body": body}}).encode()
t("parse list (공휴일 아닌 날은 표시만)", HA._parse(*ok_json([item("2026-10-03", "개천절"), item("2026-10-15", "기념일", "N")])) == [("2026-10-03", "개천절", True), ("2026-10-15", "기념일", False)])
t("parse single object", HA._parse(*ok_json(item("2026-10-09", "한글날"))) == [("2026-10-09", "한글날", True)])
t("parse empty items", HA._parse(*ok_json("")) == [])
xml_ok = "<response><header><resultCode>00</resultCode></header><body><items><item><dateName>추석</dateName><isHoliday>Y</isHoliday><locdate>20260925</locdate></item></items></body></response>"
t("parse xml", HA._parse(200, xml_ok.encode()) == [("2026-09-25", "추석", True)])
def err(code, status, msg="SERVICE ERROR"):
    return status, json.dumps({"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"errMsg": msg, "returnAuthMsg": "x", "returnReasonCode": code}}}).encode()
def raises(fn, *a):
    try: fn(*a); return ""
    except HA.HolidayApiError as e: return str(e)
t("auth error message", "인증키가 거절됐어요" in raises(HA._parse, *err("30", 403, "SERVICE_KEY_IS_NOT_REGISTERED_ERROR")))
t("limit error message", "호출 한도" in raises(HA._parse, *err("22", 200)))
t("xml error message", "인증키가 거절됐어요" in raises(HA._parse, 200, b"<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"))
t("http error without body", "HTTP 500" in raises(HA._parse, 500, b""))

# 11. 인증키: 코드에 고정 (사용자가 넣지 않음). 시험에서는 환경 변수로 바꿔 쓴다. 화면으로는 돌려주지 않음
t("built-in key", bool(HA.SERVICE_KEY) and HA.has_key() and HA._read_key() == HA.SERVICE_KEY)
os.environ["REDMINE_NOTES_HOLIDAY_KEY"] = ""
t("no key -> no fetch", not HA.has_key() and HA.maybe_fetch_week(D.datetime(2026, 10, 6, 9, 0)) is None)
os.environ["REDMINE_NOTES_HOLIDAY_KEY"] = "test-holiday-key-0123456789"   # 가짜 _http_get 에만 간다
st = json.dumps(HA.status(D.datetime(2026, 10, 6, 9, 0)), ensure_ascii=False)
t("status never returns the key", "test-holiday-key" not in st and HA.SERVICE_KEY not in st and HA.status()["key_set"] is True)

# 12. 매주 첫 영업일에 그 주(월 ~ 일)만: 2026-10-05(월)는 대체공휴일이라 화요일에 받는다. 두 달에 걸친 주는 두 번 부른다
urls = []   # 공휴일 API 호출 (가짜 sync 의 urls 와 따로)
def fake_get(url):
    urls.append(url)
    q = dict(x.split("=", 1) for x in url.split("?", 1)[1].split("&"))
    y, m = int(q["solYear"]), int(q["solMonth"])
    data = {(2026, 9): [item("2026-09-30", "가짜 9월 공휴일"), item("2026-09-24", "주 밖")], (2026, 10): [item("2026-10-01", "가짜 10월 공휴일"), item("2026-10-08", "다음 주 가짜 공휴일")]}
    return ok_json(data.get((y, m), ""))
HA._http_get = fake_get
t("monday holiday -> not first business day", HA.maybe_fetch_week(D.datetime(2026, 10, 5, 9, 0)) is None and urls == [])
got = HA.maybe_fetch_week(D.datetime(2026, 10, 6, 9, 0))
t("fetched on tuesday (first business day)", got == {"2026-10-08": "다음 주 가짜 공휴일"} and len(urls) == 1 and "serviceKey=test-holiday-key-0123456789" in urls[0])
t("once per week", HA.maybe_fetch_week(D.datetime(2026, 10, 7, 9, 0)) is None and len(urls) == 1)
t("fetched holiday stops auto fetch", not due_at(2026, 10, 8))
urls.clear()
t("week across two months", HA.fetch_week(D.date(2026, 9, 28)) == {"2026-09-30": "가짜 9월 공휴일", "2026-10-01": "가짜 10월 공휴일"} and len(urls) == 2)
st = HA.status(D.datetime(2026, 10, 7, 9, 0))
t("status shows this week", st["key_set"] and st["fetched"] and st["week"] == ["2026-10-05", "2026-10-11"] and st["days"] == [{"date": "2026-10-08", "name": "다음 주 가짜 공휴일"}] and st["error"] == "")

# 13. 받지 못하면 이유를 남기고 1시간 뒤에 다시, 그 사이에는 내장 표로
def down(url):
    raise HA.HolidayApiError("공휴일 API 에 연결할 수 없어요 — 네트워크를 확인하세요 (다음에 다시 시도해요)")
HA._http_get = down
t("failure -> None", HA.maybe_fetch_week(D.datetime(2026, 10, 12, 9, 0)) is None)
st = HA.status(D.datetime(2026, 10, 12, 9, 0))
t("failure reason kept", "연결할 수 없어요" in st["error"] and not st["fetched"])
HA._http_get = fake_get; urls.clear()
t("no retry within an hour", HA.maybe_fetch_week(D.datetime(2026, 10, 12, 9, 30)) is None and urls == [])
t("retry after an hour", HA.maybe_fetch_week(D.datetime(2026, 10, 12, 10, 5)) == {} and len(urls) == 1 and HA.status(D.datetime(2026, 10, 12, 10, 5))["error"] == "")
# 인증키를 바꾸면(재발급) 예전 키의 실패 기록 · 오류는 잊고 1시간을 기다리지 않고 바로 다시 받는다
HA._http_get = down
t("failure again", HA.maybe_fetch_week(D.datetime(2026, 11, 2, 9, 0)) is None and "연결할 수 없어요" in HA.status(D.datetime(2026, 11, 2, 9, 0))["error"])
HA._http_get = fake_get; urls.clear()
t("same key -> still waits an hour", HA.maybe_fetch_week(D.datetime(2026, 11, 2, 9, 10)) is None and urls == [])
os.environ["REDMINE_NOTES_HOLIDAY_KEY"] = "test-holiday-key-reissued"
t("new key -> old error hidden", HA.status(D.datetime(2026, 11, 2, 9, 10))["error"] == "")
t("new key -> fetch right away", HA.maybe_fetch_week(D.datetime(2026, 11, 2, 9, 11)) == {} and len(urls) == 1 and "serviceKey=test-holiday-key-reissued" in urls[0])
os.environ["REDMINE_NOTES_HOLIDAY_KEY"] = "test-holiday-key-0123456789"

# 14. tick: 켜져 있고 업무 시간이면 공휴일을 먼저 받고(그 주에 처음) 가져올 때면 가져온다
HA._http_get = fake_get; urls.clear(); A._STATE["try"] = 0; A.sync = fake_sync
put(auto_sync_min="5"); last_sync(D.datetime(2026, 10, 20, 9, 0))
r = A.tick(D.datetime(2026, 10, 20, 9, 30))   # 화요일: 이 주(10-19 ~)는 아직 안 받았다
t("tick fetches holidays then syncs", len(urls) == 1 and r and r["error"] == "")
t("status has holiday info", A.status(None, D.datetime(2026, 10, 20, 9, 31))["holiday"]["fetched"])

# 15. 새 일감 알림: 결과에 새 일감(번호 · 제목)을 담고, 창이 안 보이면 트레이 말풍선. 창이 보이면 화면이 알림 창을 띄우므로 말풍선 없음
with storage.db() as c:
    for i, sub in ((501, "새 일감 하나"), (502, "새 일감 둘")):
        c.execute("INSERT OR REPLACE INTO notes (issue_id, subject, project, roles, journals, updated_on) VALUES (?,?,?,?,?,?)", (i, sub, "[DR] 시험", "담당자", "[]", "2026-10-21T00:00:00Z"))
balloons = []
class FakeTray:
    @staticmethod
    def balloon(title, text): balloons.append((title, text))
config.RUN.tray = FakeTray
A.sync = lambda f, to: {"added_ids": [501, 502], "changed_ids": [], "failed": [], "aborted": None}
def run_at(minute, poll_ago, hidden, notify="1"):
    put(auto_sync_notify=notify); A._STATE["try"] = 0; last_sync(D.datetime(2026, 10, 21, 9, 0))
    config.STATE["alarm_poll"] = __import__("time").time() - poll_ago; config.STATE["alarm_hidden"] = hidden
    balloons.clear(); return A.run_once(D.datetime(2026, 10, 21, 9, minute))
r = run_at(30, 600, False)
t("new issues in result", r["new"] == [{"id": 501, "subject": "새 일감 하나", "project": "[DR] 시험", "roles": "담당자"}, {"id": 502, "subject": "새 일감 둘", "project": "[DR] 시험", "roles": "담당자"}])
t("window closed (no signal) -> tray balloon", r["tray"] and balloons == [("🆕 새 레드마인 일감 2건", "#501 새 일감 하나 · #502 새 일감 둘")])
r = run_at(31, 5, True)
t("window minimized (hidden) -> tray balloon", r["tray"] and len(balloons) == 1)
r = run_at(32, 5, False)
t("window visible -> no balloon (page shows dialog)", not r["tray"] and balloons == [] and r["new"])
config.STATE["page_focus"] = False; balloons.clear(); A._STATE["try"] = 0; last_sync(D.datetime(2026, 10, 21, 9, 0)); config.STATE["alarm_poll"] = __import__("time").time()
r = A.run_once(D.datetime(2026, 10, 21, 9, 32)); config.STATE["page_focus"] = True
t("window visible but another app focused -> tray balloon", r["tray"] and len(balloons) == 1)
r = run_at(33, 600, False, notify="0")
t("notify off -> no balloon, still listed", not r["tray"] and balloons == [] and len(r["new"]) == 2 and A.status()["notify"] is False)
with storage.db() as c:
    c.execute("INSERT OR REPLACE INTO notes (issue_id, subject, project, roles, journals, updated_on) VALUES (?,?,?,?,?,?)", (503, "[운영서버 배포요청 / 2026-10-21]", "[IT개발본부] DevOps", "담당자,배포요청", "[]", "2026-10-21T00:00:00Z"))
A.sync = lambda f, to: {"added_ids": [501, 503], "changed_ids": [], "failed": [], "aborted": None}
r = run_at(34, 600, False)
t("deploy-request issue -> not in new list / balloon (deploy tab only)", [x["id"] for x in r["new"]] == [501] and balloons == [("🆕 새 레드마인 일감 1건", "#501 새 일감 하나")])
A.sync = lambda f, to: {"added_ids": [503], "changed_ids": [], "failed": [], "aborted": None}
r = run_at(35, 600, False)
t("only deploy-request issue new -> no balloon", r["new"] == [] and not r["tray"] and balloons == [])
config.RUN.tray = None
r = run_at(34, 600, False)
t("no tray (source run) -> no balloon, no error", not r["tray"] and r["error"] == "")
A.sync = lambda f, to: {"added_ids": [], "changed_ids": [501], "failed": [], "aborted": None}
r = run_at(35, 600, False)
t("only changes -> nothing to notify", r["new"] == [] and not r["tray"])

# 16. 트레이 알림(말풍선)을 누르면 아이콘을 누른 것처럼 창을 연다 (열려 있으면 앞으로)
if sys.platform == "win32":
    from rnotes import tray as TR
    opened = []
    TR._S["open"] = lambda: opened.append(1)
    TR._wndproc(None, TR.WM_TRAY, 0, TR.NIN_BALLOONUSERCLICK)
    TR._wndproc(None, TR.WM_TRAY, 0, TR.WM_LBUTTONUP)
    t("balloon click -> open window (same as icon click)", opened == [1, 1])
    TR._S["open"] = None
print("OK", ok, "FAIL", fail)
