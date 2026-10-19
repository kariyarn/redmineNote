"""알림 놓치지 않게 (작업 표시줄 반짝임 · 윈도우 알림) 시험 (임시 데이터 · 가짜 트레이). 실행: python tests/test_attention.py <프로젝트 폴더>
윈도우가 아니므로 '보고 있다'는 화면이 알려 준 상태(신호 · 숨김 · 포커스)로 판단하고, 반짝임은 횟수만 센다."""
import os, sys, tempfile, time, datetime as D
os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
os.environ["REDMINE_NOTES_NO_APPWIN"] = "1"
sys.path.insert(0, sys.argv[1])
from rnotes import storage, config, attention as AT, lifecycle as L, alarms

storage.init_db()
ok = fail = 0


def t(name, cond, info=""):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name, info)


balloons = []
class FakeTray:
    @staticmethod
    def balloon(title, text): balloons.append((title, text))
config.RUN.tray = FakeTray
S = config.STATE


def page(ago=1, hidden=False, focus=True):
    S["alarm_poll"] = time.time() - ago; S["alarm_hidden"] = hidden; S["page_focus"] = focus
    balloons.clear(); S["flash_count"] = 0


def setting(k, v):
    with storage.db() as c:
        c.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))


# 1. 보고 있으면 알리지 않는다
page()
r = AT.notify("제목", "내용")
t("watching (recent signal · visible · focused) -> nothing", r == {"watching": True, "shown": False, "flashed": False, "toasted": False} and balloons == [] and S["flash_count"] == 0)

# 2. 보고 있지 않으면: 반짝임 + 윈도우 알림
for name, kw in (("covered by another app (no focus)", dict(focus=False)), ("minimized (hidden)", dict(hidden=True)), ("window closed (no signal)", dict(ago=600))):
    page(**kw)
    r = AT.notify("⏰ 제목", "내용")
    t(name + " -> flash + toast", r["shown"] and r["toasted"] and balloons == [("⏰ 제목", "내용")] and S["flash_count"] == 1, (r, balloons, S.get("flash_count")))

# 3. 설정으로 끄기
setting("notify_toast", "0"); page(focus=False); r = AT.notify("a", "b")
t("toast off -> flash only", not r["toasted"] and balloons == [] and S["flash_count"] == 1)
setting("notify_flash", "0"); page(focus=False); r = AT.notify("a", "b")
t("both off -> nothing", not r["shown"] and balloons == [] and S["flash_count"] == 0)
setting("notify_toast", "1"); setting("notify_flash", "1")
config.RUN.tray = None; page(focus=False); r = AT.notify("a", "b")
t("no tray (source run) -> no toast, no error", not r["toasted"] and S["flash_count"] == 1)
config.RUN.tray = FakeTray

# 4. 긴 글자는 말풍선 한도로 자른다
page(focus=False); AT.notify("가" * 100, "나" * 400)
t("trimmed to balloon limits", len(balloons[0][0]) == 63 and len(balloons[0][1]) == 255)

# 5. 메모 알림: 다른 앱을 쓰는 중(포커스 없음)에도 알린다 (예전에는 '보인다'로 보고 말풍선을 띄우지 않았다)
L.app_window_open = lambda: True
now = D.datetime.now()
with storage.db() as c:
    c.execute("INSERT INTO sticky (day, text, remind_time, armed_at, created_at, updated_at) VALUES (?,?,?,?,?,?)",
              (now.date().isoformat(), "회의 준비", (now - D.timedelta(minutes=1)).strftime("%H:%M"), (now - D.timedelta(hours=1)).isoformat(timespec="seconds"), now.isoformat(), now.isoformat()))
due = alarms.alarms_due()
page(focus=False); L._ALARM_NOTIFIED.clear(); L.alarm_tick()
t("memo alarm while using another app -> toast + flash", due and balloons and balloons[0][0].startswith("⏰ 메모 알림") and S["flash_count"] == 1, (due, balloons))
page(); L._ALARM_NOTIFIED.clear(); L.alarm_tick()
t("memo alarm while watching -> page dialog only", balloons == [] and S["flash_count"] == 0)

print("OK", ok, "FAIL", fail)
sys.exit(1 if fail else 0)
