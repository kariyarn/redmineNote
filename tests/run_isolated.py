"""기존 로직 시험을 소스 사본·임시 데이터·루프백 전용 네트워크에서 실행한다."""
from pathlib import Path
import shutil
import subprocess
import sys

from isolated_env import isolated_env

ROOT = Path(__file__).resolve().parent.parent
TESTS = ("alarm", "autosync", "gitbackup", "update", "attention", "beta", "queries", "commands")


def main():
    names = sys.argv[1:] or TESTS
    if any(name not in TESTS for name in names):
        raise SystemExit("허용된 시험: " + ", ".join(TESTS))
    failed = False
    for name in names:
        print("RUN " + name, flush=True)
        home, env, _, _ = isolated_env("rn2-reg-")
        # 구형 시험은 HOME을 새로 만든다. bootstrap이 원래 프로젝트의 과거
        # notes.db/.env를 가져오지 못하도록 실행할 소스만 임시 경로에 복사한다.
        source = Path(home) / "source"
        (source / "rnotes").mkdir(parents=True)
        for src in (ROOT / "rnotes").glob("*.py"):
            shutil.copyfile(src, source / "rnotes" / src.name)
        shutil.copyfile(ROOT / "main.py", source / "main.py")
        child = '''
import runpy, sys, time, types
assert getattr(sys, "_rnotes_test_local_only", False)
sys.path.insert(0, sys.argv[2])
if sys.argv[3] == "autosync":
    # 창 감지/포커스는 모의 객체로 대체해 실제 사용자 창을 조회하지 않는다.
    sys.modules["rnotes.appwin"] = types.SimpleNamespace(allow_focus=lambda:None, focus=lambda:None)
    from rnotes import lifecycle as L
    L.app_window_open = lambda: time.time() - L.STATE["last_ping"] < L.ALIVE_SEC
    from rnotes.config import conn
    conn.url = conn.key = ""  # 이 시험은 연결 전 상태부터 검사한다.
path, root = sys.argv[1:3]
sys.argv = [path, root, "nobrowser"]  # 베타 채널 경고의 실제 Windows 대화상자도 열지 않는다.
ns = runpy.run_path(path, run_name="__main__")
raise SystemExit(1 if ns.get("fail", 0) else 0)
'''
        try:
            result = subprocess.run([sys.executable, "-B", "-c", child,
                                     str(ROOT / "tests" / ("test_" + name + ".py")), str(source), name],
                                    env=env, cwd=source, capture_output=True, text=True, encoding="utf-8", timeout=120)
        except subprocess.TimeoutExpired:
            print(name + ": TIMEOUT", flush=True)
            failed = True
            continue
        print(name + ": " + result.stdout.strip(), flush=True)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        failed |= result.returncode != 0
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
