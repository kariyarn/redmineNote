"""오른쪽 아래 알림 창 (카카오톡 알림처럼). 외부 라이브러리 없이 ctypes 만 쓴다.

- show(items, on_click): 작업 표시줄 바로 위에 작은 창을 띄운다. 여러 건이면 위로 쌓이고, 새 것이 맨 아래.
- 창은 포커스를 빼앗지 않고(지금 쓰던 프로그램에 계속 입력할 수 있게) 맨 위에 떠 있다가 SHOW_MS 뒤에 사라진다.
  마우스를 올려 두면 사라지지 않는다. × 를 누르면 바로 닫히고, 나머지 자리를 누르면 on_click(item) 을 부른 뒤 닫힌다.
- 별도 스레드 하나가 창들의 메시지를 처리한다 (서버 스레드는 큐에 넣고 깨우기만 한다).
item = {"id": 일감 번호(없으면 None), "head": 작은 머리글, "title": 굵은 제목, "text": 본문 미리 보기(두 줄까지)}
"""
import ctypes
import threading
import time
from ctypes import wintypes

from .config import APP_DIR, BETA

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

LRESULT = ctypes.c_ssize_t
WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

WM_DESTROY, WM_PAINT, WM_TIMER, WM_SETCURSOR, WM_LBUTTONUP, WM_MOUSEACTIVATE = 0x0002, 0x000F, 0x0113, 0x0020, 0x0202, 0x0021
WM_APP_SHOW = 0x8000 + 1
MA_NOACTIVATE = 3
WS_POPUP = 0x80000000
WS_EX_TOPMOST, WS_EX_TOOLWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE = 0x8, 0x80, 0x80000, 0x08000000
SW_SHOWNOACTIVATE = 4
SWP_NOACTIVATE, SWP_NOSIZE, SWP_SHOWWINDOW = 0x10, 0x1, 0x40
HWND_TOPMOST = wintypes.HWND(-1)
LWA_ALPHA = 0x2
SPI_GETWORKAREA = 0x30
IDC_HAND = 32649
IMAGE_ICON, LR_LOADFROMFILE = 1, 0x10
DI_NORMAL = 3
TRANSPARENT = 1
DT_LEFT, DT_WORDBREAK, DT_SINGLELINE, DT_END_ELLIPSIS, DT_NOPREFIX, DT_EDITCONTROL, DT_CENTER, DT_VCENTER = 0, 0x10, 0x20, 0x8000, 0x800, 0x2000, 0x1, 0x4
FW_NORMAL, FW_BOLD = 400, 700
CLEARTYPE_QUALITY = 5
NULL_BRUSH = 5

CLASS_NAME = "RedmineNotes2BetaPopup" if BETA else "RedmineNotes2Popup"
W, H, MARGIN, GAP, RADIUS = 360, 92, 14, 8, 14     # 96 DPI 기준 (화면 배율에 맞춰 키운다)
MAX_SHOWN = 4                                      # 한 번에 떠 있는 창 수 (넘으면 오래된 것부터 닫는다)
SHOW_MS = 8000
TICK_MS = 30
ALPHA_MAX = 248


def _rgb(h):
    h = h.lstrip("#")
    return int(h[4:6], 16) << 16 | int(h[2:4], 16) << 8 | int(h[0:2], 16)   # COLORREF = 0x00BBGGRR


COL = {"bg": _rgb("#ffffff"), "line": _rgb("#d0d5dd"), "head": _rgb("#667085"), "title": _rgb("#1d2939"),
       "text": _rgb("#475467"), "x": _rgb("#98a2b3"), "accent": _rgb("#2f6fd6")}


class WNDCLASSW(ctypes.Structure):
    _fields_ = [
        ("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int), ("hInstance", wintypes.HINSTANCE), ("hIcon", wintypes.HICON),
        ("hCursor", wintypes.HANDLE), ("hbrBackground", wintypes.HBRUSH),
        ("lpszMenuName", wintypes.LPCWSTR), ("lpszClassName", wintypes.LPCWSTR),
    ]


class MSG(ctypes.Structure):
    _fields_ = [("hwnd", wintypes.HWND), ("message", wintypes.UINT), ("wParam", wintypes.WPARAM),
                ("lParam", wintypes.LPARAM), ("time", wintypes.DWORD), ("pt", wintypes.POINT)]


class PAINTSTRUCT(ctypes.Structure):
    _fields_ = [("hdc", wintypes.HDC), ("fErase", wintypes.BOOL), ("rcPaint", wintypes.RECT),
                ("fRestore", wintypes.BOOL), ("fIncUpdate", wintypes.BOOL), ("rgbReserved", ctypes.c_byte * 32)]


def _sig(fn, restype, *argtypes):
    fn.restype, fn.argtypes = restype, list(argtypes)


_sig(user32.DefWindowProcW, LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
_sig(user32.RegisterClassW, wintypes.ATOM, ctypes.POINTER(WNDCLASSW))
_sig(user32.CreateWindowExW, wintypes.HWND, wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
     ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE,
     wintypes.LPVOID)
_sig(user32.DestroyWindow, wintypes.BOOL, wintypes.HWND)
_sig(user32.ShowWindow, wintypes.BOOL, wintypes.HWND, ctypes.c_int)
_sig(user32.SetWindowPos, wintypes.BOOL, wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int,
     ctypes.c_int, wintypes.UINT)
_sig(user32.SetLayeredWindowAttributes, wintypes.BOOL, wintypes.HWND, wintypes.DWORD, ctypes.c_ubyte, wintypes.DWORD)
_sig(user32.SetWindowRgn, ctypes.c_int, wintypes.HWND, wintypes.HRGN, wintypes.BOOL)
_sig(user32.SetTimer, ctypes.c_size_t, wintypes.HWND, ctypes.c_size_t, wintypes.UINT, ctypes.c_void_p)
_sig(user32.KillTimer, wintypes.BOOL, wintypes.HWND, ctypes.c_size_t)
_sig(user32.GetMessageW, wintypes.BOOL, ctypes.POINTER(MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT)
_sig(user32.TranslateMessage, wintypes.BOOL, ctypes.POINTER(MSG))
_sig(user32.DispatchMessageW, LRESULT, ctypes.POINTER(MSG))
_sig(user32.PostMessageW, wintypes.BOOL, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
_sig(user32.BeginPaint, wintypes.HDC, wintypes.HWND, ctypes.POINTER(PAINTSTRUCT))
_sig(user32.EndPaint, wintypes.BOOL, wintypes.HWND, ctypes.POINTER(PAINTSTRUCT))
_sig(user32.InvalidateRect, wintypes.BOOL, wintypes.HWND, ctypes.c_void_p, wintypes.BOOL)
_sig(user32.FillRect, ctypes.c_int, wintypes.HDC, ctypes.POINTER(wintypes.RECT), wintypes.HBRUSH)
_sig(user32.DrawTextW, ctypes.c_int, wintypes.HDC, wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(wintypes.RECT), wintypes.UINT)
_sig(user32.DrawIconEx, wintypes.BOOL, wintypes.HDC, ctypes.c_int, ctypes.c_int, wintypes.HICON, ctypes.c_int, ctypes.c_int,
     wintypes.UINT, wintypes.HBRUSH, wintypes.UINT)
_sig(user32.LoadImageW, wintypes.HANDLE, wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT, ctypes.c_int,
     ctypes.c_int, wintypes.UINT)
_sig(user32.LoadCursorW, wintypes.HANDLE, wintypes.HINSTANCE, ctypes.c_void_p)
_sig(user32.SetCursor, wintypes.HANDLE, wintypes.HANDLE)
_sig(user32.GetCursorPos, wintypes.BOOL, ctypes.POINTER(wintypes.POINT))
_sig(user32.GetWindowRect, wintypes.BOOL, wintypes.HWND, ctypes.POINTER(wintypes.RECT))
_sig(user32.SystemParametersInfoW, wintypes.BOOL, wintypes.UINT, wintypes.UINT, ctypes.c_void_p, wintypes.UINT)
_sig(kernel32.GetModuleHandleW, wintypes.HMODULE, wintypes.LPCWSTR)
_sig(gdi32.CreateSolidBrush, wintypes.HBRUSH, wintypes.COLORREF)
_sig(gdi32.CreatePen, wintypes.HPEN, ctypes.c_int, ctypes.c_int, wintypes.COLORREF)
_sig(gdi32.GetStockObject, wintypes.HGDIOBJ, ctypes.c_int)
_sig(gdi32.SelectObject, wintypes.HGDIOBJ, wintypes.HDC, wintypes.HGDIOBJ)
_sig(gdi32.DeleteObject, wintypes.BOOL, wintypes.HGDIOBJ)
_sig(gdi32.RoundRect, wintypes.BOOL, wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int)
_sig(gdi32.CreateRoundRectRgn, wintypes.HRGN, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int)
_sig(gdi32.SetBkMode, ctypes.c_int, wintypes.HDC, ctypes.c_int)
_sig(gdi32.SetTextColor, wintypes.COLORREF, wintypes.HDC, wintypes.COLORREF)
_sig(gdi32.CreateFontW, wintypes.HFONT, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.DWORD,
     wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.LPCWSTR)
try:
    _sig(user32.GetDpiForSystem, wintypes.UINT)
except AttributeError:   # 윈도우 10 1607 이전
    pass

_S = {"host": None, "hinst": None, "proc": None, "ready": None, "lock": threading.Lock(), "queue": [], "wins": {},
      "order": [], "on_click": None, "fonts": None, "icon": None, "brush": None, "scale": 1.0}


def _px(v):
    return int(round(v * _S["scale"]))


def _work_area():
    r = wintypes.RECT()
    if user32.SystemParametersInfoW(SPI_GETWORKAREA, 0, ctypes.byref(r), 0):
        return r
    r.left, r.top, r.right, r.bottom = 0, 0, 1280, 720
    return r


def _layout():
    """새 창이 맨 아래, 오래된 창이 그 위로 쌓인다 (작업 표시줄 바로 위, 오른쪽 끝)."""
    wa = _work_area()
    w, h, m, g = _px(W), _px(H), _px(MARGIN), _px(GAP)
    y = wa.bottom - m - h
    for hwnd in reversed(_S["order"]):
        user32.SetWindowPos(hwnd, HWND_TOPMOST, wa.right - m - w, y, 0, 0, SWP_NOACTIVATE | SWP_NOSIZE)
        y -= h + g


def _font(size, bold=False):
    return gdi32.CreateFontW(-_px(size * 96 / 72), 0, 0, 0, FW_BOLD if bold else FW_NORMAL, 0, 0, 0, 1, 0, 0,
                             CLEARTYPE_QUALITY, 0, "Malgun Gothic")


def _text(hdc, s, font, color, l, t, r, b, flags):
    old = gdi32.SelectObject(hdc, font)
    gdi32.SetTextColor(hdc, color)
    rc = wintypes.RECT(l, t, r, b)
    user32.DrawTextW(hdc, s, -1, ctypes.byref(rc), flags | DT_NOPREFIX)
    gdi32.SelectObject(hdc, old)


def _paint(hwnd):
    w = _S["wins"].get(hwnd)
    ps = PAINTSTRUCT()
    hdc = user32.BeginPaint(hwnd, ctypes.byref(ps))
    if not hdc:
        return
    try:
        if not w:
            return
        it, f = w["item"], _S["fonts"]
        cw, ch = _px(W), _px(H)
        user32.FillRect(hdc, ctypes.byref(wintypes.RECT(0, 0, cw, ch)), _S["brush"])
        pen = gdi32.CreatePen(0, 1, COL["line"])
        op, ob = gdi32.SelectObject(hdc, pen), gdi32.SelectObject(hdc, gdi32.GetStockObject(NULL_BRUSH))
        gdi32.RoundRect(hdc, 0, 0, cw, ch, _px(RADIUS), _px(RADIUS))
        gdi32.SelectObject(hdc, op), gdi32.SelectObject(hdc, ob)
        gdi32.DeleteObject(pen)
        gdi32.SetBkMode(hdc, TRANSPARENT)
        ic = _px(36)
        if _S["icon"]:
            user32.DrawIconEx(hdc, _px(16), _px(16), _S["icon"], ic, ic, 0, None, DI_NORMAL)
        x, right = _px(16) + ic + _px(12), cw - _px(14)
        _text(hdc, it.get("head") or "레드마인 노트", f["head"], COL["head"], x, _px(10), right - _px(22), _px(28),
              DT_LEFT | DT_SINGLELINE | DT_END_ELLIPSIS)
        _text(hdc, "×", f["title"], COL["x"], right - _px(18), _px(8), right + _px(4), _px(30), DT_CENTER | DT_SINGLELINE | DT_VCENTER)
        _text(hdc, it.get("title") or "", f["title"], COL["title"], x, _px(29), right, _px(50), DT_LEFT | DT_SINGLELINE | DT_END_ELLIPSIS)
        _text(hdc, it.get("text") or "", f["text"], COL["text"], x, _px(51), right, ch - _px(8),
              DT_LEFT | DT_WORDBREAK | DT_EDITCONTROL | DT_END_ELLIPSIS)
    finally:
        user32.EndPaint(hwnd, ctypes.byref(ps))


def _hovered(hwnd):
    pt, r = wintypes.POINT(), wintypes.RECT()
    user32.GetCursorPos(ctypes.byref(pt))
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left <= pt.x < r.right and r.top <= pt.y < r.bottom


def _close(hwnd, now=False):
    w = _S["wins"].get(hwnd)
    if not w:
        return
    if now:
        user32.KillTimer(hwnd, 1)
        _S["wins"].pop(hwnd, None)
        if hwnd in _S["order"]:
            _S["order"].remove(hwnd)
        user32.DestroyWindow(hwnd)
        _layout()
    else:
        w["closing"] = True


def _tick(hwnd):
    w = _S["wins"].get(hwnd)
    if not w:
        return
    if w["closing"]:
        w["alpha"] = max(0, w["alpha"] - 32)
        if not w["alpha"]:
            return _close(hwnd, True)
    else:
        if w["alpha"] < ALPHA_MAX:
            w["alpha"] = min(ALPHA_MAX, w["alpha"] + 36)
        if _hovered(hwnd):                     # 마우스를 올려 두면 사라지지 않는다 (뗀 뒤부터 다시 센다)
            w["until"] = time.monotonic() + SHOW_MS / 1000 / 2
        elif time.monotonic() >= w["until"]:
            w["closing"] = True
    user32.SetLayeredWindowAttributes(hwnd, 0, w["alpha"], LWA_ALPHA)


def _click(hwnd, lp):
    w = _S["wins"].get(hwnd)
    if not w:
        return
    x, y = ctypes.c_short(lp & 0xFFFF).value, ctypes.c_short((lp >> 16) & 0xFFFF).value
    if not (x >= _px(W) - _px(40) and y <= _px(34)):   # × 자리가 아니면 = 알림을 연다
        fn, item = _S["on_click"], w["item"]
        if fn:
            threading.Thread(target=_safe, args=(fn, item), daemon=True).start()   # 창을 여는 동안 알림 창이 멈추지 않게
    _close(hwnd, True)


def _safe(fn, *a):
    try:
        fn(*a)
    except Exception:
        pass


def _create(item):
    cw, ch = _px(W), _px(H)
    hwnd = user32.CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED | WS_EX_NOACTIVATE, CLASS_NAME,
                                  "레드마인 노트 알림", WS_POPUP, 0, 0, cw, ch, None, None, _S["hinst"], None)
    if not hwnd:
        return
    _S["wins"][hwnd] = {"item": item, "alpha": 0, "closing": False, "until": time.monotonic() + SHOW_MS / 1000}
    _S["order"].append(hwnd)
    user32.SetWindowRgn(hwnd, gdi32.CreateRoundRectRgn(0, 0, cw + 1, ch + 1, _px(RADIUS), _px(RADIUS)), True)   # 창이 지역을 가져간다 (지우지 않는다)
    user32.SetLayeredWindowAttributes(hwnd, 0, 0, LWA_ALPHA)
    while len(_S["order"]) > MAX_SHOWN:
        _close(_S["order"][0], True)
    _layout()
    user32.ShowWindow(hwnd, SW_SHOWNOACTIVATE)
    user32.SetTimer(hwnd, 1, TICK_MS, None)


def _wndproc(hwnd, msg, wp, lp):
    if msg == WM_APP_SHOW:
        with _S["lock"]:
            items, _S["queue"] = _S["queue"], []
        for it in items:
            _create(it)
        return 0
    if msg == WM_PAINT:
        _paint(hwnd)
        return 0
    if msg == WM_TIMER:
        _tick(hwnd)
        return 0
    if msg == WM_LBUTTONUP:
        _click(hwnd, lp)
        return 0
    if msg == WM_MOUSEACTIVATE:          # 눌러도 지금 쓰던 창의 포커스를 빼앗지 않는다
        return MA_NOACTIVATE
    if msg == WM_SETCURSOR and hwnd in _S["wins"]:
        user32.SetCursor(user32.LoadCursorW(None, ctypes.c_void_p(IDC_HAND)))
        return 1
    return user32.DefWindowProcW(hwnd, msg, wp, lp)


def _run(ready):
    try:
        hinst = kernel32.GetModuleHandleW(None)
        _S["hinst"] = hinst
        _S["proc"] = WNDPROC(_wndproc)  # 파이썬이 지우지 못하게 붙들어 둔다
        wc = WNDCLASSW()
        wc.lpfnWndProc, wc.hInstance, wc.lpszClassName = _S["proc"], hinst, CLASS_NAME
        user32.RegisterClassW(ctypes.byref(wc))
        try:
            _S["scale"] = max(1.0, user32.GetDpiForSystem() / 96)
        except Exception:
            _S["scale"] = 1.0
        _S["fonts"] = {"head": _font(8.5), "title": _font(10.5, True), "text": _font(9.5)}
        _S["brush"] = gdi32.CreateSolidBrush(COL["bg"])
        ic = _px(36)
        _S["icon"] = user32.LoadImageW(None, str(APP_DIR / "icon.ico"), IMAGE_ICON, ic, ic, LR_LOADFROMFILE)
        _S["host"] = user32.CreateWindowExW(0, CLASS_NAME, CLASS_NAME, 0, 0, 0, 0, 0, None, None, hinst, None)  # 눈에 안 보이는 창: 깨우기 신호만 받는다
    finally:
        ready.set()
    if not _S["host"]:
        return
    msg = MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))


def _start():
    if _S["ready"] is None:
        _S["ready"] = threading.Event()
        threading.Thread(target=_run, args=(_S["ready"],), daemon=True).start()
    _S["ready"].wait(5)
    return bool(_S["host"])


def show(items, on_click=None):
    """알림 창들을 띄운다. 띄웠으면 True (창을 만들 수 없으면 False → 부른 쪽이 윈도우 알림으로 대신한다)."""
    items = [dict(x) for x in items or [] if x]
    if not items or not _start():
        return False
    with _S["lock"]:
        if on_click:
            _S["on_click"] = on_click
        _S["queue"].extend(items)
    return bool(user32.PostMessageW(_S["host"], WM_APP_SHOW, 0, 0))


def shown():
    """지금 떠 있는 알림 창 수 (시험용)."""
    return len(_S["order"])
