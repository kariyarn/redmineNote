"""묶은 exe 점검: 임시 데이터 + 임시 포트로 띄워 화면 파일이 들어 있는지 확인하고, 스스로 종료시킨다.  실행: python tests/test_exe.py <exe 경로>"""
import json, os, subprocess, sys, tempfile, time, urllib.request

exe = sys.argv[1]
port = int(os.environ.get("RN_APP_PORT") or 18961)   # 다른 시험과 겹치면 환경변수로 바꾼다
home = tempfile.mkdtemp(prefix="rn2-exe-")
env = dict(os.environ, REDMINE_NOTES_HOME=home, REDMINE_NOTES_PORT=str(port), REDMINE_NOTES_IDLE_SEC="0", REDMINE_NOTES_NO_APPWIN="1")
p = subprocess.Popen([exe, "nobrowser"], env=env)
base = f"http://127.0.0.1:{port}"
def get(path):
    return urllib.request.urlopen(base + path, timeout=5)
ok = True
try:
    for _ in range(80):
        try:
            get("/api/config"); break
        except Exception:
            time.sleep(0.25)
    html = get("/").read().decode("utf-8")
    scripts = [l.split('src="')[1].split('"')[0] for l in html.split("\n") if '<script src="' in l]
    links = [l.split('href="')[1].split('"')[0] for l in html.split("\n") if 'rel="stylesheet"' in l]
    bad = [u for u in scripts + links if get(u).status != 200]
    cfg = json.loads(get("/api/config").read())
    print("scripts", len(scripts), "css", len(links), "bad", bad, "version", cfg.get("appVersion"))
    ok = not bad and len(scripts) > 20 and bool(cfg.get("appVersion"))
finally:
    try:
        urllib.request.urlopen(urllib.request.Request(base + "/api/quit", b"{}", {"Content-Type": "application/json", "Origin": base}, method="POST"), timeout=5)
    except Exception:
        pass
    time.sleep(1)
print("PASS" if ok else "FAIL")
