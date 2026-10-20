"""명령어 보관함 서버 로직 시험 (임시 DB). 실행: python tests/test_commands.py <프로젝트 폴더>"""
import os
import sys
import tempfile

os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
sys.path.insert(0, sys.argv[1])
from rnotes import commands as C, storage

storage.init_db()
ok = fail = 0


def t(name, cond):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
        print("FAIL", name)


initial = C.command_list()
t("new command list starts empty", initial == [])
a = C.command_save({"shortcut": "  배포요청  ", "description": "운영 서버 배포를 요청드립니다.\n확인 부탁드립니다."})
t("create trims shortcut and preserves multiline text",
  a["shortcut"] == "배포요청" and a["description"] == "운영 서버 배포를 요청드립니다.\n확인 부탁드립니다." and a["id"] > 0)
b = C.command_save({"shortcut": "장애", "description": "확인 중입니다."})
listed = C.command_list()
t("commands follow registration order", [x["shortcut"] for x in listed] == ["배포요청", "장애"])
t("positions are assigned in registration order", [x["position"] for x in listed] == [0, 1])
reordered = C.command_reorder([b["id"], a["id"]])
t("reorder persists requested order", [x["id"] for x in reordered] == [b["id"], a["id"]]
  and [x["shortcut"] for x in C.command_list()] == ["장애", "배포요청"])
tail = C.command_save({"shortcut": "새 명령어", "description": "마지막에 추가"})
t("new commands append after customized order", [x["id"] for x in C.command_list()] == [b["id"], a["id"], tail["id"]])
C.command_delete(tail["id"])
storage.init_db()
t("custom order survives database initialization", [x["id"] for x in C.command_list()] == [b["id"], a["id"]])
for invalid_order in ([a["id"]], [a["id"], a["id"]], [a["id"], 999999], [True, b["id"]]):
    try:
        C.command_reorder(invalid_order)
        t("invalid command order rejected", False)
    except ValueError:
        t("invalid command order rejected", True)
C.command_reorder([a["id"], b["id"]])
with storage.db() as c:
    c.execute("ALTER TABLE commands DROP COLUMN position")
storage.init_db()
t("legacy commands migrate to registration order",
  [x["id"] for x in C.command_list()] == [a["id"], b["id"]]
  and [x["position"] for x in C.command_list()] == [0, 1])

for duplicate in ("배포요청", " 배포요청 "):
    try:
        C.command_save({"shortcut": duplicate, "description": "중복"})
        t("duplicate shortcut rejected", False)
    except ValueError:
        t("duplicate shortcut rejected", True)
try:
    C.command_save({"shortcut": "빈 설명", "description": "  "})
    t("empty description rejected", False)
except ValueError:
    t("empty description rejected", True)
try:
    C.command_save({"shortcut": "배포요청"})
    t("empty shortcut rejected", False)
except ValueError:
    t("empty shortcut rejected", True)

edited = C.command_save({"id": a["id"], "shortcut": "배포", "description": "새 문구"})
t("edit changes shortcut and description", edited["shortcut"] == "배포" and edited["description"] == "새 문구")
try:
    C.command_save({"id": edited["id"], "shortcut": "장애", "description": "중복"})
    t("edit duplicate shortcut rejected", False)
except ValueError:
    t("edit duplicate shortcut rejected", True)

C.command_delete(b["id"])
t("delete removes item", all(x["id"] != b["id"] for x in C.command_list()))
try:
    C.command_delete(999999)
    t("missing delete rejected", False)
except ValueError:
    t("missing delete rejected", True)

# 버튼으로 꺼내 두기
p1 = C.command_save({"shortcut": "꺼냄", "description": "x", "pinned": True})
t("pinned saved", p1["pinned"] is True and C.command_save({"id": p1["id"], "shortcut": "꺼냄", "description": "x"})["pinned"] is False)
t("pinned default false", C.command_save({"shortcut": "기본", "description": "x"})["pinned"] is False)

# 명령어 변수: 기본값(예전 #{nextTue} · #{nextThu} 를 잇는다)은 처음 한 번만
names = {v["name"]: v for v in C.var_list()}
t("default vars seeded", {"today", "nextTue", "nextThu"} <= set(names) and names["nextTue"]["kind"] == "func")
C.var_delete(names["today"]["id"])
storage.init_db()
t("deleted default not re-seeded", "today" not in {v["name"] for v in C.var_list()})
v1 = C.var_save({"name": "team", "kind": "const", "value": "웹개발팀", "description": "  우리   팀 "})
t("const var saved", v1["name"] == "team" and v1["kind"] == "const" and v1["value"] == "웹개발팀" and v1["description"] == "우리 팀")
v2 = C.var_save({"name": "며칠뒤", "kind": "func", "value": "return ctx.fmt(ctx.addDays(Number(args[0]||1)));"})
t("func var with korean name", v2["kind"] == "func")
def bad(d):
    try:
        C.var_save(d); return False
    except ValueError:
        return True
t("duplicate var name rejected (case-insensitive)", bad({"name": "TEAM", "kind": "const", "value": "x"}))
t("invalid var name rejected", all(bad({"name": n, "kind": "const", "value": "x"}) for n in ("1a", "a-b", "a b", "", "a" * 41)))
t("bad kind rejected", bad({"name": "k", "kind": "sql", "value": "x"}))
t("empty func rejected", bad({"name": "f", "kind": "func", "value": "  "}))
t("empty const allowed", C.var_save({"name": "blank", "kind": "const", "value": ""})["value"] == "")
e = C.var_save({"id": v1["id"], "name": "team", "kind": "func", "value": "return 1"})
t("var edit (kind change)", e["kind"] == "func" and e["value"] == "return 1")
C.var_delete(v1["id"])
t("var delete", all(v["id"] != v1["id"] for v in C.var_list()))
try:
    C.var_delete(999999); t("missing var delete rejected", False)
except ValueError:
    t("missing var delete rejected", True)

# 함수 인자 (2.18.0): 이름 · 타입 · 기본값, 최대 10개
pf = C.var_save({"name": "plus", "kind": "func", "value": "return a + b;",
                 "params": [{"name": "a", "type": "number", "default": "1"}, {"name": " b ", "type": "number"}]})
t("func params saved (trimmed)", pf["params"] == [{"name": "a", "type": "number", "default": "1"}, {"name": "b", "type": "number", "default": ""}])
t("const ignores params", C.var_save({"name": "cst", "kind": "const", "value": "x", "params": [{"name": "a"}]})["params"] == [])
t("params max 10", bad({"name": "p11", "kind": "func", "value": "x", "params": [{"name": f"a{i}"} for i in range(11)]}))
t("10 params ok", len(C.var_save({"name": "p10", "kind": "func", "value": "x", "params": [{"name": f"a{i}"} for i in range(10)]})["params"]) == 10)
t("param name rules", all(bad({"name": "pn", "kind": "func", "value": "x", "params": [{"name": n}]}) for n in ("1a", "a-b", "", "ctx", "args", "return", "class")))
t("korean param name ok", C.var_save({"name": "pk", "kind": "func", "value": "x", "params": [{"name": "날짜"}]})["params"][0]["name"] == "날짜")
t("duplicate param rejected", bad({"name": "pd", "kind": "func", "value": "x", "params": [{"name": "a"}, {"name": "a"}]}))
t("bad type rejected", bad({"name": "pt", "kind": "func", "value": "x", "params": [{"name": "a", "type": "list"}]}))
t("typed default checked", bad({"name": "pq", "kind": "func", "value": "x", "params": [{"name": "a", "type": "number", "default": "abc"}]})
  and bad({"name": "pq", "kind": "func", "value": "x", "params": [{"name": "a", "type": "boolean", "default": "maybe"}]})
  and bad({"name": "pq", "kind": "func", "value": "x", "params": [{"name": "a", "type": "date", "default": "내일"}]}))
t("valid typed defaults", C.var_save({"name": "pv", "kind": "func", "value": "x", "params": [
  {"name": "n", "type": "number", "default": "-2.5"}, {"name": "f", "type": "boolean", "default": "예"},
  {"name": "d1", "type": "date", "default": "2026-12-31"}, {"name": "d2", "type": "date", "default": "+3"}, {"name": "d3", "type": "date", "default": "오늘"}]})["id"] > 0)

# 기본 변수 2판 (함수 예제): 새로 받으면 9개, 예전(1판까지 넣은) DB 에는 2판만 한 번 더
os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
import importlib
from rnotes import config
importlib.reload(config); importlib.reload(storage); importlib.reload(C)
storage.init_db()
got = {v["name"]: v for v in C.var_list()}
t("all defaults seeded", set(got) == {"today", "nextTue", "nextThu", "after", "now", "next", "dday", "issueTitle", "sign"})
t("default with params", got["after"]["params"] == [{"name": "days", "type": "number", "default": "1"}] and got["dday"]["params"][0]["type"] == "date")
with storage.db() as c:
    c.execute("DELETE FROM cmd_vars WHERE name IN ('after','now','next','dday','issueTitle','sign')")
    c.execute("UPDATE settings SET value='1' WHERE key='cmd_vars_seeded'")
    c.execute("UPDATE cmd_vars SET value='return 1;' WHERE name='today'")
storage.init_db()
got = {v["name"]: v for v in C.var_list()}
t("old DB gets v2 defaults once, v1 untouched", "after" in got and "sign" in got and got["today"]["value"] == "return 1;")
C.var_delete(got["after"]["id"]); storage.init_db()
t("deleted v2 default not re-seeded", "after" not in {v["name"] for v in C.var_list()})

print("OK", ok, "FAIL", fail)
