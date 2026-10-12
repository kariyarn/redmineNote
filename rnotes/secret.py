"""API 키를 윈도우 사용자별 암호화(DPAPI)로 보호한다. 외부 라이브러리 없음.

같은 PC의 같은 윈도우 사용자 계정에서만 풀린다. 설정 파일을 다른 PC나 다른 계정으로 복사해도 열리지 않는다.
(이 프로그램 전용 추가 값을 섞어서, 같은 계정의 다른 프로그램이 같은 방식으로 푸는 것도 어렵게 한다.)
"""
import base64
import ctypes
from ctypes import wintypes

_ENTROPY = b"RedmineNotes.v1"
_UI_FORBIDDEN = 0x1  # 암호 입력 창을 띄우지 않는다


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


_crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
_crypt32.CryptProtectData.argtypes = [ctypes.POINTER(DATA_BLOB), wintypes.LPCWSTR, ctypes.POINTER(DATA_BLOB),
                                      ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DATA_BLOB)]
_crypt32.CryptProtectData.restype = wintypes.BOOL
_crypt32.CryptUnprotectData.argtypes = [ctypes.POINTER(DATA_BLOB), ctypes.POINTER(wintypes.LPWSTR),
                                        ctypes.POINTER(DATA_BLOB), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD,
                                        ctypes.POINTER(DATA_BLOB)]
_crypt32.CryptUnprotectData.restype = wintypes.BOOL
_kernel32.LocalFree.argtypes = [ctypes.c_void_p]


def _blob(data):
    buf = (ctypes.c_byte * len(data)).from_buffer_copy(data)
    return DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_byte))), buf


def _take(blob):
    data = ctypes.string_at(blob.pbData, blob.cbData)
    _kernel32.LocalFree(blob.pbData)
    return data


def protect(text):
    """문자열을 암호화해서 base64 문자열로 돌려준다. 실패하면 None."""
    src, keep1 = _blob(text.encode("utf-8"))
    ent, keep2 = _blob(_ENTROPY)
    out = DATA_BLOB()
    if not _crypt32.CryptProtectData(ctypes.byref(src), "RedmineNotes", ctypes.byref(ent), None, None,
                                     _UI_FORBIDDEN, ctypes.byref(out)):
        return None
    return base64.b64encode(_take(out)).decode("ascii")


def unprotect(b64):
    """protect() 로 만든 문자열을 푼다. 다른 PC·계정이거나 손상됐으면 None."""
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return None
    src, keep1 = _blob(raw)
    ent, keep2 = _blob(_ENTROPY)
    out = DATA_BLOB()
    if not _crypt32.CryptUnprotectData(ctypes.byref(src), None, ctypes.byref(ent), None, None,
                                       _UI_FORBIDDEN, ctypes.byref(out)):
        return None
    return _take(out).decode("utf-8", "replace")
