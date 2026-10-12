"""코드/쿼리 보관함: 자주 쓰는 SQL · 코드를 제목 · 용도 · 언어 · 코드 위치 · 연관 레드마인 · 태그와 함께 모아 두고 한 번에 복사한다.
고칠 때마다 이전 내용을 몇 개 남겨서(버전 메모) 되돌릴 수 있다."""
import datetime
import json
import re

from .storage import db


DB_KINDS = ("Oracle", "MySQL", "PostgreSQL", "MSSQL", "SQLite", "기타")
LANG_KEYS = ("sql", "js", "java", "html", "mybatis", "css", "json", "sh", "py", "text")   # 비어 있으면 '자동'(화면이 내용으로 추정)
VERSION_KEEP = 10   # 항목마다 보관하는 이전 버전 수
IMPORT_MAX = 2000


def _loads(v, default):
    try:
        x = json.loads(v or "")
    except (ValueError, TypeError):
        return default
    return x if isinstance(x, type(default)) else default


def query_row(r):
    keys = r.keys()
    out = {k: r[k] for k in ("id", "title", "purpose", "db_kind", "sql", "pinned", "use_count", "last_used_at", "day", "created_at", "updated_at")}
    out["tags"] = _loads(r["tags"], [])
    nos = _loads(r["rm_nos"], []) if "rm_nos" in keys else []
    out["rm_nos"] = [int(x) for x in nos if str(x).isdigit()]
    out["lang"] = (r["lang"] or "") if "lang" in keys else ""
    out["code_locs"] = [str(x) for x in _loads(r["code_locs"], [])] if "code_locs" in keys else []
    return out


def _tags(raw):
    tags, seen = [], set()
    if isinstance(raw, str):
        raw = raw.split(",")
    for t in raw or []:
        t = " ".join(str(t).replace("#", " ").split())[:30]
        if t and t.lower() not in seen and len(tags) < 20:
            seen.add(t.lower())
            tags.append(t)
    return tags


def _rm_nos(raw):
    """연관 레드마인 번호들: '#93857, 93860' 같은 글이나 목록 → 겹치지 않는 숫자 목록(최대 30개)."""
    if isinstance(raw, str):
        raw = re.findall(r"\d+", raw)
    out = []
    for x in raw or []:
        s = re.sub(r"\D", "", str(x))[:8]
        if s and int(s) > 0 and int(s) not in out and len(out) < 30:
            out.append(int(s))
    return out


def _code_locs(raw):
    """코드 위치: 'TravelGgController, com/x/TravelGgMapper.xml' 같은 글이나 목록 → 겹치지 않는 목록(최대 20개, 각 200자)."""
    if isinstance(raw, str):
        raw = re.split(r"[\n,]", raw)
    out, seen = [], set()
    for x in raw or []:
        s = " ".join(str(x).split())[:200]
        if s and s.lower() not in seen and len(out) < 20:
            seen.add(s.lower())
            out.append(s)
    return out


def _lang(v):
    v = str(v or "").strip().lower()
    return v if v in LANG_KEYS else ""


def _norm_sql(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


def _snapshot(c, row, now):
    """고치기 직전의 내용을 버전 메모로 남기고, 오래된 것은 지운다."""
    c.execute("INSERT INTO query_versions (query_id,title,purpose,lang,sql,saved_at) VALUES (?,?,?,?,?,?)",
              (row["id"], row["title"], row["purpose"], row["lang"] or "", row["sql"], now))
    c.execute("DELETE FROM query_versions WHERE query_id=? AND id NOT IN (SELECT id FROM query_versions WHERE query_id=? ORDER BY id DESC LIMIT ?)",
              (row["id"], row["id"], VERSION_KEEP))


def query_save(d):
    """한 건 만들기/고치기. 같은 쿼리가 이미 있으면(새로 만들 때만, force 가 없으면) 만들지 않고 {"dup": 기존 건} 을 돌려준다.
    고칠 때 제목 · 용도 · 언어 · 코드가 바뀌면 이전 내용을 버전 메모로 남긴다."""
    sql = str(d.get("sql") or "").strip("\n")[:200000]
    if not sql.strip():
        raise ValueError("코드/쿼리를 적어 주세요")
    title = " ".join(str(d.get("title") or "").split())[:200]
    if not title:
        first = next((ln.strip() for ln in sql.split("\n") if ln.strip()), "")
        title = re.sub(r"^(--|/\*|//|#)\s*", "", first)[:80] or "제목 없음"
    kind = " ".join(str(d.get("db_kind") or "").split())[:20]
    purpose = str(d.get("purpose") or "")[:5000]
    lang = _lang(d.get("lang"))
    tags = json.dumps(_tags(d.get("tags")), ensure_ascii=False)
    nos = json.dumps(_rm_nos(d.get("rm_nos")))
    locs = json.dumps(_code_locs(d.get("code_locs")), ensure_ascii=False)
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        qid = d.get("id")
        if qid:
            old = c.execute("SELECT * FROM queries WHERE id=?", (qid,)).fetchone()
            if not old:
                raise ValueError("없는 항목이에요")
            if (old["sql"], old["title"], old["purpose"], old["lang"] or "") != (sql, title, purpose, lang):
                _snapshot(c, old, now)
            c.execute("UPDATE queries SET title=?, purpose=?, db_kind=?, lang=?, sql=?, tags=?, rm_nos=?, code_locs=?, updated_at=? WHERE id=?",
                      (title, purpose, kind, lang, sql, tags, nos, locs, now, qid))
        else:
            if not d.get("force"):
                key = _norm_sql(sql)
                for r in c.execute("SELECT * FROM queries"):
                    if _norm_sql(r["sql"]) == key:
                        return {"dup": query_row(r)}
            cur = c.execute("INSERT INTO queries (title,purpose,db_kind,lang,sql,tags,rm_nos,code_locs,pinned,use_count,day,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?)",
                            (title, purpose, kind, lang, sql, tags, nos, locs, datetime.date.today().isoformat(), now, now))
            qid = cur.lastrowid
        return query_row(c.execute("SELECT * FROM queries WHERE id=?", (qid,)).fetchone())


def query_use(qid):
    """복사해서 썼다고 기록(사용 횟수 +1)."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        c.execute("UPDATE queries SET use_count=use_count+1, last_used_at=? WHERE id=?", (now, qid))
        r = c.execute("SELECT * FROM queries WHERE id=?", (qid,)).fetchone()
        if not r:
            raise ValueError("없는 항목이에요")
        return query_row(r)


def query_pin(qid, pinned):
    with db() as c:
        cur = c.execute("UPDATE queries SET pinned=? WHERE id=?", (1 if pinned else 0, qid))
        if not cur.rowcount:
            raise ValueError("없는 항목이에요")
        return query_row(c.execute("SELECT * FROM queries WHERE id=?", (qid,)).fetchone())


def query_list():
    """고정한 것 먼저, 그다음 최근 수정 순."""
    with db() as c:
        return [query_row(r) for r in c.execute("SELECT * FROM queries ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT 5000")]


def query_delete(qid):
    with db() as c:
        c.execute("DELETE FROM query_versions WHERE query_id=?", (qid,))
        c.execute("DELETE FROM queries WHERE id=?", (qid,))


def query_versions(qid):
    """이전 버전 메모들(최근 것부터)."""
    with db() as c:
        return [{k: r[k] for k in ("id", "title", "purpose", "lang", "sql", "saved_at")}
                for r in c.execute("SELECT * FROM query_versions WHERE query_id=? ORDER BY id DESC LIMIT ?", (qid, VERSION_KEEP))]


def query_restore(qid, vid):
    """이전 버전으로 되돌린다. 되돌리기 직전의 내용도 버전 메모로 남아서 다시 돌아올 수 있다."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        cur = c.execute("SELECT * FROM queries WHERE id=?", (qid,)).fetchone()
        v = c.execute("SELECT * FROM query_versions WHERE id=? AND query_id=?", (vid, qid)).fetchone()
        if not cur or not v:
            raise ValueError("없는 버전이에요")
        _snapshot(c, cur, now)
        c.execute("UPDATE queries SET title=?, purpose=?, lang=?, sql=?, updated_at=? WHERE id=?", (v["title"], v["purpose"], v["lang"] or "", v["sql"], now, qid))
        return query_row(c.execute("SELECT * FROM queries WHERE id=?", (qid,)).fetchone())


def query_import(items):
    """내보낸 파일(JSON)에서 읽은 항목들을 넣는다. 같은 코드(공백·대소문자 무시)가 이미 있으면 건너뛴다."""
    if not isinstance(items, list):
        raise ValueError("가져올 목록 형식이 올바르지 않아요")
    added = skipped = bad = 0
    for it in items[:IMPORT_MAX]:
        if not isinstance(it, dict) or not str(it.get("sql") or "").strip():
            bad += 1
            continue
        d = {k: it.get(k) for k in ("title", "purpose", "db_kind", "lang", "sql", "tags", "rm_nos", "code_locs")}
        r = query_save(d)
        if r.get("dup"):
            skipped += 1
        else:
            added += 1
    return {"added": added, "skipped": skipped, "bad": bad}
