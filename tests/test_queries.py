"""쿼리 보관함 서버 로직 시험 (임시 DB).  실행: python tests/test_queries.py <프로젝트 폴더>"""
import os, sys, tempfile
os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
sys.path.insert(0, sys.argv[1])
from rnotes import storage, queries as Q
storage.init_db()
ok = fail = 0
def t(name, cond):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name)

a = Q.query_save({"title": "회원 조회", "purpose": "회원번호로 가입일 조회", "db_kind": "Oracle", "sql": "SELECT * FROM member WHERE no = :no", "tags": "회원, 조회, 회원"})
t("saved", a["id"] and a["tags"] == ["회원", "조회"] and a["db_kind"] == "Oracle" and a["use_count"] == 0 and a["pinned"] == 0)
try: Q.query_save({"title": "x", "sql": "  \n "}); t("empty sql", False)
except ValueError: t("empty sql", True)
b = Q.query_save({"sql": "-- 주문 합계\nSELECT SUM(amt) FROM orders"})
t("auto title from first comment", b["title"] == "주문 합계")
d = Q.query_save({"sql": "select  *  from MEMBER\nwhere no = :no"})
t("duplicate detected (공백·대소문자 무시)", d.get("dup", {}).get("id") == a["id"])
d2 = Q.query_save({"sql": "select * from member where no = :no", "force": True, "title": "같은 쿼리 또 저장"})
t("force saves duplicate", d2["id"] not in (a["id"], b["id"]))
u = Q.query_use(a["id"]); u = Q.query_use(a["id"])
t("use count", u["use_count"] == 2 and u["last_used_at"])
p = Q.query_pin(b["id"], True)
t("pin", p["pinned"] == 1)
lst = Q.query_list()
t("pinned first", lst[0]["id"] == b["id"])
e = Q.query_save({"id": a["id"], "title": "회원 조회 v2", "sql": "SELECT 1", "tags": ["a"]})
t("edit keeps counters", e["title"] == "회원 조회 v2" and e["use_count"] == 2 and e["tags"] == ["a"])
try: Q.query_use(99999); t("missing use", False)
except ValueError: t("missing use", True)
with storage.db() as c: c.execute("DELETE FROM queries WHERE id=?", (a["id"],))
t("delete", all(x["id"] != a["id"] for x in Q.query_list()))
r1 = Q.query_save({"title": "연관", "sql": "select 1 from dual", "rm_nos": "#93857, 93860, 93857, abc"})
t("rm_nos parsed", r1["rm_nos"] == [93857, 93860])
r1 = Q.query_save({"id": r1["id"], "title": "연관", "sql": "select 1 from dual", "rm_nos": [1, "#2"]})
t("rm_nos edit", r1["rm_nos"] == [1, 2])
r2 = Q.query_save({"title": "연관 없음", "sql": "select 2 from dual"})
t("rm_nos default empty", r2["rm_nos"] == [])

# 코드/쿼리 보관함 2.13: 언어 · 코드 위치 · 버전 메모 · 가져오기
c1 = Q.query_save({"title": "컨트롤러", "sql": "public class TravelGgController {}", "lang": "JAVA", "code_locs": "TravelGgController, com/x/TravelGgController.java\nTravelGgController"})
t("lang normalized (대소문자) / unknown dropped", c1["lang"] == "java" and Q.query_save({"title": "x", "sql": "abc xyz 1", "lang": "cobol"})["lang"] == "")
t("code_locs parsed & de-duplicated", c1["code_locs"] == ["TravelGgController", "com/x/TravelGgController.java"])
v0 = len(Q.query_versions(c1["id"]))
c2 = Q.query_save({"id": c1["id"], "title": "컨트롤러", "sql": "public class TravelGgController { int a; }", "lang": "java", "code_locs": ["TravelGgController"]})
vs = Q.query_versions(c1["id"])
t("edit keeps previous version", len(vs) == v0 + 1 and vs[0]["sql"] == "public class TravelGgController {}")
c2b = Q.query_save({"id": c1["id"], "title": "컨트롤러", "sql": c2["sql"], "lang": "java", "code_locs": ["다른 위치"]})
t("location-only edit makes no version", len(Q.query_versions(c1["id"])) == v0 + 1 and c2b["code_locs"] == ["다른 위치"])
for i in range(14):
    Q.query_save({"id": c1["id"], "title": "컨트롤러", "sql": "public class TravelGgController { int a%d; }" % i, "lang": "java"})
t("versions capped at 10", len(Q.query_versions(c1["id"])) == 10)
oldest = Q.query_versions(c1["id"])[-1]
cur_sql = Q.query_list()[0]["sql"] if False else None
r = Q.query_restore(c1["id"], Q.query_versions(c1["id"])[0]["id"])
t("restore returns old content & snapshots current", r["sql"].startswith("public class TravelGgController { int a") and len(Q.query_versions(c1["id"])) == 10)
try: Q.query_restore(c1["id"], 999999); t("restore missing version", False)
except ValueError: t("restore missing version", True)
imp = Q.query_import([{"title": "가져옴", "sql": "select 99 from dual", "lang": "sql", "code_locs": ["A.java"], "rm_nos": "#7"}, {"title": "중복", "sql": "SELECT   99 FROM DUAL"}, {"bad": 1}, "x"])
t("import added / skipped / bad", imp == {"added": 1, "skipped": 1, "bad": 2})
Q.query_delete(c1["id"])
t("delete removes versions", Q.query_versions(c1["id"]) == [])
print("OK", ok, "FAIL", fail)
