"""업무 위키: 주제를 나무처럼 엮는 자유 문서 (행 하나 = 문서 하나 = 분류 하나).
- 행 이름이 곧 문서 제목이다. 본문을 고쳐도 행 이름은 바뀌지 않는다.
- 본문은 HTML 로 저장한다. 저장할 때 서버에서 허용 목록(태그 · 속성 · 값)만 남기고 나머지는 버린다
  (화면 · 붙여넣기 · 깃허브 백업 복원 어느 길로 들어와도 스크립트가 남지 않게).
- 형광펜 · 글자색 · 글자 크기는 값이 아니라 이름(class)으로만 저장한다: 테마마다 화면에서 색 · 크기를 정한다.
- 연결(쿼리 · 트러블슈팅 · 코드 · 일감 · 다른 위키 문서)은 <a class="lk" data-k=".." data-ref=".."> 로 id 만 저장한다.
  이름은 화면에서 그때그때 찾아 붙이므로 원래 항목의 이름을 바꿔도 링크가 깨지지 않는다.
"""
import datetime
import hashlib
import hmac
import html
import re
import secrets
import threading
import time
from html.parser import HTMLParser

from .storage import db

MAX_BODY = 500_000
MAX_TITLE = 200

_BLOCK = {"p", "div", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre",
          "table", "thead", "tbody", "tr", "th", "td"}
_INLINE = {"b", "strong", "i", "em", "u", "s", "strike", "del", "code", "mark", "span", "a", "sup", "sub"}
_VOID = {"br", "hr", "img"}
_ALLOWED = _BLOCK | _INLINE | _VOID
_DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "svg", "math", "template",
                      "noscript", "textarea", "select", "button", "form", "head", "title"}
_RENAME = {"h1": "h2", "h5": "h4", "h6": "h4"}      # 본문 제목은 3단계만 (문서 제목과 겹치지 않게)

HL = ("hl-y", "hl-g", "hl-p", "hl-b")
FC = ("fc-red", "fc-org", "fc-blue", "fc-gray")
FS = ("fs-s", "fs-l", "fs-xl")      # 글자 크기 (2.36): 작게 · 크게 · 아주 크게. 기본 크기는 class 없음
LINK_KINDS = ("issue", "vault", "trouble", "code", "wiki")
_NUM_ID = re.compile(r"[1-9][0-9]{0,11}")
_CODE_ID = re.compile(r"[^\x00-\x1f\x7f<>\"'`&]{1,200}")
IMG_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
IMG_CTYPE = {v: k for k, v in IMG_TYPES.items()}
IMG_NAME = re.compile(r"[0-9a-f]{40}\.(?:png|jpg|webp|gif)")
MAX_IMG = 15 * 1024 * 1024


def _link_id_ok(kind, value):
    if kind == "code":
        return bool(_CODE_ID.fullmatch(value)) and value.strip() == value
    return bool(_NUM_ID.fullmatch(value))


class _Clean(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.stack = []
        self.skip = 0          # 내용까지 버리는 태그 안에 있는 깊이

    def _attrs(self, tag, attrs):
        a = {}
        for k, v in attrs:
            k = (k or "").lower()
            v = "" if v is None else str(v)
            if k not in a:
                a[k] = v
        keep = []
        if tag == "mark" and a.get("class") in HL:
            keep.append(("class", a["class"]))
        elif tag == "span" and a.get("class") in FC + FS:
            keep.append(("class", a["class"]))
        elif tag == "a":
            kind, lid = a.get("data-k", ""), a.get("data-ref", "")
            if a.get("class", "").split()[:1] != ["lk"] or kind not in LINK_KINDS or not _link_id_ok(kind, lid):
                return None                   # 연결이 아닌 링크(href 등)는 태그를 벗기고 글자만 남긴다
            keep += [("class", "lk"), ("data-k", kind), ("data-ref", lid)]
        elif tag == "img":            # 사진: 우리 DB 의 사진 이름만 (src 는 화면이 붙인다 → 바깥 주소로는 못 나간다)
            if not IMG_NAME.fullmatch(a.get("data-img", "")):
                return None
            keep.append(("data-img", a["data-img"]))
        elif tag == "table" and a.get("class") == "tw-full":     # 표 폭: 본문 폭에 꽉 채우기 (2.37). 없으면 내용만큼
            keep.append(("class", "tw-full"))
        elif tag in ("th", "td"):
            for k in ("colspan", "rowspan"):
                if re.fullmatch(r"[1-9][0-9]?", a.get(k, "")):
                    keep.append((k, a[k]))
        return keep

    def handle_starttag(self, tag, attrs):
        tag = _RENAME.get(tag.lower(), tag.lower())
        if self.skip or tag in _DROP_WITH_CONTENT:
            if tag not in _VOID:
                self.skip += 1
            return
        if tag not in _ALLOWED:
            return
        keep = self._attrs(tag, attrs)
        if keep is None:
            if tag == "img":
                return
            if tag == "a":
                self.stack.append(None)       # 짝이 되는 </a> 를 버리기 위한 자리
            return
        at = "".join(f' {k}="{html.escape(v, quote=True)}"' for k, v in keep)
        if tag in _VOID:
            self.out.append(f"<{tag}{at}>")
            return
        self.out.append(f"<{tag}{at}>")
        self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        t = _RENAME.get(tag.lower(), tag.lower())
        if t in _VOID:
            self.handle_starttag(t, attrs)
        # 그 밖의 <x/> 는 버린다 (빈 요소)

    def handle_endtag(self, tag):
        tag = _RENAME.get(tag.lower(), tag.lower())
        if self.skip:
            if tag in _DROP_WITH_CONTENT or tag not in _VOID:
                self.skip -= 1
            return
        if tag == "a" and None in self.stack:
            # 벗긴 링크의 짝: 가장 안쪽의 자리표를 지운다
            i = len(self.stack) - 1 - self.stack[::-1].index(None)
            if all(x != "a" for x in self.stack[i + 1:]):
                self.stack.pop(i)
                return
        if tag not in self.stack:
            return
        while self.stack:
            t = self.stack.pop()
            if t is None:
                continue
            self.out.append(f"</{t}>")
            if t == tag:
                break

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))

    def close(self):
        super().close()
        while self.stack:
            t = self.stack.pop()
            if t:
                self.out.append(f"</{t}>")
        return "".join(self.out)


def clean_html(src):
    """허용한 태그 · 속성 · 값만 남긴 본문 HTML."""
    p = _Clean()
    p.feed(str(src or "")[:MAX_BODY * 2])
    return p.close()[:MAX_BODY]


def _title(v):
    t = " ".join(str(v or "").split())[:MAX_TITLE]
    if not t:
        raise ValueError("문서 제목을 적어 주세요")
    return t


def _row(r):
    return {k: r[k] for k in ("id", "parent_id", "pos", "title", "body", "created_at", "updated_at")}


# ---------- 주제 잠금 ----------
# 잠근 문서와 그 아래 문서 전부는 암호로 열기 전까지 서버가 내주지 않는다 (제목만 보이는 잠긴 행 하나로).
# 연 상태는 '열쇠'(무작위 토큰)로 화면 메모리에만 있다 → 창을 닫았다 열면 다시 잠긴다. 열쇠는 12시간이 지나면 버린다.
# 주의: 암호화가 아니다 (표준 라이브러리에 AES 가 없다). notes.db · 백업 파일 안의 글은 그대로 읽힌다 — 앱 안에서 가리는 잠금.
_KEYS = {}            # 토큰 -> (잠긴 문서 id, 만료 시각)
_KEYS_LOCK = threading.Lock()
KEY_TTL = 12 * 3600
_PBKDF2_N = 200_000


class Locked(ValueError):
    """잠긴 주제라서 열쇠가 필요하다 (화면은 이걸 보고 암호 창을 띄운다)."""


def _hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_N).hex()


def _open_ids(keys):
    now = time.time()
    with _KEYS_LOCK:
        for t in [t for t, (_, exp) in _KEYS.items() if exp < now]:
            del _KEYS[t]
        return {_KEYS[k][0] for k in (keys or ()) if k in _KEYS}


def _tree(c):
    rows = c.execute("SELECT id, parent_id, lock_hash FROM wiki").fetchall()
    return {r["id"]: r["parent_id"] for r in rows}, {r["id"] for r in rows if r["lock_hash"]}


def _blocker(wid, parents, locked, open_ids):
    """wid 를 막고 있는 가장 위쪽의 '잠겼고 아직 안 연' 문서 id (없으면 None)."""
    chain, p, guard = [], wid, 0
    while p is not None and guard < 500:
        chain.append(p)
        p = parents.get(p)
        guard += 1
    for x in reversed(chain):
        if x in locked and x not in open_ids:
            return x
    return None


def _need_open(c, wid, keys):
    if wid is None:
        return
    parents, locked = _tree(c)
    b = _blocker(int(wid), parents, locked, _open_ids(keys))
    if b is not None:
        raise Locked("잠긴 주제예요. 먼저 암호를 넣어 열어 주세요")


def wiki_list(keys=()):
    """문서 전부. 잠긴(안 연) 주제는 제목만 있는 행 하나로 주고, 그 아래 문서는 id 만(hidden) 알려 준다."""
    with db() as c:
        rows = c.execute("SELECT * FROM wiki ORDER BY parent_id IS NOT NULL, parent_id, pos, id").fetchall()
        parents = {r["id"]: r["parent_id"] for r in rows}
        locked = {r["id"] for r in rows if r["lock_hash"]}
    open_ids = _open_ids(keys)
    out, hidden = [], {}
    for r in rows:
        b = _blocker(r["id"], parents, locked, open_ids)
        if b is not None and b != r["id"]:
            hidden.setdefault(b, []).append(r["id"])
            continue
        x = _row(r)
        if r["lock_hash"]:
            x["locked"] = True
            x["open"] = b is None
        if b == r["id"]:
            x["body"] = ""
        out.append(x)
    for x in out:
        if x.get("locked") and not x["open"]:
            x["hidden"] = hidden.get(x["id"], [])
    return out


def wiki_lock(d, keys=()):
    """주제를 잠근다 (그 아래 문서도 같이). 이미 잠긴 주제 안이면 먼저 열어야 한다."""
    wid, pw = int(d.get("id") or 0), str(d.get("password") or "")
    if len(pw) < 4:
        raise ValueError("암호는 4글자 이상으로 정해 주세요")
    salt = secrets.token_hex(16)
    with db() as c:
        r = c.execute("SELECT lock_hash FROM wiki WHERE id=?", (wid,)).fetchone()
        if not r:
            raise ValueError("없는 문서예요")
        if r["lock_hash"]:
            raise ValueError("이미 잠긴 주제예요")
        _need_open(c, wid, keys)
        c.execute("UPDATE wiki SET lock_salt=?, lock_hash=? WHERE id=?", (salt, _hash_pw(pw, salt), wid))
    return {"ok": True}


_FAILS = {}


def _check_pw(c, wid, pw):
    r = c.execute("SELECT lock_salt, lock_hash FROM wiki WHERE id=?", (wid,)).fetchone()
    if not r or not r["lock_hash"]:
        raise ValueError("잠긴 주제가 아니에요")
    n = _FAILS.get(wid, 0)
    if n >= 5:
        time.sleep(min(5.0, 0.5 * (n - 4)))     # 여러 번 틀리면 조금씩 늦춘다
    if not hmac.compare_digest(_hash_pw(str(pw or ""), r["lock_salt"]), r["lock_hash"]):
        _FAILS[wid] = n + 1
        raise ValueError("암호가 맞지 않아요")
    _FAILS.pop(wid, None)


def wiki_unlock(d):
    """암호가 맞으면 이 주제를 여는 열쇠(토큰)를 준다. 화면 메모리에만 두므로 창을 닫으면 사라진다."""
    wid = int(d.get("id") or 0)
    with db() as c:
        _check_pw(c, wid, d.get("password"))
    t = secrets.token_urlsafe(24)
    with _KEYS_LOCK:
        _KEYS[t] = (wid, time.time() + KEY_TTL)
    return {"key": t, "id": wid}


def wiki_unlock_remove(d):
    """잠금을 아예 없앤다 (암호 확인)."""
    wid = int(d.get("id") or 0)
    with db() as c:
        _check_pw(c, wid, d.get("password"))
        c.execute("UPDATE wiki SET lock_salt='', lock_hash='' WHERE id=?", (wid,))
    with _KEYS_LOCK:
        for t in [t for t, (i, _) in _KEYS.items() if i == wid]:
            del _KEYS[t]
    return {"ok": True}


def _parent_ok(c, parent_id):
    if parent_id is None:
        return None
    pid = int(parent_id)
    if not c.execute("SELECT 1 FROM wiki WHERE id=?", (pid,)).fetchone():
        raise ValueError("위쪽 문서가 없어요 (지워졌을 수 있어요)")
    return pid


def _norm_parent(v):
    if v in (None, "", 0, "0"):
        return None
    return int(v)


def wiki_save(d, keys=()):
    """새 문서 만들기 (id 없음) / 제목 · 본문 고치기 (id 있음). 위치는 wiki_move 로만 바꾼다."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    title = _title(d.get("title"))
    body = clean_html(d.get("body"))
    with db() as c:
        wid = d.get("id")
        if wid:
            wid = int(wid)
            _need_open(c, wid, keys)
            cur = c.execute("UPDATE wiki SET title=?, body=?, updated_at=? WHERE id=?", (title, body, now, wid))
            if not cur.rowcount:
                raise ValueError("없는 문서예요 (지워졌을 수 있어요)")
        else:
            pid = _parent_ok(c, _norm_parent(d.get("parent_id")))
            _need_open(c, pid, keys)
            sibs = [r["id"] for r in c.execute("SELECT id FROM wiki WHERE parent_id IS ? ORDER BY pos, id", (pid,))]
            after = d.get("after_id")
            at = sibs.index(int(after)) + 1 if after and int(after) in sibs else len(sibs)
            cur = c.execute("INSERT INTO wiki (parent_id,pos,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                            (pid, at, title, body, now, now))
            wid = cur.lastrowid
            sibs.insert(at, wid)
            for i, s in enumerate(sibs):
                c.execute("UPDATE wiki SET pos=? WHERE id=?", (i, s))
        return _row(c.execute("SELECT * FROM wiki WHERE id=?", (wid,)).fetchone())


def wiki_move(d, keys=()):
    """문서를 다른 위쪽 문서 아래(또는 최상위)의 index 자리로 옮긴다. 자기 아래로는 옮길 수 없다."""
    wid = int(d.get("id") or 0)
    with db() as c:
        if not c.execute("SELECT 1 FROM wiki WHERE id=?", (wid,)).fetchone():
            raise ValueError("없는 문서예요")
        pid = _parent_ok(c, _norm_parent(d.get("parent_id")))
        _need_open(c, wid, keys)
        _need_open(c, pid, keys)
        p = pid
        while p is not None:          # 자기 자신 · 자기 하위 문서 아래로 옮기면 나무가 끊긴다
            if p == wid:
                raise ValueError("자기 자신이나 그 하위 문서 아래로는 옮길 수 없어요")
            r = c.execute("SELECT parent_id FROM wiki WHERE id=?", (p,)).fetchone()
            p = r["parent_id"] if r else None
        sibs = [r["id"] for r in c.execute("SELECT id FROM wiki WHERE parent_id IS ? AND id<>? ORDER BY pos, id", (pid, wid))]
        try:
            at = int(d.get("index"))
        except (TypeError, ValueError):
            at = len(sibs)
        at = max(0, min(len(sibs), at))
        sibs.insert(at, wid)
        c.execute("UPDATE wiki SET parent_id=? WHERE id=?", (pid, wid))
        for i, s in enumerate(sibs):
            c.execute("UPDATE wiki SET pos=? WHERE id=?", (i, s))
        return _row(c.execute("SELECT * FROM wiki WHERE id=?", (wid,)).fetchone())


def wiki_delete(wid, keys=()):
    """하위 문서가 있으면 지우지 않는다 (먼저 옮기거나 지운다)."""
    wid = int(wid)
    with db() as c:
        _need_open(c, wid, keys)
        if c.execute("SELECT 1 FROM wiki WHERE parent_id=? LIMIT 1", (wid,)).fetchone():
            raise ValueError("하위 문서가 있어서 지울 수 없어요. 하위 문서를 먼저 옮기거나 지워 주세요")
        c.execute("DELETE FROM wiki WHERE id=?", (wid,))


# ---------- 사진 (DB 에 저장 · 백업에 같이 들어간다) ----------
def img_save(raw, ctype):
    ext = IMG_TYPES.get((ctype or "").split(";")[0].strip().lower())
    if not ext:
        raise ValueError("사진(png · jpg · webp · gif)만 넣을 수 있어요")
    if not raw or len(raw) > MAX_IMG:
        raise ValueError("사진이 비어 있거나 너무 커요 (최대 15MB)")
    sig = {".png": raw[:8] == b"\x89PNG\r\n\x1a\n", ".jpg": raw[:3] == b"\xff\xd8\xff",
           ".gif": raw[:6] in (b"GIF87a", b"GIF89a"), ".webp": raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"}[ext]
    if not sig:
        raise ValueError("사진 파일이 아니에요 (형식과 내용이 맞지 않아요)")
    name = hashlib.sha1(raw).hexdigest() + ext
    with db() as c:
        c.execute("INSERT OR IGNORE INTO wiki_img (name, ctype, data, created_at) VALUES (?,?,?,?)",
                  (name, IMG_CTYPE[ext], raw, datetime.datetime.now().isoformat(timespec="seconds")))
    return name


def img_get(name):
    """(bytes, content-type) 또는 None."""
    if not IMG_NAME.fullmatch(name or ""):
        return None
    with db() as c:
        r = c.execute("SELECT ctype, data FROM wiki_img WHERE name=?", (name,)).fetchone()
    return (bytes(r["data"]), r["ctype"]) if r else None


def img_gc(keep_days=1):
    """어느 문서도 쓰지 않고 하루가 지난 사진을 지운다 (되돌리기 · 다시 붙이기를 위해 하루는 둔다). 지운 수."""
    cut = (datetime.datetime.now() - datetime.timedelta(days=keep_days)).isoformat(timespec="seconds")
    with db() as c:
        used = set()
        for r in c.execute("SELECT body FROM wiki WHERE body LIKE '%data-img=%'"):
            used.update(re.findall(r'data-img="([0-9a-f]{40}\.(?:png|jpg|webp|gif))"', r["body"] or ""))
        gone = [r["name"] for r in c.execute("SELECT name FROM wiki_img WHERE created_at < ?", (cut,)) if r["name"] not in used]
        c.executemany("DELETE FROM wiki_img WHERE name=?", [(n,) for n in gone])
    return len(gone)
