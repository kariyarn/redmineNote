"""트러블슈팅 문서"""
import datetime
import json
import re

from .storage import db


TROUBLE_STATUS = ("해결", "진행 중", "보류")


def trouble_row(r):
    try:
        tags = json.loads(r["tags"] or "[]")
    except ValueError:
        tags = []
    out = {k: r[k] for k in ("id", "title", "status", "symptom", "cause", "solution", "notes", "rm_no", "day", "created_at", "updated_at")}
    out["tags"] = tags if isinstance(tags, list) else []
    return out


def trouble_save(d):
    """트러블슈팅 한 건 만들기/고치기. 길이는 잘라서 저장한다."""
    title = " ".join(str(d.get("title") or "").split())[:200]
    if not title:
        raise ValueError("제목을 적어 주세요")
    status = d.get("status") if d.get("status") in TROUBLE_STATUS else "진행 중"
    tags, seen = [], set()
    raw = d.get("tags") or []
    if isinstance(raw, str):
        raw = raw.split(",")
    for t in raw:
        t = " ".join(str(t).replace("#", " ").split())[:30]
        if t and t.lower() not in seen and len(tags) < 20:
            seen.add(t.lower())
            tags.append(t)

    def txt(k):
        return str(d.get(k) or "")[:50000]
    rm = re.sub(r"[^0-9]", "", str(d.get("rm_no") or ""))[:8]
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        tid = d.get("id")
        vals = (title, status, json.dumps(tags, ensure_ascii=False), txt("symptom"), txt("cause"), txt("solution"), txt("notes"), rm)
        if tid:
            cur = c.execute("UPDATE trouble SET title=?, status=?, tags=?, symptom=?, cause=?, solution=?, notes=?, rm_no=?, updated_at=? WHERE id=?",
                            vals + (now, tid))
            if not cur.rowcount:
                raise ValueError("없는 트러블슈팅이에요")
        else:
            day = str(d.get("day") or "")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
                day = datetime.date.today().isoformat()
            cur = c.execute("INSERT INTO trouble (title,status,tags,symptom,cause,solution,notes,rm_no,day,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            vals + (day, now, now))
            tid = cur.lastrowid
        return trouble_row(c.execute("SELECT * FROM trouble WHERE id=?", (tid,)).fetchone())
