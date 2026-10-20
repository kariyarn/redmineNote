"""앱 안에서 업데이트: 깃허브 Releases 의 최신 버전을 확인하고, 받아서 검증한 뒤, 앱을 끄고 새 버전으로 바꿔 다시 켠다.

설치 방식에 따라 바꾸는 방법이 다르다.
- installer: 설치 파일로 깐 경우 (exe 옆에 unins000.exe). 새 설치 파일을 조용히(/VERYSILENT) 실행해 같은 자리에 덮어쓰고 다시 켠다 (/RELAUNCH=1).
- exe: exe 하나만 쓰는 경우. 새 exe 로 바꿔 끼우고 다시 켠다 (예전 exe 는 .old 로 남겼다가 다음 실행 때 지운다).
- source: python main.py 로 실행 중. 확인만 하고 바꾸지는 않는다 (git pull).
앱이 꺼진 다음에 파일을 바꿔야 해서, 바꾸는 일은 따로 띄운 도우미(cmd 스크립트)가 한다. 경로는 환경 변수로 넘겨서 한글 경로도 깨지지 않게 한다."""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from .config import APP_VERSION, BETA, BUILD, FROZEN
from .storage import db, get_settings

REPO = "kariyarn/redmineNote"
API = (os.environ.get("REDMINE_NOTES_UPDATE_API") or "https://api.github.com").rstrip("/")   # 시험에서는 가짜 깃허브
SETUP_NAME, EXE_NAME = "RedmineNotes2-Setup.exe", "RedmineNotes2.exe"   # 정식: Releases 에 늘 같은 이름으로 올린다 (build.yml)
# 베타: Pre-release v<버전>-beta.<번호> 의 RedmineNotes2-Beta-Setup-<버전>-beta.<번호>.exe · RedmineNotes2-Beta-<버전>-beta.<번호>.exe
BETA_TAG = re.compile(r"^v(\d+\.\d+\.\d+)-beta\.(\d+)$")
BETA_BUILD = re.compile(r"빌드:\s*([0-9a-f]{7,40})")   # 베타 릴리스 설명의 '빌드: <커밋>' (같은 빌드인지 알아보려고)
CHECK_EVERY = 24 * 3600          # 자동 확인 간격
CACHE_KEY = "update_info_beta" if BETA else "update_info"   # settings: 마지막 확인 결과 (정식 · 베타가 같은 DB 를 쓰므로 따로)
WORK_DIR = Path(tempfile.gettempdir()) / ("RedmineNotes2-Beta-update" if BETA else "RedmineNotes2-update")
DRY_RUN = os.environ.get("REDMINE_NOTES_UPDATE_DRYRUN") == "1"   # 시험: 도우미를 띄우지도, 앱을 끄지도 않는다
_LOCK = threading.Lock()
_DL = {"state": "idle", "done": 0, "total": 0, "error": "", "file": "", "version": ""}   # 받기 진행 상태 (메모리)


class UpdateError(Exception):
    """사용자에게 그대로 보여 줄 한국어 설명."""


def parse_ver(s):
    """'v2.18.0' · '2.18' → (2, 18, 0). 숫자만 본다."""
    nums = [int(x) for x in re.findall(r"\d+", str(s or ""))[:3]]
    return tuple(nums + [0] * (3 - len(nums))) if nums else (0, 0, 0)


def is_newer(latest, current=APP_VERSION):
    return parse_ver(latest) > parse_ver(current)


def install_mode():
    forced = os.environ.get("REDMINE_NOTES_UPDATE_MODE")   # 시험 전용: 화면 흐름을 소스 실행에서도 확인하려고
    if forced in ("installer", "exe", "source"):
        return forced
    if not FROZEN:
        return "source"
    exe = Path(sys.executable)
    return "installer" if (exe.parent / "unins000.exe").exists() else "exe"


def auto_on(s=None):
    """시작할 때 · 하루에 한 번 자동으로 확인 (설정 update_auto, 기본 켬)."""
    return str((get_settings() if s is None else s).get("update_auto") or "1") != "0"


def _cache(s=None):
    try:
        c = json.loads((get_settings() if s is None else s).get(CACHE_KEY) or "{}")
    except ValueError:
        c = {}
    return c if isinstance(c, dict) else {}


def _save_cache(c):
    with db() as conn:
        conn.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                     (CACHE_KEY, json.dumps(c, ensure_ascii=False)))


def _get(url, timeout=20):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": f"RedmineNotes2/{APP_VERSION}"})
    return urllib.request.urlopen(req, timeout=timeout)


# ---------- 확인 ----------
def _beta_latest(rels):
    """Pre-release 중 가장 새 베타 (버전 · 베타 번호 순). 베타 이름의 파일이 있는 것만."""
    best = None
    for rel in rels if isinstance(rels, list) else []:
        m = BETA_TAG.match(str(rel.get("tag_name") or ""))
        if not m or rel.get("draft") or not rel.get("prerelease"):
            continue
        key = (parse_ver(m.group(1)), int(m.group(2)))
        if best is None or key > best[0]:
            best = (key, rel, m.group(1), int(m.group(2)))
    return best


def check():
    """최신 릴리스를 확인해서 남기고 돌려준다 (정식은 Latest, 베타는 가장 새 베타). 실패하면 이유를 남기고 UpdateError."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    c = _cache()
    c["checked_at"] = now
    try:
        with _get(f"{API}/repos/{REPO}/releases" + ("?per_page=40" if BETA else "/latest")) as r:
            rel = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        msg = "아직 올라온 릴리스가 없어요" if e.code == 404 else (
            "깃허브 확인 횟수 제한에 걸렸어요 — 한 시간쯤 뒤에 다시 확인해요" if e.code in (403, 429) else f"깃허브가 오류로 응답했어요 (HTTP {e.code})")
        c.update(error=msg)
        _save_cache(c)
        raise UpdateError(msg) from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        msg = "깃허브에 연결할 수 없어요 — 네트워크를 확인하세요"
        c.update(error=msg)
        _save_cache(c)
        raise UpdateError(msg) from None
    if BETA:
        best = _beta_latest(rel)
        if not best:
            c.update(error="아직 올라온 베타 릴리스가 없어요")
            _save_cache(c)
            raise UpdateError(c["error"])
        _, rel, ver, n = best
        latest = f"{ver} beta.{n}"
        pick = {"installer": f"RedmineNotes2-Beta-Setup-{ver}-beta.{n}.exe", "exe": f"RedmineNotes2-Beta-{ver}-beta.{n}.exe"}.get(install_mode())
        bm = BETA_BUILD.search(str(rel.get("body") or ""))
        c.update(ver=ver, build=bm.group(1) if bm else "")
    else:
        latest = str(rel.get("tag_name") or "").lstrip("vV")
        pick = {"installer": SETUP_NAME, "exe": EXE_NAME}.get(install_mode())
    assets = {a.get("name"): a for a in rel.get("assets") or [] if isinstance(a, dict)}
    a = assets.get(pick) if pick else None
    c.update(error="", latest=latest, page=rel.get("html_url") or f"https://github.com/{REPO}/releases/latest",
             published_at=rel.get("published_at") or "", notes=str(rel.get("body") or "")[:2000],
             asset={"name": a.get("name"), "url": a.get("browser_download_url"), "size": int(a.get("size") or 0),
                    "digest": str(a.get("digest") or "")} if a else None)
    _save_cache(c)
    return status()


def maybe_check(now=None):
    """자동 확인: 켜져 있고 마지막 확인에서 하루가 지났으면. 실패해도 조용히 넘어간다 (이유는 남는다)."""
    now = now or time.time()
    if not auto_on():
        return None
    last = _cache().get("checked_at")
    try:
        if last and now - datetime.datetime.fromisoformat(last).timestamp() < CHECK_EVERY:
            return None
    except ValueError:
        pass
    try:
        return check()
    except UpdateError:
        return None


def _newer(c):
    latest = c.get("latest") or ""
    if not latest:
        return False
    if not BETA:
        return is_newer(latest)
    # 베타는 자기 베타 번호를 모른다 → 빌드한 커밋으로 '같은 빌드인지' 본다. 버전이 지금보다 낮은 베타로는 내려가지 않는다
    rel_build, ver = c.get("build") or "", c.get("ver") or ""
    if parse_ver(ver) < parse_ver(APP_VERSION):
        return False
    if rel_build and BUILD:
        return not (rel_build.startswith(BUILD[:7]) or BUILD.startswith(rel_build[:7]))
    return is_newer(ver)


def status():
    c = _cache()
    latest = c.get("latest") or ""
    mode = install_mode()
    return {
        "current": APP_VERSION, "channel": "beta" if BETA else "stable", "build": BUILD, "mode": mode, "auto": auto_on(),
        "checked_at": c.get("checked_at") or "", "error": c.get("error") or "",
        "latest": latest, "newer": _newer(c), "page": c.get("page") or f"https://github.com/{REPO}/releases",
        "published_at": c.get("published_at") or "", "notes": c.get("notes") or "",
        "can_apply": mode != "source" and bool(c.get("asset")), "asset_size": (c.get("asset") or {}).get("size") or 0,
        "download": dict(_DL),
    }


# ---------- 받기 ----------
def start_download():
    """새 버전 파일을 백그라운드로 받는다. 진행은 status()['download'] 로 본다."""
    st = status()
    if not st["newer"]:
        raise UpdateError("받을 새 버전이 없어요 — 먼저 업데이트를 확인하세요")
    if st["mode"] == "source":
        raise UpdateError("소스(python main.py)로 실행 중이라 앱 안에서 바꿀 수 없어요 — git pull 로 받으세요")
    asset = _cache().get("asset")
    if not asset or not asset.get("url"):
        raise UpdateError("이 버전에는 받을 파일이 없어요 — 릴리스 페이지에서 직접 받으세요")
    with _LOCK:
        if _DL["state"] == "downloading":
            return status()
        if _DL["state"] == "ready" and _DL["version"] == st["latest"] and Path(_DL["file"]).exists():
            return status()
        _DL.update(state="downloading", done=0, total=int(asset.get("size") or 0), error="", file="", version=st["latest"])
    threading.Thread(target=_download, args=(asset, st["latest"]), daemon=True).start()
    return status()


def _download(asset, version):
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    final = WORK_DIR / (asset["name"] if BETA else f"{Path(asset['name']).stem}-{version}.exe")   # 베타 파일 이름에는 이미 버전 · 번호가 있다
    part = final.with_suffix(".part")
    try:
        h = hashlib.sha256()
        with _get(asset["url"], timeout=60) as r, open(part, "wb") as f:
            total = int(r.headers.get("Content-Length") or asset.get("size") or 0)
            _DL["total"] = total
            while True:
                chunk = r.read(256 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                h.update(chunk)
                _DL["done"] += len(chunk)
        verify(part, asset, h.hexdigest())
        os.replace(part, final)
        _DL.update(state="ready", file=str(final))
    except UpdateError as e:
        _DL.update(state="error", error=str(e))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        _DL.update(state="error", error=f"받는 중에 끊겼어요 — 다시 시도하세요 ({e.__class__.__name__})")
    finally:
        try:
            part.unlink()
        except OSError:
            pass


def verify(path, asset, sha_hex=None):
    """받은 파일이 맞는지: 크기 · (깃허브가 알려 주면) SHA-256 · 윈도우 실행 파일(MZ)."""
    path = Path(path)
    size = path.stat().st_size
    want = int(asset.get("size") or 0)
    if want and size != want:
        raise UpdateError(f"받은 파일 크기가 달라요 ({size} / {want} 바이트) — 다시 받으세요")
    digest = str(asset.get("digest") or "")
    if digest.startswith("sha256:"):
        if sha_hex is None:
            sha_hex = hashlib.sha256(path.read_bytes()).hexdigest()
        if sha_hex.lower() != digest.split(":", 1)[1].lower():
            raise UpdateError("받은 파일의 SHA-256 이 깃허브에 올라간 값과 달라요 — 다시 받으세요")
    with open(path, "rb") as f:
        if f.read(2) != b"MZ":
            raise UpdateError("받은 파일이 윈도우 실행 파일이 아니에요")


# ---------- 바꾸기 ----------
HELPER = r"""@echo off
rem RedmineNotes2 updater: wait for the app to exit, replace it with the new version, start it again. Paths come in RN_* env vars.
set LOG=%RN_LOG%
echo [%date% %time%] start mode=%RN_MODE% >> "%LOG%"
for %%P in (%RN_PIDS%) do call :waitpid %%P
if /i "%RN_MODE%"=="installer" goto installer
set N=0
:moveold
move /y "%RN_TARGET%" "%RN_TARGET%.old" >> "%LOG%" 2>&1 && goto movenew
set /a N+=1
if %N% geq 30 goto failed
ping -n 2 127.0.0.1 >nul
goto moveold
:movenew
move /y "%RN_NEW%" "%RN_TARGET%" >> "%LOG%" 2>&1 && goto started
echo [%date% %time%] new exe move failed, restoring >> "%LOG%"
move /y "%RN_TARGET%.old" "%RN_TARGET%" >> "%LOG%" 2>&1
:failed
echo [%date% %time%] replace failed >> "%LOG%"
:started
start "" "%RN_TARGET%"
goto end
:installer
"%RN_NEW%" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /RELAUNCH=1 >> "%LOG%" 2>&1
echo [%date% %time%] setup exit %errorlevel% >> "%LOG%"
if errorlevel 1 start "" "%RN_TARGET%"
del /q "%RN_NEW%" >nul 2>&1
:end
echo [%date% %time%] done >> "%LOG%"
exit /b 0
:waitpid
set W=0
:waitloop
tasklist /FI "PID eq %1" 2>nul | find " %1 " >nul || exit /b 0
set /a W+=1
if %W% geq 60 exit /b 0
ping -n 2 127.0.0.1 >nul
goto waitloop
"""


def helper_env(new_file, mode=None):
    """도우미에게 넘길 값. 지금 프로세스(와 onefile exe 의 바깥 프로세스)가 끝나길 기다린다."""
    mode = mode or install_mode()
    pids = [os.getpid()]
    meipass = getattr(sys, "_MEIPASS", None)
    if FROZEN and meipass and Path(meipass).resolve() != Path(sys.executable).parent.resolve():   # onefile: exe 를 붙잡고 있는 바깥 프로세스도
        pids.append(os.getppid())
    return {"RN_MODE": mode, "RN_NEW": str(new_file), "RN_TARGET": str(Path(sys.executable)), "RN_PIDS": " ".join(map(str, pids)),
            "RN_LOG": str(WORK_DIR / "update.log")}


def clean_env(env=None):
    """도우미 → 설치 파일 → 새 exe 로 이어지는 프로세스에 넘길 환경 변수.
    PyInstaller onefile exe 는 _PYI_* (풀어 놓은 임시 폴더 _MEIxxxx 위치 등)를 환경에 두는데, 새 exe 가 예전 exe 와 같은 경로라서
    이것을 물려받으면 '같은 앱의 자식'으로 여겨 이미 지워진 예전 임시 폴더에서 python3xx.dll 을 찾다가 실패한다
    (업데이트 뒤 다시 켜질 때 'python dll 을 찾을 수 없습니다'). 그래서 빼고, 새로 시작하라고(PYINSTALLER_RESET_ENVIRONMENT) 알린다."""
    env = {k: v for k, v in (os.environ if env is None else env).items() if not (k.upper().startswith("_PYI_") or k.upper().startswith("_MEIPASS"))}
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return env


SETUP_ARGS = ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS", "/RELAUNCH=1"]   # 도우미(HELPER)가 넘기는 것과 같다


def _oserr(e):
    return f"WinError {e.winerror}" if getattr(e, "winerror", None) else (e.strerror or str(e) or e.__class__.__name__)


def write_helper():
    """도우미 파일을 쓴다. 매번 새 이름으로: 지난번 도우미가 아직 붙잡고 있거나 백신이 검사 중인 파일을 덮어쓰다가
    '액세스가 거부되었습니다(WinError 5)' 로 막히지 않게. 지난 도우미 파일은 지울 수 있으면 지운다."""
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    for old in WORK_DIR.glob("apply-update*.cmd"):
        try:
            old.unlink()
        except OSError:
            pass
    script = WORK_DIR / f"apply-update-{os.getpid()}-{int(time.time())}.cmd"
    script.write_bytes(HELPER.replace("\n", "\r\n").encode("ascii"))   # cmd 는 CRLF · ASCII 로 (경로는 환경 변수로 넘겨 한글도 안전)
    return script


def apply():
    """받아 둔 새 버전으로 바꾼다: 도우미를 띄우고 앱을 끈다. 화면에 응답할 틈을 주려고 끄는 것은 잠깐 뒤에."""
    st = status()
    if st["mode"] == "source":
        raise UpdateError("소스(python main.py)로 실행 중이라 앱 안에서 바꿀 수 없어요 — git pull 로 받으세요")
    if _DL["state"] != "ready" or not Path(_DL["file"]).exists():
        raise UpdateError("받아 둔 새 버전이 없어요 — 먼저 받으세요")
    if st["mode"] == "exe" and not os.access(Path(sys.executable).parent, os.W_OK):
        raise UpdateError("이 exe 가 있는 폴더에 쓸 수 없어요 — 설치 파일(RedmineNotes2-Setup.exe)로 설치하면 앱 안에서 업데이트할 수 있어요")
    env = {**clean_env(), **helper_env(_DL["file"], st["mode"])}
    try:
        script = write_helper()
    except OSError as e:
        script = None
        if st["mode"] != "installer":
            raise UpdateError(f"업데이트 도우미 파일을 임시 폴더에 쓰지 못했어요 ({_oserr(e)}) — 백신이 막았을 수 있어요. 릴리스 페이지에서 설치 파일을 받아 직접 실행하세요")
    _DL["state"] = "applying"
    if DRY_RUN:
        return {"ok": True, "dry_run": True, "script": str(script), "env": {k: v for k, v in env.items() if k.startswith("RN_")},
                "inherit": sorted(k for k in env if k.upper().startswith(("_PYI_", "_MEIPASS", "PYINSTALLER_")))}
    flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        if script is None:
            raise OSError("도우미 파일 없음")
        subprocess.Popen(["cmd.exe", "/d", "/c", str(script)], env=env, creationflags=flags, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as e:
        if st["mode"] != "installer":
            _DL["state"] = "ready"
            raise UpdateError(f"업데이트 도우미를 실행하지 못했어요 ({_oserr(e)}) — 보안 정책 · 백신이 막았을 수 있어요. 릴리스 페이지에서 받아 직접 바꾸세요")
        try:   # 설치 파일 방식은 도우미 없이도 된다: 설치 파일이 켜져 있는 앱을 닫고(CloseApplications) 설치한 뒤 다시 켠다(RELAUNCH)
            subprocess.Popen([_DL["file"], *SETUP_ARGS], env=clean_env(), close_fds=True,
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as e2:
            _DL["state"] = "ready"
            raise UpdateError(f"설치 파일을 실행하지 못했어요 ({_oserr(e2)}) — 보안 정책 · 백신이 막았을 수 있어요. "
                              f"받아 둔 파일: {_DL['file']} 을 직접 실행하거나 릴리스 페이지에서 받으세요")

    def bye():
        time.sleep(1.0)
        from .lifecycle import shutdown
        shutdown()
    threading.Thread(target=bye, daemon=True).start()
    return {"ok": True}


def cleanup_old():
    """exe 방식으로 바꾼 뒤 남은 예전 exe(.old)와 받은 파일을 지운다 (새 버전이 켜졌을 때)."""
    if not FROZEN:
        return
    for p in (Path(sys.executable).with_name(Path(sys.executable).name + ".old"),):
        try:
            p.unlink()
        except OSError:
            pass
    try:
        for p in WORK_DIR.glob("*.exe"):
            if BETA or not is_newer(p.stem.rsplit("-", 1)[-1]):   # 지금 버전보다 새것이 아니면(= 이미 깔린 것) 지운다. 베타는 번호를 몰라 늘 지운다 (필요하면 다시 받는다)
                p.unlink()
    except OSError:
        pass


def loop():
    """자동 확인: 켠 뒤 30초, 그 뒤 한 시간마다 '하루가 지났는지' 본다."""
    try:
        cleanup_old()
    except Exception:
        pass
    time.sleep(30)
    while True:
        try:
            maybe_check()
        except Exception:
            pass
        time.sleep(3600)
