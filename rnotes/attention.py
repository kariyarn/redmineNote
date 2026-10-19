"""알림을 놓치지 않게: 사용자가 앱 창을 보고 있지 않으면(최소화 · 다른 창에 가려짐 · 다른 앱 사용 중 · 창 없음)
작업 표시줄 아이콘을 반짝이고(창을 맨 앞으로 가져올 때까지) 윈도우 알림(트레이 말풍선 → 알림 센터)을 띄운다.
메모 알림 · 자동 가져오기 새 일감은 서버가, 화면에서만 생기는 알림(배포요청 · 업데이트 · 오늘 볼 메모)은 화면이 /api/attention 으로 부른다.
'보고 있다' = 윈도우에서는 앱 창이 맨 앞(포커스)일 때. 그 밖(소스 실행 · 시험)에서는 화면이 45초 안에 신호를 보냈고 숨겨지지 않았고 포커스가 있을 때."""
import os
import sys
import time

from .config import RUN, STATE
from .storage import get_settings

SEEN_SEC = 45


def flash_on(s=None):
    """작업 표시줄 아이콘 반짝이기 (설정 notify_flash, 기본 켬)."""
    return str((get_settings() if s is None else s).get("notify_flash") or "1") != "0"


def toast_on(s=None):
    """윈도우 알림 (설정 notify_toast, 기본 켬)."""
    return str((get_settings() if s is None else s).get("notify_toast") or "1") != "0"


def _win():
    return sys.platform == "win32" and os.environ.get("REDMINE_NOTES_NO_APPWIN") != "1"


def page_seen():
    """화면이 알려 준 상태로 본 '보고 있다' (최근 신호 · 숨겨지지 않음 · 포커스)."""
    return (time.time() - STATE.get("alarm_poll", 0) < SEEN_SEC and not STATE.get("alarm_hidden")
            and STATE.get("page_focus", True))


def app_focused():
    """사용자가 지금 앱 창을 보고 있는가."""
    if _win():
        try:
            from . import appwin
            fg = appwin.foreground()
            return bool(fg)   # 창이 없으면(None) 보고 있지 않다
        except Exception:
            pass
    return page_seen()


def _flash():
    if not _win():
        STATE["flash_count"] = STATE.get("flash_count", 0) + 1   # 시험에서 셀 수 있게
        return False
    try:
        from . import appwin
        return appwin.flash()
    except Exception:
        return False


def notify(title, text, flash=True, toast=True):
    """보고 있지 않으면 반짝이고 · 윈도우 알림을 띄운다. 돌려주는 값: {"watching": 보고 있었나, "shown": 알렸나, "flashed", "toasted"}."""
    out = {"watching": False, "shown": False, "flashed": False, "toasted": False}
    if app_focused():
        out["watching"] = True
        return out   # 보고 있으면 화면 안 알림으로 충분하다
    s = get_settings()
    if flash and flash_on(s):
        out["flashed"] = _flash()
    if toast and toast_on(s) and RUN.tray:
        try:
            RUN.tray.balloon(str(title)[:63], str(text or "")[:255])
            out["toasted"] = True
        except Exception:
            pass
    out["shown"] = out["flashed"] or out["toasted"]
    return out
