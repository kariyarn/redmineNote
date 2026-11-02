"""앱 안 다운로드 시험 (임시 데이터 · 임시 다운로드 폴더, 파일을 실제로 열지 않음). 실행: python tests/test_downloads.py <프로젝트 폴더>"""
import os, sys, tempfile
from pathlib import Path

os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
DL = Path(tempfile.mkdtemp()) / "내 다운로드"
os.environ["REDMINE_NOTES_DOWNLOAD_DIR"] = str(DL)
os.environ["REDMINE_NOTES_DL_DRYRUN"] = "1"
sys.path.insert(0, sys.argv[1])
from rnotes import storage, downloads as D

storage.init_db()
ok = fail = 0


def t(name, cond, info=""):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name, info)


def err(fn, *a, **k):
    try: fn(*a, **k); return ""
    except D.DownloadError as e: return str(e)


t("download dir override", D.downloads_dir() == DL)
t("safe name", D.safe_name("../a/b:c?.txt") == "b_c_.txt" and D.safe_name("CON.txt") == "_CON.txt" and D.safe_name("") == "download")
a = D.save("보고서.txt", data="안녕".encode())
t("saved into folder (created)", Path(a["path"]).read_bytes() == "안녕".encode() and Path(a["path"]).parent == DL and a["exists"] and a["size"] == 6, a)
b = D.save("보고서.txt", data=b"2")
t("same name -> (1)", Path(b["path"]).name == "보고서 (1).txt", b)
t("no partial file left", not list(DL.glob("*.part")))
ls = D.listing()
t("listing newest first", [x["name"] for x in ls["items"]] == ["보고서 (1).txt", "보고서.txt"] and ls["folder"] == str(DL), ls)
t("open (dry run)", D.open_item(a["id"])["path"] == a["path"])
t("reveal selects file", D.reveal(a["id"])["select"] is True)
t("reveal folder", D.reveal()["path"] == str(DL))
Path(a["path"]).unlink()
t("missing file flagged", [x["exists"] for x in D.listing()["items"]] == [True, False])
t("open missing -> error", "파일이 없어요" in err(D.open_item, a["id"]))
t("unknown id -> error", "목록에 없는" in err(D.open_item, "nope"))
t("external url refused", "앱 안의 파일만" in err(D.save, "x", url="https://example.com/a") and "앱 안의 파일만" in err(D.save, "x", url="/static/x"))
t("forget one", [x["name"] for x in D.forget(a["id"])["items"]] == ["보고서 (1).txt"])
t("forget all keeps files", D.forget()["items"] == [] and Path(b["path"]).exists())
print("OK", ok, "FAIL", fail)
sys.exit(1 if fail else 0)
