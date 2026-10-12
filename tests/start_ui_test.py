"""화면 시험용: 가짜 레드마인 + 임시 홈으로 앱을 띄워 두고 기다린다. (실제 레드마인·실제 데이터 사용 안 함)"""
import json, os, subprocess, sys, tempfile, time, urllib.request

SP = os.path.dirname(os.path.abspath(__file__))
SRV = sys.argv[1]
FP, AP = int(os.environ.get("RN_FAKE_PORT") or 18941), int(os.environ.get("RN_APP_PORT") or 18942)   # 다른 시험과 겹치면 바꿔서 실행
TTL = int(os.environ.get("RN_TEST_TTL") or 0)      # 0 이 아니면 이 초가 지나면 스스로 끝낸다
home = tempfile.mkdtemp(prefix="rn2-uitest-")
env = dict(os.environ, REDMINE_NOTES_HOME=home, REDMINE_NOTES_PORT=str(AP), REDMINE_NOTES_IDLE_SEC="0",
           REDMINE_NOTES_NO_APPWIN="1", PYTHONIOENCODING="utf-8")
with open(os.path.join(home, "config.json"), "w", encoding="utf-8") as f:
    json.dump({"url": f"http://127.0.0.1:{FP}", "api_key": "good-key", "dev_field_id": "18"}, f)
fake = subprocess.Popen([sys.executable, os.path.join(SP, "fake_rm_write.py"), str(FP)])
app = subprocess.Popen([sys.executable, SRV], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = f"http://127.0.0.1:{AP}"
for _ in range(60):
    try:
        urllib.request.urlopen(BASE + "/api/config", timeout=2); break
    except Exception:
        time.sleep(0.3)
for ids in ([93599, 200],):
    req = urllib.request.Request(BASE + "/api/fetch", data=json.dumps({"ids": ids}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Origin": BASE})
    urllib.request.urlopen(req, timeout=60).read()
print("READY", BASE, home, flush=True)
try:
    fake.wait(timeout=TTL or None)
except subprocess.TimeoutExpired:
    pass
finally:
    app.terminate()
    fake.terminate()
