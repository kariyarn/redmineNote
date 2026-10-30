"""깃허브 백업: 노트 DB(notes.db 스냅샷)를 내 비공개(Private) 깃허브 저장소에 올린다. 외부 라이브러리 없음.
(등록한 폰트는 올리지 않는다: 다시 등록하면 되고, 저장소만 커진다.)

- 동기화가 아니라 '백업'이다: 올리기만 자동이고, 내려받기(복원)는 사용자가 백업 시점을 골라 직접 한다.
- 올리는 때: 자동 올리기를 켜면 ① 앱 창을 닫을 때(프로그램을 끌 때 포함)는 늘 올리고, ② 켜져 있는 동안 N시간마다 올린다(0 = 닫을 때만).
  꺼져 있던 사이에 N시간이 지났으면 켤 때 한 번만 올린다. 요청이 여러 번 겹치면(닫기 · 시간 · 다시 시도) 마지막 요청 하나만 남긴다.
  바뀐 게 없으면 올리지 않는다.
- PC 한 대 기준: 저장소의 최신 기록이 이 PC가 마지막으로 올린(또는 복원한) 것이 아니면 올리지 않고 알린다 (덮어쓰기 · 병합 없음).
- 토큰은 API 키처럼 윈도우 사용자별 암호화(DPAPI)로 HOME_DIR/gitbackup.json 에 둔다. 화면으로는 돌려주지 않고, 백업 zip 에도 들어가지 않는다.
- 깃허브 Git Data API 로 한 번에 커밋한다: blob(파일) → tree → commit → ref 이동(빨리 감기만 허용).
"""
import base64
import datetime
import hashlib
import io
import json
import os
import platform
import re
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from .config import APP_VERSION, DB_PATH, HOME_DIR, RUN
from .storage import db, restore_bytes
from .http_client import RedirectBlocked, open_authenticated

API = (os.environ.get("REDMINE_NOTES_GITHUB_API") or "https://api.github.com").rstrip("/")   # 시험에서는 가짜 깃허브 주소
CFG_PATH = HOME_DIR / "gitbackup.json"
MAX_HOURS = 24                 # 켜져 있는 동안 올리는 간격(시간). 0 = 앱을 닫을 때만
DEFAULT_HOURS = 3
MAX_FILE = 100 * 1024 * 1024   # 깃허브 파일 하나 최대 100MB
RETRY_SEC = 15 * 60            # 정해진 때 올리기가 실패하면 15분마다 다시 해 본다 (충돌 · 설정 오류는 다시 하지 않는다)
TICK = int(os.environ.get("REDMINE_NOTES_GITBACKUP_TICK") or 30)
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
LOCK = threading.Lock()
_RT = {"was_open": False, "pending": False, "next_retry": 0.0, "notified": "", "again": "", "started": False}   # 실행 중에만 쓰는 상태 (again: 올리는 중에 들어와 미뤄 둔 마지막 요청)


class BackupError(Exception):
    """사용자에게 그대로 보여 줄 한국어 설명. kind: auth / notfound / public / conflict / size / network / server / config"""
    def __init__(self, msg, kind="other"):
        super().__init__(msg)
        self.kind = kind


# ---------- 설정 (HOME_DIR/gitbackup.json: 이 PC 에만 있다. 노트 DB 를 복원해도 바뀌지 않는다) ----------
def load():
    try:
        d = json.loads(CFG_PATH.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save(d):
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CFG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, CFG_PATH)


def _update(**kv):
    d = load()
    d.update(kv)
    _save(d)
    return d


def _token(d):
    if d.get("token_enc"):
        try:
            from . import secret
            return secret.unprotect(d["token_enc"]) or ""
        except Exception:
            return ""
    return d.get("token", "")


def _store_token(d, token):
    d.pop("token", None)
    d.pop("token_enc", None)
    if not token:
        return
    enc = None
    if sys.platform == "win32":
        try:
            from . import secret
            enc = secret.protect(token)
        except Exception:
            enc = None
    if enc:
        d["token_enc"] = enc
    else:
        d["token"] = token


def auto(d):
    """자동 올리기를 켰는가. (예전 설정 mode = close · hours · daily 도 켬으로 본다)"""
    if "auto" in d:
        return bool(d["auto"])
    return d.get("mode") in ("close", "hours", "daily")


def hours(d):
    """켜져 있는 동안 올리는 간격(시간, 0 ~ 24). 0 = 앱을 닫을 때만. 정한 적이 없으면 3."""
    v = d.get("hours")
    if v is None or v == "":
        v = {"close": 0, "daily": 24}.get(d.get("mode"), DEFAULT_HOURS)   # 예전 설정에서 옮겨 온다
    try:
        v = int(v)
    except (TypeError, ValueError):
        v = DEFAULT_HOURS
    return max(0, min(MAX_HOURS, v))


def connected(d=None):
    d = load() if d is None else d
    return bool(d.get("repo") and _token(d))


def enabled(d=None):
    d = load() if d is None else d
    return connected(d) and auto(d)


def save_config(repo=None, branch=None, token=None, auto_=None, hours_=None):
    """화면에서 바꾼 값만 저장한다. token 이 None 이면 그대로 둔다. 저장소가 바뀌면 '이 PC가 아는 마지막 기록'을 지운다."""
    d = load()
    if repo is not None:
        repo = repo.strip().removeprefix("https://github.com/").removesuffix(".git").strip("/")
        if repo and not REPO_RE.match(repo):
            raise BackupError("저장소는 '소유자/이름' 모양으로 적어 주세요 (예: kariyarn/redmine-notes-backup)", "config")
        if repo != d.get("repo"):
            d.pop("known", None)
        d["repo"] = repo
    if branch is not None:
        b = branch.strip() or "main"
        if not re.match(r"^[A-Za-z0-9._/-]+$", b) or ".." in b:
            raise BackupError("브랜치 이름이 올바르지 않아요", "config")
        if b != d.get("branch", "main"):
            d.pop("known", None)
        d["branch"] = b
    if token is not None:
        _store_token(d, token.strip())
    if auto_ is not None:
        if bool(auto_) and not auto(d):
            d["sched_try"] = ""   # 켜자마자 한 번 올려서 잘 되는지 바로 알 수 있게 한다
        d["auto"] = bool(auto_)
    if hours_ is not None:
        d["hours"] = hours({"hours": hours_})
    d.pop("mode", None)   # 예전 설정은 auto · hours 로 옮겼다
    d.pop("at", None)
    _save(d)
    return d


def disconnect():
    """연결 해제: 토큰과 '마지막 기록'을 지운다. 저장소 이름 · 올리는 때 · 지난 결과는 남겨 둔다."""
    d = load()
    _store_token(d, "")
    d.pop("known", None)
    d["auto"] = False
    d.pop("mode", None)
    _save(d)
    return d


# ---------- 깃허브 API ----------
def _req(d, method, path, body=None, raw=False, timeout=60):
    token = _token(d)
    if not token:
        raise BackupError("토큰이 없어요. 설정 → 깃허브 백업에서 토큰을 넣어 주세요", "auth")
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.raw+json" if raw else "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": f"RedmineNotes2/{APP_VERSION}",
        **({"Content-Type": "application/json"} if data is not None else {}),
    })
    try:
        with open_authenticated(req, timeout=timeout) as r:
            b = r.read()
            return b if raw else (json.loads(b) if b else {})
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b"{}").get("message", "")
        except Exception:
            msg = ""
        e.gh_message = msg
        raise e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise BackupError(f"깃허브에 연결하지 못했어요. 인터넷 연결을 확인해 주세요 ({getattr(e, 'reason', e)})", "network")


def _explain(e, d):
    """HTTPError → 사용자에게 보여 줄 BackupError."""
    if isinstance(e, BackupError):
        return e
    if isinstance(e, RedirectBlocked):
        return BackupError("인증 요청의 리다이렉트를 거절했어요. 최종 API 주소를 확인하세요", "redirect")
    code, msg = getattr(e, "code", 0), getattr(e, "gh_message", "")
    if code == 401:
        return BackupError("토큰이 맞지 않거나 만료됐어요. 깃허브에서 새 토큰을 만들어 넣어 주세요", "auth")
    if code == 403:
        if "rate limit" in msg.lower():
            return BackupError("깃허브 요청 한도를 넘었어요. 잠시 뒤에 다시 해 주세요", "server")
        return BackupError(f"이 토큰으로는 '{d.get('repo')}' 에 쓸 수 없어요. 토큰의 저장소 선택과 Contents 읽기/쓰기 권한을 확인해 주세요", "auth")
    if code == 404:
        return BackupError(f"저장소 '{d.get('repo')}' 를 찾을 수 없어요. 이름을 확인하고, 토큰에 이 저장소 권한이 있는지 확인해 주세요", "notfound")
    if code in (409, 422):
        return BackupError(f"깃허브가 요청을 거절했어요 ({code} {msg})", "conflict")
    if code >= 500:
        return BackupError(f"깃허브 서버에 문제가 있어요 ({code}). 잠시 뒤에 다시 해 주세요", "server")
    return BackupError(f"깃허브 응답 오류 ({code} {msg})", "server")


def _repo_path(d):
    repo = d.get("repo") or ""
    if not REPO_RE.match(repo):
        raise BackupError("설정 → 깃허브 백업에서 저장소를 먼저 적어 주세요", "config")
    return "/repos/" + repo


def _branch(d):
    return d.get("branch") or "main"


def check(d=None):
    """연결 확인: 저장소가 있고 · 비공개이고 · 쓰기 권한이 있는가. 저장소 정보(dict)를 돌려준다."""
    d = load() if d is None else d
    try:
        info = _req(d, "GET", _repo_path(d))
    except Exception as e:
        raise _explain(e, d)
    if not info.get("private"):
        raise BackupError(f"'{d.get('repo')}' 는 공개(Public) 저장소예요. 노트가 누구에게나 보일 수 있어서 올리지 않아요. 비공개(Private) 저장소를 써 주세요", "public")
    perm = info.get("permissions")
    if isinstance(perm, dict) and perm and not perm.get("push"):
        raise BackupError(f"'{d.get('repo')}' 에 쓰기 권한이 없어요", "auth")
    return info


def _head(d):
    """브랜치의 최신 커밋 sha. 브랜치가 없거나 저장소가 비어 있으면 None."""
    try:
        r = _req(d, "GET", f"{_repo_path(d)}/git/ref/heads/{urllib.parse.quote(_branch(d), safe='/')}")
        return r["object"]["sha"]
    except urllib.error.HTTPError as e:
        if e.code in (404, 409):
            return None
        raise _explain(e, d)


def _tree(d, commit_sha):
    """커밋의 파일 목록 {경로: blob sha}."""
    try:
        c = _req(d, "GET", f"{_repo_path(d)}/git/commits/{commit_sha}")
        t = _req(d, "GET", f"{_repo_path(d)}/git/trees/{c['tree']['sha']}?recursive=1")
    except Exception as e:
        raise _explain(e, d)
    return c["tree"]["sha"], {x["path"]: x["sha"] for x in t.get("tree", []) if x.get("type") == "blob"}


def _blob_sha(data):
    """깃이 파일에 붙이는 이름(sha1("blob <크기>\\0" + 내용)). 같으면 올리지 않는다."""
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def _snapshot():
    """올릴 파일들 {경로: bytes}: notes.db(안전한 스냅샷)."""
    tmp = tempfile.mkdtemp()
    try:
        snap = os.path.join(tmp, "notes.db")
        src, dst = sqlite3.connect(DB_PATH), sqlite3.connect(snap)
        try:
            src.backup(dst)
        finally:
            src.close()
            dst.close()
        with open(snap, "rb") as f:
            files = {"notes.db": f.read()}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return files


def _counts():
    try:
        with db() as c:
            return c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    except Exception:
        return 0


def _pc():
    return os.environ.get("COMPUTERNAME") or platform.node() or "PC"


def _init_branch(d, info):
    """백업 브랜치가 없을 때: 기본 브랜치가 있으면 거기서 새 브랜치를 만들고,
    저장소가 비어 있으면(Git Data API 는 빈 저장소에서 안 된다) 안내 파일 하나로 첫 커밋을 만든다."""
    default = info.get("default_branch") or "main"
    try:
        base = _head({**d, "branch": default})
        if not base:
            body = {"message": "레드마인 노트 백업 저장소 시작",
                    "content": base64.b64encode("# 레드마인 노트 백업\n\n레드마인 노트 2 가 올리는 백업입니다. 직접 고치지 마세요.\n복원은 앱의 설정 → 깃허브 백업에서 합니다.\n".encode("utf-8")).decode("ascii")}
            base = _req(d, "PUT", f"{_repo_path(d)}/contents/README.md", body)["commit"]["sha"]   # 빈 저장소: 기본 브랜치가 생긴다
        if _branch(d) != default:
            _req(d, "POST", f"{_repo_path(d)}/git/refs", {"ref": f"refs/heads/{_branch(d)}", "sha": base})
    except Exception as e:
        raise _explain(e, d)
    return _head(d)


def upload(reason="수동", force=False, now=None, wait=1):
    """지금 올린다. 바뀐 게 없으면 올리지 않는다. 결과(dict)를 돌려주고 마지막 결과로 저장한다.
    force: 저장소에 이 PC가 모르는 기록이 있어도 그 위에 이어서 올린다 (사용자가 확인했을 때만. 기록은 지워지지 않는다).
    wait: 다른 올리기가 끝나기를 기다릴 초 (넘으면 'busy')."""
    now = now or datetime.datetime.now()
    if not LOCK.acquire(timeout=wait):
        raise BackupError("이미 올리는 중이에요", "busy")
    d = load()
    res = {"at": now.isoformat(timespec="seconds"), "reason": reason, "ok": False, "changed": False, "commit": "", "error": "", "kind": ""}
    try:
        info = check(d)
        files = _snapshot()
        big = [p for p, b in files.items() if len(b) > MAX_FILE]
        if big:
            raise BackupError(f"{big[0]} 가 100MB 를 넘어서 깃허브에 올릴 수 없어요 ({len(files[big[0]]) // 1048576}MB)", "size")
        head = _head(d)
        known = d.get("known")
        if head and known != head and not force:
            if known:
                raise BackupError("저장소에 이 PC가 모르는 백업이 있어요 (다른 PC에서 올렸거나 깃허브에서 직접 고쳤어요). 덮어쓰지 않고 멈췄어요. "
                                  "설정 → 깃허브 백업에서 '그래도 이어서 올리기' 를 누르면 그 위에 이어서 올려요 (기존 백업은 지워지지 않아요)", "conflict")
            # 처음 올리는 저장소: 이미 노트 백업이 들어 있으면 다른 PC의 것일 수 있으니 확인을 받는다
            _, remote = _tree(d, head)
            if "notes.db" in remote:
                raise BackupError("이 저장소에는 이미 노트 백업이 있어요. 다른 PC의 백업이라면 섞이지 않게 다른 저장소를 쓰는 게 좋아요. "
                                  "'그래도 이어서 올리기' 를 누르면 그 위에 이어서 올려요 (기존 백업은 지워지지 않아요)", "conflict")
        if not head:
            head = _init_branch(d, info)
        base_tree, remote = _tree(d, head)
        local = {p: _blob_sha(b) for p, b in files.items()}
        if all(remote.get(p) == s for p, s in local.items()):
            _update(known=head)
            res.update(ok=True, commit=head)
            return res
        entries = []
        try:
            for p, b in files.items():
                if remote.get(p) == local[p]:
                    continue
                blob = _req(d, "POST", f"{_repo_path(d)}/git/blobs", {"content": base64.b64encode(b).decode("ascii"), "encoding": "base64"}, timeout=300)
                entries.append({"path": p, "mode": "100644", "type": "blob", "sha": blob["sha"]})
            n = _counts()
            info = {"app_version": APP_VERSION, "at": res["at"], "pc": _pc(), "notes": n, "reason": reason,
                    "files": {p: {"size": len(b), "sha": local[p]} for p, b in files.items()}}
            ib = json.dumps(info, ensure_ascii=False, indent=2).encode("utf-8")
            blob = _req(d, "POST", f"{_repo_path(d)}/git/blobs", {"content": base64.b64encode(ib).decode("ascii"), "encoding": "base64"})
            entries.append({"path": "backup-info.json", "mode": "100644", "type": "blob", "sha": blob["sha"]})
            tree = _req(d, "POST", f"{_repo_path(d)}/git/trees", {"base_tree": base_tree, "tree": entries})
            msg = f"백업 {now:%Y-%m-%d %H:%M} · 노트 {n}건 · {_pc()} ({reason})"
            commit = _req(d, "POST", f"{_repo_path(d)}/git/commits", {"message": msg, "tree": tree["sha"], "parents": [head]})
        except Exception as e:
            raise _explain(e, d)
        try:
            _req(d, "PATCH", f"{_repo_path(d)}/git/refs/heads/{urllib.parse.quote(_branch(d), safe='/')}", {"sha": commit["sha"], "force": False})
        except urllib.error.HTTPError as e:
            if e.code == 422:   # 그 사이 다른 곳에서 올렸다 (빨리 감기가 아니다)
                raise BackupError("올리는 사이에 저장소에 다른 기록이 생겼어요. 덮어쓰지 않고 멈췄어요. 잠시 뒤 다시 해 주세요", "conflict")
            raise _explain(e, d)
        _update(known=commit["sha"])
        res.update(ok=True, changed=True, commit=commit["sha"])
        return res
    except BackupError as e:
        res.update(error=str(e), kind=e.kind)
        raise
    except Exception as e:
        res.update(error=f"올리지 못했어요: {e}", kind="other")
        raise BackupError(res["error"], "other")
    finally:
        last = {k: res[k] for k in ("at", "reason", "ok", "changed", "commit", "error", "kind")}
        upd = {"last": last}
        if res["ok"]:
            upd["last_ok"] = last
        try:
            _update(**upd)
        except Exception:
            pass
        LOCK.release()


# ---------- 내려받기 (수동) ----------
def history(limit=30):
    """백업 시점 목록 (최근 것부터): notes.db 를 바꾼 커밋만."""
    d = load()
    check(d)
    if not _head(d):
        return []
    try:
        rows = _req(d, "GET", f"{_repo_path(d)}/commits?sha={urllib.parse.quote(_branch(d))}&path=notes.db&per_page={int(limit)}")
    except Exception as e:
        raise _explain(e, d)
    out = []
    for r in rows:
        c = r.get("commit") or {}
        when = ((c.get("committer") or {}).get("date") or (c.get("author") or {}).get("date") or "")
        try:
            when = datetime.datetime.fromisoformat(when.replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d %H:%M")
        except ValueError:
            pass
        out.append({"sha": r["sha"], "at": when, "message": (c.get("message") or "").splitlines()[0] if c.get("message") else ""})
    return out


def fetch_zip(sha):
    """그 백업 시점의 notes.db 를 zip(bytes)으로 받는다 (복원 · 파일로 받기에 같이 쓴다). 폰트는 넣지 않는다 (이 PC의 폰트는 그대로)."""
    if not re.match(r"^[0-9a-f]{7,40}$", sha or ""):
        raise BackupError("백업 시점이 올바르지 않아요", "config")
    d = load()
    check(d)
    _, files = _tree(d, sha)
    if "notes.db" not in files:
        raise BackupError("그 시점에는 노트 백업(notes.db)이 없어요", "notfound")
    buf = io.BytesIO()
    try:
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("notes.db", _req(d, "GET", f"{_repo_path(d)}/git/blobs/{files['notes.db']}", raw=True, timeout=300))
    except Exception as e:
        raise _explain(e, d)
    return buf.getvalue()


def restore(sha):
    """그 백업 시점으로 복원한다 (복원 직전 상태는 로컬 backups 에 before-restore 로 남는다).
    복원한 뒤에는 저장소의 지금 최신 기록을 '이 PC가 아는 기록'으로 삼아, 다음 올리기가 그 위에 이어진다."""
    data = fetch_zip(sha)
    r = restore_bytes(data)
    d = load()
    try:
        head = _head(d)
        if head:
            _update(known=head)
    except Exception:
        pass
    return r


# ---------- 언제 올리나 ----------
def _when(v):
    try:
        return datetime.datetime.fromisoformat(v or "")
    except (TypeError, ValueError):
        return None


def _base(d):
    """시간을 재는 기준: 마지막으로 정해진 때 올려 본 시각과 마지막으로 올리기에 성공한 시각(직접 · 닫을 때 포함) 중 늦은 것."""
    ts = [t for t in (_when(d.get("sched_try")), _when((d.get("last_ok") or {}).get("at"))) if t]
    return max(ts) if ts else None


def due(now, d, base):
    """켜져 있는 동안 N시간마다 올릴 때가 됐는가. base: 기준 시각(_base, 없으면 None = 바로).
    프로그램이 꺼져 있던 사이에 N시간이 지났어도 켜졌을 때 한 번만 '때가 됐다'가 된다 (밀린 횟수만큼 올리지 않는다).
    '앱을 닫을 때'는 여기서 판단하지 않는다 (창이 닫히는 순간 · 프로그램 종료 때 따로 부른다)."""
    h = hours(d)
    if not enabled(d) or not h:
        return False
    return base is None or (now - base).total_seconds() >= h * 3600


def next_at(now, d):
    """다음 시간 예정 시각 (화면 표시용). 꺼짐이거나 '닫을 때만'(0시간)이면 None."""
    h = hours(d)
    if not enabled(d) or not h:
        return None
    base = _base(d)
    return now if base is None else max(now, base + datetime.timedelta(hours=h))


def _notify_fail(e):
    """올리기에 실패하면 트레이 말풍선으로 한 번 알린다 (같은 오류는 다시 알리지 않는다)."""
    key = f"{getattr(e, 'kind', '')}:{e}"
    if _RT["notified"] == key or not RUN.tray:
        return
    _RT["notified"] = key
    try:
        RUN.tray.balloon("깃허브 백업을 올리지 못했어요", str(e)[:200])
    except Exception:
        pass


def run_scheduled(reason, now=None):
    """자동 올리기 한 번. 다른 올리기가 돌고 있으면 기다리지 않고 '마지막 요청'으로만 남긴다
    (그 사이 몇 번이 들어와도 하나로 합쳐져 다음 확인 때 한 번만 올린다).
    실패하면 (충돌 · 설정 문제가 아니면) 15분 뒤 다시 해 본다."""
    now = now or datetime.datetime.now()
    try:
        r = upload(reason, now=now)
        _RT["pending"], _RT["notified"] = False, ""
        return r
    except BackupError as e:
        if e.kind == "busy":
            _RT["again"] = reason   # 앞서 들어온 요청은 버리고 마지막 것만
            return {"ok": False, "queued": True, "error": str(e), "kind": e.kind}
        retry = e.kind in ("network", "server", "other")
        _RT["pending"], _RT["next_retry"] = retry, time.time() + RETRY_SEC
        _notify_fail(e)
        return {"ok": False, "error": str(e), "kind": e.kind}


def tick(now=None, window_open=None):
    """한 번 확인 (30초마다): 창이 닫히는 순간 · N시간이 지났을 때(켤 때 밀린 것 포함) · 미뤄 둔 요청 · 실패 뒤 다시 해 볼 때 올린다.
    한 번 확인에 많아야 한 번만 올린다."""
    now = now or datetime.datetime.now()
    d = load()
    first, _RT["started"] = not _RT["started"], True
    if not enabled(d):
        _RT["was_open"], _RT["again"], _RT["pending"] = bool(window_open), "", False
        return None
    reason = ""
    if window_open is not None:
        if _RT["was_open"] and not window_open:
            reason = "앱 닫을 때"
        _RT["was_open"] = window_open
    if not reason and due(now, d, _base(d)):
        reason = "앱 켤 때 (밀린 백업)" if first else f"{hours(d)}시간마다"
    if not reason and _RT["again"] and not LOCK.locked():
        reason = _RT["again"]
    if not reason and _RT["pending"] and time.time() >= _RT["next_retry"]:
        reason = "다시 시도"
    if not reason:
        return None
    _RT["again"] = ""
    _update(sched_try=now.isoformat(timespec="seconds"))   # 닫을 때 올렸어도 N시간은 여기서부터 다시 잰다
    return run_scheduled(reason, now)


def on_shutdown():
    """프로그램이 꺼질 때: 자동 올리기가 켜져 있으면 마지막으로 한 번 올린다 (돌고 있는 올리기가 있으면 끝나기를 기다렸다가 한 번만.
    바뀐 게 없으면 금방 끝난다)."""
    if enabled():
        def go():
            try:
                upload("프로그램 종료", wait=80)
            except Exception:
                pass
        t = threading.Thread(target=go, daemon=True)
        t.start()
        t.join(90)   # 네트워크가 멈춰도 프로그램 종료가 마냥 늦어지지 않게


def loop():
    while True:
        time.sleep(TICK)
        try:
            from .lifecycle import app_window_open
            tick(window_open=app_window_open())
        except Exception:
            pass


def status(now=None):
    """화면용 상태. 토큰은 돌려주지 않고 있는지만 알려 준다."""
    now = now or datetime.datetime.now()
    d = load()
    nxt = next_at(now, d)
    return {
        "repo": d.get("repo", ""), "branch": _branch(d), "token_set": bool(_token(d)), "auto": auto(d),
        "hours": hours(d), "enabled": enabled(d), "busy": LOCK.locked(),
        "known": d.get("known", ""), "last": d.get("last"), "last_ok": d.get("last_ok"),
        "next": nxt.isoformat(timespec="minutes") if nxt else "", "pending": _RT["pending"], "queued": bool(_RT["again"]),
        "max_hours": MAX_HOURS,
    }
