"""쓰기 시험용 가짜 레드마인 (PUT 지원). 실제 레드마인에는 연결하지 않는다."""
import datetime, hashlib, json, sys, threading, time, uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote

PORT = int(sys.argv[1])
LOCK = threading.Lock()
PUTS = []
MANAGES, DELETED = [], set()
BLOCKED = []
ORIG_J = {}
UPLOADS, UPLOAD_CALLS, ATT_DATA = {}, [], {}
UPLOAD_FAILED_ONCE, PUT_FAILED_ONCE = set(), set()
USED_UPLOADS = set()
NEXT_AID = 10000
CONTROL, REQUESTS = {}, []
EXPIRED_ONCE = set()
STATUS = {5: "완료", 11: "작업중", 15: "최종확인요청", 33: "접수"}


def mk(i):
    return {"id": i, "subject": f"시험 일감 {i}", "project": {"id": 20, "name": "[BC]"}, "tracker": {"name": "작업"},
            "status": {"id": 33, "name": "접수"}, "author": {"id": 55, "name": "요청자"}, "assigned_to": {"id": 7, "name": "나"},
            "updated_on": "2026-10-06T01:00:00Z", "description": "본문", "journals": [], "relations": [],
            "custom_fields": [{"id": 18, "name": "개발담당자", "value": "7"}],
            "attachments": [{"id": 77, "filename": "테스트 문서.txt", "filesize": 11, "content_type": "text/plain", "description": "", "author": {"id": 60, "name": "김철수"}, "created_on": "2026-10-05T01:00:00Z", "content_url": "x"}],
            "journals_extra": 1}


DB = {93599: mk(93599), 200: mk(200)}
DB[200]["journals"].append({"id": 900, "user": {"id": 60, "name": "김철수"}, "notes": "", "created_on": "2026-10-05T02:00:00Z", "details": [{"property": "attachment", "name": "77", "new_value": "테스트 문서.txt"}]})
TODAY = datetime.date.today().isoformat()
YEST = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082")
USERS = {7: ("테스터", "나"), 55: ("[웹] ", "요청자"), 60: ("[개발]", "김철수")}
DB[200]["description"] = '<p>본문 사진</p><img alt="" data-rich-file-id="1" src="/system/rich/rich_files/rich_files/000/000/001/original/%EC%82%AC%EC%A7%84.png">'
DB[200]["journals"] += [
    {"id": 901, "user": {"id": 60, "name": "김철수"}, "notes": "", "created_on": "2026-10-05T03:00:00Z",
     "details": [{"property": "attr", "name": "status_id", "old_value": "33", "new_value": "15"},
                 {"property": "attr", "name": "assigned_to_id", "old_value": "7", "new_value": "55"},
                 {"property": "cf", "name": "18", "old_value": "7", "new_value": "60"}]},
    {"id": 902, "user": {"id": 60, "name": "김철수"}, "notes": '<p>사진 댓글</p><img alt="" src="/system/rich/rich_files/rich_files/000/000/002/original/b.png">', "created_on": "2026-10-05T04:00:00Z",
     "details": [{"property": "attr", "name": "done_ratio", "old_value": "0", "new_value": "100"}, {"property": "attr", "name": "description"}]},
]


def mkdeploy(i, date, note, mine=True):
    d = mk(i)
    d.update({"subject": f"[운영서버 배포요청 / {date}]", "project": {"id": 30, "name": "[IT개발본부] DevOps", "identifier": "request-2021"},
              "author": {"id": 60, "name": "김철수"}, "assigned_to": {"id": 60, "name": "김철수"}, "status": {"id": 33, "name": "접수"},
              "description": "<p>배포 요청 모음</p>", "attachments": [], "custom_fields": [{"id": 18, "name": "개발담당자", "value": "60"}]})
    d["journals"] = [{"id": 5000 + i, "user": {"id": 60, "name": "김철수"}, "notes": "<p>- 요청 사유: 다른 사람 요청</p>", "created_on": date + "T04:00:00Z", "details": []},
                     {"id": 6000 + i, "user": {"id": 7, "name": "나"}, "notes": note, "created_on": date + "T05:00:00Z", "details": []}]
    return d


DB[300] = mkdeploy(300, TODAY, "<p>- 요청 사유: #93599 시험 일감 수정<br />- 반영대상: B/O</p>")
DB[301] = mkdeploy(301, YEST, "<p>- 요청 사유: #200 시험 일감</p>")
DB[304] = mkdeploy(304, "2001-01-02", "<p>- 요청 사유: 내가 담당자인 배포요청</p>"); DB[304]["assigned_to"] = {"id": 7, "name": "나"}   # 일반 가져오기로 들어오는 배포요청
DB[305] = mk(305); DB[305]["subject"] = "[운영서버 배포요청 / 2001-01-03] 다른 프로젝트"   # 제목만 같고 배포요청 프로젝트가 아님
DB[302] = mk(302); DB[302]["subject"] = "[기획전] 시험 제목 검색"; DB[302]["project"] = {"id": 19, "name": "[DR] Daily Request"}
DB[303] = mk(303); DB[303]["subject"] = "또 다른 기획전 페이지"; DB[303]["project"] = {"id": 19, "name": "[DR] Daily Request"}; DB[303]["status"] = {"id": 5, "name": "완료"}
DB[306] = mk(306); DB[306]["subject"] = "[목록 시험] 수동 DR 추가"; DB[306]["project"] = {"id": 19, "name": "[DR] Daily Request"}
DB[306]["updated_on"] = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
DB[200]["attachments"] += [
    {"id": 78, "filename": "화면캡처.png", "filesize": 70, "content_type": "image/png", "description": "", "author": {"id": 60, "name": "김철수"}, "created_on": "2026-10-05T05:00:00Z", "content_url": "x"},
    {"id": 79, "filename": "본문첨부.png", "filesize": 70, "content_type": "image/png", "description": "", "author": {"id": 55, "name": "요청자"}, "created_on": "2026-10-04T01:00:00Z", "content_url": "x"}]
DB[200]["journals"].append({"id": 903, "user": {"id": 60, "name": "김철수"}, "notes": "<p>캡처 첨부합니다</p>", "created_on": "2026-10-05T05:00:00Z",
                            "details": [{"property": "attachment", "name": "78", "new_value": "화면캡처.png"}]})
MEM = [{"user": {"id": 7, "name": "나"}},{"user": {"id": 55, "name": "요청자"}}, {"user": {"id": 60, "name": "김철수"}}]
for _issue in DB.values():
    for _att in _issue["attachments"]:
        _att["content_url"] = f"http://127.0.0.1:{PORT}/attachments/download/{_att['id']}/{quote(_att['filename'])}"


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_CONNECT(self):
        BLOCKED.append(self.path)
        self.send(403, {"error": "test proxy: external network blocked"})

    def redirect(self, path):
        if path.startswith("/__"):
            return False
        REQUESTS.append({"method": self.command, "path": path, "has_key": bool(self.headers.get("X-Redmine-API-Key"))})
        if CONTROL.get("redirect_path") == path and CONTROL.get("redirect_method", self.command) == self.command:
            self.send_response(int(CONTROL["redirect_code"]))
            self.send_header("Location", CONTROL.get("redirect_location", "http://outside.invalid/never"))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return True
        return False

    def send(self, code, obj=None):
        body = b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.scheme or u.netloc:
            BLOCKED.append(self.path)
            return self.send(403, {"error": "test proxy: external network blocked"})
        if u.path == "/__blocked":
            return self.send(200, BLOCKED)
        if u.path == "/api/rm/attachment" and CONTROL.get("editor_app") and parse_qs(u.query).get("id") == ["78"]:
            # 브라우저 컴포넌트 시험의 로컬 이미지 프록시 대역. 외부 서버로 전달하지 않는다.
            self.send_response(200); self.send_header("Content-Type", "image/png"); self.send_header("Content-Length", str(len(PNG)))
            self.end_headers(); self.wfile.write(PNG); return
        if u.path == "/api/rm/img" and CONTROL.get("editor_app") and parse_qs(u.query).get("p", [""])[0].startswith(("/system/rich/", "/system/attachments/")):
            self.send_response(200); self.send_header("Content-Type", "image/png"); self.send_header("Content-Length", str(len(PNG)))
            self.end_headers(); self.wfile.write(PNG); return
        if u.path == "/__test/editor":
            base = CONTROL.get("editor_app", "")
            if not base.startswith("http://127.0.0.1:"):
                return self.send(400, {})
            page = Path(__file__).with_name("comment_editor.html").read_text(encoding="utf-8").replace("__APP__", base)
            body = page.encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline' http://127.0.0.1:*; style-src 'unsafe-inline' http://127.0.0.1:*; img-src blob: http://127.0.0.1:*; connect-src http://127.0.0.1:*; font-src http://127.0.0.1:*; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'")
            self.end_headers(); self.wfile.write(body); return
        if u.path == "/__manages":
            return self.send(200, MANAGES)
        if u.path == "/__test/requests":
            return self.send(200, REQUESTS)
        if u.path == "/__redirect_target":
            REQUESTS.append({"method": self.command, "path": u.path, "has_key": bool(self.headers.get("X-Redmine-API-Key"))})
            return self.send(200, {})
        if self.redirect(u.path):
            return
        if u.path == "/__puts":
            return self.send(200, PUTS)
        if u.path == "/__uploads":
            return self.send(200, UPLOAD_CALLS)
        if not u.path.startswith("/__test/") and self.headers.get("X-Redmine-API-Key") != "good-key":
            return self.send(401, {"error": "bad"})
        q = parse_qs(u.query)
        if u.path == "/__test/deploy":   # 시험 전용: ?id=300&done=ISO(완료 시각)&cm=ISO(댓글 시각)&reset=1
            i = int(q["id"][0])
            if q.get("seq"):   # ?seq=rrcr : 댓글을 순서대로 만든다 (r=배포 요청, c=절취선 구분선, x=잡담, d=상태를 완료로 바꿈)
                import datetime as _d
                ORIG_J.setdefault(i, json.loads(json.dumps(DB[i]["journals"])))
                DB[i]["journals"] = []; DB[i]["status"] = {"id": 33, "name": "접수"}
                t0 = _d.datetime.utcnow() - _d.timedelta(minutes=120)
                for k, ch in enumerate(q["seq"][0]):
                    at = (t0 + _d.timedelta(minutes=k)).strftime("%Y-%m-%dT%H:%M:%SZ")
                    j = {"id": 7000 + k, "user": {"id": 60, "name": "김철수"}, "notes": "", "created_on": at, "details": []}
                    if ch == "r": j["notes"] = "<p>- 요청 사유:&nbsp;#93599 시험<br />- 반영대상: B/O<br />- 배포 요청 일시: 오늘</p>"
                    elif ch == "c": j["notes"] = "<p>========================= 절취선&nbsp;=========================</p>"
                    elif ch == "x": j["notes"] = "<p>확인했습니다</p>"
                    elif ch == "d":
                        j["details"] = [{"property": "attr", "name": "status_id", "old_value": "33", "new_value": "5"}]; DB[i]["status"] = {"id": 5, "name": "완료"}
                    DB[i]["journals"].append(j)
                return self.send(200, {"ok": True})
            if q.get("restore"):   # 시험이 끝나면 원래 댓글·상태로 되돌린다
                DB[i]["status"] = {"id": 33, "name": "접수"}
                DB[i]["journals"] = json.loads(json.dumps(ORIG_J.get(i, DB[i]["journals"])))
                return self.send(200, {"ok": True})
            if q.get("reset"):
                ORIG_J.setdefault(i, json.loads(json.dumps(DB[i]["journals"])))
                DB[i]["status"] = {"id": 33, "name": "접수"}
                DB[i]["journals"] = []
            if q.get("done"):
                DB[i]["status"] = {"id": 5, "name": "완료"}
                DB[i]["journals"].append({"id": 7001, "user": {"id": 60, "name": "김철수"}, "notes": "", "created_on": q["done"][0],
                                          "details": [{"property": "attr", "name": "status_id", "old_value": "33", "new_value": "5"}]})
            if q.get("cm"):
                DB[i]["journals"].append({"id": 7002, "user": {"id": 60, "name": "김철수"}, "notes": "<p>완료 뒤 추가 댓글</p>", "created_on": q["cm"][0], "details": []})
            return self.send(200, {"ok": True})
        if u.path.startswith(("/system/rich/", "/system/attachments/", "/rich/files/", "/attachments/thumbnail/")):
            if CONTROL.get("image_status"):
                return self.send(int(CONTROL["image_status"]), {"error": "synthetic image access error"})
            if u.path.endswith("bad.txt"):
                b = b"nope"; ct = "text/plain"
            else:
                b = PNG; ct = "image/png"
            self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        if u.path.startswith("/users/") and u.path != "/users/current.json":
            uid = int(u.path.split("/")[2].split(".")[0])
            if uid in USERS:
                return self.send(200, {"user": {"id": uid, "login": "u%d" % uid, "lastname": USERS[uid][0], "firstname": USERS[uid][1]}})
            return self.send(404, {})
        if u.path == "/trackers.json":
            return self.send(200, {"trackers": [{"id": 1, "name": "작업"}]})
        if u.path == "/enumerations/issue_priorities.json":
            return self.send(200, {"issue_priorities": [{"id": 2, "name": "보통"}]})
        if u.path == "/projects.json":
            return self.send(200, {"projects": [{"id": 19, "name": "[DR] Daily Request", "identifier": "dr"}, {"id": 30, "name": "[IT개발본부] DevOps", "identifier": "request-2021"}], "total_count": 2})
        if u.path == "/projects/request-2021.json":
            return self.send(200, {"project": {"id": 30, "name": "[IT개발본부] DevOps", "identifier": "request-2021"}})
        if u.path in ("/issues.json", "/projects/request-2021/issues.json"):
            kw = (q.get("subject") or [""])[0].lstrip("~")
            items = []
            for k, v in DB.items():
                if kw and kw not in v["subject"]: continue
                if (q.get("assigned_to_id") or [""])[0] == "me" and v["assigned_to"]["id"] != 7: continue
                if (q.get("cf_18") or [""])[0] == "me" and v["custom_fields"][0]["value"] != "7": continue
                if (q.get("watcher_id") or [""])[0] == "me": continue
                if u.path.startswith("/projects/") and v["project"].get("identifier") != "request-2021": continue
                if (q.get("status_id") or ["*"])[0] == "open" and v["status"]["id"] in (5,): continue
                pid = (q.get("project_id") or [""])[0]
                if pid and str(v["project"]["id"]) != pid: continue
                upd = (q.get("updated_on") or [""])[0]
                if upd.startswith(">=") and v["updated_on"][:10] < upd[2:]: continue
                items.append({kk: v[kk] for kk in ("id", "subject", "project", "tracker", "status", "author", "assigned_to", "updated_on")})
            lim = int((q.get("limit") or ["25"])[0]); off = int((q.get("offset") or ["0"])[0])
            return self.send(200, {"issues": items[off:off + lim], "total_count": len(items), "offset": off, "limit": lim})
        if u.path == "/users/current.json":
            return self.send(200, {"user": {"id": 7, "login": "me", "firstname": "나", "lastname": "테스터"}})
        if u.path == "/issue_statuses.json":
            return self.send(200, {"issue_statuses": [{"id": k, "name": v} for k, v in STATUS.items()]})
        if u.path.startswith("/projects/") and u.path.endswith("/memberships.json"):
            return self.send(200, {"memberships": MEM, "total_count": len(MEM), "offset": 0, "limit": 100})
        if u.path.startswith("/attachments/download/"):
            if CONTROL.get("image_status") and CONTROL.get("apply_to_download"):
                return self.send(int(CONTROL["image_status"]), {"error": "synthetic attachment access error"})
            aid = int(u.path.split("/")[3])
            if aid in DELETED:
                return self.send(404, {"error": "deleted"})
            if aid in ATT_DATA:
                body = ATT_DATA[aid]
                ct = next((a.get("content_type", "application/octet-stream") for issue in DB.values() for a in issue["attachments"] if a["id"] == aid), "application/octet-stream")
                self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
            if u.path.lower().endswith((".png", ".jpg")):
                body = PNG; ct = "image/png"
            else:
                body = b"hello-file!" + chr(10).encode(); ct = "text/plain"
            self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if u.path.startswith("/issues/"):
            i = int(u.path.split("/")[2].split(".")[0])
            if i in DB:
                return self.send(200, {"issue": DB[i]})
            return self.send(404, {"error": "x"})
        self.send(404, {"error": "?"})

    def do_PUT(self):
        global NEXT_AID
        if self.headers.get("X-Redmine-API-Key") != "good-key":
            return self.send(401, {})
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        if self.redirect(u.path):
            return
        if u.path.startswith("/journals/"):
            jid = int(u.path.split("/")[2].split(".")[0])
            with LOCK:
                MANAGES.append({"method": "PUT", "target_id": jid, "body": body})
                if CONTROL.get("manage_status"):
                    return self.send(int(CONTROL["manage_status"]), {"errors": ["Journal update rejected"]})
                pair = next(((d, j) for d in DB.values() for j in d["journals"] if j["id"] == jid), None)
                if not pair:
                    return self.send(404, {})
                d, journal = pair
                if journal["user"]["id"] != 7:
                    return self.send(403, {})
                if CONTROL.get("manage_delay"):
                    time.sleep(float(CONTROL["manage_delay"]))
                if set(body) != {"journal"} or set(body["journal"]) != {"notes"}:
                    return self.send(422, {})
                journal["notes"] = body["journal"]["notes"]
                journal["updated_on"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                d["updated_on"] = journal["updated_on"]
            return self.manage_response()
        i = int(u.path.split("/")[2].split(".")[0])
        iss = body["issue"]
        with LOCK:
            PUTS.append({"id": i, "body": body})
            d = DB[i]
            note = iss.get("notes", "")
            if "422STATUS" in note:
                return self.send(422, {"errors": ["Status is invalid"]})
            if "5XXNOTAPPLIED" in note:
                return self.send(500, {"error": "boom"})
            if "422ONCE" in note and note not in PUT_FAILED_ONCE:
                PUT_FAILED_ONCE.add(note)
                return self.send(422, {"errors": ["Status is invalid"]})
            uploads = iss.get("uploads", [])
            if any(x["filename"] == "expire-once.txt" for x in uploads) and "expire-once.txt" not in EXPIRED_ONCE:
                EXPIRED_ONCE.add("expire-once.txt")
                for x in uploads:
                    UPLOADS.pop(x["token"], None)
                return self.send(422, {"errors": ["Upload token has expired"]})
            if any(x["filename"] == "token-boundary.txt" for x in uploads):
                return self.send(422, {"errors": ["x" * 295 + " Upload " + uploads[0]["token"] + " good-key"]})
            if any(x.get("token") not in UPLOADS or x.get("token") in USED_UPLOADS for x in uploads):
                return self.send(422, {"errors": ["Upload is invalid"]})
            if any(x["filename"] == "foreign-same.bin" for x in uploads):
                x = uploads[0]; data = UPLOADS[x["token"]]["data"]; aid = NEXT_AID; NEXT_AID += 1
                ATT_DATA[aid] = bytes(v ^ 255 for v in data)
                d["attachments"].append({"id": aid, "filename": x["filename"], "filesize": len(data),
                                          "author": {"id": 60, "name": "다른 사용자"}})
                d["journals"].append({"id": max((j["id"] for j in d["journals"]), default=0) + 1,
                                      "user": {"id": 60}, "notes": note, "details": [{"property": "attachment", "name": str(aid), "new_value": x["filename"]}]})
                return self.send(500, {})
            if "5XXPARTIAL" in note:  # 댓글만 반영되고 파일은 빠진 경우를 성공으로 오판하지 않아야 한다.
                d["journals"].append({"id": max((j["id"] for j in d["journals"]), default=0) + 1,
                                      "user": {"id": 7, "name": "나"}, "notes": note, "details": []})
                return self.send(500, {})
            details = []
            for upload in uploads:
                stored = UPLOADS[upload["token"]]
                aid = stored["id"]
                ATT_DATA[aid] = stored["data"]
                USED_UPLOADS.add(upload["token"])
                d["attachments"].append({"id": aid, "filename": upload["filename"], "filesize": len(stored["data"]),
                                         "content_type": upload.get("content_type", "application/octet-stream"), "author": {"id": 7, "name": "나"},
                                         "content_url": f"http://127.0.0.1:{PORT}/attachments/download/{aid}/{quote(upload['filename'])}",
                                         "created_on": "2026-10-06T02:00:00Z"})
                details.append({"property": "attachment", "name": str(aid), "new_value": upload["filename"]})
            for key in ("status_id", "assigned_to_id"):
                if key in iss:
                    old = (d["status"] if key == "status_id" else d.get("assigned_to", {})).get("id")
                    if old != iss[key]:
                        details.append({"property": "attr", "name": key, "old_value": str(old), "new_value": str(iss[key])})
            for cf in iss.get("custom_fields", []):
                if d["custom_fields"][0]["value"] != cf["value"]:
                    details.append({"property": "cf", "name": str(cf["id"]), "old_value": d["custom_fields"][0]["value"], "new_value": cf["value"]})
            if "touch" in iss:
                pass
            if note or details:
                d["journals"].append({"id": max((j["id"] for j in d["journals"]), default=0) + 1,
                                      "user": {"id": 7, "name": "나"}, "notes": note,
                                      "created_on": "2026-10-06T02:00:00Z", "details": details})
            if "status_id" in iss:
                d["status"] = {"id": iss["status_id"], "name": STATUS[iss["status_id"]]}
            if "assigned_to_id" in iss:
                nm = {7: "나", 55: "요청자", 60: "김철수"}[int(iss["assigned_to_id"])]
                d["assigned_to"] = {"id": int(iss["assigned_to_id"]), "name": nm}
            for cf in iss.get("custom_fields", []):
                d["custom_fields"][0]["value"] = cf["value"]
            d["updated_on"] = "2026-10-06T03:%02d:00Z" % (len(PUTS) % 60)
            if "5XXAPPLIED" in note or any(x["filename"] == "applied-error.txt" for x in uploads):
                return self.send(500, {"error": "applied but error"})
        # 반영은 끝났지만 성공 응답을 받지 못한 상황을 재현한다.
        response = CONTROL.get("put_response")
        if response in ("timeout", "lost"):
            if response == "timeout":
                time.sleep(0.25)
            self.close_connection = True
            return
        self.send(204)

    def manage_response(self):
        mode = CONTROL.get("manage_response")
        if mode in ("lost", "timeout"):
            if mode == "timeout":
                time.sleep(.25)
            self.close_connection = True
            return
        return self.send(204)

    def do_DELETE(self):
        if self.headers.get("X-Redmine-API-Key") != "good-key":
            return self.send(401, {})
        path = urlparse(self.path).path
        if self.redirect(path):
            return
        if not path.startswith("/attachments/") or not path.endswith(".json"):
            return self.send(404, {})
        aid = int(path.split("/")[2].split(".")[0])
        with LOCK:
            MANAGES.append({"method": "DELETE", "target_id": aid})
            if CONTROL.get("manage_status"):
                return self.send(int(CONTROL["manage_status"]), {"errors": ["Attachment delete rejected"]})
            pair = next(((d, a) for d in DB.values() for a in d["attachments"] if a["id"] == aid), None)
            if not pair:
                return self.send(404, {})
            d, attachment = pair
            if attachment["author"]["id"] != 7:
                return self.send(403, {})
            if CONTROL.get("manage_delay"):
                time.sleep(float(CONTROL["manage_delay"]))
            d["attachments"].remove(attachment)
            DELETED.add(aid); ATT_DATA.pop(aid, None)
            jid = max((j["id"] for issue in DB.values() for j in issue["journals"]), default=0) + 1
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            d["journals"].append({"id": jid, "user": {"id": 7, "name": "나"}, "notes": "", "created_on": now,
                                  "details": [{"property": "attachment", "name": str(aid), "old_value": attachment["filename"]}]})
            d["updated_on"] = now
        return self.manage_response()

    def do_POST(self):  # 시험 도우미: 일감을 몰래 바꿔서 '충돌' 상황을 만든다
        global NEXT_AID
        u = urlparse(self.path)
        if u.path == "/__test/control":
            CONTROL.clear(); CONTROL.update(json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}"))
            return self.send(200, {})
        if self.redirect(u.path):
            return
        if u.path == "/uploads.json":
            if self.headers.get("X-Redmine-API-Key") != "good-key":
                return self.send(401, {})
            if self.headers.get("Content-Type") != "application/octet-stream":
                return self.send(406, {})
            name = parse_qs(u.query).get("filename", [""])[0]
            data = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            with LOCK:
                UPLOAD_CALLS.append({"filename": name, "filesize": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                                     "content_type": self.headers.get("Content-Type")})
                fail = name == "upload-fail.txt" or (name == "upload-fail-once.txt" and name not in UPLOAD_FAILED_ONCE)
                if fail:
                    UPLOAD_FAILED_ONCE.add(name)
                    return self.send(500, {"error": "upload failed"})
                token = "fake-upload-" + uuid.uuid4().hex
                aid = NEXT_AID; NEXT_AID += 1
                UPLOADS[token] = {"data": data, "filename": name, "id": aid}
            if name == "slow.txt":
                time.sleep(0.5)
            return self.send(201, {"upload": {"token": token, **({} if name == "no-id.txt" or CONTROL.get("upload_token_only") else {"id": aid})}})
        if u.path == "/__clearnotes":   # 레드마인에서 댓글을 지운 상황 (일감 수정일은 그대로)
            with LOCK:
                DB[93599]["journals"] = []
            return self.send(200, {"ok": True})
        if u.path == "/__touch":
            with LOCK:
                DB[93599]["updated_on"] = "2026-10-06T09:00:00Z"
            return self.send(200, {"ok": True})
        self.send(404, {"error": "?"})


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
