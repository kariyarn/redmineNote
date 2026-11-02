"""앱 안 다운로드: 브라우저(크롬/엣지)의 다운로드 대신 서버가 파일을 '다운로드' 폴더에 바로 저장하고 목록을 남긴다.
앱 창에 브라우저 기본 다운로드 팝업이 뜨지 않게, 화면은 저장할 것(같은 서버의 주소 또는 파일 내용)만 넘기고
다운로드 목록 레이어에서 열기 · 폴더에서 보기를 한다. 목록은 settings 의 downloads 에 최근 것부터 남긴다."""
import datetime
import json
import os
import re
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
from pathlib import Path

from .config import PORT
from .storage import db, get_settings

_NO_PROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))
KEY = "downloads"
KEEP = 100                     # 목록에 남길 개수 (파일은 지우지 않는다)
_LOCK = threading.Lock()
DRY_RUN = os.environ.get("REDMINE_NOTES_DL_DRYRUN") == "1"   # 시험: 파일 열기 · 탐색기를 띄우지 않는다


class DownloadError(Exception):
    """화면에 그대로 보여 줄 한국어 설명."""


DIR_KEY = "download_dir"       # settings: 사용자가 고른 저장 폴더 (비어 있으면 윈도우 '다운로드' 폴더)


def downloads_dir(s=None):
    """저장할 폴더: 설정에서 고른 폴더, 없으면 윈도우의 '다운로드' 폴더. 시험은 환경 변수가 먼저."""
    forced = os.environ.get("REDMINE_NOTES_DOWNLOAD_DIR")
    if forced:
        return Path(forced)
    custom = ((get_settings() if s is None else s).get(DIR_KEY) or "").strip()
    return Path(custom) if custom else default_dir()


def default_dir():
    """윈도우의 '다운로드' 폴더 (사용자가 옮겼으면 옮긴 곳). 다른 OS 는 ~/Downloads."""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class GUID(ctypes.Structure):
                _fields_ = [("a", wintypes.DWORD), ("b", wintypes.WORD), ("c", wintypes.WORD), ("d", ctypes.c_ubyte * 8)]
            g = GUID(0x374DE290, 0x123F, 0x4565, (ctypes.c_ubyte * 8)(0x91, 0x64, 0x39, 0xC4, 0x92, 0x5E, 0x46, 0x7B))   # FOLDERID_Downloads
            p = ctypes.c_wchar_p()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(g), 0, None, ctypes.byref(p)) == 0:
                try:
                    return Path(p.value)
                finally:
                    ctypes.windll.ole32.CoTaskMemFree(p)
        except Exception:
            pass
    return Path.home() / "Downloads"


def safe_name(name):
    """경로 · 윈도우에서 못 쓰는 글자를 뺀 파일 이름."""
    name = os.path.basename(str(name or "").replace("\\", "/")).strip()
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    if re.fullmatch(r"(?i)(con|prn|aux|nul|com\d|lpt\d)(\..*)?", name):
        name = "_" + name
    return name[:180] or "download"


def _unique(folder, name):
    """같은 이름이 있으면 '이름 (1).확장자' 처럼 (브라우저와 같게)."""
    p = folder / name
    stem, ext = os.path.splitext(name)
    i = 1
    while p.exists():
        p = folder / f"{stem} ({i}){ext}"
        i += 1
    return p


def _items(s=None):
    try:
        v = json.loads((get_settings() if s is None else s).get(KEY) or "[]")
    except ValueError:
        v = []
    return v if isinstance(v, list) else []


def _save_items(items):
    with db() as c:
        c.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  (KEY, json.dumps(items[:KEEP], ensure_ascii=False)))


def _fetch_local(path):
    """같은 서버의 GET 주소(/api/...)를 받아 온다 (첨부파일 · 백업 내려받기 등). 다른 곳으로는 나가지 않는다."""
    u = urllib.parse.urlsplit(path or "")
    if u.scheme or u.netloc or not u.path.startswith("/api/"):
        raise DownloadError("이 앱 안의 파일만 저장할 수 있어요")
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{u.path}" + (f"?{u.query}" if u.query else ""),
                                 headers={"Host": f"127.0.0.1:{PORT}"})
    try:
        with _NO_PROXY.open(req, timeout=120) as r:   # 같은 PC 안이라 회사 프록시 설정을 타지 않게
            data = r.read()
            cd = r.headers.get("Content-Disposition") or ""
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error")
        except Exception:
            msg = ""
        raise DownloadError(msg or f"파일을 받지 못했어요 (HTTP {e.code})") from None
    except OSError as e:
        raise DownloadError(f"파일을 받지 못했어요 ({e})") from None
    m = re.search(r"filename\*=UTF-8''([^;]+)", cd) or re.search(r'filename="?([^";]+)"?', cd)
    return data, (urllib.parse.unquote(m.group(1)) if m else "")


def save(name, data=None, url=None):
    """파일을 다운로드 폴더에 저장하고 목록 맨 앞에 남긴다. 저장한 항목을 돌려준다."""
    hint = ""
    if url is not None:
        data, hint = _fetch_local(url)
    if data is None:
        raise DownloadError("저장할 내용이 없어요")
    folder = downloads_dir()
    try:
        folder.mkdir(parents=True, exist_ok=True)
        with _LOCK:
            p = _unique(folder, safe_name(name or hint or (os.path.basename(urllib.parse.urlsplit(url or "").path) if url else "")))
            tmp = p.with_name(p.name + ".part")
            tmp.write_bytes(data)
            os.replace(tmp, p)
            item = {"id": f"{int(datetime.datetime.now().timestamp() * 1000)}-{os.getpid()}-{len(_items())}",
                    "name": p.name, "path": str(p), "size": len(data),
                    "at": datetime.datetime.now().isoformat(timespec="seconds")}
            _save_items([item] + _items())
    except OSError as e:
        raise DownloadError(f"다운로드 폴더에 저장하지 못했어요 ({e.strerror or e})") from None
    return listing_item(item)


def listing_item(it):
    return dict(it, exists=Path(it.get("path") or "").exists())


def listing():
    s = get_settings()
    return {"folder": str(downloads_dir(s)), "default": str(default_dir()), "custom": bool((s.get(DIR_KEY) or "").strip()),
            "items": [listing_item(it) for it in _items(s)]}


def set_folder(path):
    """저장 폴더를 바꾼다. 빈 값이면 기본('다운로드' 폴더)으로. 절대 경로여야 하고, 없으면 만들고, 쓸 수 있는지 확인한다."""
    path = (path or "").strip().strip('"')
    if path:
        p = Path(os.path.expandvars(os.path.expanduser(path)))
        if not p.is_absolute():
            raise DownloadError("폴더는 C:\\… 처럼 전체 경로로 적어 주세요")
        try:
            p.mkdir(parents=True, exist_ok=True)
            probe = p / f".rn-write-test-{os.getpid()}"
            probe.write_bytes(b"")
            probe.unlink()
        except OSError as e:
            raise DownloadError(f"이 폴더에는 저장할 수 없어요 ({e.strerror or e})") from None
        path = str(p)
    with db() as c:
        c.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (DIR_KEY, path))
    return listing()


def pick_folder():
    """윈도우 폴더 고르기 창을 띄워 고른 폴더를 돌려준다 ({path} · 취소하면 {cancel: True}). 저장은 하지 않는다."""
    if DRY_RUN:
        v = os.environ.get("REDMINE_NOTES_DL_PICK", "")
        return {"path": v} if v else {"cancel": True}
    if sys.platform != "win32":
        raise DownloadError("폴더 고르기 창은 윈도우에서만 열 수 있어요 — 경로를 직접 적어 주세요")
    import ctypes
    from ctypes import wintypes

    class BROWSEINFOW(ctypes.Structure):
        _fields_ = [("hwndOwner", wintypes.HWND), ("pidlRoot", ctypes.c_void_p), ("pszDisplayName", wintypes.LPWSTR),
                    ("lpszTitle", wintypes.LPCWSTR), ("ulFlags", wintypes.UINT), ("lpfn", ctypes.c_void_p),
                    ("lParam", wintypes.LPARAM), ("iImage", ctypes.c_int)]
    shell32, ole32, user32 = ctypes.windll.shell32, ctypes.windll.ole32, ctypes.windll.user32
    shell32.SHBrowseForFolderW.restype = ctypes.c_void_p
    shell32.SHBrowseForFolderW.argtypes = [ctypes.POINTER(BROWSEINFOW)]
    shell32.SHGetPathFromIDListW.argtypes = [ctypes.c_void_p, wintypes.LPWSTR]
    ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    ole32.OleInitialize(None)   # 새 모양 창(BIF_NEWDIALOGSTYLE)은 OLE 초기화가 필요하다 (이 요청을 처리하는 스레드에서)
    try:
        name = ctypes.create_unicode_buffer(260)
        bi = BROWSEINFOW(hwndOwner=user32.GetForegroundWindow(), pszDisplayName=name,
                         lpszTitle="다운로드한 파일을 저장할 폴더를 고르세요", ulFlags=0x0001 | 0x0040)   # 파일 시스템 폴더만 · 새 모양(새 폴더 만들기)
        pidl = shell32.SHBrowseForFolderW(ctypes.byref(bi))
        if not pidl:
            return {"cancel": True}
        try:
            buf = ctypes.create_unicode_buffer(32768)
            if not shell32.SHGetPathFromIDListW(pidl, buf) or not buf.value:
                raise DownloadError("그 폴더는 고를 수 없어요 (실제 폴더를 골라 주세요)")
            return {"path": buf.value}
        finally:
            ole32.CoTaskMemFree(pidl)
    finally:
        ole32.OleUninitialize()


def _find(item_id):
    for it in _items():
        if it.get("id") == item_id:
            return it
    raise DownloadError("목록에 없는 파일이에요")


def _launch(path, select=False):
    """윈도우: select 면 탐색기에서 그 파일을 골라 보여 주고, 아니면 기본 프로그램으로 연다. 그 밖의 OS 는 xdg-open."""
    if DRY_RUN:
        return {"ok": True, "dry_run": True, "path": str(path), "select": select}
    if sys.platform == "win32":
        if select:
            _select_in_explorer(str(path))
        else:
            os.startfile(str(path))   # noqa: S606 — 이 앱이 저장한 파일 · 다운로드 폴더만
    else:
        subprocess.Popen(["xdg-open", str(Path(path).parent if select else path)], close_fds=True)
    return {"ok": True}


def _select_in_explorer(path):
    """탐색기에서 그 파일을 골라 보여 준다. 셸 함수(SHOpenFolderAndSelectItems)로 경로를 그대로 넘긴다.
    예전에는 ['explorer', '/select,경로'] 로 넘겨, 경로에 빈칸이 있으면 파이썬이 '/select,…' 전체를 따옴표로 감싸
    탐색기가 알아듣지 못하고 엉뚱한 폴더(문서)를 열었다. 셸 함수가 안 되면 따옴표를 경로에만 붙인 명령으로."""
    import ctypes
    try:
        shell32, ole32 = ctypes.windll.shell32, ctypes.windll.ole32
        shell32.ILCreateFromPathW.restype = ctypes.c_void_p
        shell32.ILCreateFromPathW.argtypes = [ctypes.c_wchar_p]
        shell32.SHOpenFolderAndSelectItems.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_uint]
        shell32.ILFree.argtypes = [ctypes.c_void_p]
        ole32.CoInitialize(None)
        pidl = shell32.ILCreateFromPathW(path)
        if pidl:
            try:
                if shell32.SHOpenFolderAndSelectItems(pidl, 0, None, 0) == 0:
                    return
            finally:
                shell32.ILFree(pidl)
    except Exception:
        pass
    subprocess.Popen(f'explorer /select,"{path}"', close_fds=True)   # 문자열 그대로: 따옴표는 경로에만


def open_item(item_id):
    """파일을 기본 프로그램으로 연다."""
    p = Path(_find(item_id)["path"])
    if not p.exists():
        raise DownloadError("파일이 없어요 — 옮기거나 지운 것 같아요")
    return _launch(p)


def reveal(item_id=None):
    """탐색기에서 파일을 골라 보여 준다 (파일이 없거나 item_id 가 없으면 다운로드 폴더를 연다)."""
    p = Path(_find(item_id)["path"]) if item_id else None
    if p is not None and p.exists():
        return _launch(p, select=True)
    folder = downloads_dir()
    folder.mkdir(parents=True, exist_ok=True)
    return _launch(folder)


def forget(item_id=None):
    """목록에서 뺀다 (파일은 그대로). item_id 가 없으면 목록을 비운다."""
    with _LOCK:
        _save_items([] if item_id is None else [it for it in _items() if it.get("id") != item_id])
    return listing()
