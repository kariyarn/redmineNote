import re
"""가짜 레드마인 + 임시 홈으로 2.1 쓰기 API 시험. 결과는 stdout 으로 낸다."""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
import hashlib, sqlite3, uuid
from concurrent.futures import ThreadPoolExecutor
from isolated_env import isolated_env, multipart_body

SP = os.path.dirname(os.path.abspath(__file__))
SRV = sys.argv[1]
home, env, FP, AP = isolated_env("rn2-wtest-", allow="93599")
fake = subprocess.Popen([sys.executable, os.path.join(SP, "fake_rm_write.py"), str(FP)], env=env)
app = subprocess.Popen([sys.executable, SRV], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = f"http://127.0.0.1:{AP}"
ok_all = True
checks = 0


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


def uploads():
    return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{FP}/__uploads").read())


def confirm_not_applied(result):
    status, body = call("POST", "/api/rm/write/recover", {"issue_id": 93599, "request_id": result["request_id"], "decision": "not_applied"})
    assert status == 200 and body.get("retry_allowed")


def attach(files, notes="", request_id=None, issue_id=93599, **fields):
    data = {"issue_id": issue_id, "notes": notes, "request_id": request_id or uuid.uuid4().hex, **fields}
    body, content_type = multipart_body(data, files)
    req = urllib.request.Request(BASE + "/api/rm/write", data=body, method="POST",
                                 headers={"Content-Type": content_type, "Origin": BASE})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(name, cond, info=""):
    global ok_all, checks
    checks += 1
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
    if cfg.get("url") != f"http://127.0.0.1:{FP}" or os.path.realpath(cfg.get("dataDir", "")) != os.path.realpath(home):
        raise SystemExit("ABORT 앱의 가짜 서버/임시 데이터 격리가 일치하지 않음")
    check("127.0.0.1 네트워크 가드 및 임시 홈 사전 검증", env["RN_TEST_ISOLATED"] == "1")
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
    confirm_not_applied(r)
    # 5xx 인데 안 올라감 / 올라감
    n_before = len(puts())
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "5XXNOTAPPLIED a"}); check("5xx 미반영 -> 실패 보고, 재시도 안 함", s == 502 and len(puts()) == n_before + 1, (s, r))
    confirm_not_applied(r)
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "5XXAPPLIED b"}); check("5xx 인데 반영됨 -> 확인 후 성공", s == 200 and r.get("verified"), r)
    # 기록
    s, lg = call("GET", "/api/write/log"); check("쓰기 기록", s == 200 and len(lg) >= 8 and any(not x["ok"] for x in lg) and any(x["ok"] for x in lg), lg[:3])
    # 설정 저장 키
    s, r = call("POST", "/api/settings", {"write_ack_first": "1", "st_done": "5"}); check("새 설정 키 저장", s == 200, r)
    # ---- 공식 uploads API + 기존 쓰기 경로 ----
    call("GET", "/api/rm/attachments?issue_id=93599")  # 이전 목록을 일부러 캐시한다.
    binary = b"ATTACHMENT-BINARY-MUST-NOT-BE-LOGGED\x00\xff\r\n" + bytes(range(256))
    s, r = attach([("파일 전용.bin", binary)])
    check("댓글 없이 파일만 등록", s == 200 and r.get("ok"))
    last = puts()[-1]["body"]["issue"]
    check("파일 전용 payload에는 notes 없이 uploads만", "notes" not in last and len(last["uploads"]) == 1)
    check("octet-stream 바이너리·UTF-8 파일명이 보존됨", uploads()[-1]["filename"] == "파일 전용.bin"
          and uploads()[-1]["sha256"] == hashlib.sha256(binary).hexdigest()
          and uploads()[-1]["content_type"] == "application/octet-stream")
    s, att = call("GET", "/api/rm/attachments?issue_id=93599")
    added = next((x for x in att if x["filename"] == "파일 전용.bin"), {})
    check("성공 직후 캐시 무효화 및 댓글 첨부 목록 갱신", bool(added) and added["source"] == "comment" and added["journal_id"] > 0)
    with urllib.request.urlopen(BASE + "/api/rm/attachment?id=" + str(added.get("id", 0)) + "&name=file.bin") as response:
        check("새 첨부파일 내려받기 바이너리 보존", response.read() == binary)
    s, r = attach([("comment.txt", b"comment-file")], "댓글과 파일")
    check("댓글과 파일 함께 등록", s == 200 and "댓글과 파일" in puts()[-1]["body"]["issue"]["notes"])
    s, r = attach([("one.txt", b"one"), ("two.txt", b"two")], "여러 파일")
    check("여러 파일을 하나의 PUT에 등록", s == 200 and len(puts()[-1]["body"]["issue"]["uploads"]) == 2)
    s, r = attach([("state.txt", b"state")], "상태와 파일", status_id=5, assigned_to_id=55, dev_id=7)
    p = puts()[-1]["body"]["issue"]
    check("상태·담당자·개발담당자 + 댓글 + 파일 함께 등록", s == 200 and p.get("status_id") == 5
          and p.get("assigned_to_id") == 55 and p.get("custom_fields") == [{"id": 18, "value": "7"}] and len(p["uploads"]) == 1)
    before_u, before_p = len(uploads()), len(puts())
    s, r = attach([("denied.txt", b"deny")], issue_id=200)
    check("허용되지 않은 일감은 업로드 전 403", s == 403 and len(uploads()) == before_u and len(puts()) == before_p)
    s, r = attach([("large.txt", b"x" * (20 * 1024 * 1024 + 1))])
    check("파일당 20MB 초과를 업로드 전 거절", s == 400 and r.get("code") == "bad_file" and len(uploads()) == before_u)
    chunk = b"x" * (17 * 1024 * 1024)
    s, r = attach([("total1.bin", chunk), ("total2.bin", chunk), ("total3.bin", chunk)])
    check("합계 50MB 초과를 업로드 전 거절", s == 400 and r.get("code") == "bad_file" and len(uploads()) == before_u)
    del chunk
    oversized = urllib.request.Request(BASE + "/api/rm/write", data=b"x", method="POST",
                                      headers={"Content-Length": str(80 * 1024 * 1024 + 1), "Origin": BASE})
    try:
        urllib.request.urlopen(oversized, timeout=5)
        check("요청 본문 80MB 초과 사전 거절", False)
    except urllib.error.HTTPError as error:
        check("요청 본문 80MB 초과 사전 거절", error.code == 413)
    s, r = attach([(f"file-{i}.txt", b"x") for i in range(11)])
    check("파일 개수 초과 거절", s == 400 and len(uploads()) == before_u)
    s, r = attach([("../path.txt", b"x")])
    check("파일명 경로 조작 거절", s == 400 and len(uploads()) == before_u)
    s, r = attach([("가" * 86 + ".txt", b"x")])
    check("UTF-8 파일명 255바이트 초과 거절", s == 400 and len(uploads()) == before_u)
    s, r = attach([("upload-fail.txt", b"x")], "업로드 오류")
    check("업로드 실패 시 일감 PUT 없음", s == 502 and r.get("code") == "upload_failed" and len(puts()) == before_p)
    rid = uuid.uuid4().hex
    pair = [("partial-first.txt", b"first"), ("upload-fail-once.txt", b"second")]
    before_u = len(uploads())
    s, r = attach(pair, "부분 업로드", rid)
    check("두 번째 파일 업로드 실패 시 PUT 없음", s == 502 and len(puts()) == before_p)
    s, r = attach(pair, "부분 업로드", rid)
    check("부분 실패 재시도는 첫 파일 토큰 재사용", s == 200 and len(uploads()) == before_u + 3)
    rid = uuid.uuid4().hex
    before_u, before_p = len(uploads()), len(puts())
    pair = [("retry-put.txt", b"retry")]
    s, r = attach(pair, "422ONCE 최종 수정 실패", rid)
    check("업로드 성공 후 최종 PUT 실패 보고", s == 422 and len(uploads()) == before_u + 1 and len(puts()) == before_p + 1)
    s2, r2 = attach(pair, "422ONCE 최종 수정 실패", rid)
    check("최종 수정 실패 후 확인 전에는 재전송 차단", s2 == 409 and r2.get("needs_review") and len(puts()) == before_p + 1)
    confirm_not_applied(r)
    rid = uuid.uuid4().hex
    s, r = attach(pair, "422ONCE 최종 수정 실패", rid)
    check("미등록 직접 확인 후 새 요청으로 명시적 재시도", s == 200 and len(uploads()) == before_u + 2 and len(puts()) == before_p + 2)
    before_u, before_p = len(uploads()), len(puts())
    s, r = attach(pair, "422ONCE 최종 수정 실패", rid, force=True)
    check("동일 요청 재전송은 force여도 성공 결과만 재사용", s == 200 and r.get("replayed") and len(uploads()) == before_u and len(puts()) == before_p)
    s, r = attach(pair, "다른 내용", rid)
    check("동일 요청 ID에 다른 내용 사용 거절", s == 409 and r.get("code") == "request_reused")
    s, r = attach(pair, "422ONCE 최종 수정 실패")
    check("새 ID의 동일 내용도 기존 409 duplicate 유지", s == 409 and r.get("code") == "duplicate" and len(uploads()) == before_u)
    rid = uuid.uuid4().hex
    s, r = attach([("conflict.txt", b"conflict")], "첨부 충돌", rid, loaded_updated_on="2000-01-01T00:00:00Z")
    check("첨부 409 충돌은 파일 업로드 전 검사", s == 409 and r.get("code") == "changed" and len(uploads()) == before_u)
    s, r = attach([("conflict.txt", b"conflict")], "첨부 충돌", rid, loaded_updated_on="2000-01-01T00:00:00Z", force=True)
    check("409 확인 후 같은 요청 ID로 강제 등록", s == 200)
    rid = uuid.uuid4().hex
    before_u, before_p = len(uploads()), len(puts())
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(attach, [("slow.txt", b"slow")], "동시 클릭", rid)
        for _ in range(100):
            if len(uploads()) > before_u:
                break
            time.sleep(0.01)
        second_s, second_r = attach([("slow.txt", b"slow")], "동시 클릭", rid)
        first_s, first_r = pending.result(timeout=30)
    check("동시 중복 클릭은 하나의 업로드·PUT만", first_s == 200 and second_s == 409 and second_r.get("code") == "busy"
          and len(uploads()) == before_u + 1 and len(puts()) == before_p + 1)
    s, r = attach([("applied-error.txt", b"applied")])
    check("파일만 등록 후 5xx 응답도 새 첨부를 확인해 성공 판정", s == 200 and r.get("verified"))
    unknown_id = uuid.uuid4().hex
    s, r = attach([("unknown.txt", b"unknown")], "5XXNOTAPPLIED 첨부", unknown_id)
    check("최종 5xx 미확정 결과 보고", s == 502 and r.get("needs_review"))
    before_u, before_p = len(uploads()), len(puts())
    s, r = attach([("unknown.txt", b"unknown")], "5XXNOTAPPLIED 첨부", unknown_id)
    check("미확정 요청은 재업로드·PUT 자동 재시도 금지", s == 409 and r.get("needs_review")
          and len(uploads()) == before_u and len(puts()) == before_p)
    confirm_not_applied(r)
    s, r = attach([("partial-not-applied.txt", b"partial")], "5XXPARTIAL 댓글만 반영")
    check("댓글만 반영되고 첨부가 빠진 5xx는 성공으로 오판하지 않음", s == 502 and r.get("needs_review"))
    urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{FP}/__clearnotes", data=b"", method="POST")).read()
    confirm_not_applied(r)
    replay_id = uuid.uuid4().hex
    s, r = attach([("restart.txt", b"restart")], "재시작 중복 방지", replay_id)
    check("재시작 전 요청 성공", s == 200)
    before_u, before_p = len(uploads()), len(puts())
    app.terminate(); app.wait(timeout=10)
    app = subprocess.Popen([sys.executable, SRV], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            call("GET", "/api/config"); break
        except Exception:
            time.sleep(0.1)
    s, r = attach([("restart.txt", b"restart")], "재시작 중복 방지", replay_id)
    check("서버 재시작 후에도 성공한 요청 ID 중복 방지", s == 200 and r.get("replayed") and len(uploads()) == before_u and len(puts()) == before_p)
    s, r = attach([("unknown.txt", b"unknown")], "5XXNOTAPPLIED 첨부", unknown_id)
    check("서버 재시작 후에도 확인을 마친 이전 ID 재사용 금지", s == 409 and r.get("code") == "request_closed" and len(puts()) == before_p)
    with sqlite3.connect(os.path.join(home, "notes.db")) as cx:
        logged = "\n".join(row[0] + row[1] for row in cx.execute("SELECT payload, result FROM write_log"))
        logged += "\n".join(row[0] for row in cx.execute("SELECT context FROM write_requests"))
    fake_tokens = [x["token"] for p in puts() for x in p["body"]["issue"].get("uploads", [])]
    check("DB 로그에는 업로드 토큰·바이너리 없음", all(token not in logged for token in fake_tokens)
          and "ATTACHMENT-BINARY-MUST-NOT-BE-LOGGED" not in logged and '"token"' not in logged)
finally:
    app.terminate(); fake.terminate()
    app.wait(timeout=10); fake.wait(timeout=10)
    print(("ALL PASS" if ok_all and sys.exc_info()[0] is None else "SOME FAILED") + f" ({checks} checks)")
sys.exit(0 if ok_all else 1)
