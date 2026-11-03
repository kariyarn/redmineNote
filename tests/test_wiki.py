"""업무 위키 서버 로직 시험 (임시 DB).  실행: python tests/test_wiki.py <프로젝트 폴더>"""
import os, sys, tempfile
os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
sys.path.insert(0, sys.argv[1])
from rnotes import storage, wiki as W
storage.init_db()
ok = fail = 0
def t(name, cond):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name)
def err(name, fn):
    try: fn(); t(name, False)
    except ValueError: t(name, True)

# ---- 본문 거르기: 허용한 것만 남는다 ----
C = W.clean_html
t("plain kept", C("<p>안녕 <b>굵게</b> <i>x</i> <u>u</u> <s>s</s></p>") == "<p>안녕 <b>굵게</b> <i>x</i> <u>u</u> <s>s</s></p>")
t("script dropped with content", C("<p>a<script>alert(1)</script>b</p>") == "<p>ab</p>")
t("style dropped", C("<style>p{}</style><p>x</p>") == "<p>x</p>")
t("event attr dropped", C('<p onclick="x()">a</p><img src=x onerror=alert(1)>') == "<p>a</p>")
t("svg dropped", C('<svg onload=alert(1)><circle/></svg>ok') == "ok")
t("iframe dropped", C('<iframe src="javascript:alert(1)"></iframe>ok') == "ok")
t("href link unwrapped", C('<a href="javascript:alert(1)">눌러</a>') == "눌러")
t("href link with lk class still unwrapped", C('<a class="lk" href="x" data-k="evil" data-ref="1">x</a>') == "x")
t("lk link kept", C('<a class="lk" data-k="vault" data-ref="12">추첨</a>') == '<a class="lk" data-k="vault" data-ref="12">추첨</a>')
t("lk extra attrs dropped", C('<a class="lk" data-k="issue" data-ref="306" href="http://x" onclick="y" title="t">#306</a>') == '<a class="lk" data-k="issue" data-ref="306">#306</a>')
t("lk bad id", C('<a class="lk" data-k="issue" data-ref="12x">x</a>') == "x")
t("code link id escaped", C('<a class="lk" data-k="code" data-ref="TB_CONDO_APPLY">t</a>') == '<a class="lk" data-k="code" data-ref="TB_CONDO_APPLY">t</a>')
t("code link quote rejected", C('<a class="lk" data-k="code" data-ref=\'a"b\'>t</a>') == "t")
t("mark class allowlist", C('<mark class="hl-y">a</mark><mark class="evil">b</mark><mark>c</mark>') == '<mark class="hl-y">a</mark><mark>b</mark><mark>c</mark>')
t("span color class only", C('<span class="fc-red" style="color:red">a</span><span style="background:url(x)">b</span>') == '<span class="fc-red">a</span><span>b</span>')
t("span size class", C('<span class="fs-l">a</span><span class="fs-xl">b</span><span class="fs-s">c</span>') == '<span class="fs-l">a</span><span class="fs-xl">b</span><span class="fs-s">c</span>')
t("span size bad class/style dropped", C('<span class="fs-huge" style="font-size:90px">a</span><span class="fs-l fc-red">b</span>') == '<span>a</span><span>b</span>')
t("size + color nested", C('<span class="fc-red"><span class="fs-l">a</span></span>') == '<span class="fc-red"><span class="fs-l">a</span></span>')
t("mark size class rejected", C('<mark class="fs-l">a</mark>') == '<mark>a</mark>')
t("nested list kept", C('<ul><li>a<ul><li>b<ol><li>c</li></ol></li></ul></li><li>d</li></ul>') == '<ul><li>a<ul><li>b<ol><li>c</li></ol></li></ul></li><li>d</li></ul>')
t("table width class", C('<table class="tw-full"><tr><td>x</td></tr></table>') == '<table class="tw-full"><tr><td>x</td></tr></table>')
t("table other class dropped", C('<table class="evil" style="width:9999px"><tr><td>x</td></tr></table>') == '<table><tr><td>x</td></tr></table>')
t("hr and blockquote kept", C('<hr><blockquote><p>q</p></blockquote>') == '<hr><blockquote><p>q</p></blockquote>')
t("table kept", C('<table><tr><th colspan="2">h</th></tr><tr><td rowspan="999">x</td><td>y</td></tr></table>') == '<table><tr><th colspan="2">h</th></tr><tr><td>x</td><td>y</td></tr></table>')
t("h1 -> h2, h6 -> h4", C("<h1>a</h1><h6>b</h6>") == "<h2>a</h2><h4>b</h4>")
t("text escaped", C("<p>&lt;script&gt;x</p>") == "<p>&lt;script&gt;x</p>")
t("unknown tag unwrapped", C("<font color=red>빨강</font><blink>b</blink>") == "빨강b")
t("unclosed closed", C("<ul><li>a<li>b") == "<ul><li>a<li>b</li></li></ul>")
t("stray end tags ignored", C("</b>a</p>") == "a")
t("br/hr void", C("a<br>b<br/>c<hr>") == "a<br>b<br>c<hr>")
t("pre code", C("<pre><code>SELECT 1 &lt; 2</code></pre>") == "<pre><code>SELECT 1 &lt; 2</code></pre>")
t("noscript content dropped", C("<noscript><p>x</p></noscript>y") == "y")
t("nested script: no tag survives", C("<script><script>x</script>y</script>z") == "yz")
t("textarea content dropped", C("<p><textarea><img src=x onerror=1></textarea>ok</p>") == "<p>ok</p>")
t("uppercase tag", C("<B>x</B><SCRIPT>1</SCRIPT>") == "<b>x</b>")
t("comment dropped", C("a<!-- <script>1</script> -->b") == "ab")
t("long body capped", len(C("a" * (W.MAX_BODY + 10))) == W.MAX_BODY)

# ---- 나무 ----
a = W.wiki_save({"title": "  법인콘도  ", "body": "<p>공통</p>"})
t("create root", a["title"] == "법인콘도" and a["parent_id"] is None and a["pos"] == 0)
b = W.wiki_save({"title": "경기도청", "parent_id": a["id"], "body": "<script>x</script><p>ok</p>"})
t("create child sanitized", b["parent_id"] == a["id"] and b["body"] == "<p>ok</p>")
c = W.wiki_save({"title": "서울시청", "parent_id": a["id"]})
d = W.wiki_save({"title": "부산시청", "parent_id": a["id"], "after_id": b["id"]})
kids = [x["title"] for x in W.wiki_list() if x["parent_id"] == a["id"]]
t("insert after", kids == ["경기도청", "부산시청", "서울시청"])
err("empty title", lambda: W.wiki_save({"title": "  "}))
err("missing parent", lambda: W.wiki_save({"title": "x", "parent_id": 9999}))
err("update missing", lambda: W.wiki_save({"id": 9999, "title": "x"}))
u = W.wiki_save({"id": b["id"], "title": "경기도청 (수정)", "body": "<p>새 본문</p>", "parent_id": 9999})
t("update keeps parent", u["title"] == "경기도청 (수정)" and u["parent_id"] == a["id"] and u["body"] == "<p>새 본문</p>")
g = W.wiki_save({"title": "성수기", "parent_id": b["id"]})
err("move under self", lambda: W.wiki_move({"id": b["id"], "parent_id": b["id"]}))
err("move under descendant", lambda: W.wiki_move({"id": a["id"], "parent_id": g["id"]}))
m = W.wiki_move({"id": c["id"], "parent_id": None, "index": 0})
roots = [x["title"] for x in W.wiki_list() if x["parent_id"] is None]
t("move to root first", m["parent_id"] is None and roots == ["서울시청", "법인콘도"])
m = W.wiki_move({"id": d["id"], "parent_id": a["id"], "index": 0})
kids = [x["title"] for x in W.wiki_list() if x["parent_id"] == a["id"]]
t("reorder", kids == ["부산시청", "경기도청 (수정)"])
W.wiki_move({"id": d["id"], "parent_id": a["id"], "index": 99})
kids = [x["title"] for x in W.wiki_list() if x["parent_id"] == a["id"]]
t("index clamped", kids == ["경기도청 (수정)", "부산시청"])
err("delete with children", lambda: W.wiki_delete(b["id"]))
W.wiki_delete(g["id"]); W.wiki_delete(b["id"])
t("delete leaf then parent", all(x["id"] not in (b["id"], g["id"]) for x in W.wiki_list()))

# ---- 사진 ----
N = "a" * 40 + ".webp"
t("img kept by name only", C(f'<img data-img="{N}" src="http://evil/x.png" onerror="x()" alt="a">') == f'<img data-img="{N}">')
t("img self-closing", C(f'<p><img data-img="{N}"/>x</p>') == f'<p><img data-img="{N}">x</p>')
t("img without our name dropped", C('<img src="https://example.com/a.png">ok') == "ok")
t("img bad name dropped", C('<img data-img="../../etc.png">ok') == "ok")
png = b"\x89PNG\r\n\x1a\n" + b"x" * 20
nm = W.img_save(png, "image/png")
t("img save", nm.endswith(".png") and W.img_get(nm) == (png, "image/png"))
t("img save idempotent", W.img_save(png, "image/png") == nm)
err("img wrong type", lambda: W.img_save(b"<svg/>", "image/svg+xml"))
err("img signature mismatch", lambda: W.img_save(b"not a png at all", "image/png"))
t("img get bad name", W.img_get("../x.png") is None and W.img_get("b" * 40 + ".png") is None)
with storage.db() as c: c.execute("UPDATE wiki_img SET created_at='2000-01-01T00:00:00'")
keep = W.wiki_save({"title": "사진 문서", "body": f'<p><img data-img="{nm}"></p>'})
nm2 = W.img_save(b"\xff\xd8\xff" + b"y" * 20, "image/jpeg")
with storage.db() as c: c.execute("UPDATE wiki_img SET created_at='2000-01-01T00:00:00' WHERE name=?", (nm2,))
nm3 = W.img_save(b"GIF89a" + b"z" * 20, "image/gif")
t("img gc removes only old unused", W.img_gc() == 1 and W.img_get(nm) and not W.img_get(nm2) and W.img_get(nm3))

# ---- 주제 잠금 ----
W._PBKDF2_N = 1000          # 시험만 빠르게
root = W.wiki_save({"title": "비밀 주제", "body": "<p>비밀 본문</p>"})
kid = W.wiki_save({"title": "비밀 하위", "parent_id": root["id"], "body": "<p>하위 본문</p>"})
gkid = W.wiki_save({"title": "더 깊은", "parent_id": kid["id"]})
err("short password", lambda: W.wiki_lock({"id": root["id"], "password": "12"}))
W.wiki_lock({"id": root["id"], "password": "abcd"})
err("lock twice", lambda: W.wiki_lock({"id": root["id"], "password": "abcd"}))
lst = {x["id"]: x for x in W.wiki_list()}
t("locked stub hides body", lst[root["id"]]["locked"] and not lst[root["id"]]["open"] and lst[root["id"]]["body"] == "")
t("descendants hidden", kid["id"] not in lst and gkid["id"] not in lst and sorted(lst[root["id"]]["hidden"]) == sorted([kid["id"], gkid["id"]]))
t("no hash leak", all("lock_hash" not in x and "lock_salt" not in x for x in lst.values()))
for name, fn in [("save locked", lambda: W.wiki_save({"id": root["id"], "title": "x", "body": ""})),
                 ("save child locked", lambda: W.wiki_save({"id": kid["id"], "title": "x"})),
                 ("create under locked", lambda: W.wiki_save({"title": "x", "parent_id": kid["id"]})),
                 ("move locked out", lambda: W.wiki_move({"id": kid["id"], "parent_id": None})),
                 ("move into locked", lambda: W.wiki_move({"id": a["id"], "parent_id": root["id"]})),
                 ("delete locked", lambda: W.wiki_delete(gkid["id"]))]:
    try: fn(); t(name, False)
    except W.Locked: t(name, True)
err("wrong password", lambda: W.wiki_unlock({"id": root["id"], "password": "nope"}))
k = W.wiki_unlock({"id": root["id"], "password": "abcd"})["key"]
lst = {x["id"]: x for x in W.wiki_list([k])}
t("unlocked shows all", lst[root["id"]]["open"] and lst[root["id"]]["body"] == "<p>비밀 본문</p>" and kid["id"] in lst and gkid["id"] in lst)
t("save with key", W.wiki_save({"id": kid["id"], "title": "비밀 하위 2", "body": "<p>x</p>"}, [k])["title"] == "비밀 하위 2")
t("other key useless", kid["id"] not in {x["id"] for x in W.wiki_list(["bogus-key-1234567890"])})
W.wiki_unlock_remove({"id": root["id"], "password": "abcd"})
t("lock removed", kid["id"] in {x["id"] for x in W.wiki_list()} and not any(x.get("locked") for x in W.wiki_list()))
t("old key dropped", not W._open_ids([k]))

print(f"wiki: {ok} ok, {fail} fail")
sys.exit(1 if fail else 0)
