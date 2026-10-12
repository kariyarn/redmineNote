"""실행 수명: 창 열기 · 트레이 · 자동 종료 감시 · 알림 스케줄러"""
import os
import sys
import threading
import time
import webbrowser

from .alarms import ALARM_TICK, alarm_pending, alarms_due
from .config import ALIVE_SEC, APP_DIR, APP_VERSION, FROZEN, HOME_DIR, IDLE_QUIT_SEC, PORT, RUN, STATE


def idle_watchdog():
    """앱 창을 닫으면 서버는 트레이에 남고, 창도 화면 신호도 없이 IDLE_QUIT_SEC(기본 10분)이 지나면 서버를 끈다."""
    while True:
        time.sleep(15)
        if app_window_open() or alarm_pending():   # 앞으로 울릴 알림이 있으면 창이 없어도 서버를 켜 둔다
            STATE["last_active"] = time.time()
        if time.time() - max(STATE["last_ping"], STATE["last_active"]) > IDLE_QUIT_SEC:
            shutdown()


def shutdown():
    """프로그램 종료. 트레이 아이콘을 먼저 지워서 알림 영역에 유령 아이콘이 남지 않게 한다."""
    try:
        if sys.platform == "win32":
            from . import appwin
            appwin.close_all()  # 서버가 꺼지는데 빈 창만 남지 않도록 앱 창도 닫는다
    except Exception:
        pass
    try:
        if RUN.tray:
            RUN.tray.remove()
    finally:
        os._exit(0)


def app_window_open():
    """앱 창이 지금 열려 있는가. 윈도우에서는 창 목록에서 직접 찾고, 그 밖에는 화면 신호로 판단한다."""
    if sys.platform == "win32":
        try:
            from . import appwin
            return bool(appwin.windows())
        except Exception:
            pass
    return time.time() - STATE["last_ping"] < ALIVE_SEC


def page_alive():
    return app_window_open()


def open_new():
    """새 앱 창을 연다 (평소 크롬과 분리된 전용 창). 크롬/엣지를 못 찾으면 기본 브라우저로 연다."""
    url = f"http://127.0.0.1:{PORT}"
    if sys.platform == "win32" and os.environ.get("REDMINE_NOTES_NO_APPWIN") != "1":
        try:
            from . import appwin
            tag_exe = sys.executable if (FROZEN or os.environ.get("REDMINE_NOTES_TAG") == "1") else None   # 작업 표시줄에서 exe 버튼과 한 묶음으로
            if appwin.launch(url, str(HOME_DIR / "app-profile"), tag_exe):
                return
        except Exception:
            pass
    webbrowser.open(url)


def open_or_notify():
    """바로가기/아이콘을 눌렀을 때: 이미 열려 있으면 새 창을 또 열지 않고 알려 주기만 한다. 닫혀 있으면 연다.
    돌려주는 값: 새 창을 열었는지."""
    if page_alive():
        focused = False
        try:
            from . import appwin
            if FROZEN or os.environ.get("REDMINE_NOTES_TAG") == "1":
                appwin.ensure_tag_watcher(sys.executable)   # 이미 떠 있는 창도 표식이 풀렸으면 다시 붙인다
            focused = appwin.focus()  # 이미 열려 있는 창을 맨 앞으로 가져온다 (최소화돼 있으면 복원)
        except Exception:
            pass
        if not focused and RUN.tray:
            RUN.tray.balloon("이미 실행 중입니다", "열려 있는 레드마인 노트 창을 확인하세요. 새 창이 필요하면 이 아이콘을 우클릭 → '새 레드마인 노트 열기'.")
        return False
    open_new()
    return True


def start_tray():
    """윈도우 오른쪽 아래 알림 영역(트레이)에 작은 아이콘을 단다. exe 로 실행할 때 켜진다."""
    if sys.platform != "win32" or not (FROZEN or os.environ.get("REDMINE_NOTES_TRAY") == "1"):
        return
    try:
        from . import tray
        tray.start(f"레드마인 노트 2 · {APP_VERSION} (실행 중) · 우클릭: 새 창 / 서버 닫기", str(APP_DIR / "icon.ico"),
                   open_or_notify, shutdown, on_new=open_new)
        RUN.tray = tray
        hint = HOME_DIR / ".tray-hint"
        if not hint.exists():  # 처음 한 번만: 새 아이콘은 ^ 안에 숨어 있을 수 있다고 알려 준다
            hint.write_text("1")
            tray.balloon("레드마인 노트가 실행 중입니다", "오른쪽 아래 아이콘을 우클릭하면 새 창 열기 / 서버 닫기를 할 수 있습니다. 안 보이면 ^ 안을 확인하세요.")
    except Exception:
        pass


def open_browser():
    if FROZEN and "nobrowser" not in sys.argv:
        threading.Timer(0.8, open_new).start()




def wake_window():
    """창이 닫혀 있을 때 '중요' 알림이면 앱 창을 다시 연다. 시험용(NO_APPWIN)에서는 열지 않고 세기만 한다."""
    STATE["wake_count"] = STATE.get("wake_count", 0) + 1
    if os.environ.get("REDMINE_NOTES_NO_APPWIN") == "1":
        return
    open_new()


_ALARM_NOTIFIED = set()


def alarm_tick():
    """새로 울릴 알림이 있으면: 창이 없거나 숨겨져 있으면 트레이 말풍선, 중요 알림이면 창을 다시 연다."""
    due = alarms_due()
    seen_now = time.time() - STATE.get("alarm_poll", 0) < 45 and not STATE.get("alarm_hidden")
    for a in due:
        key = (a["id"], a["latest"])
        if key in _ALARM_NOTIFIED:
            continue
        _ALARM_NOTIFIED.add(key)
        if not seen_now and RUN.tray:
            try:
                RUN.tray.balloon(f"⏰ 메모 알림 · {a['remind_time']}", a["preview"] or "(내용 없음)")
            except Exception:
                pass
        if a["wake"] and not app_window_open():
            wake_window()


def alarm_loop():
    while True:
        time.sleep(ALARM_TICK)
        try:
            alarm_tick()
        except Exception:
            pass
