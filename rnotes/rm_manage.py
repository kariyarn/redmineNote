"""첨부 삭제·본인 댓글 수정. 기존 일감 락·요청 원장과 인증 전송을 재사용한다."""
import hashlib
import json
import re
import urllib.error

from .config import conn
from .redmine import invalidate_cached, my_id, rm_delete, rm_issue, rm_put
from .rm_write import _access, _finish_write, _locked_call, _scope, explain_write, write_log
from .storage import configured
from . import write_requests
from .comment_format import check_format


OPERATIONS = ("delete_attachment", "edit_journal")


def _id(value):
    return int(str(value)) if re.fullmatch(r"[1-9][0-9]{0,17}", str(value)) else 0


def _hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _version(journal):
    return _hash({k: journal.get(k) for k in ("notes", "updated_on", "user", "details", "private_notes")})


def _target(issue, operation, target_id, me):
    key = "attachments" if operation == "delete_attachment" else "journals"
    item = next((x for x in issue.get(key, []) if x.get("id") == target_id), None)
    if not item:
        return None, (404, {"error": "이 일감에 해당 첨부파일 또는 댓글이 없어요", "code": "target_missing"})
    author = (item.get("author") if operation == "delete_attachment" else item.get("user")) or {}
    flag = "deletable" if operation == "delete_attachment" else "editable"
    if author.get("id") != me or item.get(flag) is False:
        return None, (403, {"error": "본인이 작성하고 변경 가능한 항목만 처리할 수 있어요", "code": "not_owner"})
    if operation == "edit_journal" and not (item.get("notes") or "").strip():
        return None, (403, {"error": "댓글 내용이 없는 변경 이력은 수정할 수 없어요", "code": "not_comment"})
    return item, None


def journal_for_edit(query):
    iid, jid = _id(query.get("issue_id")), _id(query.get("journal_id"))
    if not iid or not jid:
        return 400, {"error": "일감·댓글 번호가 올바르지 않아요"}
    denied = _access(iid)
    if denied:
        return denied
    me = my_id() if configured() else None
    if not me:
        return 400, {"error": "Redmine에 연결돼 있지 않아요"}
    try:
        issue, _ = rm_issue(iid)
        journal, denied = _target(issue, "edit_journal", jid, me)
        if denied:
            return denied
        return 200, {"raw": journal.get("notes") or "", "version": _version(journal), "journal_id": jid}
    except Exception as e:
        return _error(e, "edit_journal", iid)


def _error(error, operation, iid):
    kind, reason, hint, detail = explain_write(error)
    status = getattr(error, "code", 0)
    if operation == "edit_journal" and status in (404, 405, 501):
        return 422, {"error": "이 Redmine은 댓글 수정 API를 지원하지 않거나 대상을 조회할 수 없어요",
                     "hint": "원본 Redmine에서 댓글을 수정하세요", "code": "unsupported", "original_path": f"/issues/{iid}"}
    if status == 403:
        reason, hint = "Redmine에서 이 작업의 권한을 거절했어요", "원본 Redmine에서 권한을 확인하세요"
    return (status if status in (401, 403, 404, 409, 422) else 502), {
        "error": reason, "hint": hint, "detail": detail, "kind": kind, "original_path": f"/issues/{iid}"}


def _review(row):
    context = json.loads(row["context"])
    return 409, {"error": "이전 삭제·수정 요청의 반영 여부를 원본 Redmine에서 확인해 주세요",
                 "code": "needs_review", "needs_review": True, "request_id": row["request_id"],
                 "operation": context["operation"], "target_id": context["target_id"],
                 "original_path": f"/issues/{row['issue_id']}"}


def manage_write(body, operation):
    iid = _id(body.get("issue_id")) if isinstance(body, dict) else 0
    if not iid or operation not in OPERATIONS:
        return 400, {"error": "요청이 올바르지 않아요"}
    return _locked_call(iid, _manage_write, body, operation, iid)


def _manage_write(body, operation, iid):
    denied = _access(iid)
    if denied:
        return denied
    target_id = _id(body.get("target_id"))
    rid = body.get("request_id")
    if not target_id or not isinstance(rid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", rid):
        return 400, {"error": "대상·요청 번호가 올바르지 않아요"}
    if set(body) - {"issue_id", "target_id", "request_id", "notes", "notes_format", "version", "filename"}:
        return 400, {"error": "허용되지 않은 요청 항목이에요"}
    if operation == "edit_journal":
        notes = body.get("notes")
        if not isinstance(notes, str) or not notes.strip() or len(notes) > 20000 or not isinstance(body.get("version"), str):
            return 400, {"error": "댓글은 1~20000자이며 원본 확인 정보가 필요해요"}
        try:
            if body.get("notes_format") == "legacy":
                raise ValueError("기존 댓글은 원문 또는 확인한 서버 형식으로 수정하세요")
            if not check_format(notes, body.get("notes_format", "source"), conn.url):
                raise ValueError("댓글 내용이 비어 있어요")
        except (ValueError, TypeError):
            return 400, {"error": "댓글 형식 또는 HTML이 안전하지 않아요. 원문을 확인하세요", "code": "bad_format"}
    elif not isinstance(body.get("filename"), str) or not body["filename"]:
        return 400, {"error": "삭제할 파일명이 필요해요"}
    me = my_id() if configured() else None
    if not me:
        return 400, {"error": "Redmine에 연결돼 있지 않아요"}
    # 새 댓글 쓰기의 미확정 상태와 구분한다. 실행 중 락은 기존 쓰기와 공유한다.
    scope = _scope(me) + ":manage"
    sig = _hash([operation, iid, target_id, body.get("filename"), body.get("version"), body.get("notes")])
    if body.get("notes_format") not in (None, "source"):
        sig = _hash([sig, body["notes_format"]])
    try:
        row = write_requests.get_request(rid)
        if row:
            if row["scope"] != scope or row["signature"] != sig:
                return 409, {"error": "다른 내용에 사용된 요청 번호예요", "code": "request_reused"}
            if row["state"] in ("succeeded", "confirmed"):
                return 200, {"ok": True, "replayed": True, "request_id": rid}
            if row["state"] == "released":
                return 409, {"error": "종료된 요청이에요. 새 요청 번호를 사용하세요", "code": "request_closed", "retry_allowed": True}
            return _review(row)
        pending = write_requests.unresolved(scope, iid)
        if pending:
            return _review(pending)
    except Exception:
        return 503, {"error": "요청 상태를 읽지 못해 원격 변경을 보내지 않았어요"}
    try:
        issue, _ = rm_issue(iid)
        item, denied = _target(issue, operation, target_id, me)
        if denied:
            return denied
        if operation == "edit_journal":
            if body["version"] != _version(item):
                return 409, {"error": "그 사이 댓글이 바뀌었어요. 원본을 다시 확인하세요", "code": "changed"}
            if body["notes"] == item.get("notes"):
                return 400, {"error": "바뀐 내용이 없어요", "code": "nochange"}
        elif body["filename"] != item.get("filename"):
            return 409, {"error": "삭제 대상 파일명이 바뀌었어요. 목록을 다시 확인하세요", "code": "changed"}
    except Exception as e:
        return _error(e, operation, iid)
    before = {k: item.get(k) for k in ("id", "filename", "filesize")} if operation == "delete_attachment" else None
    context = {"iid": iid, "me": me, "operation": operation, "target_id": target_id,
               "before": before, "before_version": _version(item) if operation == "edit_journal" else None,
               "after": body.get("notes"), "request_id": rid, "sig": sig,
               "action": operation, "log_payload": {"operation": operation, "target_id": target_id}}
    try:
        write_requests.begin(rid, scope, iid, sig, context)
    except Exception:
        return 503, {"error": "처리 상태를 저장하지 못해 변경을 보내지 않았어요", "code": "journal_unavailable"}
    try:
        if operation == "delete_attachment":
            rm_delete(f"/attachments/{target_id}.json")
        else:
            rm_put(f"/journals/{target_id}.json", {"journal": {"notes": body["notes"]}})
    except Exception as e:
        status, error = _error(e, operation, iid)
        # 명확한 거절만 종료한다. 나머지는 영속 미확정 상태로 두고 재전송하지 않는다.
        definite = isinstance(e, urllib.error.HTTPError) and e.code in (400, 401, 403, 404, 405, 409, 422, 501)
        saved = False
        try:
            write_requests.set_state(rid, "released" if definite else "uncertain")
            saved = True
        except Exception:
            pass
        try:
            write_log(iid, operation, sig, context["log_payload"], False, "manage: " + error.get("kind", error.get("code", "error")))
        except Exception:
            pass
        invalidate_cached(("att", iid))
        if definite and saved:
            error["retry_allowed"] = True
        else:
            error.update(_review({"context": json.dumps(context), "request_id": rid, "issue_id": iid})[1])
            error["hint"] = "결과를 확정할 수 없어 자동 재전송하지 않아요. 원본 Redmine에서 확인하세요"
        return status, error
    return _finish_write(context, {})


def recover_manage(body):
    iid = _id(body.get("issue_id")) if isinstance(body, dict) else 0
    if not iid:
        return 400, {"error": "일감 번호가 올바르지 않아요"}
    return _locked_call(iid, _recover_manage, body, iid)


def _recover_manage(body, iid):
    denied = _access(iid)
    if denied:
        return denied
    me = my_id() if configured() else None
    try:
        row = write_requests.get_request(body.get("request_id") or "")
        if not me or not row or row["scope"] != _scope(me) + ":manage" or row["issue_id"] != iid:
            return 404, {"error": "이 연결과 일감의 요청이 아니에요"}
        if row["state"] in ("succeeded", "confirmed"):
            return 200, {"ok": True, "replayed": True}
        if row["state"] == "released":
            return 200, {"retry_allowed": True}
        context = json.loads(row["context"])
        decision = body.get("decision")
        if decision not in ("check", "applied", "not_applied"):
            return 400, {"error": "확인 방법이 올바르지 않아요"}
        issue, _ = rm_issue(iid)
        key = "attachments" if context["operation"] == "delete_attachment" else "journals"
        item = next((x for x in issue.get(key, []) if x.get("id") == context["target_id"]), None)
        applied = item is None if key == "attachments" else bool(item and item.get("notes") == context["after"])
        unchanged = False
        if item:
            if key == "attachments":
                unchanged = ({k: item.get(k) for k in ("id", "filename", "filesize")} == context["before"]
                             and (item.get("author") or {}).get("id") == me)
            else:
                unchanged = _version(item) == context["before_version"]
        if decision == "applied" and applied:
            return _finish_write(context, {}, manual=True)
        if decision == "not_applied" and unchanged:
            write_requests.set_state(row["request_id"], "released")
            return 200, {"retry_allowed": True}
        return _review(row)  # 같은 내용·부재만으로 자동 성공을 추정하지 않는다.
    except Exception as e:
        return _error(e, "recover", iid)
