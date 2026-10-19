"""베타 채널 시험 (임시 데이터 · 가짜 깃허브 Releases · 가짜 '다른 채널' 서버). 실행: python tests/test_beta.py <프로젝트 폴더>
정식과 다른 실행 환경(포트 · 제목 · 업데이트 확인 대상)을 쓰고, 노트 데이터 폴더는 같은지 · 다른 채널이 켜져 있으면 끝내는지 본다."""
import hashlib, json, os, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = sys.argv[1]
HOME = tempfile.mkdtemp()
os.environ["REDMINE_NOTES_HOME"] = HOME
os.environ["REDMINE_NOTES_NO_APPWIN"] = "1"
os.environ["REDMINE_NOTES_UPDATE_DRYRUN"] = "1"
os.environ["REDMINE_NOTES_CHANNEL"] = "beta"
os.environ["REDMINE_NOTES_BUILD"] = "b2b2b2b2b2b2b2b2"
os.environ.pop("REDMINE_NOTES_PORT", None)
GOOD = b"MZ" + b"\x90" * 200000
RELS = []
OTHER = {"body": b'{"appVersion":"2.19.2"}'}


def rel(tag, build, pre=True, draft=False, files=None):
    v = tag.lstrip("v")
    names = files if files is not None else [f"RedmineNotes2-Beta-Setup-{v}.exe", f"RedmineNotes2-Beta-{v}.exe"]
    return {"tag_name": tag, "prerelease": pre, "draft": draft, "html_url": f"https://example/{tag}", "published_at": "2026-10-18T01:00:00Z",
            "body": f"베타\n- 빌드: {build}\n", "assets": [{"name": n, "size": len(GOOD), "digest": "sha256:" + hashlib.sha256(GOOD).hexdigest()} for n in names]}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        if self.path.startswith("/repos/kariyarn/redmineNote/releases?"):
            base = f"http://127.0.0.1:{self.server.server_port}/dl/"
            out = [dict(r, assets=[dict(a, browser_download_url=base + a["name"]) for a in r["assets"]]) for r in RELS]
            body = json.dumps(out).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body); return
        if self.path.startswith("/dl/"):
            self.send_response(200); self.send_header("Content-Length", str(len(GOOD))); self.end_headers(); self.wfile.write(GOOD); return
        if self.path == "/api/config":   # '다른 채널' 앱 흉내
            self.send_response(200); self.end_headers(); self.wfile.write(OTHER["body"]); return
        self.send_response(404); self.end_headers()


srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["REDMINE_NOTES_UPDATE_API"] = f"http://127.0.0.1:{srv.server_port}"
sys.path.insert(0, ROOT)
from rnotes import config as C, storage, updater as U, main as M

ok = fail = 0


def t(name, cond, info=""):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name, info)


def err(fn, *a):
    try: fn(*a); return ""
    except U.UpdateError as e: return str(e)


# 1. 실행 환경: 베타는 포트 · 제목 · 버전 표시가 다르고, 데이터 폴더는 같다
t("beta channel", C.CHANNEL == "beta" and C.BETA and C.OTHER_CHANNEL == "stable")
t("beta port", C.PORT == 8792 and C.CHANNEL_PORTS == {"stable": 8791, "beta": 8792})
t("beta title", C.APP_TITLE == "레드마인 노트 2 (베타)")
t("beta version label", C.VERSION_LABEL == f"{C.APP_VERSION} 베타 (b2b2b2b)", C.VERSION_LABEL)
t("data dir shared (not per channel)", str(C.DATA_DIR).startswith(HOME) and "beta" not in str(C.DATA_DIR).lower(), C.DATA_DIR)
t("beta update cache/work dir separate", U.CACHE_KEY == "update_info_beta" and "Beta" in U.WORK_DIR.name)
probe = "import json,sys;sys.path.insert(0,sys.argv[1]);from rnotes import config as C;print(json.dumps([C.CHANNEL,C.PORT,C.APP_TITLE,C.VERSION_LABEL]))"
env = {k: v for k, v in os.environ.items() if not k.startswith("REDMINE_NOTES_")}
st_cfg = json.loads(subprocess.run([sys.executable, "-c", probe, ROOT], env=env, capture_output=True, text=True).stdout)
t("stable defaults", st_cfg == ["stable", 8791, "레드마인 노트 2", C.APP_VERSION], st_cfg)
odd = json.loads(subprocess.run([sys.executable, "-c", probe, ROOT], env=dict(env, REDMINE_NOTES_CHANNEL="nightly", REDMINE_NOTES_PORT="9999"), capture_output=True, text=True).stdout)
t("unknown channel -> stable, port override", odd[0] == "stable" and odd[1] == 9999, odd)

# 2. 업데이트 확인: 가장 새 베타(pre-release)만 본다
storage.init_db()
U.WORK_DIR = Path(tempfile.mkdtemp()) / "upd"
v = C.APP_VERSION
RELS[:] = []
t("no beta yet", "베타 릴리스가 없어요" in err(U.check))
RELS[:] = [rel("v99.0.0", "f" * 40, pre=False, files=["RedmineNotes2-Setup.exe"]),           # 정식(Latest) 은 보지 않는다
           rel(f"v{v}-beta.1", "a1a1a1a1a1"), rel(f"v{v}-beta.3", "c3c3c3c3c3"), rel(f"v{v}-beta.2", "b2b2b2b2b2"),
           rel(f"v{v}-beta.9", "d9d9d9d9d9", draft=True),                                     # 초안은 건너뛴다
           rel("v1.0.0-beta.50", "e5e5e5e5e5")]                                               # 낮은 버전은 번호가 커도 뒤
U.install_mode = lambda: "installer"
st = U.check()
t("picks newest beta", st["latest"] == f"{v} beta.3" and st["newer"] and st["can_apply"] and st["channel"] == "beta", st)
t("beta setup asset", U._cache()["asset"]["name"] == f"RedmineNotes2-Beta-Setup-{v}-beta.3.exe")
U.install_mode = lambda: "exe"
U.check()
t("beta exe asset", U._cache()["asset"]["name"] == f"RedmineNotes2-Beta-{v}-beta.3.exe")
U.start_download()
end = time.time() + 10
while time.time() < end and U._DL["state"] == "downloading": time.sleep(0.05)
d = U.status()["download"]
t("beta download keeps asset name", d["state"] == "ready" and Path(d["file"]).name == f"RedmineNotes2-Beta-{v}-beta.3.exe", d)
U.install_mode = lambda: "installer"

U.BUILD = "c3c3c3c3c3c3c3"   # 지금 켠 것이 beta.3 이면 → 새 버전 아님
t("same build -> not newer", not U.check()["newer"])
U.BUILD = "b2b2b2b2b2b2b2"
RELS[:] = [rel("v1.0.0-beta.7", "e7e7e7e7e7")]
t("lower version beta -> not newer", not U.check()["newer"])
U.BUILD = ""
RELS[:] = [rel("v99.0.0-beta.1", "abcabcabc")]
t("no build info -> version compare", U.check()["newer"])
RELS[:] = [rel(f"v{v}-beta.4", "abcabcabc", files=["RedmineNotes2-Setup.exe"])]   # 이 변경 전 베타: 정식 이름 파일뿐
st = U.check()
t("old-style beta assets -> cannot apply", not st["can_apply"], st)
with storage.db() as c:
    keys = {r[0] for r in c.execute("SELECT key FROM settings WHERE key LIKE 'update_info%'")}
t("stable cache untouched", keys == {"update_info_beta"}, keys)

# 3. 다른 채널(정식)이 켜져 있으면 알리고 끝낸다
M.CHANNEL_PORTS = {"stable": srv.server_port, "beta": 1}
t("other channel detected", M.other_channel_running())
OTHER["body"] = b"<html>other program</html>"
t("other program on port is ignored", not M.other_channel_running())
OTHER["body"] = b'{"appVersion":"2.19.2"}'
M.CHANNEL_PORTS = {"stable": 1, "beta": 1}
t("nothing on port", not M.other_channel_running())
os.environ["REDMINE_NOTES_PORT"] = "1"; M.CHANNEL_PORTS = {"stable": srv.server_port, "beta": 1}
t("explicit port skips check", not M.other_channel_running())
os.environ.pop("REDMINE_NOTES_PORT")
exited = []
M.os._exit = lambda code: exited.append(code)
M.refuse_other_channel()
t("refuse exits", exited == [0])

srv.shutdown()
print("OK", ok, "FAIL", fail)
sys.exit(1 if fail else 0)
