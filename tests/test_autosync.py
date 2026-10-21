"""자동 가져오기 서버 로직 시험 (임시 데이터 · 가짜 가져오기만 사용).  실행: python tests/test_autosync.py <프로젝트 폴더>"""
import os, sys, tempfile, json, datetime as D
os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
os.environ["REDMINE_NOTES_NO_APPWIN"] = "1"
sys.path.insert(0, sys.argv[1])   # 프로젝트 폴더(rnotes 가 있는 곳)
from rnotes import storage, autosync as A, config
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

# 9. 토 · 일 · 공휴일은 쉰다 (내장 공휴일 표 · 설정의 추가 휴일만)
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

# 10. 공휴일 API 는 없다: 공휴일을 받아 오지 않고(tick 은 가져오기만), 화면에는 오늘 쉬는 날인지만 준다
import importlib.util
t("no holiday_api module", importlib.util.find_spec("rnotes.holiday_api") is None)
A._STATE["try"] = 0; A.sync = fake_sync
put(auto_sync_min="5"); last_sync(D.datetime(2026, 10, 20, 9, 0))
r = A.tick(D.datetime(2026, 10, 20, 9, 30))
t("tick syncs (no holiday fetch)", r and r["error"] == "")
t("status holiday = today_off only", A.status(None, D.datetime(2026, 10, 9, 9, 31))["holiday"] == {"today_off": True}
  and A.status(None, D.datetime(2026, 10, 20, 9, 31))["holiday"] == {"today_off": False})
with storage.db() as c:
    c.execute("INSERT OR REPLACE INTO settings (key,value) VALUES ('holiday_api','{\"weeks\":{}}')")
storage.init_db()
t("old fetched holidays are cleared on start", "holiday_api" not in storage.get_settings())

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

# 15-2. 바뀐 일감의 새 소식: 가져오기 전 수정 시각 뒤에 남이 단 댓글 · 변경만 (내 것 · 배포요청 일감은 빼고). 창이 안 보이면 오른쪽 아래 알림 창
config.STATE["me_id"], config.STATE["me_name"] = 7, "나개발"
J = [{"id": 1, "user": {"id": 9, "name": "김기획"}, "created_on": "2026-10-20T01:00:00Z", "notes": "예전 댓글"},
     {"id": 2, "user": {"id": 9, "name": "김기획"}, "created_on": "2026-10-21T01:00:00Z", "notes": "\n확인 부탁드려요\n둘째 줄"},
     {"id": 3, "user": {"id": 7, "name": "나개발"}, "created_on": "2026-10-21T02:00:00Z", "notes": "내가 단 댓글"}]
CH = [{"id": 4, "user": "박운영", "created_on": "2026-10-21T00:30:00Z", "items": [{"label": "상태", "old": "진행", "new": "완료"}]},
      {"id": 5, "user": "나개발", "created_on": "2026-10-21T03:00:00Z", "items": [{"label": "상태", "old": "접수", "new": "진행"}]}]
with storage.db() as c:
    c.execute("INSERT OR REPLACE INTO notes (issue_id, subject, project, roles, journals, changes, updated_on) VALUES (?,?,?,?,?,?,?)",
              (601, "댓글 달린 일감", "[DR] 시험", "담당자", json.dumps(J, ensure_ascii=False), json.dumps(CH, ensure_ascii=False), "2026-10-20T05:00:00Z"))
    c.execute("INSERT OR REPLACE INTO notes (issue_id, subject, project, roles, journals, changes, updated_on) VALUES (?,?,?,?,?,?,?)",
              (602, "내 댓글만", "[DR] 시험", "담당자", json.dumps(J[2:], ensure_ascii=False), "[]", "2026-10-20T05:00:00Z"))
act = A._activity([601, 602, 999], {601: "2026-10-20T05:00:00Z", 602: "2026-10-20T05:00:00Z"})
t("activity: others' new comment + change, mine excluded", act == [{"id": 601, "subject": "댓글 달린 일감", "who": "김기획", "text": "확인 부탁드려요", "count": 2}])
t("activity: no 'before' (new issue) -> none", A._activity([601], {}) == [])
t("activity: change text", A._activity([601], {601: "2026-10-21T00:00:00Z"})[0]["count"] == 2 and
  A._activity([601], {601: "2026-10-21T00:40:00Z"})[0]["text"] == "확인 부탁드려요")
shown_items = []
class FakePopup:
    ok = True
    @staticmethod
    def show(items, on_click=None): shown_items.append((items, on_click)); return FakePopup.ok
config.RUN.tray, config.RUN.popup = FakeTray, FakePopup
A.sync = lambda f, to: {"added_ids": [], "changed_ids": [601], "failed": [], "aborted": None}
with storage.db() as c:
    c.execute("UPDATE notes SET updated_on=? WHERE issue_id=601", ("2026-10-20T05:00:00Z",))
shown_items.clear(); r = run_at(40, 600, False)
t("changed issue with new comment -> popup (no balloon)", r["popup"] and not r["tray"] and balloons == [] and len(shown_items) == 1
  and shown_items[0][0] == [{"id": 601, "new": False, "head": "💬 김기획 외 1건", "title": "#601 댓글 달린 일감", "text": "확인 부탁드려요"}]
  and callable(shown_items[0][1]) and r["act"][0]["id"] == 601)
shown_items.clear(); r = run_at(41, 5, False)
t("window visible -> no popup", not r["popup"] and shown_items == [] and r["act"])
put(notify_popup="0"); shown_items.clear(); r = run_at(42, 600, False)
t("popup off -> balloon instead", not r["popup"] and r["tray"] and shown_items == [] and balloons == [("💬 새 댓글 2건", "#601 김기획: 확인 부탁드려요")])
put(notify_popup="1"); FakePopup.ok = False; r = run_at(43, 600, False)
t("popup failed -> balloon instead", not r["popup"] and r["tray"] and len(balloons) == 1)
FakePopup.ok = True
A.sync = lambda f, to: {"added_ids": [501], "changed_ids": [601], "failed": [], "aborted": None}
shown_items.clear(); r = run_at(44, 600, False)
t("new + comment in one popup batch", [x["id"] for x in shown_items[0][0]] == [501, 601] and shown_items[0][0][0]["new"] is True)
items = A._popup_items([{"id": i, "subject": f"새 {i}", "project": "P"} for i in (1, 2, 3, 4)], [])
t("many -> 2 + summary", len(items) == 3 and items[2]["id"] is None and items[2]["title"] == "새 소식 2건 더")
config.RUN.popup = None

# 15-3. 알림 창을 누르면: 앱 창이 열려 있으면 그 화면이 노트를 열게(open_req) 하고, 닫혀 있으면 그 노트를 여는 새 창
from rnotes import lifecycle as LC
opened_q = []
LC.open_new = lambda query="": opened_q.append(query)
config.STATE["last_ping"] = __import__("time").time()
LC.open_issue({"id": 601, "new": False})
t("window open -> open request for the page", config.STATE["open_req"] == {"id": 601, "new": False} and opened_q == [])
config.STATE["last_ping"] = 0
LC.open_issue({"id": 501, "new": True})
t("window closed -> new window with ?open=", opened_q == ["?open=501&new=1"] and config.STATE["open_req"] is None)
LC.open_issue({"id": None})
t("summary popup -> just open the app", opened_q[-1] == "")

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
