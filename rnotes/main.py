"""프로그램 시작점"""
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
from .config import DATA_DIR, FROZEN, IDLE_QUIT_SEC, PORT, STATE
from .http_handler import Handler, Server
from .lifecycle import alarm_loop, idle_watchdog, open_browser, start_tray
from .storage import ensure_daily_backup, init_db


def run():
    if sys.stdout is None:  # 창 없는 exe 에는 출력할 곳이 없다 (한국어가 아닌 윈도우에서도 한글 출력에 죽지 않게 utf-8)
        sys.stdout = sys.stderr = open(os.devnull, "w", encoding="utf-8")
    for s in (sys.stdout, sys.stderr):  # 콘솔 글자표에 없는 글자(한글)는 깨진 표시로 바꿔 출력한다 (죽지 않게)
        try:
            s.reconfigure(errors="backslashreplace")
        except Exception:
            pass
    init_db()
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
