"""화면 시험용: 가짜 레드마인 + 임시 홈으로 앱을 띄워 두고 기다린다. (실제 레드마인·실제 데이터 사용 안 함)"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from isolated_env import isolated_env

SP = os.path.dirname(os.path.abspath(__file__))
SRV = sys.argv[1]
TTL = int(os.environ.get("RN_TEST_TTL") or 0)      # 0 이 아니면 이 초가 지나면 스스로 끝낸다
home, env, FP, AP = isolated_env("rn2-uitest-")
fake = subprocess.Popen([sys.executable, os.path.join(SP, "fake_rm_write.py"), str(FP)], env=env)
app = subprocess.Popen([sys.executable, SRV], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = f"http://127.0.0.1:{AP}"
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/api/config", timeout=2); break
        except Exception:
            time.sleep(0.3)
    else:
        raise SystemExit("앱 서버가 뜨지 않음")
    cfg = json.loads(urllib.request.urlopen(BASE + "/api/config", timeout=5).read())
    if cfg.get("url") != f"http://127.0.0.1:{FP}" or os.path.realpath(cfg.get("dataDir", "")) != os.path.realpath(home):
        raise SystemExit("ABORT 가짜 서버/임시 홈 격리가 일치하지 않음")
    req = urllib.request.Request(BASE + "/api/fetch", data=json.dumps({"ids": [93599, 200, 306]}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Origin": BASE})
    urllib.request.urlopen(req, timeout=60).read()
    prefs = json.dumps({"drMode": "manual", "drManual": [], "incRef": True})
    req = urllib.request.Request(BASE + "/api/settings", data=json.dumps({"ui_prefs2": prefs}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Origin": BASE})
    urllib.request.urlopen(req, timeout=10).read()
    print("READY", BASE, home, flush=True)
    fake.wait(timeout=TTL or None)
except (subprocess.TimeoutExpired, KeyboardInterrupt):
    pass
finally:
    app.terminate()
    fake.terminate()
    app.wait(timeout=10); fake.wait(timeout=10)
