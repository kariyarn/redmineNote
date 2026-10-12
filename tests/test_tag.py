"""작업 표시줄 표식 감시 시험: 임시 프로필의 크롬 창에 표식이 붙고, 누가 덮어써도 다시 붙는지. 사용자 창이 이미 있으면 중단."""
import http.server, os, subprocess, sys, tempfile, threading, time
sys.path.insert(0, sys.argv[1])
import appwin

if appwin.windows():
    sys.exit("ABORT: 이미 '레드마인 노트 2' 창이 열려 있음 (사용자 창을 건드리지 않기 위해 중단)")


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        b = f"<html><head><title>{appwin.TITLE}</title></head><body>tag test</body></html>".encode("utf-8")
        self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 18961), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
prof = tempfile.mkdtemp(prefix="rn2-tagprof-")
exe = r"C:\Windows\System32\notepad.exe"
ok = True


def chk(n, c, i=""):
    global ok; ok &= bool(c); print(("PASS " if c else "FAIL ") + n, "" if c else i, flush=True)


try:
    chk("앱 창 열림", appwin.launch("http://127.0.0.1:18961/", prof, exe))
    t0 = time.time(); w = []
    while time.time() - t0 < 20 and not w:
        time.sleep(0.5); w = appwin.windows()
    chk("창 발견", len(w) == 1, w)
    if w:
        h = w[0]; time.sleep(3)
        chk("표식 붙음", appwin.get_window_prop(h, appwin.PID_ID) == appwin.AUMID, appwin.get_window_prop(h, appwin.PID_ID))
        appwin.set_window_props(h, [(appwin.PID_ID, "Chrome.overwritten.by.chrome")])     # 크롬이 덮어쓴 상황을 흉내
        chk("덮어써짐", appwin.get_window_prop(h, appwin.PID_ID) == "Chrome.overwritten.by.chrome")
        time.sleep(3)
        chk("감시가 다시 붙임", appwin.get_window_prop(h, appwin.PID_ID) == appwin.AUMID, appwin.get_window_prop(h, appwin.PID_ID))
finally:
    subprocess.run(["powershell", "-NoProfile", "-Command",
                    f"Get-CimInstance Win32_Process -Filter \"Name like '%chrome%' or Name like '%msedge%'\" | Where-Object {{ $_.CommandLine -like '*{os.path.basename(prof)}*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"])
    print("ALL PASS" if ok else "SOME FAILED")
