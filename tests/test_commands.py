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
t("list sorted by shortcut", [x["shortcut"] for x in listed] == ["배포요청", "장애"])

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

print("OK", ok, "FAIL", fail)
