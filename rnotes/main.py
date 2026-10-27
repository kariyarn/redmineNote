"""프로그램 시작점"""
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

from .autosync import autosync_loop
from .gitbackup import loop as gitbackup_loop
from .updater import loop as update_loop
from .config import CHANNEL_PORTS, DATA_DIR, FROZEN, IDLE_QUIT_SEC, OTHER_CHANNEL, PORT, STATE
from .http_handler import Handler, Server
from .lifecycle import alarm_loop, idle_watchdog, open_browser, start_popup, start_tray
from .storage import ensure_daily_backup, init_db


CHANNEL_NAME = {"stable": "정식", "beta": "베타"}


def other_channel_running():
    """같은 노트 데이터를 쓰는 다른 채널(정식 ↔ 베타)이 켜져 있는가. 포트를 따로 정해 실행(시험 등)하면 보지 않는다."""
    if os.environ.get("REDMINE_NOTES_PORT"):
        return False
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{CHANNEL_PORTS[OTHER_CHANNEL]}/api/config", timeout=1.5) as r:
            return r.status == 200 and "appVersion" in json.loads(r.read(65536).decode("utf-8"))   # 레드마인 노트가 맞는지 (다른 프로그램이 그 포트를 쓸 수도)
    except Exception:
        return False


def refuse_other_channel():
    """다른 채널이 켜져 있으면 알리고 끝낸다 (같은 DB 를 둘이 함께 쓰지 않게: 자동 가져오기 · 알림 · 백업이 두 번 돌거나 DB 형식이 엇갈리는 것을 막는다)."""
    other, me = CHANNEL_NAME[OTHER_CHANNEL], CHANNEL_NAME["beta" if OTHER_CHANNEL == "stable" else "stable"]
    msg = (f"레드마인 노트 {other} 버전이 이미 켜져 있어요.\n\n정식과 베타는 같은 노트 데이터를 쓰기 때문에 한 번에 하나만 켤 수 있어요.\n"
           f"{other} 버전을 끈 뒤(트레이 아이콘 우클릭 → 서버 닫기) {me} 버전을 다시 실행하세요.")
    print(msg)
    if sys.platform == "win32" and "nobrowser" not in sys.argv:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, msg, f"레드마인 노트 ({me})", 0x30 | 0x40000)   # 경고 아이콘 · 맨 위
        except Exception:
            pass
    os._exit(0)


def run():
    if sys.stdout is None:  # 창 없는 exe 에는 출력할 곳이 없다 (한국어가 아닌 윈도우에서도 한글 출력에 죽지 않게 utf-8)
        sys.stdout = sys.stderr = open(os.devnull, "w", encoding="utf-8")
    for s in (sys.stdout, sys.stderr):  # 콘솔 글자표에 없는 글자(한글)는 깨진 표시로 바꿔 출력한다 (죽지 않게)
        try:
            s.reconfigure(errors="backslashreplace")
        except Exception:
            pass
    if other_channel_running():
        refuse_other_channel()
    init_db()
    try:
        from . import memoimg
        memoimg.gc()   # 어느 메모도 쓰지 않는 지난 사진 파일 정리
    except Exception:
        pass
    try:
        httpd = Server(("127.0.0.1", PORT), Handler)
    except OSError:
        # 이미 실행 중. 새로 켜지 않는다. exe 면 실행 중인 쪽에 알려서, 창이 열려 있으면 알림만 / 닫혀 있으면 창을 다시 열게 한다.
        if FROZEN and "nobrowser" not in sys.argv:
            try:
                from . import appwin
                appwin.allow_focus()
            except Exception:
                pass
            try:
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{PORT}/api/second-launch", b"{}",
                                       {"Content-Type": "application/json"}, method="POST"), timeout=3)
            except Exception:
                webbrowser.open(f"http://127.0.0.1:{PORT}")  # 서버가 응답하지 않으면 그냥 연다
        os._exit(0)
    try:
        ensure_daily_backup()
    except Exception:
        pass
    start_tray()
    start_popup()
    open_browser()
    threading.Thread(target=alarm_loop, daemon=True).start()
    threading.Thread(target=autosync_loop, daemon=True).start()   # 자동 가져오기 (켜져 있을 때만 가져온다)
    threading.Thread(target=gitbackup_loop, daemon=True).start()  # 깃허브 백업 (켜져 있을 때만 올린다)
    threading.Thread(target=update_loop, daemon=True).start()     # 새 버전 확인 (하루 한 번, 설정으로 끔)
    if IDLE_QUIT_SEC > 0:
        STATE["last_ping"] = time.time()
        threading.Thread(target=idle_watchdog, daemon=True).start()
    print(f"http://127.0.0.1:{PORT} 에서 실행 중 (종료: Ctrl+C)  · 데이터 위치: {DATA_DIR}")
    httpd.serve_forever()
