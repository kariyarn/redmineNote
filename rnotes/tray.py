"""윈도우 오른쪽 아래 알림 영역(트레이) 아이콘. 외부 라이브러리 없이 ctypes 만 쓴다.

- 아이콘을 왼쪽 클릭(또는 더블클릭) = on_open (이미 열려 있으면 알려 주기만 하는 동작을 서버가 정한다)
- 아이콘을 우클릭 = 메뉴: [새 레드마인 노트 열기] / [서버 닫기]
start(...) 로 켜고, 서버를 끌 때는 remove() 로 아이콘부터 지워야 유령 아이콘이 남지 않는다.
"""
import ctypes
import threading
from ctypes import wintypes

user32 = ctypes.WinDLL("user32", use_last_error=True)
shell32 = ctypes.WinDLL("shell32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

LRESULT = ctypes.c_ssize_t
WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

WM_DESTROY, WM_NULL, WM_COMMAND, WM_USER = 0x0002, 0x0000, 0x0111, 0x0400
WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_RBUTTONUP, WM_CONTEXTMENU = 0x0202, 0x0203, 0x0205, 0x007B
WM_TRAY = WM_USER + 1
NIN_BALLOONUSERCLICK = WM_USER + 5   # 말풍선(윈도우 10 에서는 알림 센터 알림)을 눌렀을 때
NIM_ADD, NIM_MODIFY, NIM_DELETE = 0, 1, 2
NIF_MESSAGE, NIF_ICON, NIF_TIP, NIF_INFO = 0x1, 0x2, 0x4, 0x10
NIIF_INFO = 0x1
IMAGE_ICON, LR_LOADFROMFILE, LR_DEFAULTSIZE = 1, 0x10, 0x40
MF_SEPARATOR, TPM_RIGHTBUTTON = 0x800, 0x2
ID_OPEN, ID_QUIT = 1001, 1002
from .config import BETA

CLASS_NAME = "RedmineNotes2BetaTray" if BETA else "RedmineNotes2Tray"   # 1.x(RedmineNotesTray) · 정식/베타끼리 겹치지 않게


class WNDCLASSW(ctypes.Structure):
    _fields_ = [
        ("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int), ("hInstance", wintypes.HINSTANCE), ("hIcon", wintypes.HICON),
        ("hCursor", wintypes.HANDLE), ("hbrBackground", wintypes.HBRUSH),
        ("lpszMenuName", wintypes.LPCWSTR), ("lpszClassName", wintypes.LPCWSTR),
    ]


class GUID(ctypes.Structure):
    _fields_ = [("Data1", ctypes.c_uint32), ("Data2", ctypes.c_uint16), ("Data3", ctypes.c_uint16),
                ("Data4", ctypes.c_ubyte * 8)]


class NOTIFYICONDATAW(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD), ("hWnd", wintypes.HWND), ("uID", wintypes.UINT),
        ("uFlags", wintypes.UINT), ("uCallbackMessage", wintypes.UINT), ("hIcon", wintypes.HICON),
        ("szTip", wintypes.WCHAR * 128), ("dwState", wintypes.DWORD), ("dwStateMask", wintypes.DWORD),
        ("szInfo", wintypes.WCHAR * 256), ("uVersion", wintypes.UINT), ("szInfoTitle", wintypes.WCHAR * 64),
        ("dwInfoFlags", wintypes.DWORD), ("guidItem", GUID), ("hBalloonIcon", wintypes.HICON),
    ]


class MSG(ctypes.Structure):
    _fields_ = [("hwnd", wintypes.HWND), ("message", wintypes.UINT), ("wParam", wintypes.WPARAM),
                ("lParam", wintypes.LPARAM), ("time", wintypes.DWORD), ("pt", wintypes.POINT)]


def _sig(fn, restype, *argtypes):
    fn.restype, fn.argtypes = restype, list(argtypes)


_sig(user32.DefWindowProcW, LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
_sig(user32.RegisterClassW, wintypes.ATOM, ctypes.POINTER(WNDCLASSW))
_sig(user32.CreateWindowExW, wintypes.HWND, wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
     ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE,
     wintypes.LPVOID)
_sig(user32.GetMessageW, wintypes.BOOL, ctypes.POINTER(MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT)
_sig(user32.TranslateMessage, wintypes.BOOL, ctypes.POINTER(MSG))
_sig(user32.DispatchMessageW, LRESULT, ctypes.POINTER(MSG))
_sig(user32.PostQuitMessage, None, ctypes.c_int)
_sig(user32.PostMessageW, wintypes.BOOL, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
_sig(user32.LoadImageW, wintypes.HANDLE, wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT, ctypes.c_int,
     ctypes.c_int, wintypes.UINT)
_sig(user32.LoadIconW, wintypes.HICON, wintypes.HINSTANCE, ctypes.c_void_p)
_sig(user32.CreatePopupMenu, wintypes.HMENU)
_sig(user32.AppendMenuW, wintypes.BOOL, wintypes.HMENU, wintypes.UINT, ctypes.c_size_t, wintypes.LPCWSTR)
_sig(user32.TrackPopupMenu, wintypes.BOOL, wintypes.HMENU, wintypes.UINT, ctypes.c_int, ctypes.c_int, ctypes.c_int,
     wintypes.HWND, ctypes.c_void_p)
_sig(user32.DestroyMenu, wintypes.BOOL, wintypes.HMENU)
_sig(user32.GetCursorPos, wintypes.BOOL, ctypes.POINTER(wintypes.POINT))
_sig(user32.SetForegroundWindow, wintypes.BOOL, wintypes.HWND)
_sig(user32.RegisterWindowMessageW, wintypes.UINT, wintypes.LPCWSTR)
_sig(shell32.Shell_NotifyIconW, wintypes.BOOL, wintypes.DWORD, ctypes.POINTER(NOTIFYICONDATAW))
_sig(kernel32.GetModuleHandleW, wintypes.HMODULE, wintypes.LPCWSTR)

_S = {"hwnd": None, "icon": None, "tip": "", "open": None, "new": None, "quit": None, "taskbar_msg": 0, "proc": None}


def _nid(flags=0):
    n = NOTIFYICONDATAW()
    n.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
    n.hWnd, n.uID, n.uFlags = _S["hwnd"], 1, flags
    return n


def _add():
    n = _nid(NIF_MESSAGE | NIF_ICON | NIF_TIP)
    n.uCallbackMessage, n.hIcon, n.szTip = WM_TRAY, _S["icon"], _S["tip"][:127]
    shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(n))


def remove():
    """트레이 아이콘을 지운다 (프로그램을 끄기 직전에 꼭 부른다)."""
    if _S["hwnd"]:
        shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(_nid()))


def balloon(title, text):
    """아이콘 근처에 짧은 안내 말풍선을 띄운다."""
    if not _S["hwnd"]:
        return
    n = _nid(NIF_INFO)
    n.szInfoTitle, n.szInfo, n.dwInfoFlags = title[:63], text[:255], NIIF_INFO
    shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(n))


def _call(fn):
    if fn:
        try:
            fn()
        except Exception:
            pass


def _menu(hwnd):
    m = user32.CreatePopupMenu()
    user32.AppendMenuW(m, 0, ID_OPEN, "새 레드마인 노트 (베타) 열기" if BETA else "새 레드마인 노트 열기")
    user32.AppendMenuW(m, MF_SEPARATOR, 0, None)
    user32.AppendMenuW(m, 0, ID_QUIT, "서버 닫기")
    pt = wintypes.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    user32.SetForegroundWindow(hwnd)  # 이걸 안 하면 메뉴 밖을 눌러도 메뉴가 안 닫힌다
    user32.TrackPopupMenu(m, TPM_RIGHTBUTTON, pt.x, pt.y, 0, hwnd, None)
    user32.PostMessageW(hwnd, WM_NULL, 0, 0)
    user32.DestroyMenu(m)


def _wndproc(hwnd, msg, wp, lp):
    if msg == WM_TRAY:
        ev = lp & 0xFFFF
        if ev in (WM_LBUTTONUP, WM_LBUTTONDBLCLK, NIN_BALLOONUSERCLICK):   # 알림을 눌러도 창을 연다 (열려 있으면 앞으로)
            _call(_S["open"])
        elif ev in (WM_RBUTTONUP, WM_CONTEXTMENU):
            _menu(hwnd)
        return 0
    if msg == WM_COMMAND:
        cmd = wp & 0xFFFF
        if cmd == ID_OPEN:
            _call(_S["new"] or _S["open"])      # 메뉴의 "새 ... 열기" = 이미 열려 있어도 새 창을 연다
        elif cmd == ID_QUIT:
            _call(_S["quit"])
        return 0
    if _S["taskbar_msg"] and msg == _S["taskbar_msg"]:  # 탐색기가 다시 시작되면 아이콘이 사라지므로 다시 단다
        _add()
        return 0
    if msg == WM_DESTROY:
        user32.PostQuitMessage(0)
        return 0
    return user32.DefWindowProcW(hwnd, msg, wp, lp)


def _load_icon(path):
    h = None
    if path:
        h = user32.LoadImageW(None, path, IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE)
    return h or user32.LoadIconW(None, ctypes.c_void_p(32512))  # 못 찾으면 기본 아이콘


def _run(ready):
    hinst = kernel32.GetModuleHandleW(None)
    _S["proc"] = WNDPROC(_wndproc)  # 파이썬이 지우지 못하게 붙들어 둔다
    wc = WNDCLASSW()
    wc.lpfnWndProc, wc.hInstance, wc.lpszClassName = _S["proc"], hinst, CLASS_NAME
    user32.RegisterClassW(ctypes.byref(wc))
    hwnd = user32.CreateWindowExW(0, CLASS_NAME, CLASS_NAME, 0, 0, 0, 0, 0, None, None, hinst, None)  # 눈에 안 보이는 창
    _S["hwnd"] = hwnd
    _S["taskbar_msg"] = user32.RegisterWindowMessageW("TaskbarCreated")
    _add()
    ready.set()
    msg = MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))


def start(tooltip, icon_path, on_open, on_quit, on_new=None):
    """트레이 아이콘을 만든다. 별도 스레드에서 메시지를 처리한다."""
    _S["icon"], _S["tip"], _S["open"], _S["quit"], _S["new"] = _load_icon(icon_path), tooltip, on_open, on_quit, on_new
    ready = threading.Event()
    threading.Thread(target=_run, args=(ready,), daemon=True).start()
    ready.wait(5)
