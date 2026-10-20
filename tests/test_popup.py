"""오른쪽 아래 알림 창 시험 (윈도우에서만): 실제로 창을 띄워 위치 · 보임 · 나타나기 · 누르기 · 저절로 닫힘을 확인하고 화면을 찍어 둔다.
실행: python tests/test_popup.py <프로젝트 폴더> [찍은 화면을 둘 폴더]"""
import ctypes, os, struct, sys, time
from ctypes import wintypes
if sys.platform != "win32":
    print("SKIP (윈도우 전용)"); sys.exit(0)
sys.path.insert(0, sys.argv[1])
OUT = sys.argv[2] if len(sys.argv) > 2 else "."
from rnotes import popup as P

ok = fail = 0
def t(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print("PASS", name, extra)
    else: fail += 1; print("FAIL", name, extra)

user32, gdi32 = ctypes.WinDLL("user32"), ctypes.WinDLL("gdi32")
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindow.argtypes = [wintypes.HWND]
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetLayeredWindowAttributes.argtypes = [wintypes.HWND, ctypes.c_void_p, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_void_p]
user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.GetDC.restype, user32.GetDC.argtypes = wintypes.HDC, [wintypes.HWND]
user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
gdi32.CreateCompatibleDC.restype, gdi32.CreateCompatibleDC.argtypes = wintypes.HDC, [wintypes.HDC]
gdi32.CreateCompatibleBitmap.restype, gdi32.CreateCompatibleBitmap.argtypes = wintypes.HBITMAP, [wintypes.HDC, ctypes.c_int, ctypes.c_int]
gdi32.SelectObject.restype, gdi32.SelectObject.argtypes = wintypes.HGDIOBJ, [wintypes.HDC, wintypes.HGDIOBJ]
gdi32.BitBlt.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HDC, ctypes.c_int, ctypes.c_int, wintypes.DWORD]
gdi32.GetDIBits.argtypes = [wintypes.HDC, wintypes.HBITMAP, wintypes.UINT, wintypes.UINT, ctypes.c_void_p, ctypes.c_char_p, wintypes.UINT]
gdi32.DeleteObject.argtypes = [wintypes.HGDIOBJ]
gdi32.DeleteDC.argtypes = [wintypes.HDC]

def wait(cond, sec):
    end = time.time() + sec
    while time.time() < end:
        if cond(): return True
        time.sleep(0.05)
    return cond()

def rect(h):
    r = wintypes.RECT(); user32.GetWindowRect(h, ctypes.byref(r)); return r

def alpha(h):
    a = ctypes.c_ubyte(); user32.GetLayeredWindowAttributes(h, None, ctypes.byref(a), None); return a.value

def shot(path, r):
    """화면의 r 영역을 BMP 로 저장 (레이어드 창까지 찍는다)."""
    w, h = r.right - r.left, r.bottom - r.top
    sdc = user32.GetDC(None); mdc = gdi32.CreateCompatibleDC(sdc)
    bmp = gdi32.CreateCompatibleBitmap(sdc, w, h); gdi32.SelectObject(mdc, bmp)
    gdi32.BitBlt(mdc, 0, 0, w, h, sdc, r.left, r.top, 0x00CC0020 | 0x40000000)   # SRCCOPY | CAPTUREBLT
    stride = (w * 3 + 3) & ~3
    hdr = struct.pack("<IiiHHIIiiII", 40, w, h, 1, 24, 0, stride * h, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(stride * h)
    gdi32.GetDIBits(mdc, bmp, 0, h, buf, ctypes.c_char_p(hdr), 0)
    with open(path, "wb") as f:
        f.write(b"BM" + struct.pack("<IHHI", 14 + 40 + len(buf.raw), 0, 0, 54) + hdr + buf.raw)
    gdi32.DeleteObject(bmp); gdi32.DeleteDC(mdc); user32.ReleaseDC(None, sdc)

P.SHOW_MS = 4000
clicked = []
items = [{"id": 601, "new": False, "head": "💬 김기획 외 1건", "title": "#601 로그인 화면 오류 수정 요청", "text": "확인 부탁드려요. 운영 서버에서도 같은 증상이 있어요 (긴 글은 두 줄까지 보이고 말줄임표)"},
         {"id": 501, "new": True, "head": "🆕 새 레드마인 일감", "title": "#501 새 일감 하나", "text": "[DR] 시험 프로젝트"}]
t("show() returns True", P.show(items, lambda it: clicked.append(it["id"])))
t("two windows created", wait(lambda: P.shown() == 2, 3), f"shown={P.shown()}")
hs = list(P._S["order"])
t("all visible", all(user32.IsWindowVisible(h) for h in hs))
wa = P._work_area()
rs = [rect(h) for h in hs]
print("work area", (wa.left, wa.top, wa.right, wa.bottom), "rects", [(r.left, r.top, r.right, r.bottom) for r in rs], "scale", P._S["scale"])
t("inside work area, right-bottom corner", all(wa.left <= r.left and r.right <= wa.right and wa.top <= r.top and r.bottom <= wa.bottom for r in rs)
  and rs[-1].bottom > wa.bottom - P._px(40) and rs[-1].right > wa.right - P._px(40))
t("newest at bottom, older stacked above", rs[0].bottom <= rs[1].top)
t("fades in", wait(lambda: all(alpha(h) == P.ALPHA_MAX for h in hs), 3), f"alpha={[alpha(h) for h in hs]}")
time.sleep(0.3)
u = wintypes.RECT(min(r.left for r in rs) - 20, min(r.top for r in rs) - 20, wa.right, wa.bottom)
try:
    shot(os.path.join(OUT, "popup.bmp"), u); print("screenshot", os.path.join(OUT, "popup.bmp"))
except Exception as e:
    print("screenshot failed (무시):", e)
# 누르기: 본문을 누르면 on_click(item) 을 부르고 그 창만 닫힌다
x, y = P._px(120), P._px(60)
user32.PostMessageW(hs[0], P.WM_LBUTTONUP, 0, (y << 16) | x)
t("click body -> on_click(item)", wait(lambda: clicked == [601], 3), f"clicked={clicked}")
t("clicked window closed", wait(lambda: not user32.IsWindow(hs[0]) and P.shown() == 1, 3))
# × 를 누르면 on_click 없이 닫힌다
x = P._px(P.W) - P._px(16); y = P._px(16)
user32.PostMessageW(hs[1], P.WM_LBUTTONUP, 0, (y << 16) | x)
t("click × -> closed without on_click", wait(lambda: P.shown() == 0, 3) and clicked == [601])
# 그냥 두면 SHOW_MS 뒤에 사라진다
user32.SetCursorPos(0, 0)
P.show([{"id": None, "head": "레드마인 노트", "title": "저절로 닫히는지", "text": ""}])
t("auto shown", wait(lambda: P.shown() == 1, 3))
t("auto close after SHOW_MS", wait(lambda: P.shown() == 0, P.SHOW_MS / 1000 + 4))
# 한 번에 너무 많으면 오래된 것부터 닫는다
P.show([{"id": i, "title": f"#{i}", "text": ""} for i in range(6)])
t("max shown", wait(lambda: P.shown() == P.MAX_SHOWN, 3), f"shown={P.shown()}")
print("OK", ok, "FAIL", fail)
sys.exit(1 if fail else 0)
