"""실제 Chromium 댓글 편집기 검사. 임시 프로필·루프백 차단 프록시·가짜 서버만 사용."""
import html
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

from isolated_env import isolated_env

ROOT = Path(__file__).resolve().parent.parent
home, env, FP, AP = isolated_env("rn2-browser-")
FAKE, BASE = f"http://127.0.0.1:{FP}", f"http://127.0.0.1:{AP}"
browser = next((p for p in (Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
                            Path("C:/Program Files/Google/Chrome/Application/chrome.exe")) if p.is_file()), None)
if browser is None and "--serve" not in sys.argv:
    raise SystemExit("SKIP: 사용할 수 있는 Chromium 실행 파일이 없음")


def get(path):
    with urllib.request.urlopen(path, timeout=5) as r:
        return r.read()


fake = subprocess.Popen([sys.executable, str(ROOT / "tests/fake_rm_write.py"), str(FP)], env=env)
# Serve a test-only augmented index in this temporary process; production routes/files stay unchanged.
app_code = r'''
import os, pathlib, runpy, sys, urllib.parse
assert getattr(sys, "_rnotes_test_local_only", False) and os.environ["RN_TEST_ISOLATED"] == "1"
root=pathlib.Path(sys.argv[1]);sys.path.insert(0,str(root))
from rnotes.http_handler import Handler
original=Handler.do_GET
def smoke_get(self):
    if urllib.parse.urlsplit(self.path).path!="/__test/app":return original(self)
    text=(root/"web/index.html").read_text(encoding="utf-8")
    probe="<script>window.__smokeErrors=[];window.addEventListener('error',e=>window.__smokeErrors.push(String(e.message)));</script><style>*,*::before,*::after{transition:none!important;animation:none!important}</style>"
    text=text.replace("</head>",probe+"</head>").replace("</body>","<script>"+(root/"tests/browser_app_smoke.js").read_text(encoding="utf-8")+"</script></body>")
    self.send_bytes(text.encode(),"text/html; charset=utf-8",200,{"Content-Security-Policy":"default-src 'self' blob: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; object-src 'none'"})
Handler.do_GET=smoke_get
sys.argv=[str(root/"main.py"),"nobrowser"];runpy.run_path(str(root/"main.py"),run_name="__main__")
'''
app = subprocess.Popen([sys.executable, "-B", "-c", app_code, str(ROOT)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(100):
        try:
            get(FAKE + "/__blocked"); config = json.loads(get(BASE + "/api/config")); break
        except OSError:
            time.sleep(.05)
    else:
        raise RuntimeError("가짜 서버/임시 앱을 시작하지 못함")
    assert config["url"] == FAKE and Path(config["dataDir"]).resolve() == Path(home).resolve()
    control = urllib.request.Request(FAKE + "/__test/control", json.dumps({"editor_app": BASE}).encode(), {"Content-Type": "application/json"})
    urllib.request.urlopen(control, timeout=5).close()
    seed = urllib.request.Request(BASE + "/api/fetch", json.dumps({"ids": [93599, 200]}).encode(), {"Content-Type": "application/json", "Origin": BASE})
    urllib.request.urlopen(seed, timeout=10).close()
    # 실행 전 차단 프록시가 외부 URL/CONNECT를 전달하지 않는지 직접 확인한다.
    import http.client
    conn = http.client.HTTPConnection("127.0.0.1", FP, timeout=5)
    conn.request("CONNECT", "preflight.invalid:443"); assert conn.getresponse().status == 403; conn.close()
    if "--serve" in sys.argv:
        print("READY " + FAKE + "/__test/editor?design=classic", flush=True)
        print("APP " + BASE, flush=True)
        try:
            while True: time.sleep(1)
        except KeyboardInterrupt:
            pass
        sys.exit(0)
    for kind, design in (("editor", "classic"), ("editor", "v2"), ("app", "classic"), ("app", "v2")):
        target = FAKE + "/__test/editor?design=" + design if kind == "editor" else BASE + "/__test/app?design=" + design
        args = [str(browser), "--headless=new", "--disable-gpu", "--disable-gpu-shader-disk-cache", "--no-first-run", "--no-default-browser-check",
                "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions",
                "--disable-default-apps", "--disable-quic", "--disable-crash-reporter", "--metrics-recording-only",
                "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
                "--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication,DnsOverHttps",
                "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
                f"--proxy-server={FAKE}", "--proxy-bypass-list=127.0.0.1",
                f"--user-data-dir={Path(home) / ('browser-' + kind + '-' + design)}",
                "--dump-dom", "--virtual-time-budget=15000", target]
        process = subprocess.Popen(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            stdout, stderr = process.communicate(timeout=25)
        except subprocess.TimeoutExpired:
            # 이 시험이 시작한 프로세스 트리만 종료한다. 기존 사용자 브라우저는 건드리지 않는다.
            subprocess.run([str(Path(env.get("SystemRoot", "C:/Windows")) / "System32/taskkill.exe"),
                            "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            process.kill(); stdout, stderr = process.communicate(timeout=5)
            raise RuntimeError("브라우저가 제한 시간 안에 종료되지 않아 시험 프로세스만 종료했습니다")
        result = subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
        dom = result.stdout.decode("utf-8", "replace")
        if not dom and b"GPU process isn't usable" in result.stderr:
            print("SKIP native browser: GPU/renderer process permission unavailable; sandbox remains enabled")
            break
        match = re.search(r'<pre id="result">(.*?)</pre>', dom, re.S)
        if not match:
            raise AssertionError("브라우저 결과를 읽지 못했어요: code=" + str(result.returncode) + " " + result.stderr.decode("utf-8", "replace")[-1200:] + dom[-500:])
        data = json.loads(html.unescape(match.group(1)))
        summary = {k: v for k, v in data.items() if k != "names"}
        print(kind + " " + design + ": " + json.dumps(summary, ensure_ascii=False))
        assert data["ok"], summary
        assert any("preflight.invalid" in u for u in json.loads(get(FAKE + "/__blocked"))), "차단 프록시 검증 실패"
    # 실제 EXE를 실행하지 않고 동일한 정적 리소스 경로와 빌드 포함 규칙을 검증한다.
    for path in ("/static/js/comment_editor.js", "/static/css/comment_editor.css"):
        assert get(BASE + path)
    build = (ROOT / "build.bat").read_text(encoding="utf-8-sig")
    assert '--add-data "web;web"' in build
    index = get(BASE + "/").decode("utf-8")
    assert index.index("js/editor.js") < index.index("js/comment_editor.js") < index.index("js/note.js")
    print("PASS Windows web 리소스 포함 규칙 / 실제 HTTP 리소스 / 기존 스크립트 순서")
finally:
    app.terminate(); fake.terminate()
    app.wait(timeout=10); fake.wait(timeout=10)
