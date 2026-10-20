"""앱 업데이트 시험 (임시 데이터 · 가짜 깃허브 Releases, 실제 깃허브에는 가지 않는다). 실행: python tests/test_update.py <프로젝트 폴더>
바꾸기는 DRY_RUN 으로 도우미를 띄우지 않고 앱도 끄지 않는다 (도우미 스크립트 · 넘길 값만 확인)."""
import hashlib, json, os, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
os.environ["REDMINE_NOTES_NO_APPWIN"] = "1"
os.environ["REDMINE_NOTES_UPDATE_DRYRUN"] = "1"
GOOD = b"MZ" + b"\x90" * 300000
FAKE = {"status": 200, "tag": "v99.1.0", "files": {"RedmineNotes2-Setup.exe": GOOD, "RedmineNotes2.exe": GOOD + b"x"}, "digest": True, "size_off": 0, "hits": 0}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        FAKE["hits"] += 1
        if self.path == "/repos/kariyarn/redmineNote/releases/latest":
            if FAKE["status"] != 200:
                self.send_response(FAKE["status"]); self.end_headers(); self.wfile.write(b"{}"); return
            base = f"http://127.0.0.1:{self.server.server_port}/dl/"
            body = json.dumps({"tag_name": FAKE["tag"], "html_url": "https://example/rel", "published_at": "2026-10-16T01:00:00Z", "body": "notes",
                               "assets": [{"name": n, "browser_download_url": base + n, "size": len(b) + FAKE["size_off"],
                                           "digest": ("sha256:" + hashlib.sha256(b).hexdigest()) if FAKE["digest"] is True else FAKE["digest"]}
                                          for n, b in FAKE["files"].items()]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body); return
        if self.path.startswith("/dl/"):
            b = FAKE["files"].get(self.path[4:])
            self.send_response(200 if b is not None else 404); self.send_header("Content-Length", str(len(b or b""))); self.end_headers(); self.wfile.write(b or b""); return
        self.send_response(404); self.end_headers()


srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["REDMINE_NOTES_UPDATE_API"] = f"http://127.0.0.1:{srv.server_port}"
sys.path.insert(0, sys.argv[1])
from rnotes import storage, updater as U
from rnotes.config import APP_VERSION

storage.init_db()
U.WORK_DIR = Path(tempfile.mkdtemp()) / "upd"
ok = fail = 0


def t(name, cond, info=""):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name, info)


def err(fn, *a):
    try: fn(*a); return ""
    except U.UpdateError as e: return str(e)


def wait_dl(sec=10):
    end = time.time() + sec
    while time.time() < end and U._DL["state"] == "downloading": time.sleep(0.05)
    return U.status()["download"]


# 1. 버전 비교
t("parse_ver", U.parse_ver("v2.18.0") == (2, 18, 0) and U.parse_ver("2.18") == (2, 18, 0) and U.parse_ver("") == (0, 0, 0))
t("is_newer", U.is_newer("2.18.1", "2.18.0") and U.is_newer("v2.20.0", "2.19.9") and not U.is_newer("2.18.0", "2.18.0") and not U.is_newer("2.9.9", "2.10.0"))

# 2. 소스 실행: 확인은 되지만 바꾸지는 않는다
st = U.check()
t("check finds newer", st["newer"] and st["latest"] == "99.1.0" and st["current"] == APP_VERSION and st["error"] == "" and st["checked_at"], st)
t("source mode: cannot apply", st["mode"] == "source" and not st["can_apply"])
t("source mode: download refused", "소스" in err(U.start_download))

# 3. 설치 파일 방식: 설치 파일을 고르고, 받고, 검증하고, 바꿀 준비
U.install_mode = lambda: "installer"
st = U.check()
t("installer picks setup asset", st["can_apply"] and st["asset_size"] == len(GOOD), st)
U.start_download(); d = wait_dl()
t("download ready + verified", d["state"] == "ready" and Path(d["file"]).read_bytes() == GOOD and d["done"] == len(GOOD), d)
t("download is idempotent when ready", U.start_download()["download"]["state"] == "ready")
fake_exe = Path(tempfile.mkdtemp()) / "RedmineNotes2.exe"; fake_exe.write_bytes(b"MZold")
U.sys.executable = str(fake_exe)
r = U.apply()
script = Path(r["script"])
t("apply (dry run): helper written as ascii CRLF", r["dry_run"] and script.exists() and b"\r\n" in script.read_bytes() and all(c < 128 for c in script.read_bytes()))
t("apply (dry run): env", r["env"]["RN_MODE"] == "installer" and r["env"]["RN_NEW"] == d["file"] and r["env"]["RN_TARGET"] == str(fake_exe)
  and str(os.getpid()) in r["env"]["RN_PIDS"].split() and r["env"]["RN_LOG"].endswith("update.log"), r["env"])
os.environ.update(_PYI_APPLICATION_HOME_DIR=r"C:\Temp\_MEI12345", _PYI_ARCHIVE_FILE=str(fake_exe), _PYI_PARENT_PROCESS_LEVEL="1", _MEIPASS2="x")
U._DL.update(state="ready"); r = U.apply()
t("apply: PyInstaller env not inherited (new exe must not load the old _MEI python dll)", r["inherit"] == ["PYINSTALLER_RESET_ENVIRONMENT"], r["inherit"])
for k in ("_PYI_APPLICATION_HOME_DIR", "_PYI_ARCHIVE_FILE", "_PYI_PARENT_PROCESS_LEVEL", "_MEIPASS2"): os.environ.pop(k)
t("helper relaunches installer silently", "/VERYSILENT" in U.HELPER and "/RELAUNCH=1" in U.HELPER and "%RN_" in U.HELPER)
# 3-2. 바꾸기가 '액세스가 거부되었습니다(WinError 5)' 로 막히지 않게: 도우미 파일은 매번 새 이름, cmd 를 못 띄우면 설치 파일을 바로 실행
s1 = U.write_helper(); time.sleep(1.1); s2 = U.write_helper()
t("helper file: new name each time, old one removed", s1 != s2 and s2.exists() and not s1.exists() and len(list(U.WORK_DIR.glob("apply-update*.cmd"))) == 1)
from rnotes import lifecycle as LC
launched, real_popen, real_shutdown = [], U.subprocess.Popen, LC.shutdown
def fake_popen(args, **kw):
    if str(args[0]).lower() == "cmd.exe":
        e = PermissionError(13, "액세스가 거부되었습니다"); e.winerror = 5; raise e
    launched.append(list(args))
U.subprocess.Popen, LC.shutdown, U.DRY_RUN = fake_popen, (lambda: launched.append("shutdown")), False
U._DL.update(state="ready"); r = U.apply(); time.sleep(1.3)
t("cmd blocked (WinError 5) -> run setup directly (it closes the app and relaunches)", r == {"ok": True} and launched[0] == [d["file"], *U.SETUP_ARGS] and launched[-1] == "shutdown", launched)
real_write, launched[:] = U.write_helper, []
def deny(): e = PermissionError(13, "액세스가 거부되었습니다"); e.winerror = 5; raise e
U.write_helper = deny
U._DL.update(state="ready"); r = U.apply(); time.sleep(1.3)
t("helper file write blocked -> run setup directly", launched and launched[0][0] == d["file"], launched)
def no_run(args, **kw):
    e = PermissionError(13, "액세스가 거부되었습니다"); e.winerror = 5; raise e
U.subprocess.Popen, launched[:] = no_run, []
U._DL.update(state="ready")
t("setup also blocked -> clear message naming the file, state back to ready", "WinError 5" in err(U.apply) and d["file"] in err(U.apply) and U._DL["state"] == "ready" and launched == [])
U.subprocess.Popen, LC.shutdown, U.DRY_RUN, U.write_helper = real_popen, real_shutdown, True, real_write

# 4. exe 방식: exe 를 고른다, 쓸 수 없는 폴더면 거절
U._DL.update(state="idle", file="")
U.install_mode = lambda: "exe"
st = U.check()
t("exe mode picks exe asset", st["asset_size"] == len(GOOD) + 1)
U.start_download(); d = wait_dl()
t("exe downloaded", d["state"] == "ready" and Path(d["file"]).name.startswith("RedmineNotes2-99.1.0"), d)
r = U.apply()
t("exe apply env", r["env"]["RN_MODE"] == "exe")
os.chmod(fake_exe.parent, 0o500)
if not os.access(fake_exe.parent, os.W_OK):
    U._DL["state"] = "ready"
    t("unwritable folder refused", "쓸 수 없어요" in err(U.apply))
os.chmod(fake_exe.parent, 0o700)

# 5. 검증 실패: SHA-256 · 크기 · 실행 파일 아님
U.install_mode = lambda: "installer"
FAKE["digest"] = "sha256:" + "0" * 64; U.check(); U._DL["state"] = "idle"; U.start_download(); d = wait_dl()
t("sha mismatch rejected", d["state"] == "error" and "SHA-256" in d["error"], d)
FAKE["digest"] = True; FAKE["size_off"] = 5; U.check(); U.start_download(); d = wait_dl()
t("size mismatch rejected", d["state"] == "error" and "크기" in d["error"], d)
FAKE["size_off"] = 0; FAKE["files"]["RedmineNotes2-Setup.exe"] = b"<html>not exe</html>"; U.check(); U.start_download(); d = wait_dl()
t("non-exe rejected", d["state"] == "error" and "실행 파일" in d["error"], d)
t("no partial files left", not list(U.WORK_DIR.glob("*.part")))
FAKE["files"]["RedmineNotes2-Setup.exe"] = GOOD; FAKE["digest"] = ""   # 깃허브가 digest 를 안 줄 때: 크기 · MZ 만
U.check(); U.start_download(); d = wait_dl()
t("no digest: size + MZ only", d["state"] == "ready", d)
t("apply refused without ready download", (U._DL.update(state="idle"), "먼저 받으세요" in err(U.apply))[1])

# 6. 최신이면 · 오류면
FAKE["tag"] = "v" + APP_VERSION; st = U.check()
t("same version -> not newer", not st["newer"] and "새 버전이 없어요" in err(U.start_download))
FAKE["status"] = 404
t("404 message", "릴리스가 없어요" in err(U.check) and "릴리스가 없어요" in U.status()["error"])
FAKE["status"] = 403
t("rate limit message", "제한" in err(U.check))
FAKE["status"] = 200; U.API = "http://127.0.0.1:1"
t("network error message", "연결할 수 없어요" in err(U.check))
U.API = os.environ["REDMINE_NOTES_UPDATE_API"]

# 7. 자동 확인: 하루에 한 번 · 끄면 안 함
FAKE["tag"] = "v99.2.0"
U.check(); h = FAKE["hits"]
t("auto: not again within a day", U.maybe_check() is None and FAKE["hits"] == h)
t("auto: again after a day", U.maybe_check(time.time() + U.CHECK_EVERY + 5) is not None and FAKE["hits"] == h + 1)
with storage.db() as c:
    c.execute("INSERT INTO settings (key,value) VALUES ('update_auto','0') ON CONFLICT(key) DO UPDATE SET value='0'")
h = FAKE["hits"]
t("auto off: no check", U.maybe_check(time.time() + 10 * U.CHECK_EVERY) is None and FAKE["hits"] == h and U.status()["auto"] is False)

# 8. 정리: 지금 버전 이하로 받은 파일은 지운다
U.FROZEN = True
(U.WORK_DIR / f"RedmineNotes2-Setup-{APP_VERSION}.exe").write_bytes(b"MZ")
(U.WORK_DIR / "RedmineNotes2-Setup-99.9.9.exe").write_bytes(b"MZ")
fake_exe.with_name(fake_exe.name + ".old").write_bytes(b"MZ")
U.cleanup_old()
t("cleanup", not (U.WORK_DIR / f"RedmineNotes2-Setup-{APP_VERSION}.exe").exists() and (U.WORK_DIR / "RedmineNotes2-Setup-99.9.9.exe").exists()
  and not fake_exe.with_name(fake_exe.name + ".old").exists())

srv.shutdown()
print("OK", ok, "FAIL", fail)
sys.exit(1 if fail else 0)
