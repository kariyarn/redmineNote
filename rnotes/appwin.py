"""앱 창: 크롬/엣지의 '앱 모드'(--app)로 주소창·탭 없는 독립 창을 띄운다. 외부 라이브러리 없음.

- 평소 쓰는 크롬과 섞이지 않도록 이 프로그램 전용 프로필(user-data-dir)을 쓴다.
- 앱 창이 열려 있는지 / 앞으로 가져오기 / 닫기는 윈도우 창 목록에서 직접 찾아서 처리한다.
  (앱 창의 제목은 화면의 <title> 그대로 '레드마인 노트' 이고, 평소 크롬 탭은 '… - Google Chrome' 처럼 뒤에 이름이 붙어서 구분된다.)
"""
import ctypes
import json
import os
import subprocess
import threading
import time
from ctypes import wintypes

TITLE = "레드마인 노트 2"   # 화면 <title> 과 같아야 앱 창을 찾을 수 있다. 1.x("레드마인 노트")와 구분된다
CHROME_CLASS = "Chrome_WidgetWin_1"  # 크롬과 엣지 창의 공통 클래스 이름
WM_CLOSE, SW_RESTORE, SW_MAXIMIZE = 0x0010, 9, 3
DETACHED_PROCESS, CREATE_NEW_PROCESS_GROUP = 0x00000008, 0x00000200

user32 = ctypes.WinDLL("user32", use_last_error=True)
EnumProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user32.EnumWindows.argtypes = [EnumProc, wintypes.LPARAM]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsIconic.argtypes = [wintypes.HWND]
user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.AllowSetForegroundWindow.argtypes = [wintypes.DWORD]


def find_browser():
    """설치된 크롬(없으면 엣지)의 실행 파일 경로. 환경변수 REDMINE_NOTES_BROWSER 로 직접 지정할 수도 있다."""
    env = os.environ.get("REDMINE_NOTES_BROWSER")
    if env and os.path.isfile(env):
        return env
    import winreg

    cands = []
    for exe, sub in (("chrome.exe", r"Google\Chrome\Application\chrome.exe"),
                     ("msedge.exe", r"Microsoft\Edge\Application\msedge.exe")):
        for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                with winreg.OpenKey(root, rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}") as k:
                    cands.append(winreg.QueryValue(k, None))
            except OSError:
                pass
        for var in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            base = os.environ.get(var)
            if base:
                cands.append(os.path.join(base, sub))
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


def reset_zoom(profile_dir):
    """이 앱 전용 크롬 프로필에 예전에 저장된 확대/축소 배율을 지워 100% 로 되돌린다. 크롬이 이 프로필을 쓰는 중이면 건드리지 않는다."""
    p = os.path.join(profile_dir, "Default", "Preferences")
    try:
        if windows() or not os.path.isfile(p):
            return False
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        part = d.get("partition")
        if not isinstance(part, dict):
            return False
        changed = False
        for k in ("per_host_zoom_levels", "default_zoom_level"):
            if k in part:
                del part[k]
                changed = True
        if changed:
            tmp = p + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, p)
        return changed
    except Exception:
        return False


def launch(url, profile_dir, relaunch_exe=None):
    """앱 창을 연다. 브라우저를 못 찾으면 False (호출한 쪽이 기본 브라우저로 대신 연다).
    relaunch_exe 를 주면, 뜬 창에 '이 창은 그 exe 의 창'이라는 표식을 붙여 작업 표시줄에서 exe 버튼과 한 묶음이 되게 한다."""
    exe = find_browser()
    if not exe:
        return False
    args = [exe, f"--app={url}", f"--user-data-dir={profile_dir}", "--no-first-run", "--no-default-browser-check"]
    reset_zoom(profile_dir)                    # 예전에 확대/축소해 둔 배율이 남아 있으면 100% 로
    args.append("--disable-pinch")             # 터치패드 두 손가락 확대 끄기
    args.append("--start-maximized")           # 열릴 때 화면을 꽉 채운다 (작은 화면에서 창이 잘리지 않게)
    subprocess.Popen(args, close_fds=True, creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
    if relaunch_exe:
        ensure_tag_watcher(relaunch_exe)
    return True


def windows():
    """지금 열려 있는 이 프로그램의 앱 창들."""
    found = []

    def cb(h, _):
        if user32.IsWindowVisible(h):
            cls = ctypes.create_unicode_buffer(64)
            user32.GetClassNameW(h, cls, 64)
            if cls.value == CHROME_CLASS:
                n = user32.GetWindowTextLengthW(h)
                buf = ctypes.create_unicode_buffer(n + 1)
                user32.GetWindowTextW(h, buf, n + 1)
                if buf.value == TITLE:
                    found.append(h)
        return True

    user32.EnumWindows(EnumProc(cb), 0)
    return found


def focus():
    """이미 열려 있는 앱 창을 맨 앞으로 가져온다 (최소화돼 있으면 복원). 가져왔으면 True."""
    ws = windows()
    for h in ws:
        if user32.IsIconic(h):
            user32.ShowWindow(h, SW_RESTORE)
    if ws:
        return bool(user32.SetForegroundWindow(ws[0]))
    return False


def allow_focus():
    """(두 번째로 실행된 쪽에서) 이미 켜진 서버가 창을 앞으로 가져올 수 있게 허락한다."""
    user32.AllowSetForegroundWindow(0xFFFFFFFF)  # ASFW_ANY


def close_all():
    """앱 창을 정상적으로 닫는다 (강제 종료가 아니라 닫기 요청)."""
    for h in windows():
        user32.PostMessageW(h, WM_CLOSE, 0, 0)


# ---------- 작업 표시줄 묶기: 앱 창에 "이 창은 레드마인 노트 exe 의 창" 표식을 붙인다 ----------
# 크롬이 만든 창은 기본으로 크롬 소속이라, 작업 표시줄에 고정한 exe 버튼과 따로 두 개로 보인다.
# 창에 같은 앱 ID(AppUserModelID)와 '다시 실행할 exe'를 붙이면 윈도우가 한 버튼으로 묶는다.
AUMID = "RedmineNotes2.App"
ole32 = ctypes.WinDLL("ole32")
shell32 = ctypes.WinDLL("shell32")


class GUID(ctypes.Structure):
    _fields_ = [("Data1", ctypes.c_uint32), ("Data2", ctypes.c_uint16), ("Data3", ctypes.c_uint16),
                ("Data4", ctypes.c_ubyte * 8)]


class PROPERTYKEY(ctypes.Structure):
    _fields_ = [("fmtid", GUID), ("pid", wintypes.DWORD)]


class PROPVARIANT(ctypes.Structure):
    _fields_ = [("vt", ctypes.c_ushort), ("w1", ctypes.c_ushort), ("w2", ctypes.c_ushort), ("w3", ctypes.c_ushort),
                ("val", ctypes.c_byte * 16)]


def _guid(text):
    g = GUID()
    ole32.CLSIDFromString(text, ctypes.byref(g))
    return g


_FMT = _guid("{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}")        # System.AppUserModel.*
_IID_PS = _guid("{886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99}")     # IPropertyStore
PID_RELAUNCH_COMMAND, PID_RELAUNCH_ICON, PID_RELAUNCH_NAME, PID_ID = 2, 3, 4, 5
ole32.CoTaskMemAlloc.restype = ctypes.c_void_p
ole32.CoTaskMemAlloc.argtypes = [ctypes.c_size_t]
shell32.SHGetPropertyStoreForWindow.argtypes = [wintypes.HWND, ctypes.POINTER(GUID), ctypes.POINTER(ctypes.c_void_p)]
_TagFn = ctypes.WINFUNCTYPE


def _vtable(ppv):
    return ctypes.cast(ctypes.cast(ppv.value, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))


def _open_store(hwnd):
    ole32.CoInitialize(None)
    ppv = ctypes.c_void_p()
    hr = shell32.SHGetPropertyStoreForWindow(hwnd, ctypes.byref(_IID_PS), ctypes.byref(ppv))
    return ppv if hr == 0 and ppv.value else None


def set_window_props(hwnd, pairs):
    """창에 문자열 속성들을 붙인다. pairs = [(속성번호, 문자열), ...]. 성공하면 True."""
    ppv = _open_store(hwnd)
    if not ppv:
        return False
    vt = _vtable(ppv)
    set_value = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(PROPERTYKEY), ctypes.POINTER(PROPVARIANT))(vt[6])
    commit = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p)(vt[7])
    release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vt[2])
    ok = True
    for pid, text in pairs:
        pv = PROPVARIANT()
        pv.vt = 31  # VT_LPWSTR
        size = (len(text) + 1) * 2
        buf = ole32.CoTaskMemAlloc(size)
        ctypes.memmove(buf, ctypes.create_unicode_buffer(text), size)
        ctypes.cast(ctypes.addressof(pv.val), ctypes.POINTER(ctypes.c_void_p))[0] = buf
        ok = (set_value(ppv, ctypes.byref(PROPERTYKEY(_FMT, pid)), ctypes.byref(pv)) == 0) and ok
        ole32.PropVariantClear(ctypes.byref(pv))
    ok = (commit(ppv) == 0) and ok
    release(ppv)
    return ok


def get_window_prop(hwnd, pid):
    """창에 붙어 있는 문자열 속성을 읽는다 (확인용). 없으면 None."""
    ppv = _open_store(hwnd)
    if not ppv:
        return None
    vt = _vtable(ppv)
    get_value = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(PROPERTYKEY), ctypes.POINTER(PROPVARIANT))(vt[5])
    release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vt[2])
    pv = PROPVARIANT()
    out = None
    if get_value(ppv, ctypes.byref(PROPERTYKEY(_FMT, pid)), ctypes.byref(pv)) == 0 and pv.vt == 31:
        out = ctypes.wstring_at(ctypes.cast(ctypes.addressof(pv.val), ctypes.POINTER(ctypes.c_void_p))[0])
    ole32.PropVariantClear(ctypes.byref(pv))
    release(ppv)
    return out


_tagged = set()
_maxed = set()


def maximize_new():
    """새로 뜬 앱 창은 한 번 화면 가득(최대화)으로 만든다. 그 뒤에 사용자가 창 크기를 바꾸는 것은 건드리지 않는다."""
    for h in windows():
        if h not in _maxed:
            _maxed.add(h)
            try:
                user32.ShowWindow(h, SW_MAXIMIZE)
            except Exception:
                pass


def tag_windows(exe):
    """아직 표식이 없는 앱 창에 표식을 붙인다. 새로 붙인 창 수를 돌려준다."""
    n = 0
    for h in windows():
        # 크롬이 나중에 자기 앱 ID 로 덮어쓰면 작업 표시줄 버튼이 둘로 갈라진다 → 이미 붙인 창도 다시 확인해서 달라졌으면 다시 붙인다
        try:
            if get_window_prop(h, PID_ID) == AUMID and get_window_prop(h, PID_RELAUNCH_COMMAND) == f'"{exe}"':
                continue
        except Exception:
            pass
        if set_window_props(h, [(PID_ID, AUMID), (PID_RELAUNCH_COMMAND, f'"{exe}"'),
                                (PID_RELAUNCH_ICON, f"{exe},0"), (PID_RELAUNCH_NAME, TITLE)]):
            _tagged.add(h)
            n += 1
    return n


_watch = {"started": False, "exe": None}


def ensure_tag_watcher(exe):
    """프로그램이 켜져 있는 동안 계속(1초마다) 앱 창의 표식을 지켜본다. 한 번만 시작한다."""
    _watch["exe"] = exe
    if _watch["started"] or not exe:
        return
    _watch["started"] = True

    def loop():
        while True:
            try:
                maximize_new()
                tag_windows(_watch["exe"])
            except Exception:
                pass
            time.sleep(1.0)

    threading.Thread(target=loop, daemon=True).start()


def _tag_when_ready(exe, timeout=25):
    """창이 뜰 때까지 잠깐 기다렸다가 표식을 붙인다."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            tag_windows(exe)
        except Exception:
            pass
        time.sleep(0.4)
