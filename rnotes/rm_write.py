"""레드마인에 쓰기(댓글 · 상태 · 담당자) · 첨부 목록"""
import datetime
import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from .config import STATE, conn
from .redmine import cached, explain, my_id, rm_get, rm_issue, rm_members, rm_put, rm_statuses, upsert_issue
from .storage import configured, db, get_settings


# ---------- 레드마인에 쓰기 (댓글 · 상태 · 담당자) ----------
# 영향도를 최소화하려고 쓸 수 있는 것은 이 세 가지뿐이다. 제목·본문·기간 등은 쓰지 않고, 삭제 기능은 없다.
WRITE_ALLOW_IDS = ()   # 시험 모드 해제됨(2.1.0). 목록이 비어 있으면 "내 노트에 등록된 일감"이면 어디서든 쓸 수 있다. 다시 제한하려면 (93599,) 처럼 번호를 넣고 빌드한다.
WRITE_FIELDS = {"issue_id", "notes", "status_id", "assigned_to_id", "dev_id", "preset", "loaded_updated_on", "force"}   # 요청에 들어올 수 있는 항목


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
    return {"allow": list(allow), "test": bool(allow), "statuses": status_ids()}


_FENCE = re.compile(r"```([A-Za-z0-9_+#.-]*)[ \t]*\n(.*?)```", re.S)
_PRE = re.compile(r"(<pre>.*?</pre>|<pre><code[^>]*>.*?</code></pre>)", re.S)


_MARK = re.compile(r"^\s*(?:[*#]+\s|\||h[1-6]\.\s|bq\.\s|p\.\s)")   # 목록·표·제목 줄


def _soft_breaks(seg):
    """레드마인은 댓글을 HTML 로 보여 줘서 엔터(\\n)만으로는 줄이 바뀌지 않는다.
    글 속의 엔터는 친 횟수만큼 <br /> 로 바꾼다: 한 번 = 줄바꿈, 두 번 = 빈 줄 한 줄, 세 번 = 빈 줄 두 줄.
    (예전에는 한 번짜리만 바꿔서 빈 줄이 사라지고 윗줄과 아랫줄이 한 줄로 붙었다.) 목록·표·제목 앞의 빈 줄은 건드리지 않는다."""
    lines = seg.split("\n")
    out, i, n = [], 0, len(lines)
    while i < n:
        a = lines[i]
        if not a.strip():
            out.append(a)
            i += 1
            continue
        j = i + 1
        while j < n and not lines[j].strip():
            j += 1
        k = j - i - 1                      # 두 글줄 사이의 빈 줄 수
        if j < n and not _MARK.match(lines[j]) and not _MARK.match(a) and not a.rstrip().endswith("<br />"):
            out.append(a.rstrip() + "<br />" * (k + 1))   # 빈 줄들은 <br /> 로 바꿔 담았으니 따로 남기지 않는다
        else:
            out.append(a)
            out.extend(lines[i + 1:j])
        i = j
    return "\n".join(out)


def to_textile(text):
    """앱에서 쓴 글(```코드 상자```, `인라인 코드`)을 레드마인 Textile 로 바꾼다."""
    text = (text or "").replace("\r\n", "\n")

    def fence(m):
        lang, code = m.group(1).lower(), m.group(2).strip("\n")
        return f'<pre><code class="{lang}">\n{code}\n</code></pre>' if lang else f"<pre>\n{code}\n</pre>"

    segs = _PRE.split(_FENCE.sub(fence, text))
    for i in range(0, len(segs), 2):  # 짝수 칸 = 코드 상자 밖
        segs[i] = _soft_breaks(re.sub(r"`([^`\n]+)`", r"@\1@", segs[i]))
    return "".join(segs)


def explain_write(e):
    """쓰기 실패 -> (종류, 사유, 조치). 레드마인이 알려 준 원문도 같이 돌려준다."""
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
        detail = " / ".join(str(x) for x in msgs)[:300]
        if e.code == 401:
            return ("key", "API 키가 거절됐어요", "설정에서 API 키를 다시 입력하세요", detail)
        if e.code == 403:
            return ("forbidden", "이 일감에 댓글을 쓰거나 바꿀 권한이 없어요", "레드마인에서 내 권한을 확인하세요", detail)
        if e.code == 404:
            return ("gone", "일감을 찾을 수 없어요 (삭제됐거나 볼 수 없음)", "번호를 확인하세요", detail)
        if e.code == 422:
            low = detail.lower()
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
    return (kind, reason, hint, "")


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


def do_write(b):
    """POST /api/rm/write. 돌려주는 값: (HTTP 코드, JSON)"""
    try:
        iid = int(b.get("issue_id") or 0)
    except (TypeError, ValueError):
        iid = 0
    if not iid:
        return 400, {"error": "일감 번호가 없어요"}
    allow = write_allow()
    if allow and iid not in allow:
        return 403, {"error": "시험 모드예요: " + ", ".join(f"#{x}" for x in allow) + " 에서만 레드마인에 쓸 수 있어요", "code": "test_mode"}
    if not allow:   # 시험 모드가 아니면: 내 노트에 등록된(가져온) 일감에서만
        with db() as c:
            if not c.execute("SELECT 1 FROM notes WHERE issue_id=?", (iid,)).fetchone():
                return 403, {"error": "내 노트에 등록되지 않은 일감이에요. 먼저 가져온 일감에서만 쓸 수 있어요", "code": "not_registered"}
    extra = set(b) - WRITE_FIELDS
    if extra:
        return 400, {"error": "보낼 수 없는 항목이 들어 있어요: " + ", ".join(sorted(extra)), "code": "bad_field"}
    if not configured() or not my_id():
        return 400, {"error": "레드마인에 연결돼 있지 않아요 — 설정에서 API 키를 확인하세요"}
    notes = (b.get("notes") or "").strip()
    if len(notes) > 20000:
        return 400, {"error": "댓글이 너무 길어요 (최대 20000자)"}
    try:
        d, dev = rm_issue(iid)
        me = my_id()
        fields = gather_fields(b, d, me)
    except Exception as e:
        kind, reason, hint, _ = explain(e)
        return 502, {"error": f"{reason} — {hint}", "kind": kind}
    # 이미 같은 값이면 보내지 않는다 (불필요한 변경 이력과 알림 방지)
    same = {"status_id": d["status"]["id"], "assigned_to_id": (d.get("assigned_to") or {}).get("id"), "dev_id": dev}
    fields = {k: v for k, v in fields.items() if v != same.get(k)}
    if not notes and not fields:
        return 400, {"error": "바뀌는 것이 없어요 — 이미 같은 상태·담당자예요 (댓글도 비어 있어요)", "code": "nochange"}
    # 보이는 화면을 연 뒤에 레드마인에서 바뀌었는지 확인
    lu = b.get("loaded_updated_on")
    if lu and lu != d["updated_on"] and not b.get("force"):
        return 409, {"error": "이 일감이 그 사이에 레드마인에서 바뀌었어요. 그래도 올릴까요?", "code": "changed",
                     "current": {"updated_on": d["updated_on"], "status": d["status"]["name"], "assigned": (d.get("assigned_to") or {}).get("name"),
                                 "comments": len([j for j in d.get("journals", []) if (j.get("notes") or "").strip()])}}
    sig = hashlib.sha1(json.dumps([iid, notes, sorted(fields.items())], ensure_ascii=False).encode("utf-8")).hexdigest()
    if not b.get("force"):
        since = (datetime.datetime.now() - datetime.timedelta(seconds=60)).isoformat(timespec="seconds")
        with db() as c:
            if c.execute("SELECT 1 FROM write_log WHERE sig=? AND ok=1 AND at>=?", (sig, since)).fetchone():
                return 409, {"error": "같은 내용을 방금 올렸어요. 한 번 더 올릴까요?", "code": "duplicate"}
    payload = {"issue": {}}
    if notes:
        payload["issue"]["notes"] = to_textile(notes)
    if "status_id" in fields:
        payload["issue"]["status_id"] = fields["status_id"]
    if "assigned_to_id" in fields:
        payload["issue"]["assigned_to_id"] = fields["assigned_to_id"]
    if "dev_id" in fields:
        payload["issue"]["custom_fields"] = [{"id": int(conn.dev_field), "value": str(fields["dev_id"])}]
    action = b.get("preset") or ("comment" if notes and not fields else "custom")
    verified = False
    try:
        rm_put(f"/issues/{iid}.json", payload)
    except Exception as e:
        kind, reason, hint, detail = explain_write(e)
        if kind in ("server", "timeout", "network"):  # 올라갔는지 모르는 경우: 레드마인에서 다시 읽어 확인한다 (자동 재시도는 중복이 될 수 있어 하지 않음)
            try:
                d2, dev2 = rm_issue(iid)
                mine = [j for j in d2.get("journals", []) if (j.get("user") or {}).get("id") == me and (j.get("notes") or "").strip() == payload["issue"].get("notes", "").strip()]
                done = (bool(notes) and bool(mine)) or (not notes and all(
                    {"status_id": d2["status"]["id"], "assigned_to_id": (d2.get("assigned_to") or {}).get("id"), "dev_id": dev2}.get(k) == v for k, v in fields.items()))
                if done:
                    verified = True
            except Exception:
                pass
        if not verified:
            lid = write_log(iid, action, sig, payload, False, f"{kind}: {reason} {detail}".strip())
            return 422 if kind in ("status", "assignee", "devfield", "invalid") else 502, {
                "error": reason, "hint": hint, "detail": detail, "kind": kind, "log_id": lid}
    try:
        n = refresh_local(iid)
    except Exception:
        n = None
    lid = write_log(iid, action, sig, payload, True, "올라감" + (" (오류 응답 뒤 레드마인에서 확인됨)" if verified else ""))
    return 200, {"ok": True, "note": n, "verified": verified, "log_id": lid}


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
                "author": (a.get("author") or {}).get("name", ""), "created_on": a.get("created_on", ""),
                "source": "comment" if j else "body",
                "comment_by": ((j.get("user") or {}).get("name", "") if j else ""),
                "comment_at": (j.get("created_on", "") if j else ""),
                "journal_id": (j.get("id") or 0) if j else 0,
            })
        return out
    return cached(("att", iid), 60, load)
