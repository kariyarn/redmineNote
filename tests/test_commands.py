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

print("OK", ok, "FAIL", fail)
