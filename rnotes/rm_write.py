"""레드마인에 쓰기(댓글 · 상태 · 담당자) · 첨부 목록"""
import datetime
import collections
import hashlib
import html
import json
import os
import re
import threading
import time
import unicodedata
import uuid
from email import policy
from email.parser import BytesParser
import urllib.error
import urllib.parse
import urllib.request

from .config import STATE, conn
from .redmine import cached, explain, invalidate_cached, my_id, rm_get, rm_issue, rm_members, rm_put, rm_statuses, rm_upload, upsert_issue
from .storage import configured, db, get_settings
from .http_client import RedirectBlocked
from . import write_requests
from .comment_format import attachment_image_url, check_format


# ---------- 레드마인에 쓰기 (댓글 · 상태 · 담당자) ----------
# 댓글·첨부·상태·담당자만 쓴다. 제목·본문·기간 등은 쓰지 않고, 삭제 기능은 없다.
WRITE_ALLOW_IDS = ()   # 시험 모드 해제됨(2.1.0). 목록이 비어 있으면 "내 노트에 등록된 일감"이면 어디서든 쓸 수 있다. 다시 제한하려면 (93599,) 처럼 번호를 넣고 빌드한다.
WRITE_FIELDS = {"issue_id", "notes", "notes_format", "status_id", "assigned_to_id", "dev_id", "preset", "loaded_updated_on", "force", "request_id"}
MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_FILES_SIZE = 50 * 1024 * 1024
MAX_FILES = 10
LOCKS_GUARD = threading.Lock()
WRITE_LOCKS = {}
_REQUESTS = collections.OrderedDict()  # 토큰만 메모리에 보관. 바이너리·토큰을 DB에 넣지 않는다.
REQUEST_TTL = 24 * 60 * 60
MAX_REQUESTS = 256


def write_allow():
    env = os.environ.get("REDMINE_NOTES_WRITE_ALLOW")  # 개발·시험 전용(가짜 레드마인으로 시험할 때). 실제 사용에서는 설정하지 않는다.
    if env:
        return tuple(int(x) for x in env.split(",") if x.strip().isdigit())
    return tuple(WRITE_ALLOW_IDS)


def status_ids():
    st = get_settings()
    return {k: int(st.get("st_" + k) or d) for k, d in (("dev", 11), ("confirm", 15), ("done", 5))}


def write_info():
    allow = write_allow()
    return {"allow": list(allow), "test": bool(allow), "statuses": status_ids(),
            "uploads": {"max_file": MAX_FILE_SIZE, "max_total": MAX_FILES_SIZE, "max_count": MAX_FILES}}


_FENCE = re.compile(r"```([A-Za-z0-9_+#.-]*)[ \t]*\n(.*?)```", re.S)
_PRE = re.compile(r"(<pre>.*?</pre>|<pre><code[^>]*>.*?</code></pre>)", re.S)
_SOFT_BREAK = "\uE002"


def _paragraphs(seg):
    """레드마인 웹 편집기(CKEditor)는 엔터 한 번마다 새 문단(<p>)을 만들어서 줄 사이에 여유가 생긴다.
    앱에서 쓴 글도 똑같이 보이도록 한 줄을 한 문단(<p>줄</p>)으로, 빈 줄은 편집기처럼 빈 문단(<p>&nbsp;</p>)으로 바꾼다.
    (예전에는 <br /> 로 바꿔서 한 문단 안에 줄이 붙어 보였고, 목록 줄(* 항목)은 아예 한 줄로 합쳐졌다.) 글 앞뒤의 빈 줄은 버린다."""
    lines = [x.rstrip() for x in seg.strip("\n").split("\n")]
    if not any(x.strip() for x in lines):
        return ""
    while not lines[0].strip():
        lines.pop(0)
    while not lines[-1].strip():
        lines.pop()
    return "\n".join(
        f"<p>{'<br />'.join(x.split(_SOFT_BREAK))}</p>" if x.strip() else "<p>&nbsp;</p>"
        for x in lines
    )


def to_textile(text):
    """앱에서 쓴 글(```코드 상자```, `인라인 코드`)을 레드마인 Textile 로 바꾼다."""
    text = (text or "").replace("\r\n", "\n")

    def fence(m):
        lang, code = m.group(1).lower(), m.group(2).strip("\n")
        code = html.escape(code, quote=False)
        return f'<pre><code class="{lang}">\n{code}\n</code></pre>' if lang else f"<pre>\n{code}\n</pre>"

    segs = _PRE.split(_FENCE.sub(fence, text))
    for i in range(0, len(segs), 2):  # 짝수 칸 = 코드 상자 밖
        segs[i] = _paragraphs(re.sub(r"`([^`\n]+)`", lambda m: "@" + html.escape(m[1], quote=False) + "@", segs[i]))
    return "\n".join(x for x in segs if x)   # 문단과 코드 상자는 각각 따로 선 덩어리


def redact(text, secrets=(), limit=300):
    text = str(text)
    for secret in sorted({s for s in (conn.key, *secrets) if s}, key=len, reverse=True):
        text = text.replace(secret, "[redacted]")
    return text[:limit]


def explain_write(e, secrets=()):
    """쓰기 실패 -> (종류, 사유, 조치). 레드마인이 알려 준 원문도 같이 돌려준다."""
    if isinstance(e, RedirectBlocked):
        kind, reason, hint, _ = explain(e)
        return kind, reason, hint, ""
    if isinstance(e, urllib.error.HTTPError):
        raw = ""
        try:
            raw = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        msgs = []
        try:
            msgs = json.loads(raw).get("errors") or []
        except Exception:
            pass
        detail = redact(" / ".join(str(x) for x in msgs), secrets)
        if e.code == 401:
            return ("key", "API 키가 거절됐어요", "설정에서 API 키를 다시 입력하세요", detail)
        if e.code == 403:
            return ("forbidden", "이 일감에 댓글을 쓰거나 바꿀 권한이 없어요", "레드마인에서 내 권한을 확인하세요", detail)
        if e.code == 404:
            return ("gone", "일감을 찾을 수 없어요 (삭제됐거나 볼 수 없음)", "번호를 확인하세요", detail)
        if e.code == 422:
            low = detail.lower()
            if any(x in low for x in ("upload", "attachment", "token", "첨부")):
                return ("upload_token", "첨부 토큰이 만료되었거나 거절됐어요", "Redmine에서 반영 여부를 확인한 뒤 재시도를 준비하세요", detail)
            if "status" in low or "상태" in detail:
                return ("status", "지금 상태에서는 그 상태로 바꿀 수 없어요", "레드마인의 워크플로가 허용하지 않는 전환이에요. 다른 상태를 고르거나 레드마인에서 확인하세요", detail)
            if "assigned" in low or "담당자" in detail:
                return ("assignee", "담당자로 지정할 수 없는 사람이에요", "다른 사람을 고르세요", detail)
            if "custom" in low or "개발담당자" in detail:
                return ("devfield", "개발담당자로 지정할 수 없는 사람이에요", "다른 사람을 고르세요", detail)
            return ("invalid", "레드마인이 값을 받아들이지 않았어요", "아래 레드마인 메시지를 확인하세요", detail)
        if e.code >= 500:
            return ("server", f"레드마인 서버 오류예요 (HTTP {e.code})", "올라갔는지 레드마인에서 확인한 뒤 다시 시도하세요", detail)
        return ("http", f"레드마인이 오류로 응답했어요 (HTTP {e.code})", "같은 오류가 계속되면 알려 주세요", detail)
    kind, reason, hint, _ = explain(e)
    return (kind, redact(reason, secrets), redact(hint, secrets), "")


def name_of(uid, d, names, me):
    if uid is None:
        return None
    if uid in names:
        return names[uid]
    if d.get("author", {}).get("id") == uid:
        return d["author"]["name"]
    if d.get("assigned_to", {}).get("id") == uid:
        return d["assigned_to"]["name"]
    if uid == me and STATE.get("me_name"):
        return STATE["me_name"]
    return f"#{uid}"


def resolve_preset(preset, d, me):
    ids = status_ids()
    if preset == "dev":
        return {"status_id": ids["dev"], "assigned_to_id": me, "dev_id": me}
    if preset == "confirm":      # 최종확인요청: 담당자는 일감 작성자(요청자)에게 돌려준다
        return {"status_id": ids["confirm"], "assigned_to_id": d["author"]["id"], "dev_id": me}
    if preset == "done":
        return {"status_id": ids["done"], "assigned_to_id": me, "dev_id": me}
    if preset == "me":
        return {"assigned_to_id": me, "dev_id": me}
    raise ValueError("알 수 없는 버튼이에요")


def gather_fields(b, d, me):
    fields = {}
    if b.get("preset"):
        fields.update(resolve_preset(b["preset"], d, me))
    for k in ("status_id", "assigned_to_id", "dev_id"):
        if b.get(k) not in (None, ""):
            fields[k] = int(b[k])
    return fields


def current_state(d, dev, names, me):
    stn = {x["id"]: x["name"] for x in rm_statuses()}
    return {
        "status": {"id": d["status"]["id"], "name": d["status"]["name"]},
        "assigned": {"id": d["assigned_to"]["id"], "name": d["assigned_to"]["name"]} if d.get("assigned_to") else None,
        "dev": {"id": dev, "name": name_of(dev, d, names, me)} if dev else None,
    }, stn


def preview_write(q):
    """확인 창에 보여 줄 '변경 전 → 후'. 레드마인에는 아무것도 쓰지 않는다."""
    iid = int(q.get("issue_id") or 0)
    d, dev = rm_issue(iid)
    me = my_id()
    try:
        names = {u["id"]: u["name"] for u in rm_members(d["project"]["id"])}
    except Exception:
        names = {}
    cur, stn = current_state(d, dev, names, me)
    fields = gather_fields(q, d, me)
    changes = []
    if "status_id" in fields:
        changes.append({"field": "상태", "before": cur["status"]["name"], "after": stn.get(fields["status_id"], f"#{fields['status_id']}"),
                        "changed": fields["status_id"] != cur["status"]["id"]})
    if "assigned_to_id" in fields:
        changes.append({"field": "담당자", "before": (cur["assigned"] or {}).get("name") or "(없음)", "after": name_of(fields["assigned_to_id"], d, names, me),
                        "changed": fields["assigned_to_id"] != (cur["assigned"] or {}).get("id")})
    if "dev_id" in fields:
        changes.append({"field": "개발담당자", "before": (cur["dev"] or {}).get("name") or "(없음)", "after": name_of(fields["dev_id"], d, names, me),
                        "changed": fields["dev_id"] != (cur["dev"] or {}).get("id")})
    return {"current": cur, "changes": changes, "updated_on": d["updated_on"], "any_change": any(c["changed"] for c in changes)}


def write_log(iid, action, sig, payload, ok, result):
    with db() as c:
        cur = c.execute("INSERT INTO write_log (at, issue_id, action, sig, payload, ok, result) VALUES (?,?,?,?,?,?,?)",
                        (datetime.datetime.now().isoformat(timespec="seconds"), iid, action, sig,
                         json.dumps(payload, ensure_ascii=False), 1 if ok else 0, result))
        return cur.lastrowid


def refresh_local(iid):
    """쓴 뒤에 그 일감 1건만 다시 받아 저장하고, 화면에 줄 노트 행을 돌려준다."""
    d, dev = rm_issue(iid)
    me = my_id()
    with db() as c:
        row = c.execute("SELECT roles FROM notes WHERE issue_id=?", (iid,)).fetchone()
        keep = [r for r in (row["roles"].split(",") if row else []) if r in ("관람자", "추가됨", "배포요청")]
        roles = []
        if d.get("assigned_to", {}).get("id") == me:
            roles.append("담당자")
        if dev == me:
            roles.append("개발담당자")
        role_text = ",".join(roles + keep) or "연관"
        upsert_issue(c, iid, role_text, bool(row))
        c.commit()
        n = dict(c.execute("SELECT * FROM notes WHERE issue_id=?", (iid,)).fetchone())
    n["journals"] = json.loads(n["journals"] or "[]")
    n["changes"] = json.loads(n.get("changes") or "[]")
    return n


def validate_files(files):
    if not isinstance(files, list) or len(files) > MAX_FILES:
        raise ValueError(f"첨부파일은 최대 {MAX_FILES}개예요")
    metadata, total = [], 0
    for f in files:
        name, data = f.get("filename"), f.get("data")
        if (not isinstance(name, str) or not name.strip() or name in (".", "..")
                or len(name.encode("utf-8")) > 255 or any(c in name for c in '/\\:')
                or any(unicodedata.category(c).startswith("C") for c in name)):
            raise ValueError("첨부파일 이름이 올바르지 않아요 (경로·제어 문자는 사용할 수 없어요)")
        if not isinstance(data, bytes) or len(data) > MAX_FILE_SIZE:
            raise ValueError("첨부파일은 하나에 최대 20MB예요")
        total += len(data)
        metadata.append({"filename": name, "filesize": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    if total > MAX_FILES_SIZE:
        raise ValueError("첨부파일 합계는 최대 50MB예요")
    return metadata


def parse_write_request(content_type, raw):
    """HTTP 핸들러는 라우팅만 하고, 댓글 입력 형식은 여기서 해석한다."""
    if content_type.startswith("application/json"):
        return json.loads(raw or b"{}"), []
    if not content_type.startswith("multipart/form-data"):
        raise ValueError("JSON 또는 multipart 요청이 필요해요")
    message = BytesParser(policy=policy.default).parsebytes(
        ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode("ascii") + raw)
    if not message.is_multipart() or message.defects:
        raise ValueError("첨부 요청 형식이 올바르지 않아요")
    data, files = None, []
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if part.is_multipart() or part.defects or part.get("Content-Transfer-Encoding"):
            raise ValueError("첨부 요청 형식이 올바르지 않아요")
        payload = part.get_payload(decode=True)
        if name == "data" and data is None and part.get_filename() is None and len(payload) <= 100000:
            data = json.loads(payload.decode("utf-8"))
        elif name == "files" and part.get_filename() is not None and len(files) < MAX_FILES:
            files.append({"filename": part.get_filename(), "data": payload})
        else:
            raise ValueError("허용되지 않은 항목 또는 너무 많은 파일이 있어요")
    if not isinstance(data, dict):
        raise ValueError("댓글 요청 정보가 없어요")
    return data, files


def _verified_write(context):
    """명시 업로드 ID + 새 첨부 + 작성자 + 같은 새 저널로 동일성을 확인한다."""
    d, dev = rm_issue(context["iid"])
    current = {"status_id": d["status"]["id"], "assigned_to_id": (d.get("assigned_to") or {}).get("id"), "dev_id": dev}
    if any(current.get(k) != v for k, v in context["fields"].items()):
        return False
    ids = context["attachment_ids"]
    if context["files"]:
        if len(ids) != len(context["files"]) or any(not isinstance(i, int) or i <= 0 for i in ids) or len(set(ids)) != len(ids):
            return False
        attachments = {a["id"]: a for a in d.get("attachments", [])}
        for aid, wanted in zip(ids, context["files"]):
            a = attachments.get(aid)
            if (aid in context["before_attachments"] or not a or (a.get("author") or {}).get("id") != context["me"]
                    or a.get("filename") != wanted["filename"] or a.get("filesize") != wanted["filesize"]):
                return False
    for journal in d.get("journals", []):
        if journal.get("id") in context["before_journals"] or (journal.get("user") or {}).get("id") != context["me"]:
            continue
        if context["notes"] and (journal.get("notes") or "").strip() != context["notes"].strip():
            continue
        details = journal.get("details", [])
        added = {str(x.get("name")) for x in details if x.get("property") == "attachment" and x.get("new_value")}
        if not {str(i) for i in ids} <= added:
            continue
        if all(any(x.get("property") == ("cf" if k == "dev_id" else "attr")
                   and str(x.get("name")) == (context["dev_field"] if k == "dev_id" else k)
                   and str(x.get("new_value")) == str(v) for x in details) for k, v in context["fields"].items()):
            return True
    return False


def _scope(me):
    return hashlib.sha256(json.dumps([conn.url, me, conn.dev_field]).encode()).hexdigest()


def _access(iid):
    allow = write_allow()
    if allow and iid not in allow:
        return 403, {"error": "시험 모드에서 허용되지 않은 일감이에요", "code": "test_mode"}
    if not allow:
        with db() as c:
            if not c.execute("SELECT 1 FROM notes WHERE issue_id=?", (iid,)).fetchone():
                return 403, {"error": "내 노트에 등록되지 않은 일감이에요", "code": "not_registered"}
    return None


def _review_required(request_id, message="이전 요청의 반영 여부를 Redmine에서 확인해 주세요", code="needs_review"):
    return 409, {"error": message, "code": code, "request_id": request_id, "needs_review": True,
                 "hint": "댓글과 파일을 유지했어요. 반영 확인 또는 재시도 준비를 선택하세요. 자동으로 다시 보내지 않아요"}


def _finish_write(context, request, verified=False, manual=False):
    iid, rid = context["iid"], context["request_id"]
    invalidate_cached(("att", iid))
    result = {"ok": True, "note": None, "verified": verified, "manual": manual, "log_id": None, "request_id": rid}
    request["result"] = dict(result)
    request.pop("uploads", None)
    # 이 갱신이 실패해도 PUT 전 pending 기록이 남아서 재시작 후 재전송을 차단한다.
    try:
        write_requests.set_state(rid, "confirmed" if manual else "succeeded")
    except Exception:
        result["tracking_pending"] = True
    try:
        result["note"] = refresh_local(iid)
    except Exception:
        pass
    try:
        result["log_id"] = write_log(iid, context["action"], context["sig"], context["log_payload"], True,
                                     "사용자가 등록됨을 확인" if manual else "올라감" + (" (Redmine에서 동일성 확인됨)" if verified else ""))
    except Exception:
        pass  # write_requests가 별도로 중복 방지를 담당한다.
    request["result"] = {k: v for k, v in result.items() if k != "note"}
    return 200, result


def _locked_call(iid, fn, *args):
    with LOCKS_GUARD:
        lock = WRITE_LOCKS.setdefault(iid, threading.Lock())
        if not lock.acquire(blocking=False):
            return 409, {"error": "이 일감에 이미 올리는 중이에요", "code": "busy"}
    try:
        return fn(*args)
    finally:
        with LOCKS_GUARD:
            lock.release()
            WRITE_LOCKS.pop(iid, None)


def do_write(b, files=None):
    try:
        iid = int(b.get("issue_id") or 0) if isinstance(b, dict) else 0
    except (TypeError, ValueError):
        iid = 0
    if iid <= 0:
        return 400, {"error": "일감 번호가 없어요"}
    return _locked_call(iid, _do_write, b, files or [], iid)


def _do_write(b, files, iid):
    denied = _access(iid)
    if denied:
        return denied
    if set(b) - WRITE_FIELDS:
        return 400, {"error": "보낼 수 없는 항목이 들어 있어요", "code": "bad_field"}
    rid = b.get("request_id") or uuid.uuid4().hex
    if not isinstance(rid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", rid):
        return 400, {"error": "요청 식별자가 올바르지 않아요"}
    try:
        metadata = validate_files(files)
    except (ValueError, TypeError, AttributeError) as e:
        return 400, {"error": str(e), "code": "bad_file"}
    me = my_id() if configured() else None
    if not me:
        return 400, {"error": "Redmine에 연결돼 있지 않아요"}
    notes = b.get("notes") or ""
    if not isinstance(notes, str) or len(notes.strip()) > 20000:
        return 400, {"error": "댓글은 최대 20000자예요"}
    mode = b.get("notes_format", "legacy")
    try:
        if mode != "legacy" and len(notes) > 20000:
            return 400, {"error": "댓글은 최대 20000자예요"}
        notes = check_format(notes, mode, conn.url)
    except (ValueError, TypeError):
        return 400, {"error": "댓글 형식 또는 HTML이 안전하지 않아요. 원문과 선택한 형식을 확인하세요", "code": "bad_format"}
    notes = notes.strip() if mode == "legacy" else notes
    raw_fields = {k: b[k] for k in ("preset", "status_id", "assigned_to_id", "dev_id") if b.get(k) not in (None, "")}
    if mode != "legacy":
        raw_fields["notes_format"] = mode
    sig = hashlib.sha1(json.dumps([iid, notes, sorted(raw_fields.items()), metadata], ensure_ascii=False).encode()).hexdigest()
    scope = _scope(me)
    signature = scope + ":" + sig
    for key, value in list(_REQUESTS.items()):
        if time.monotonic() - value["at"] > REQUEST_TTL:
            _REQUESTS.pop(key, None)
    request = _REQUESTS.get(rid)
    if request and request["sig"] != signature:
        return 409, {"error": "이미 다른 내용에 사용한 요청이에요", "code": "request_reused"}
    if request and request.get("result"):
        return 200, {**request["result"], "replayed": True}
    stored = write_requests.get_request(rid)
    if stored:
        if stored["scope"] != scope or stored["signature"] != sig:
            return 409, {"error": "이미 다른 내용에 사용한 요청이에요", "code": "request_reused"}
        if stored["state"] in ("succeeded", "confirmed"):
            return 200, {"ok": True, "note": None, "replayed": True, "request_id": rid}
        if stored["state"] == "released":
            return 409, {"error": "확인을 마친 이전 요청 ID예요. 새 요청 ID로 올려 주세요", "code": "request_closed"}
        return _review_required(rid)
    pending = write_requests.unresolved(scope, iid)
    if pending:
        return _review_required(pending["request_id"])
    try:
        d, dev = rm_issue(iid)
        fields = gather_fields(b, d, me)
    except Exception as e:
        kind, reason, hint, _ = explain(e)
        return 502, {"error": redact(reason), "hint": redact(hint), "kind": kind}
    same = {"status_id": d["status"]["id"], "assigned_to_id": (d.get("assigned_to") or {}).get("id"), "dev_id": dev}
    fields = {k: v for k, v in fields.items() if v != same.get(k)}
    if not notes and not fields and not files:
        return 400, {"error": "바뀌는 것이 없어요", "code": "nochange"}
    if b.get("loaded_updated_on") and b["loaded_updated_on"] != d["updated_on"] and not b.get("force"):
        return 409, {"error": "그 사이 Redmine에서 바뀌었어요. 그래도 올릴까요?", "code": "changed",
                     "current": {"updated_on": d["updated_on"], "status": d["status"]["name"],
                                 "assigned": (d.get("assigned_to") or {}).get("name"), "comments": len(d.get("journals", []))}}
    if not b.get("force"):
        since = (datetime.datetime.now() - datetime.timedelta(seconds=60)).isoformat(timespec="seconds")
        with db() as c:
            duplicate = c.execute("SELECT 1 FROM write_log WHERE sig=? AND ok=1 AND at>=?", (sig, since)).fetchone()
        if duplicate or write_requests.recently_succeeded(scope, sig):
            return 409, {"error": "같은 내용을 방금 올렸어요", "code": "duplicate"}
    payload = {"issue": {}}
    if notes:
        payload["issue"]["notes"] = to_textile(notes) if mode == "legacy" else notes
    for k in ("status_id", "assigned_to_id"):
        if k in fields:
            payload["issue"][k] = fields[k]
    if "dev_id" in fields:
        payload["issue"]["custom_fields"] = [{"id": int(conn.dev_field), "value": str(fields["dev_id"])}]
    action = b.get("preset") or ("comment" if notes or files else "custom")
    log_payload = {"issue": dict(payload["issue"]), "attachments": metadata, "request_id": rid}
    if request is None:
        if len(_REQUESTS) >= MAX_REQUESTS:
            for key, value in list(_REQUESTS.items()):
                if value.get("result"):
                    _REQUESTS.pop(key, None)
                    break
        if len(_REQUESTS) >= MAX_REQUESTS:
            return 429, {"error": "보관 중인 요청이 많아요. 잠시 뒤 다시 시도해 주세요"}
        request = {"at": time.monotonic(), "sig": signature, "uploads": []}
        _REQUESTS[rid] = request
    try:
        for f in files[len(request["uploads"]):]:
            request["uploads"].append(rm_upload(f["filename"], f["data"]))
    except Exception as e:
        kind, reason, hint, _ = explain_write(e, [u["token"] for u in request["uploads"]])
        return 502, {"error": "파일 업로드를 마치지 못했어요", "code": "upload_failed", "kind": kind,
                     "hint": hint if kind == "redirect" else "일감 수정은 보내지 않았어요. 받은 토큰은 메모리에서만 재사용해요"}
    context = {"iid": iid, "me": me, "dev_field": str(conn.dev_field), "fields": fields,
               "notes": payload["issue"].get("notes", ""), "files": metadata,
               "attachment_ids": [u["attachment_id"] for u in request["uploads"]],
               "before_attachments": [a["id"] for a in d.get("attachments", [])],
               "before_journals": [j["id"] for j in d.get("journals", [])],
               "request_id": rid, "sig": sig, "action": action, "log_payload": log_payload}
    try:
        write_requests.begin(rid, scope, iid, sig, context)  # commit를 마치기 전에는 PUT을 보내지 않는다.
    except Exception:
        return 503, {"error": "요청 처리 상태를 저장하지 못해 일감 수정을 보내지 않았어요", "code": "journal_unavailable"}
    if request["uploads"]:
        payload["issue"]["uploads"] = [{"token": u["token"], "filename": u["filename"],
                                        **({"content_type": mime} if (mime := raster_type(f["filename"], f["data"])) else {})}
                                       for u, f in zip(request["uploads"], files)]
    verified, failure = False, None
    try:
        # 명확한 PUT 성공 응답이면 등록 완료다. upload ID는 필수 응답이 아니다.
        rm_put(f"/issues/{iid}.json", payload)
    except Exception as e:
        # 응답 유실·오류 때에만 확실한 동일성 증거로 원격 반영을 확인한다.
        failure = explain_write(e, [u["token"] for u in request["uploads"]])
        try:
            verified = _verified_write(context)
        except Exception:
            pass
    finally:
        invalidate_cached(("att", iid))
    if failure and not verified:
        kind, reason, hint, detail = failure
        try:
            write_requests.set_state(rid, "token_rejected" if kind == "upload_token" else "uncertain")
        except Exception:
            pass  # durable pending가 이미 있어 재시작 뒤에도 전송을 차단한다.
        try:
            write_log(iid, action, sig, log_payload, False, "write: " + kind)
        except Exception:
            pass
        return (422 if kind in ("status", "assignee", "devfield", "invalid", "upload_token") else 502), {
            "error": reason, "hint": hint, "detail": detail, "kind": kind, "code": "needs_review",
            "needs_review": True, "request_id": rid}
    return _finish_write(context, request, verified)


def recover_write(b):
    try:
        iid = int(b.get("issue_id") or 0)
    except (TypeError, ValueError, AttributeError):
        iid = 0
    if iid <= 0:
        return 400, {"error": "일감 번호가 없어요"}
    return _locked_call(iid, _recover_write, b, iid)


def _recover_write(b, iid):
    if b.get("decision") not in ("check", "applied", "not_applied"):
        return 400, {"error": "확인 방법이 올바르지 않아요"}
    denied = _access(iid)
    if denied:
        return denied
    me = my_id() if configured() else None
    stored = write_requests.get_request(b.get("request_id") or "")
    if not me or not stored or stored["scope"] != _scope(me) or stored["issue_id"] != iid:
        return 404, {"error": "이 연결과 일감의 요청이 아니에요"}
    if stored["state"] == "released":
        return 200, {"retry_allowed": True, "request_id": stored["request_id"]}
    context = json.loads(stored["context"])
    try:
        verified = _verified_write(context)
    except Exception:
        verified = False
    if verified or stored["state"] in ("succeeded", "confirmed") or b.get("decision") == "applied":
        request = _REQUESTS.get(stored["request_id"], {})
        return _finish_write(context, request, verified, not verified and (b.get("decision") == "applied" or stored["state"] == "confirmed"))
    if b.get("decision") != "not_applied":
        return _review_required(stored["request_id"], "API만으로 반영 여부를 확정할 수 없어요. Redmine에서 직접 확인하세요")
    # 사용자가 미반영을 직접 확인했다고 명시한 경우에만 이전 ID를 닫는다. 여기서는 전송하지 않는다.
    try:
        write_requests.set_state(stored["request_id"], "released")
    except Exception:
        return 503, {"error": "확인 결과를 저장하지 못했어요. 다시 보내지 않았어요"}
    _REQUESTS.pop(stored["request_id"], None)
    return 200, {"retry_allowed": True, "request_id": stored["request_id"]}


def raster_type(filename, data):
    """확장자와 바이너리 서명이 일치하는 래스터만 이미지 MIME으로 전달한다."""
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "png" and data.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png"
    if ext in ("jpg", "jpeg") and data.startswith(b"\xff\xd8\xff"): return "image/jpeg"
    if ext == "gif" and data[:6] in (b"GIF87a", b"GIF89a"): return "image/gif"
    if ext == "webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp"
    return ""


def rm_attachments(iid):
    """일감의 첨부파일 목록(본문 첨부 + 댓글 첨부). 레드마인에서 바로 읽는다 (1분 캐시)."""
    def load():
        d = rm_get(f"/issues/{iid}.json", {"include": "attachments,journals"})["issue"]
        by_att = {}
        for j in d.get("journals", []):
            for x in j.get("details", []):
                if x.get("property") == "attachment":
                    by_att[str(x.get("name"))] = j
        out = []
        for a in d.get("attachments", []):
            j = by_att.get(str(a["id"]))
            out.append({
                "id": a["id"], "filename": a.get("filename", ""), "filesize": a.get("filesize", 0),
                "content_type": a.get("content_type", ""), "description": a.get("description", ""),
                "content_url": attachment_image_url(a.get("content_url"), a["id"], conn.url),
                "author": (a.get("author") or {}).get("name", ""), "created_on": a.get("created_on", ""),
                "source": "comment" if j else "body",
                "comment_by": ((j.get("user") or {}).get("name", "") if j else ""),
                "comment_at": (j.get("created_on", "") if j else ""),
                "journal_id": (j.get("id") or 0) if j else 0,
            })
        return out
    return cached(("att", iid), 60, load)
