"""HTTP 시험 공통 격리: 임시 홈, 가짜 키, 127.0.0.1만 허용하는 Python 네트워크 가드."""
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import textwrap
import uuid


GUARD = textwrap.dedent('''\
import sys
def _local_only(event, args):
    if event == "socket.connect":
        address = args[1]
        if not isinstance(address, tuple) or address[0] != "127.0.0.1":
            raise RuntimeError("TEST BLOCKED: non-loopback connection")
    elif event == "socket.getaddrinfo" and args[0] not in ("127.0.0.1", b"127.0.0.1"):
        raise RuntimeError("TEST BLOCKED: non-loopback DNS")
sys.addaudithook(_local_only)
sys._rnotes_test_local_only = True
''')


def multipart_body(data, files):
    boundary = "test-" + uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n'.encode(), json.dumps(data).encode(), b"\r\n"]
    for name, binary in files:
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(), binary, b"\r\n"])
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), "multipart/form-data; boundary=" + boundary


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def isolated_env(prefix, allow=None):
    home = Path(tempfile.mkdtemp(prefix=prefix))
    fake_port, app_port = free_port(), free_port()
    while fake_port == app_port:
        app_port = free_port()
    # 회사/사용자 환경변수·프록시·키를 자식 프로세스에 상속하지 않는다.
    env = {k: os.environ[k] for k in ("SystemRoot", "WINDIR", "COMSPEC", "PATHEXT") if k in os.environ}
    for sub in ("tmp", "appdata", "local"):
        (home / sub).mkdir()
    env.update(REDMINE_NOTES_HOME=str(home), REDMINE_NOTES_PORT=str(app_port),
               REDMINE_NOTES_NO_APPWIN="1", REDMINE_NOTES_IDLE_SEC="0",
               REDMINE_NOTES_UPDATE_API=f"http://127.0.0.1:{fake_port}",
               REDMINE_NOTES_GITHUB_API=f"http://127.0.0.1:{fake_port}",
               REDMINE_NOTES_UPDATE_DRYRUN="1", PYTHONDONTWRITEBYTECODE="1",
               PYTHONIOENCODING="utf-8", PYTHONPATH=str(home), NO_PROXY="*",
               APPDATA=str(home / "appdata"), LOCALAPPDATA=str(home / "local"),
               USERPROFILE=str(home), HOME=str(home), TMP=str(home / "tmp"), TEMP=str(home / "tmp"),
               RN_TEST_ISOLATED="1")
    if allow is not None:
        env["REDMINE_NOTES_WRITE_ALLOW"] = allow
    config = {"url": f"http://127.0.0.1:{fake_port}", "api_key": "good-key", "dev_field_id": "18"}
    (home / "config.json").write_text(json.dumps(config), encoding="utf-8")
    (home / "sitecustomize.py").write_text(GUARD, encoding="utf-8")
    with sqlite3.connect(home / "notes.db") as c:
        c.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
        c.executemany("INSERT INTO settings VALUES (?,?)", [("update_auto", "0"), ("auto_check", "0"), ("auto_sync_min", "0")])
    # 모듈 import/서버 시작 전 격리 설정과 목적지를 확인한다.
    assert Path(env["REDMINE_NOTES_HOME"]).resolve() == home.resolve()
    assert json.loads((home / "config.json").read_text())["url"] == f"http://127.0.0.1:{fake_port}"
    assert not any(k in env for k in ("OPENAI_API_KEY", "REDMINE_API_KEY", "REDMINE_NOTES_LEGACY_HOME", "HTTP_PROXY", "HTTPS_PROXY"))
    exec(compile(GUARD, "<test-network-guard>", "exec"), {})
    probe = subprocess.run([sys.executable, "-B", "-c", textwrap.dedent('''\
        import os, sys
        assert getattr(sys, "_rnotes_test_local_only", False)
        assert os.environ["REDMINE_NOTES_HOME"] == sys.argv[1]
        try:
            sys.audit("socket.connect", None, ("192.0.2.1", 443))
        except RuntimeError:
            pass
        else:
            raise SystemExit("Network isolation missing")
        ''') , str(home)], env=env, capture_output=True, timeout=10)
    if probe.returncode:
        raise RuntimeError("시험 네트워크/홈 격리를 확인하지 못했으므로 서버를 시작하지 않습니다")
    return str(home), env, fake_port, app_port
