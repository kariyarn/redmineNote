"""시험 모드 해제 후 + 줄바꿈 변환 + 첨부파일 (가짜 레드마인만 사용)"""
import json, os, urllib.parse, subprocess, sys, tempfile, time, urllib.request, urllib.error
SP = os.path.dirname(os.path.abspath(__file__)); SRV = sys.argv[1]
FP, AP = int(os.environ.get("RN_FAKE_PORT") or 18951), int(os.environ.get("RN_APP_PORT") or 18952)   # 다른 시험과 겹치면 환경변수로 바꾼다
home = tempfile.mkdtemp(prefix="rn2-rel-")
env = dict(os.environ, REDMINE_NOTES_HOME=home, REDMINE_NOTES_PORT=str(AP), REDMINE_NOTES_IDLE_SEC="0", REDMINE_NOTES_NO_APPWIN="1", PYTHONIOENCODING="utf-8")
env.pop("REDMINE_NOTES_WRITE_ALLOW", None)
json.dump({"url": f"http://127.0.0.1:{FP}", "api_key": "good-key", "dev_field_id": "18"}, open(os.path.join(home, "config.json"), "w", encoding="utf-8"))
fake = subprocess.Popen([sys.executable, os.path.join(SP, "fake_rm_write.py"), str(FP)])
app = subprocess.Popen([sys.executable, SRV], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = f"http://127.0.0.1:{AP}"; ok = True
NL = chr(10)


def call(m, p, b=None):
    req = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m,
                                 headers={"Content-Type": "application/json", "Origin": BASE} if b is not None else {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def chk(n, c, i=""):
    global ok; ok &= bool(c); print(("PASS " if c else "FAIL ") + n, "" if c else i)


try:
    for _ in range(50):
        try: urllib.request.urlopen(BASE + "/api/config", timeout=2); break
        except Exception: time.sleep(0.3)
    s, cfg = call("GET", "/api/config")
    if "127.0.0.1" not in str(cfg.get("url")): raise SystemExit("ABORT 가짜 서버가 아님")
    chk("시험 모드 꺼짐", cfg["write"]["test"] is False and cfg["write"]["allow"] == [], cfg["write"])
    call("POST", "/api/fetch", {"ids": [200]})
    s, r = call("POST", "/api/rm/write", {"issue_id": 200, "notes": "등록된 일감 댓글"}); chk("등록된 #200 에 댓글 가능", s == 200 and r.get("ok"), r)
    s, r = call("POST", "/api/rm/write", {"issue_id": 93599, "notes": "미등록"}); chk("등록 안 된 #93599 는 거절", s == 403 and r.get("code") == "not_registered", r)
    text = NL.join(["첫줄", "둘째줄", "* 항목1", "* 항목2", "`x` 와 ```sql", "SELECT 1", "```"])
    s, r = call("POST", "/api/rm/write", {"issue_id": 200, "notes": text})
    p = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{FP}/__puts").read())[-1]["body"]["issue"]["notes"]
    want = NL.join(["첫줄<br />", "둘째줄", "* 항목1", "* 항목2", "@x@ 와 <pre><code class=\"sql\">", "SELECT 1", "</code></pre>"])
    chk("줄바꿈 <br /> 변환(목록 제외)", p == want, repr(p))
    # 엔터를 여러 번 친 빈 줄이 레드마인(HTML)에서 사라지지 않는지: 친 횟수만큼 <br />
    text2 = NL.join(["안녕하세요.", "", "http://x/issues/1", "일전에", "확인", "", "", "감사합니다"])
    call("POST", "/api/rm/write", {"issue_id": 200, "notes": text2})
    p2 = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{FP}/__puts").read())[-1]["body"]["issue"]["notes"]
    want2 = NL.join(["안녕하세요.<br /><br />", "http://x/issues/1<br />", "일전에<br />", "확인<br /><br /><br />", "감사합니다"])
    chk("빈 줄(엔터 여러 번)도 줄바꿈 유지", p2 == want2, repr(p2))
    # 저장된 댓글에 원문(raw)이 같이 들어 있는지 (코드 상자 다시 그리기용)
    s, notes = call("GET", "/api/notes")
    n200 = [x for x in notes if x["issue_id"] == 200][0]
    chk("댓글 원문(raw) 보존", any("raw" in j and "<pre>" in j["raw"] for j in n200["journals"]), n200["journals"][-1:])
    s, a = call("GET", "/api/rm/attachments?issue_id=200")
    chk("첨부 목록(댓글 첨부 연결)", s == 200 and len(a) == 3 and a[0]["source"] == "comment" and a[0]["comment_by"] == "김철수" and a[0]["journal_id"] == 900, a)
    chk("첨부 사진의 댓글·본문 위치(journal_id)", {x["filename"]: x["journal_id"] for x in a} == {"테스트 문서.txt": 900, "화면캡처.png": 903, "본문첨부.png": 0}, a)
    d = urllib.request.urlopen(f"{BASE}/api/rm/attachment?id=77&name=" + urllib.parse.quote("테스트 문서.txt"))
    chk("첨부 내려받기", d.read() == b"hello-file!" + b"\n" and "attachment" in d.headers.get("Content-Disposition", ""), dict(d.headers))
    try:
        urllib.request.urlopen(f"{BASE}/api/rm/attachment?id=abc&name=x"); chk("잘못된 번호 거절", False)
    except urllib.error.HTTPError as e: chk("잘못된 번호 거절", e.code == 400)
    # ---- 포스트잇 메모 ----
    def dele(path):
        req = urllib.request.Request(BASE + path, method="DELETE", headers={"Origin": BASE})
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    s, a1 = call("POST", "/api/sticky", {"day": "2026-10-06", "text": "첫 메모 100%_테스트", "color": "pink", "x": 50, "y": 60, "w": 99999, "h": 5})
    chk("포스트잇 만들기 + 범위 자르기", s == 200 and a1["id"] and a1["w"] == 900 and a1["h"] == 100 and a1["color"] == "pink", a1)
    s, a2 = call("POST", "/api/sticky", {"day": "2026-10-06", "text": "둘째", "color": "없는색"})
    chk("없는 색은 노랑으로", a2["color"] == "yellow" and a2["z"] > a1["z"], a2)
    s, up = call("POST", "/api/sticky", {"id": a1["id"], "day": "2026-10-06", "text": "고친 메모 100%_테스트", "x": 300, "y": 20, "color": "blue"})
    chk("포스트잇 고치기", up["id"] == a1["id"] and up["x"] == 300 and up["text"].startswith("고친"), up)
    s, bad = call("POST", "/api/sticky", {"day": "어제", "text": "x"})
    chk("날짜 형식 오류 400", s == 400, bad)
    s, lst = call("GET", "/api/sticky?day=2026-10-06"); chk("하루치 목록", s == 200 and len(lst) == 2, lst)
    s, days = call("GET", "/api/sticky/days"); chk("메모가 있는 날", days[0] == {"day": "2026-10-06", "count": 2}, days)
    s, sr = call("GET", "/api/sticky/search?q=" + urllib.parse.quote("100%_")); chk("메모 검색(특수문자 안전)", len(sr) == 1 and sr[0]["id"] == a1["id"], sr)
    s, sr2 = call("GET", "/api/sticky/search?q=" + urllib.parse.quote("%")); chk("% 만 검색해도 전체가 걸리지 않음", len(sr2) == 1, sr2)
    # 전역 노트 검색·사전에 걸리지 않는지: 노트 목록에는 포스트잇 글이 없다
    s, notes = call("GET", "/api/notes"); chk("노트 목록과 완전 분리", "첫 메모" not in json.dumps(notes, ensure_ascii=False) and "고친 메모" not in json.dumps(notes, ensure_ascii=False))
    s, dd = dele("/api/sticky/%d" % a2["id"]); s, lst2 = call("GET", "/api/sticky?day=2026-10-06"); chk("포스트잇 삭제", len(lst2) == 1, lst2)
    s, neg = call("POST", "/api/sticky", {"day": "2026-10-07", "text": "음수 자리 + 핀", "x": -300, "y": -120, "pinned": 1})
    chk("음수 좌표·핀 저장", neg["x"] == -300 and neg["y"] == -120 and neg["pinned"] == 1, neg)
    s, far = call("POST", "/api/sticky", {"day": "2026-10-07", "text": "x", "x": -99999, "y": 99999})
    chk("좌표 범위 자르기", far["x"] == -4000 and far["y"] == 8000, far)
    s, rg = call("GET", "/api/sticky/range?from=2026-10-06&to=2026-10-07"); chk("날짜 범위 가져오기(내보내기용)", s == 200 and len(rg) == 3 and rg[0]["day"] <= rg[-1]["day"], [r["day"] for r in rg])
    s, rg2 = call("GET", "/api/sticky/range?from=2026-10-07&to=2026-10-07"); chk("핀이 날짜 안에서 먼저", rg2[0]["pinned"] == 1, rg2)
    # ---- 2.7.5: 배포요청 상태는 '댓글 흐름'으로 판단 (r=요청 c=절취선 x=잡담 d=상태 완료로 바꿈) ----
    ctl = lambda q: urllib.request.urlopen(f"http://127.0.0.1:{FP}/__test/deploy?{q}").read()
    for seq, want, pend in [("-", "idle", 0), ("c", "idle", 0), ("x", "idle", 0), ("d", "idle", 0),
                            ("r", "pending", 1), ("rr", "pending", 2), ("rrc", "landed", 0), ("rrcr", "pending", 1),
                            ("rrcrc", "landed", 0), ("rrdr", "pending", 1), ("crrd", "landed", 0), ("rrcx", "landed", 0), ("rrcxr", "pending", 1)]:
        ctl("id=300&seq=" + seq)
        s, st = call("GET", "/api/rm/deploy/state?id=300")
        chk("배포요청 상태 [%s] → %s(%d건)" % (seq or "빈 일감", want, pend), s == 200 and st["state"] == want and st["pending"] == pend, st)
    ctl("restore=1&id=300")      # 뒤의 다른 시험이 쓰는 원래 댓글로 복원
    # ---- 2.8.0: 체크리스트 보관 (지우지 않고 숨김 · 되돌리기) ----
    s, t1 = call("POST", "/api/todo", {"issue_id": 200, "text": "보관 시험 A"})
    s, t2 = call("POST", "/api/todo", {"issue_id": 200, "text": "보관 시험 B"})
    call("POST", "/api/todo", {"id": t1["id"], "done": True})
    s, ar = call("POST", "/api/todo", {"issue_id": 200, "archive_done": True})
    chk("완료 항목만 보관(미완료는 그대로)", s == 200 and ar["n"] == 1, ar)
    s, tl = call("GET", "/api/todos")
    m = {x["id"]: x for x in tl}
    chk("보관한 항목은 지워지지 않고 archived_at 이 기록됨", m[t1["id"]]["archived_at"] and m[t2["id"]]["archived_at"] is None, [m[t1["id"]], m[t2["id"]]])
    s, rs = call("POST", "/api/todo", {"id": t1["id"], "archived": False})
    chk("보관함에서 되돌리기", s == 200 and rs["archived_at"] is None and rs["done"] == 1, rs)
    s, ar2 = call("POST", "/api/todo", {"issue_id": 200, "archive_done": True})
    chk("다시 보관하면 또 1건", ar2["n"] == 1, ar2)
    dele("/api/todo/%d" % t1["id"]); dele("/api/todo/%d" % t2["id"])
    # ---- 2.7.2: 고정한 포스트잇 모아보기 (날짜 무관) ----
    s, pn = call("GET", "/api/sticky/pinned")
    chk("고정 모아보기: 날짜와 상관없이 고정만", s == 200 and len(pn) >= 1 and all(x["pinned"] == 1 for x in pn) and {x["day"] for x in pn} >= {"2026-10-07"}, [(x["day"], x["text"][:6]) for x in pn])
    chk("고정 모아보기: 최근 날짜 먼저", [x["day"] for x in pn] == sorted([x["day"] for x in pn], reverse=True), [x["day"] for x in pn])
    # ---- 2.7: 노출 기간 (시작일~종료일) ----
    s, rgd = call("POST", "/api/sticky", {"day": "2026-11-01", "until": "2026-11-05", "text": "기간 시험", "color": "green"})
    chk("기간 포스트잇 저장", s == 200 and rgd["until"] == "2026-11-05", rgd)
    onday = lambda d: [x["text"] for x in call("GET", "/api/sticky?day=" + d)[1]]
    chk("기간 안의 날에 보임(시작·중간·종료)", all("기간 시험" in onday(d) for d in ("2026-11-01", "2026-11-03", "2026-11-05")), [onday(d) for d in ("2026-11-01", "2026-11-03", "2026-11-05")])
    chk("기간 밖의 날엔 안 보임(전날·다음날)", all("기간 시험" not in onday(d) for d in ("2026-10-31", "2026-11-06")), [onday(d) for d in ("2026-10-31", "2026-11-06")])
    s, rbad = call("POST", "/api/sticky", {"day": "2026-11-10", "until": "2026-11-02", "text": "종료일이 더 빠름"})
    chk("종료일이 시작일보다 빠르면 하루짜리", s == 200 and rbad["until"] == "", rbad)
    s, rfmt = call("POST", "/api/sticky", {"day": "2026-11-10", "until": "내일", "text": "x"})
    chk("종료일 형식 오류 400", s == 400, rfmt)
    s, dd2 = call("GET", "/api/sticky/days"); chk("메모가 있는 날은 시작일에만 센다", all(d["day"] != "2026-11-03" for d in dd2), dd2)
    # ---- 2.4/2.5: 변경 이력 · 원문 · 사진 · 검색 · 배포요청 ----
    call("POST", "/api/fetch", {"ids": [200]})
    s, notes = call("GET", "/api/notes"); n200 = [x for x in notes if x["issue_id"] == 200][0]
    chk("본문 원문 저장(desc_raw)", "<img" in n200["desc_raw"] and "%EC%82%AC" in n200["desc_raw"], n200["desc_raw"][:80])
    ch = n200["changes"]
    chk("변경 이력 저장(2건 이상)", len(ch) >= 2, ch)
    c901 = [c for c in ch if c["id"] == 901]
    items = {i["label"]: i for i in (c901[0]["items"] if c901 else [])}
    chk("상태 번호→이름 (접수→최종확인요청)", items.get("상태", {}).get("old") == "접수" and items.get("상태", {}).get("new") == "최종확인요청", items)
    chk("담당자 번호→이름 (나→요청자)", items.get("담당자", {}).get("old") == "테스터 나" and items.get("담당자", {}).get("new") == "[웹] 요청자", items.get("담당자"))
    chk("개발담당자(cf18) 번호→이름", items.get("개발담당자", {}).get("new") == "[개발] 김철수", items.get("개발담당자"))
    c902 = [c for c in ch if c["id"] == 902]
    it2 = {i["label"]: i for i in (c902[0]["items"] if c902 else [])}
    chk("진척도 %·설명 수정 표시", it2.get("진척도", {}).get("new") == "100%" and it2.get("설명", {}).get("note") == "수정됨", it2)
    chk("글 있는 댓글은 변경 이력과 따로 보존", any("사진 댓글" in j["notes"] and "<img" in j.get("raw", "") for j in n200["journals"]), n200["journals"][-1:])
    # 사진 프록시
    d = urllib.request.urlopen(BASE + "/api/rm/img?p=" + urllib.parse.quote("/system/rich/rich_files/rich_files/000/000/001/original/%EC%82%AC%EC%A7%84.png", safe=""))
    chk("사진 프록시", d.status == 200 and d.headers.get("Content-Type") == "image/png" and d.read()[1:4] == b"PNG", dict(d.headers))
    for bad, code in [("/etc/passwd", 400), ("/system/../etc/x", 400), ("/system/rich/bad.txt", 415), ("/issues/1.json", 400)]:
        try:
            urllib.request.urlopen(BASE + "/api/rm/img?p=" + urllib.parse.quote(bad, safe="")); chk("사진 프록시 거절 " + bad, False)
        except urllib.error.HTTPError as e: chk("사진 프록시 거절 " + bad, e.code == code, e.code)
    # 전체 검색
    s, r = call("GET", "/api/rm/search?q=" + urllib.parse.quote("기획전")); chk("제목 검색(부분 일치)", s == 200 and r["total"] == 2 and all("기획전" in i["subject"] for i in r["issues"]), r)
    s, r = call("GET", "/api/rm/search?q=" + urllib.parse.quote("기획전") + "&open=1"); chk("열린 것만", r["total"] == 1, r)
    s, r = call("GET", "/api/rm/search?q=" + urllib.parse.quote("기획전") + "&project=19"); chk("프로젝트 필터", r["total"] == 2, r)
    s, r = call("GET", "/api/rm/search?q=%23200"); chk("번호로 바로 조회 + 내 노트 표시", r.get("byNumber") and r["issues"][0]["id"] == 200 and r["issues"][0]["mine"] is True, r)
    s, r = call("GET", "/api/rm/search?q=999999"); chk("없는 번호는 0건", r["total"] == 0, r)
    s, pj = call("GET", "/api/rm/projects"); chk("프로젝트 목록", len(pj) == 2, pj)
    # 노트에 추가: 추가됨 구분
    s, r = call("POST", "/api/fetch", {"ids": [302], "role": "추가됨"}); chk("검색 결과 노트에 추가", 302 in r["got"], r)
    s, notes = call("GET", "/api/notes"); n302 = [x for x in notes if x["issue_id"] == 302][0]; chk("구분 '추가됨'", n302["roles"] == "추가됨", n302["roles"])
    call("POST", "/api/rm/refresh", {"issue_id": 302}); s, notes = call("GET", "/api/notes"); chk("새로 읽어도 '추가됨' 유지", "추가됨" in [x for x in notes if x["issue_id"] == 302][0]["roles"].split(","))
    s, r = call("POST", "/api/fetch", {"ids": [200], "role": "추가됨"}); s, notes = call("GET", "/api/notes"); chk("이미 있는 일감에는 구분만 덧붙임(기존 역할 보존)", "추가됨" in [x for x in notes if x["issue_id"] == 200][0]["roles"].split(","), [x for x in notes if x["issue_id"] == 200][0]["roles"])
    # 배포요청
    today = time.strftime("%Y-%m-%d")
    s, dp = call("GET", "/api/rm/deploy?date=" + today); chk("오늘 배포요청 찾기(하루 한 건)", len(dp) == 1 and dp[0]["id"] == 300 and dp[0]["date"] == today, dp)
    s, dl = call("GET", "/api/rm/deploy?days=30"); chk("최근 30일 배포요청 목록", [x["id"] for x in dl][:2] == [300, 301], dl)
    s, dn = call("GET", "/api/rm/deploy?date=2001-01-01"); chk("없는 날은 빈 목록", dn == [], dn)
    s, r = call("POST", "/api/fetch", {"ids": [300], "role": "배포요청"}); s, notes = call("GET", "/api/notes"); n300 = [x for x in notes if x["issue_id"] == 300][0]
    chk("배포요청 노트로 저장", n300["roles"] == "배포요청" and len(n300["journals"]) == 2, n300["roles"])
    s, r = call("POST", "/api/rm/write", {"issue_id": 300, "notes": "배포요청 댓글 시험 #200"}); chk("배포요청 일감에도 평소 댓글 쓰기 그대로", s == 200 and r.get("ok"), r)
    # 가져오기(동기화)가 역할을 다시 계산해도 직접 붙인 구분은 유지
    s, sy = call("POST", "/api/sync", {"from": "2026-01-01", "to": "2026-12-31"})
    s, notes = call("GET", "/api/notes")
    r302 = [x for x in notes if x["issue_id"] == 302][0]["roles"].split(","); r300 = [x for x in notes if x["issue_id"] == 300][0]["roles"].split(",")
    chk("동기화 뒤에도 '추가됨' 유지(+새 역할 합쳐짐)", "추가됨" in r302 and "담당자" in r302, r302)
    chk("동기화 뒤에도 '배포요청' 유지", "배포요청" in r300, r300)
finally:
    app.terminate(); fake.terminate(); print("ALL PASS" if ok else "SOME FAILED")
