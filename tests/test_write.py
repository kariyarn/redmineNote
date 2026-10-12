import re
"""가짜 레드마인 + 임시 홈으로 2.1 쓰기 API 시험. 결과는 stdout 으로 낸다."""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error

SP = os.path.dirname(os.path.abspath(__file__))
SRV = sys.argv[1]
FP, AP = 18931, 18932
home = tempfile.mkdtemp(prefix="rn2-wtest-")
env = dict(os.environ, REDMINE_NOTES_HOME=home, REDMINE_NOTES_PORT=str(AP), REDMINE_NOTES_IDLE_SEC="0",
           REDMINE_NOTES_NO_APPWIN="1", REDMINE_URL=f"http://127.0.0.1:{FP}", REDMINE_API_KEY="good-key",
           REDMINE_NOTES_WRITE_ALLOW="93599", PYTHONIOENCODING="utf-8")
with open(os.path.join(home, "config.json"), "w", encoding="utf-8") as f:   # 앱은 환경변수가 아니라 이 파일에서 주소·키를 읽는다
    json.dump({"url": f"http://127.0.0.1:{FP}", "api_key": "good-key", "dev_field_id": "18"}, f)
fake = subprocess.Popen([sys.executable, os.path.join(SP, "fake_rm_write.py"), str(FP)])
app = subprocess.Popen([sys.executable, SRV], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = f"http://127.0.0.1:{AP}"
ok_all = True


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", "Origin": BASE} if body is not None else {}
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def puts():
    return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{FP}/__puts").read())


def check(name, cond, info=""):
    global ok_all
    ok_all &= bool(cond)
    print(("PASS " if cond else "FAIL ") + name, info if not cond else "")


try:
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE + "/api/config", timeout=2)
            break
        except Exception:
            time.sleep(0.3)
    else:
        raise SystemExit("앱 서버가 뜨지 않음")
    s, cfg = call("GET", "/api/config")
    if "127.0.0.1" not in str(cfg.get("url")):   # 안전장치: 실제 레드마인을 보고 있으면 즉시 중단
        raise SystemExit("ABORT 앱이 가짜 서버를 보고 있지 않음: " + str({k: v for k, v in cfg.items() if "rl" in k}))
    check("config.write 시험 모드", cfg.get("write", {}).get("allow") == [93599], cfg.get("write"))
    check("버전 표시(x.y.z)", bool(re.fullmatch(r"\d+\.\d+\.\d+", str(cfg.get("appVersion") or ""))), {k: v for k, v in cfg.items() if "ersion" in k})
    check("상태 번호 기본값", cfg["write"]["statuses"] == {"dev": 11, "confirm": 15, "done": 5}, cfg["write"])
    # 처음에 일감을 한 번 저장해 둔다
    call("POST", "/api/fetch", {"ids": [93599]})
    s, st = call("GET", "/api/rm/statuses"); check("상태 목록", s == 200 and len(st) == 4, st)
    s, mem = call("GET", "/api/rm/members?issue_id=93599"); check("구성원 목록", s == 200 and [m["name"] for m in mem] == sorted(m["name"] for m in mem) and len(mem) == 3, mem)
    s, pv = call("GET", "/api/rm/preview?issue_id=93599&preset=confirm")
    ch = {c["field"]: c for c in pv.get("changes", [])}
    check("미리보기 최종확인요청: 담당자=작성자(요청자)", s == 200 and ch["담당자"]["after"] == "요청자" and ch["상태"]["after"] == "최종확인요청" and ch["개발담당자"]["changed"] is False, pv)
    check("미리보기는 쓰지 않음", puts() == [])
    # 허용 목록
    s, r = call("POST", "/api/rm/write", {"issue_id": 200, "notes": "x"}); check("허용 안 된 일감 403", s == 403 and r.get("code") == "test_mode", r)
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "x", "title": "해킹"}); check("허용 안 된 항목 400", s == 400 and r.get("code") == "bad_field", r)
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599}); check("빈 요청 400", s == 400, r)
    check("거절된 것은 안 올라감", puts() == [])
    # 댓글 + Textile
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "본문 `x` 입니다\n```java\nint a=1;\n```\n끝"})
    check("댓글 올림", s == 200 and r.get("ok"), r)
    p = puts()[-1]["body"]["issue"]
    check("Textile 변환", "@x@" in p["notes"] and '<pre><code class="java">\nint a=1;\n</code></pre>' in p["notes"] and "status_id" not in p, p)
    check("화면용 노트 행 반환(댓글 1개)", r["note"] and len(r["note"]["journals"]) == 1, r.get("note"))
    # 중복
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "본문 `x` 입니다\n```java\nint a=1;\n```\n끝"})
    check("같은 내용 1분 안 재전송 409 duplicate", s == 409 and r.get("code") == "duplicate", r)
    # 프리셋 최종확인요청
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "preset": "confirm", "notes": "확인 부탁"})
    p = puts()[-1]["body"]["issue"]
    check("최종확인요청 전송값", s == 200 and p["status_id"] == 15 and p["assigned_to_id"] == 55 and "custom_fields" not in p, p)
    check("로컬 반영 상태", r["note"]["rm_status"] == "최종확인요청" and r["note"]["assignee"] == "요청자", r["note"] and (r["note"]["rm_status"], r["note"]["assignee"]))
    # 개발중 프리셋: 담당자 나, 개발담당자 이미 나 -> 담당자/상태만
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "preset": "dev"})
    p = puts()[-1]["body"]["issue"]
    check("개발중: 상태 11 + 담당자 7, 개발담당자는 같아 생략", s == 200 and p["status_id"] == 11 and p["assigned_to_id"] == 7 and "custom_fields" not in p and "notes" not in p, p)
    # 개발담당자 변경
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "dev_id": 60})
    p = puts()[-1]["body"]["issue"]
    check("개발담당자 변경은 cf18 로", s == 200 and p["custom_fields"] == [{"id": 18, "value": "60"}], p)
    # 바뀐 것 없음
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "status_id": 11}); check("이미 같은 값이면 400 nochange", s == 400 and r.get("code") == "nochange", r)
    # 충돌
    urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{FP}/__touch", data=b"", method="POST"))
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "충돌 시험", "loaded_updated_on": "2026-10-06T01:00:00Z"})
    check("충돌 409 changed", s == 409 and r.get("code") == "changed", r)
    n_before = len(puts())
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "충돌 시험", "loaded_updated_on": "2026-10-06T01:00:00Z", "force": True})
    check("force 로 올림", s == 200 and len(puts()) == n_before + 1, r)
    # 422
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "422STATUS 시험"}); check("422 상태 사유", s == 422 and r.get("kind") == "status" and "Status" in r.get("detail", ""), r)
    # 5xx 인데 안 올라감 / 올라감
    n_before = len(puts())
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "5XXNOTAPPLIED a"}); check("5xx 미반영 -> 실패 보고, 재시도 안 함", s == 502 and len(puts()) == n_before + 1, (s, r))
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "5XXAPPLIED b"}); check("5xx 인데 반영됨 -> 확인 후 성공", s == 200 and r.get("verified"), r)
    # 기록
    s, lg = call("GET", "/api/write/log"); check("쓰기 기록", s == 200 and len(lg) >= 8 and any(not x["ok"] for x in lg) and any(x["ok"] for x in lg), lg[:3])
    # 설정 저장 키
    s, r = call("POST", "/api/settings", {"write_ack_first": "1", "st_done": "5"}); check("새 설정 키 저장", s == 200, r)
finally:
    app.terminate(); fake.terminate()
    print("ALL PASS" if ok_all and sys.exc_info()[0] is None else "SOME FAILED")
