"""업무 위키: 주제를 나무처럼 엮는 자유 문서 (행 하나 = 문서 하나 = 분류 하나).
- 행 이름이 곧 문서 제목이다. 본문을 고쳐도 행 이름은 바뀌지 않는다.
- 본문은 HTML 로 저장한다. 저장할 때 서버에서 허용 목록(태그 · 속성 · 값)만 남기고 나머지는 버린다
  (화면 · 붙여넣기 · 깃허브 백업 복원 어느 길로 들어와도 스크립트가 남지 않게).
- 형광펜 · 글자색은 색 값이 아니라 이름(class)으로만 저장한다: 테마마다 화면에서 색을 정한다.
- 연결(쿼리 · 트러블슈팅 · 코드 · 일감 · 다른 위키 문서)은 <a class="lk" data-k=".." data-ref=".."> 로 id 만 저장한다.
  이름은 화면에서 그때그때 찾아 붙이므로 원래 항목의 이름을 바꿔도 링크가 깨지지 않는다.
"""
import datetime
import html
import re
from html.parser import HTMLParser

from .storage import db

MAX_BODY = 500_000
MAX_TITLE = 200

_BLOCK = {"p", "div", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre",
          "table", "thead", "tbody", "tr", "th", "td"}
_INLINE = {"b", "strong", "i", "em", "u", "s", "strike", "del", "code", "mark", "span", "a", "sup", "sub"}
_VOID = {"br", "hr"}
_ALLOWED = _BLOCK | _INLINE | _VOID
_DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "svg", "math", "template",
                      "noscript", "textarea", "select", "button", "form", "head", "title"}
_RENAME = {"h1": "h2", "h5": "h4", "h6": "h4"}      # 본문 제목은 3단계만 (문서 제목과 겹치지 않게)

HL = ("hl-y", "hl-g", "hl-p", "hl-b")
FC = ("fc-red", "fc-org", "fc-blue", "fc-gray")
LINK_KINDS = ("issue", "vault", "trouble", "code", "wiki")
_NUM_ID = re.compile(r"[1-9][0-9]{0,11}")
_CODE_ID = re.compile(r"[^\x00-\x1f\x7f<>\"'`&]{1,200}")


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
        elif tag == "span" and a.get("class") in FC:
            keep.append(("class", a["class"]))
        elif tag == "a":
            kind, lid = a.get("data-k", ""), a.get("data-ref", "")
            if a.get("class", "").split()[:1] != ["lk"] or kind not in LINK_KINDS or not _link_id_ok(kind, lid):
                return None                   # 연결이 아닌 링크(href 등)는 태그를 벗기고 글자만 남긴다
            keep += [("class", "lk"), ("data-k", kind), ("data-ref", lid)]
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
            if tag == "a":
                self.stack.append(None)       # 짝이 되는 </a> 를 버리기 위한 자리
            return
        at = "".join(f' {k}="{html.escape(v, quote=True)}"' for k, v in keep)
        if tag in _VOID:
            self.out.append(f"<{tag}>")
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


def wiki_list():
    with db() as c:
        return [_row(r) for r in c.execute("SELECT * FROM wiki ORDER BY parent_id IS NOT NULL, parent_id, pos, id")]


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


def wiki_save(d):
    """새 문서 만들기 (id 없음) / 제목 · 본문 고치기 (id 있음). 위치는 wiki_move 로만 바꾼다."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    title = _title(d.get("title"))
    body = clean_html(d.get("body"))
    with db() as c:
        wid = d.get("id")
        if wid:
            wid = int(wid)
            cur = c.execute("UPDATE wiki SET title=?, body=?, updated_at=? WHERE id=?", (title, body, now, wid))
            if not cur.rowcount:
                raise ValueError("없는 문서예요 (지워졌을 수 있어요)")
        else:
            pid = _parent_ok(c, _norm_parent(d.get("parent_id")))
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


def wiki_move(d):
    """문서를 다른 위쪽 문서 아래(또는 최상위)의 index 자리로 옮긴다. 자기 아래로는 옮길 수 없다."""
    wid = int(d.get("id") or 0)
    with db() as c:
        if not c.execute("SELECT 1 FROM wiki WHERE id=?", (wid,)).fetchone():
            raise ValueError("없는 문서예요")
        pid = _parent_ok(c, _norm_parent(d.get("parent_id")))
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


def wiki_delete(wid):
    """하위 문서가 있으면 지우지 않는다 (먼저 옮기거나 지운다)."""
    wid = int(wid)
    with db() as c:
        if c.execute("SELECT 1 FROM wiki WHERE parent_id=? LIMIT 1", (wid,)).fetchone():
            raise ValueError("하위 문서가 있어서 지울 수 없어요. 하위 문서를 먼저 옮기거나 지워 주세요")
        c.execute("DELETE FROM wiki WHERE id=?", (wid,))
