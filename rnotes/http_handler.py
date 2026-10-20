"""HTTP: 이 화면에서 온 요청만 받는 서버와 모든 /api 경로"""
import datetime
import json
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler
from http.server import ThreadingHTTPServer
from pathlib import Path

from .alarms import alarm_ack, alarms_due, future_notice, sticky_calendar
from .autosync import status as autosync_status
from .config import APP_TITLE, BETA, BUILD, CHANNEL, VERSION_LABEL
from .config import WEB_DIR, APP_VERSION, BACKUP_DIR, DATA_DIR, DB_PATH, DEFAULT_URL, FONT_DIR, FONT_EXT, FROZEN, HOME_DIR, MAX_UPLOAD, POINTER_PATH, PORT, RUN, SETTING_KEYS, STATE, conn
from .fonts import font_files
from .lifecycle import open_or_notify, shutdown
from .redmine import check_login, explain, fetch_ids, fetch_linked, my_id, rm_issue, rm_members, rm_statuses, sync
from .rm_deploy import deploy_issues, deploy_state, rm_peek, rm_projects, rm_search
from .rm_write import do_write, preview_write, refresh_local, rm_attachments, write_info
from .sticky import sticky_row, sticky_save
from .storage import backup_path, configured, db, get_settings, list_backups, note_count, restore_bytes, save_config, snapshot_zip, stamp
from .holiday_api import HolidayApiError, fetch_and_store, week_start
from .holiday_api import status as holiday_status
from .holidays import extra_days, holiday_dates
from .queries import query_delete, query_import, query_list, query_pin, query_restore, query_save, query_use, query_versions
from . import updater
from .attention import notify as attention_notify
from .commands import command_delete, command_list, command_reorder, command_save, var_delete, var_list, var_save
from .trouble import trouble_row, trouble_save
from . import gitbackup


# ---------- HTTP ----------
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
ALLOWED_ORIGINS = {f"http://{h}" for h in ALLOWED_HOSTS}
STATIC_TYPES = {".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8"}


class Handler(BaseHTTPRequestHandler):
    def _guard(self, write):
        """이 프로그램 화면에서 온 요청만 받는다.
        - Host 가 내 주소가 아니면 거절 (악성 웹사이트가 도메인을 이 PC로 돌려서 읽는 'DNS 리바인딩' 방어)
        - 쓰기 요청(POST/DELETE)은 다른 사이트에서 보낸 것이면 거절 (Origin / Sec-Fetch-Site 확인)"""
        host = (self.headers.get("Host") or "").lower()
        bad = bool(host) and host not in ALLOWED_HOSTS
        if write and not bad:
            origin = self.headers.get("Origin")
            if origin and origin.lower() not in ALLOWED_ORIGINS:
                bad = True
            if (self.headers.get("Sec-Fetch-Site") or "same-origin") not in ("same-origin", "none"):
                bad = True
        if bad:
            self.send_json({"error": "허용되지 않은 요청입니다"}, 403)
            return False
        return True

    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        self.send_bytes(json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                        "application/json; charset=utf-8", code)

    def send_bytes(self, body, ctype, code=200, headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_raw(self):
        n = int(self.headers.get("Content-Length", 0))
        if n > MAX_UPLOAD:
            raise ValueError("파일이 너무 큽니다 (최대 80MB)")
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        if not self._guard(False):
            return
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if u.path == "/":
            html = (WEB_DIR / "index.html").read_bytes()
            if BETA:   # 베타: 앱 창 제목을 따로 (appwin 이 이 제목으로 창을 찾는다)
                html = html.replace("<title>레드마인 노트 2</title>".encode(), f"<title>{APP_TITLE}</title>".encode(), 1)
            self.send_bytes(html, "text/html; charset=utf-8", headers={"Cache-Control": "no-cache"})
        elif u.path.startswith("/static/"):      # web/ 안의 CSS · JS 만 (폴더 밖으로 나가는 경로는 거절)
            f = (WEB_DIR / urllib.parse.unquote(u.path[len("/static/"):])).resolve()
            if WEB_DIR.resolve() in f.parents and f.is_file() and f.suffix in STATIC_TYPES:
                self.send_bytes(f.read_bytes(), STATIC_TYPES[f.suffix], headers={"Cache-Control": "no-cache"})
            else:
                self.send_json({"error": "not found"}, 404)
        elif u.path == "/api/config":
            first = not STATE["served"]  # 서버를 켠 뒤 처음 여는 경우에만 True
            STATE["served"] = True
            s = get_settings()
            self.send_json(
                {
                    "url": conn.url,
                    "configured": configured(),
                    "noteCount": note_count(),
                    "write": write_info(),
                    "imported": (HOME_DIR / ".imported-v1").exists(),
                    "keyUnreadable": conn.key_problem and not conn.key,
                    "appVersion": APP_VERSION,
                    "channel": CHANNEL, "build": BUILD, "versionLabel": VERSION_LABEL,   # 정식 / 베타
                    "newerDb": STATE["newer_db"],
                    "defaultUrl": DEFAULT_URL,
                    "devFieldId": conn.dev_field,
                    "meName": STATE["me_name"] if my_id() else None,
                    "dataDir": str(DATA_DIR),
                    "frozen": FROZEN,
                    "meId": my_id(),
                    "autoCheck": s.get("auto_check", "1") == "1",
                    "firstOpen": first,
                }
            )
        elif u.path == "/api/settings":
            self.send_json(get_settings())
        elif u.path == "/api/notes":
            with db() as c:
                rows = [dict(r) for r in c.execute("SELECT * FROM notes ORDER BY updated_on DESC")]
            for r in rows:
                r["journals"] = json.loads(r["journals"] or "[]")
                r["changes"] = json.loads(r.get("changes") or "[]")
            self.send_json(rows)
        elif u.path == "/api/links":
            with db() as c:
                self.send_json([dict(r) for r in c.execute("SELECT * FROM links")])
        elif u.path == "/api/progress":
            with db() as c:
                self.send_json(
                    [dict(r) for r in c.execute("SELECT * FROM progress ORDER BY day DESC, id ASC")]
                )
        elif u.path == "/api/skipped":
            with db() as c:
                self.send_json({r["issue_id"]: r["reason"] for r in c.execute("SELECT * FROM skipped")})
        elif u.path == "/api/terms":
            with db() as c:
                self.send_json([dict(r) for r in c.execute("SELECT * FROM terms ORDER BY term")])
        elif u.path == "/api/todos":
            with db() as c:
                self.send_json([dict(r) for r in c.execute("SELECT * FROM todos ORDER BY issue_id, done, pos, id")])
        elif u.path == "/api/rm/statuses":
            try:
                self.send_json(rm_statuses())
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/queries":          # 코드/쿼리 보관함 전부 (고정 먼저, 최근 수정 순)
            self.send_json(query_list())
        elif u.path == "/api/queries/versions":  # 한 항목의 이전 버전 메모
            self.send_json(query_versions(int(q.get("id") or 0)))
        elif u.path == "/api/commands":          # 댓글 단축어와 삽입할 문구
            self.send_json(command_list())
        elif u.path == "/api/cmdvars":           # 명령어 변수 (상수 · 함수)
            self.send_json(var_list())
        elif u.path == "/api/trouble":          # 트러블슈팅 전부 (최근 수정 순)
            with db() as c:
                self.send_json([trouble_row(r) for r in c.execute("SELECT * FROM trouble ORDER BY updated_at DESC, id DESC LIMIT 5000")])
        elif u.path == "/api/alarms/due":       # 지금 떠야 할 알림 + 오늘 볼 메모 (화면이 15초마다 가져간다)
            STATE["alarm_poll"] = time.time()
            STATE["alarm_hidden"] = q.get("hidden") == "1"
            STATE["page_focus"] = q.get("focus") != "0"   # 화면에 포커스가 있는가 (윈도우가 아닐 때 '보고 있다' 판단에 쓴다)
            self.send_json({"alarms": alarms_due(), "notice": future_notice(), "server_started": STATE["started"], "now": datetime.datetime.now().isoformat(timespec="seconds")})
        elif u.path == "/api/update":           # 앱 업데이트: 현재 · 최신 버전 · 받기 진행 상태 (확인은 하지 않는다)
            self.send_json(updater.status())
        elif u.path == "/api/autosync":         # 자동 가져오기 상태 + since 뒤의 결과들 (화면이 30초마다 가져간다)
            since = q.get("since")
            self.send_json(autosync_status(int(since) if since and since.lstrip("-").isdigit() else None))
        elif u.path == "/api/open-req":         # 오른쪽 아래 알림 창을 눌러 열어 달라고 한 노트 (한 번 가져가면 지운다). 화면이 창으로 돌아올 때 · 몇 초마다 확인한다
            req, STATE["open_req"] = STATE.get("open_req"), None
            self.send_json({"req": req})
        elif u.path == "/api/holidays":         # 그 해의 공휴일(내장 표 + 설정의 추가 휴일). 달력 표시용
            try:
                self.send_json(holiday_dates(int(q.get("year") or datetime.date.today().year), extra_days(get_settings().get("holiday_extra"))))
            except ValueError:
                self.send_json({"error": "year 는 숫자예요"}, 400)
        elif u.path == "/api/sticky/calendar":  # 달력: 그 달에 걸친 메모
            try:
                self.send_json(sticky_calendar(q.get("month")))
            except ValueError as e:
                self.send_json({"error": str(e)}, 400)
        elif u.path == "/api/sticky/days":      # 메모가 있는 날짜 (최근 것부터)
            with db() as c:
                self.send_json([{"day": r[0], "count": r[1]} for r in c.execute(
                    "SELECT day, COUNT(*) FROM sticky GROUP BY day ORDER BY day DESC LIMIT ?", (int(q.get("limit") or 120),))])
        elif u.path == "/api/sticky/pinned":    # 고정(📌)한 포스트잇 전부, 날짜와 상관없이 (최근 날짜 먼저)
            with db() as c:
                self.send_json([sticky_row(r) for r in c.execute(
                    "SELECT * FROM sticky WHERE pinned=1 ORDER BY day DESC, z DESC, id DESC LIMIT 1000")])
        elif u.path == "/api/sticky/range":     # 내보내기: 날짜 범위의 포스트잇 전부
            f, t = q.get("from") or "0000-00-00", q.get("to") or "9999-99-99"
            with db() as c:
                self.send_json([sticky_row(r) for r in c.execute(
                    "SELECT * FROM sticky WHERE day>=? AND day<=? ORDER BY day, pinned DESC, z, id LIMIT 5000", (f, t))])
        elif u.path == "/api/sticky/search":    # 메모 화면 안에서만 쓰는 검색 (전역 검색에는 걸리지 않는다)
            kw = (q.get("q") or "").strip()
            with db() as c:
                rows = c.execute("SELECT * FROM sticky WHERE text LIKE ? ESCAPE '\\' ORDER BY day DESC, id DESC LIMIT 100",
                                 ("%" + kw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%",)).fetchall() if kw else []
                self.send_json([sticky_row(r) for r in rows])
        elif u.path == "/api/sticky":           # 하루치 포스트잇
            with db() as c:
                dy = q.get("day") or ""   # 그 날 만든 것 + 노출 기간이 그 날을 지나는 것(시작일 ≤ 그 날 ≤ 종료일)
                self.send_json([sticky_row(r) for r in c.execute(
                    "SELECT * FROM sticky WHERE day=? OR (until != '' AND day<=? AND until>=?) ORDER BY z, id", (dy, dy, dy))])
        elif u.path == "/api/rm/search":
            try:
                self.send_json(rm_search(q.get("q"), q.get("project"), q.get("open") == "1", q.get("offset"), q.get("days")))
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/rm/peek":
            try:
                self.send_json(rm_peek(q.get("id") or 0))
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/rm/projects":
            try:
                self.send_json(rm_projects())
            except Exception as e:
                self.send_json([])
        elif u.path == "/api/rm/deploy":      # 배포요청 일감 찾기: ?date=2026-10-07 (그 날 것) / ?days=30 (최근 30일)
            try:
                self.send_json(deploy_issues(q.get("date"), q.get("days")))
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/rm/deploy/state":   # 배포요청 일감 하나의 진행 상태(완료 시각 · 완료 뒤 댓글 수). 읽기 전용
            try:
                self.send_json(deploy_state(q.get("id") or 0))
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/rm/img":         # 본문·댓글 속 사진: 브라우저는 레드마인에 바로 못 가므로 서버가 대신 받아서 넘긴다 (사진 경로만 허용)
            pth = q.get("p", "")
            if not re.fullmatch(r"/(?:system|attachments)/[^\s?#]+", pth) or ".." in pth:
                self.send_json({"error": "허용되지 않은 경로예요"}, 400)
                return
            try:
                r = urllib.request.urlopen(urllib.request.Request(conn.url + urllib.parse.quote(pth, safe="/%:@!$&'()*+,;=-._~"),
                                                                  headers={"X-Redmine-API-Key": conn.key}), timeout=40)
            except Exception as e:
                self.send_json({"error": "사진을 불러오지 못했어요"}, 502)
                return
            with r:
                ct = r.headers.get("Content-Type") or ""
                if not ct.startswith("image/"):
                    self.send_json({"error": "사진이 아니에요"}, 415)
                    return
                body = r.read(20 * 1024 * 1024)
            self.send_bytes(body, ct, 200, {"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})
        elif u.path == "/api/rm/attachments":
            try:
                self.send_json(rm_attachments(int(q.get("issue_id") or 0)))
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/rm/attachment":   # 첨부파일 내려받기: 브라우저는 API 키가 없으므로 서버가 대신 받아서 넘겨 준다 (읽기 전용)
            aid = q.get("id", "")
            name = os.path.basename((q.get("name") or "file").replace("\\", "/")) or "file"
            if not aid.isdigit():
                self.send_json({"error": "첨부 번호가 올바르지 않아요"}, 400)
                return
            try:
                req = urllib.request.Request(f"{conn.url}/attachments/download/{aid}/{urllib.parse.quote(name)}",
                                             headers={"X-Redmine-API-Key": conn.key})
                r = urllib.request.urlopen(req, timeout=60)
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
                return
            with r:
                self.send_response(200)
                self.send_header("Content-Type", r.headers.get("Content-Type") or "application/octet-stream")
                if r.headers.get("Content-Length"):
                    self.send_header("Content-Length", r.headers["Content-Length"])
                self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(name))
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                while True:
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        elif u.path == "/api/rm/members":
            try:
                d, _dev = rm_issue(int(q.get("issue_id") or 0))
                self.send_json(rm_members(d["project"]["id"]))
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/rm/preview":
            try:
                self.send_json(preview_write(q))
            except Exception as e:
                kind, reason, hint, _ = explain(e)
                self.send_json({"error": f"{reason} — {hint}"}, 502)
        elif u.path == "/api/write/log":
            with db() as c:
                self.send_json([dict(r) for r in c.execute("SELECT id, at, issue_id, action, ok, result FROM write_log ORDER BY id DESC LIMIT ?", (int(q.get("limit") or 30),))])
        elif u.path == "/api/codenotes":
            with db() as c:
                self.send_json({r["token"]: r["description"] for r in c.execute("SELECT token, description FROM code_notes")})
        elif u.path == "/api/backups":
            self.send_json(list_backups())
        elif u.path == "/api/backup/download":
            if q.get("name"):
                p = backup_path(q["name"])
                if not p:
                    return self.send_json({"error": "백업 파일이 없습니다"}, 404)
                data, fname = p.read_bytes(), p.name
            else:  # 지금 상태를 바로 내려받기
                tmp = Path(tempfile.mkdtemp())
                try:
                    snapshot_zip(tmp / "b.zip")
                    data = (tmp / "b.zip").read_bytes()
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
                fname = f"redmine-notes-backup-{stamp()}.zip"
            self.send_bytes(data, "application/zip", headers={
                "Content-Disposition": f'attachment; filename="{fname}"'})
        elif u.path == "/api/gitbackup":            # 깃허브 백업 설정 · 마지막 결과 (토큰은 있는지만)
            self.send_json(gitbackup.status())
        elif u.path in ("/api/gitbackup/history", "/api/gitbackup/download"):
            try:
                if u.path == "/api/gitbackup/history":   # 백업 시점 목록 (최근 것부터)
                    return self.send_json(gitbackup.history())
                sha = q.get("sha", "")               # 그 시점을 zip 파일로 받기
                self.send_bytes(gitbackup.fetch_zip(sha), "application/zip", headers={
                    "Content-Disposition": f'attachment; filename="redmine-notes-github-{sha[:7]}.zip"'})
            except gitbackup.BackupError as e:
                self.send_json({"error": str(e), "kind": e.kind}, 400)
        elif u.path == "/api/fonts":
            self.send_json(font_files())
        elif u.path.startswith("/fonts/"):
            name = urllib.parse.unquote(u.path[len("/fonts/"):])
            p = FONT_DIR / name
            if "/" in name or "\\" in name or not p.is_file() or p.suffix.lower() not in FONT_EXT:
                return self.send_json({"error": "not found"}, 404)
            self.send_bytes(p.read_bytes(), FONT_EXT[p.suffix.lower()],
                            headers={"Cache-Control": "max-age=3600"})
        else:
            self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        if not self._guard(True):
            return
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            raw = self.read_raw()
            is_json = self.headers.get("Content-Type", "").startswith("application/json")
            d = json.loads(raw or b"{}") if is_json else {}
            if u.path == "/api/sync":
                self.send_json(sync(d["from"], d["to"]))
            elif u.path == "/api/fetch":
                if d.get("ids"):
                    self.send_json(fetch_ids([int(i) for i in d["ids"]], d.get("role") or "연관"))
                else:  # ids가 없으면 연결돼 있지만 없는 일감 전부
                    failed = []
                    with db() as c:
                        n = fetch_linked(c, failed)
                    self.send_json({"linked": n, "failed": failed})
            elif u.path == "/api/note":
                # 레드마인 상태는 읽기 전용: 여기서는 내가 쓴 칸만 저장한다.
                with db() as c:
                    if "requirement" in d:   # 예전 화면(요건 편집)이 보내는 경우만 반영. 2.6.3 부터는 요건을 고치지 않으므로 보내지 않는다
                        c.execute(
                            "UPDATE notes SET requirement=?, action=?, code_change=?,"
                            " reason=? WHERE issue_id=?",
                            (d["requirement"], d["action"], d["code_change"], d["reason"], d["issue_id"]),
                        )
                    else:
                        c.execute(
                            "UPDATE notes SET action=?, code_change=?, reason=? WHERE issue_id=?",
                            (d["action"], d["code_change"], d["reason"], d["issue_id"]),
                        )
                self.send_json({"ok": True})
            elif u.path == "/api/progress":
                day, text = str(d.get("day", "")), str(d.get("text", "")).strip()
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) or not text:
                    return self.send_json({"error": "날짜(YYYY-MM-DD)와 내용이 필요합니다"}, 400)
                now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                with db() as c:
                    if d.get("id"):
                        c.execute(
                            "UPDATE progress SET day=?, text=?, updated_at=? WHERE id=?",
                            (day, text, now, d["id"]),
                        )
                        pid = d["id"]
                    else:
                        cur = c.execute(
                            "INSERT INTO progress (issue_id, day, text, created_at, updated_at)"
                            " VALUES (?,?,?,?,?)",
                            (d["issue_id"], day, text, now, now),
                        )
                        pid = cur.lastrowid
                self.send_json({"ok": True, "id": pid})
            elif u.path == "/api/recmode":
                mode = d.get("rec_mode")
                if mode not in ("none", "record"):
                    return self.send_json({"error": "rec_mode 는 none 또는 record 여야 합니다"}, 400)
                with db() as c:
                    c.execute("UPDATE notes SET rec_mode=? WHERE issue_id=?", (mode, d["issue_id"]))
                self.send_json({"ok": True})
            elif u.path == "/api/star":
                with db() as c:
                    c.execute(
                        "UPDATE notes SET starred=? WHERE issue_id=?",
                        (1 if d.get("starred") else 0, d["issue_id"]),
                    )
                self.send_json({"ok": True})
            elif u.path == "/api/setup":
                url = (d.get("url") or DEFAULT_URL).strip().rstrip("/")
                key = (d.get("api_key") or "").strip()
                fid = str(d.get("dev_field_id") or conn.dev_field).strip() or "18"
                if not url.lower().startswith(("http://", "https://")):
                    return self.send_json({"error": "주소는 http:// 또는 https:// 로 시작해야 합니다."}, 400)
                if not key:
                    return self.send_json({"error": "API 키를 붙여넣어 주세요."}, 400)
                if not fid.isdigit():
                    return self.send_json({"error": "개발담당자 항목 번호는 숫자여야 합니다."}, 400)
                try:
                    user = check_login(url, key)
                except ValueError as e:
                    return self.send_json({"error": str(e)}, 400)
                # 다른 사람의 키로 바꾸면 기존 노트가 섞인다 -> 한 번 더 확인
                with db() as c:
                    row = c.execute("SELECT value FROM settings WHERE key='owner_id'").fetchone()
                    if row and str(row[0]) != str(user["id"]) and not d.get("force"):
                        return self.send_json(
                            {"error": "이 노트는 다른 레드마인 계정의 것입니다. 계속하면 두 사람의 일감이 한 DB에 섞입니다.",
                             "code": "other_user"}, 409)
                    c.execute("INSERT INTO settings (key,value) VALUES ('owner_id',?) "
                              "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(user["id"]),))
                save_config(url, key, fid)
                my_id()
                self.send_json({"ok": True, "name": STATE["me_name"]})
            elif u.path == "/api/datadir":
                new = Path((d.get("path") or "").strip().strip('"'))
                if not new.is_absolute():
                    return self.send_json({"error": "전체 경로를 입력하세요. 예: D:\\RedmineNotes"}, 400)
                if str(new).startswith("\\\\") and not d.get("force"):
                    return self.send_json(
                        {"error": "네트워크 폴더에서는 DB 파일이 깨질 수 있습니다. 이 PC의 폴더를 권장합니다.", "code": "network"}, 409)
                if new.resolve() == DATA_DIR.resolve():
                    return self.send_json({"ok": True, "restart": False})
                try:
                    new.mkdir(parents=True, exist_ok=True)
                    (new / ".write-test").write_text("ok")
                    (new / ".write-test").unlink()
                except OSError as e:
                    return self.send_json({"error": f"이 폴더에 쓸 수 없습니다: {e}"}, 400)
                if (new / "notes.db").exists() and not d.get("use_existing"):
                    return self.send_json(
                        {"error": "그 폴더에 이미 notes.db 가 있습니다. 그 파일을 그대로 쓰시겠어요?", "code": "exists"}, 409)
                if not (new / "notes.db").exists():
                    src, dst = sqlite3.connect(DB_PATH), sqlite3.connect(new / "notes.db")
                    with dst:
                        src.backup(dst)  # 쓰는 중에도 안전하게 복사
                    src.close(); dst.close()
                    for sub in ("backups", "fonts"):
                        if (DATA_DIR / sub).is_dir():
                            shutil.copytree(DATA_DIR / sub, new / sub, dirs_exist_ok=True)
                POINTER_PATH.write_text(json.dumps({"data_dir": str(new)}, ensure_ascii=False), encoding="utf-8")
                self.send_json({"ok": True, "restart": True})
            elif u.path == "/api/ping":  # 화면이 열려 있다는 신호 (몇십 초마다)
                STATE["last_ping"] = time.time()
                self.send_json({"ok": True})
            elif u.path == "/api/open-external":  # 레드마인 같은 바깥 링크는 평소 쓰는 기본 브라우저(로그인돼 있는)로 연다
                target = (d.get("url") or "").strip()
                if not target.lower().startswith(("http://", "https://")):
                    return self.send_json({"error": "http(s) 주소만 열 수 있습니다"}, 400)
                webbrowser.open(target)
                self.send_json({"ok": True})
            elif u.path == "/api/alarms/ack":
                try:
                    self.send_json(alarm_ack(d))
                except (ValueError, TypeError) as e:
                    self.send_json({"error": str(e)}, 400)
            elif u.path == "/api/sticky":
                try:
                    self.send_json(sticky_save(d))
                except ValueError as e:
                    self.send_json({"error": str(e)}, 400)
            elif u.path in ("/api/queries", "/api/queries/use", "/api/queries/pin", "/api/queries/restore", "/api/queries/import"):
                try:
                    if u.path == "/api/queries/restore":
                        self.send_json(query_restore(int(d.get("id") or 0), int(d.get("version_id") or 0)))
                    elif u.path == "/api/queries/import":
                        self.send_json(query_import(d.get("items")))
                    elif u.path == "/api/queries/use":
                        self.send_json(query_use(int(d.get("id") or 0)))
                    elif u.path == "/api/queries/pin":
                        self.send_json(query_pin(int(d.get("id") or 0), d.get("pinned")))
                    else:
                        self.send_json(query_save(d))
                except (ValueError, TypeError) as e:
                    self.send_json({"error": str(e)}, 400)
            elif u.path == "/api/commands/order":
                try:
                    self.send_json(command_reorder(d.get("ids")))
                except (ValueError, TypeError) as e:
                    self.send_json({"error": str(e)}, 400)
            elif u.path == "/api/commands":
                try:
                    self.send_json(command_save(d))
                except (ValueError, TypeError) as e:
                    self.send_json({"error": str(e)}, 400)
            elif u.path == "/api/cmdvars":
                try:
                    self.send_json(var_save(d))
                except (ValueError, TypeError) as e:
                    self.send_json({"error": str(e)}, 400)
            elif u.path == "/api/trouble":
                try:
                    self.send_json(trouble_save(d))
                except ValueError as e:
                    self.send_json({"error": str(e)}, 400)
            elif u.path == "/api/attention":   # 화면에서만 생기는 알림: 보고 있지 않으면 작업 표시줄 반짝임 + 윈도우 알림
                if "focus" in d:
                    STATE["page_focus"] = bool(d["focus"])
                    STATE["alarm_poll"] = time.time()
                    STATE["alarm_hidden"] = bool(d.get("hidden"))
                self.send_json(attention_notify(str(d.get("title") or "레드마인 노트"), str(d.get("text") or "")))
            elif u.path == "/api/popup/test":   # 설정 → 알림 방식: 오른쪽 아래 알림 창 미리 보기 (누르면 지금 연 노트로)
                if not RUN.popup:
                    return self.send_json({"shown": False, "reason": "윈도우에서 실행할 때만 띄울 수 있어요"})
                from .lifecycle import open_issue
                iid = d.get("issue_id")
                item = {"id": int(iid) if str(iid or "").isdigit() else None, "head": "💬 미리 보기",
                        "title": str(d.get("title") or "레드마인 노트 알림")[:120], "text": "새 댓글이 오면 이렇게 알려 줘요. 누르면 그 노트의 새 댓글로 바로 가요."}
                self.send_json({"shown": bool(RUN.popup.show([item], open_issue))})
            elif u.path in ("/api/update/check", "/api/update/download", "/api/update/apply"):   # 앱 업데이트: 확인 · 받기(백그라운드) · 바꾸고 다시 켜기
                try:
                    fn = {"check": updater.check, "download": updater.start_download, "apply": updater.apply}[u.path.rsplit("/", 1)[1]]
                    self.send_json(fn())
                except updater.UpdateError as e:
                    self.send_json({"error": str(e)}, 400)
                except OSError as e:   # 예상하지 못한 파일 · 권한 오류도 어느 단계인지 알 수 있게
                    step = {"check": "확인", "download": "받기", "apply": "바꾸기"}[u.path.rsplit("/", 1)[1]]
                    self.send_json({"error": f"{step} 단계에서 막혔어요 ({e}) — 릴리스 페이지에서 설치 파일을 받아 직접 실행해 주세요"}, 400)
            elif u.path == "/api/holiday/fetch":   # 이번 주 공휴일을 지금 받기
                try:
                    fetch_and_store(week_start(datetime.date.today()))
                except HolidayApiError as e:
                    return self.send_json({"error": str(e)}, 502)
                self.send_json(holiday_status())
            elif u.path == "/api/rm/refresh":   # 일감 1건을 레드마인에서 다시 읽어 저장 (읽기 전용: 레드마인에서 지운 댓글·바뀐 상태 반영)
                try:
                    iid = int(d.get("issue_id") or 0)
                    with db() as c:
                        known = c.execute("SELECT 1 FROM notes WHERE issue_id=?", (iid,)).fetchone()
                    if not known:
                        return self.send_json({"error": "내 노트에 없는 일감이에요"}, 404)
                    self.send_json({"ok": True, "note": refresh_local(iid)})
                except Exception as e:
                    kind, reason, hint, _ = explain(e)
                    self.send_json({"error": f"{reason} — {hint}", "kind": kind}, 502)
            elif u.path == "/api/rm/write":   # 레드마인에 댓글 · 상태 · 담당자 쓰기
                code, obj = do_write(d)
                self.send_json(obj, code)
            elif u.path == "/api/second-launch":  # 이미 켜져 있는데 또 실행됨
                self.send_json({"ok": True, "opened": open_or_notify()})
            elif u.path == "/api/quit":
                self.send_json({"ok": True})
                threading.Timer(0.4, shutdown).start()
            elif u.path == "/api/todo":
                now = datetime.datetime.now().isoformat(timespec="seconds")
                with db() as c:
                    if d.get("archive_done"):  # 완료한 항목을 보관함으로 (지우지 않는다)
                        cur = c.execute("UPDATE todos SET archived_at=? WHERE issue_id=? AND done=1 AND archived_at IS NULL",
                                        (now, d["issue_id"]))
                        return self.send_json({"ok": True, "n": cur.rowcount, "archived_at": now})
                    if d.get("clear_done"):  # (예전 방식) 완료한 항목 영구 삭제 — 화면에서는 더 쓰지 않는다
                        c.execute("DELETE FROM todos WHERE issue_id=? AND done=1", (d["issue_id"],))
                        return self.send_json({"ok": True})
                    if d.get("id"):
                        row = c.execute("SELECT * FROM todos WHERE id=?", (d["id"],)).fetchone()
                        if not row:
                            return self.send_json({"error": "없는 항목입니다"}, 404)
                        text = row["text"] if "text" not in d else (d["text"] or "").strip()
                        if not text:
                            return self.send_json({"error": "내용이 비어 있습니다"}, 400)
                        done = row["done"] if "done" not in d else (1 if d["done"] else 0)
                        done_at = (now if done else None) if done != row["done"] else row["done_at"]
                        archived_at = row["archived_at"] if "archived" not in d else (now if d["archived"] else None)   # 되돌리기 = archived:false
                        c.execute("UPDATE todos SET text=?, done=?, done_at=?, archived_at=? WHERE id=?", (text, done, done_at, archived_at, d["id"]))
                        tid = d["id"]
                    else:
                        text = (d.get("text") or "").strip()
                        if not text:
                            return self.send_json({"error": "내용이 비어 있습니다"}, 400)
                        pos = c.execute("SELECT COALESCE(MAX(pos),0)+1 FROM todos WHERE issue_id=?", (d["issue_id"],)).fetchone()[0]
                        cur = c.execute("INSERT INTO todos (issue_id, text, done, pos, created_at) VALUES (?,?,0,?,?)",
                                        (d["issue_id"], text, pos, now))
                        tid = cur.lastrowid
                    self.send_json(dict(c.execute("SELECT * FROM todos WHERE id=?", (tid,)).fetchone()))
            elif u.path == "/api/codenote":
                token, desc = (d.get("token") or "").strip(), d.get("description") or ""
                if not token:
                    return self.send_json({"error": "이름이 없습니다"}, 400)
                with db() as c:
                    if desc.strip():  # 비우면 설명을 지운다
                        c.execute(
                            "INSERT INTO code_notes (token, description, updated_at) VALUES (?,?,?) "
                            "ON CONFLICT(token) DO UPDATE SET description=excluded.description,"
                            " updated_at=excluded.updated_at",
                            (token, desc, datetime.datetime.now().isoformat(timespec="seconds")),
                        )
                    else:
                        c.execute("DELETE FROM code_notes WHERE token=?", (token,))
                self.send_json({"ok": True})
            elif u.path == "/api/terms":
                vals = (d["term"].strip(), d.get("aliases", "").strip(), d.get("description", ""))
                with db() as c:
                    if d.get("id"):
                        c.execute(
                            "UPDATE terms SET term=?, aliases=?, description=? WHERE id=?",
                            vals + (d["id"],),
                        )
                    else:
                        c.execute(
                            "INSERT INTO terms (term, aliases, description) VALUES (?,?,?) "
                            "ON CONFLICT(term) DO UPDATE SET aliases=excluded.aliases,"
                            " description=excluded.description",
                            vals,
                        )
                self.send_json({"ok": True})
            elif u.path == "/api/settings":
                with db() as c:
                    for k, v in d.items():
                        if k in SETTING_KEYS:
                            c.execute(
                                "INSERT INTO settings (key,value) VALUES (?,?) "
                                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                                (k, str(v)),
                            )
                self.send_json(get_settings())
            elif u.path == "/api/backup/now":
                BACKUP_DIR.mkdir(exist_ok=True)
                snapshot_zip(BACKUP_DIR / f"manual-{stamp()}.zip")
                self.send_json(list_backups())
            elif u.path == "/api/restore":
                if q.get("name"):
                    p = backup_path(q["name"])
                    if not p:
                        return self.send_json({"error": "백업 파일이 없습니다"}, 404)
                    raw = p.read_bytes()
                if not raw:
                    return self.send_json({"error": "복원할 파일이 비어 있습니다"}, 400)
                self.send_json(restore_bytes(raw))
            elif u.path.startswith("/api/gitbackup/"):
                try:
                    act = u.path.rsplit("/", 1)[-1]
                    if act == "config":       # 바꾼 값만 저장. 저장소 · 토큰을 바꿨으면 바로 연결을 확인한다
                        gitbackup.save_config(d.get("repo"), d.get("branch"), d.get("token"), d.get("auto"), d.get("hours"))
                        out = gitbackup.status()
                        if (d.get("repo") is not None or d.get("token")) and gitbackup.connected():
                            try:
                                gitbackup.check()
                                out["check"] = {"ok": True}
                            except gitbackup.BackupError as e:
                                out["check"] = {"ok": False, "error": str(e), "kind": e.kind}
                        self.send_json(out)
                    elif act == "check":
                        info = gitbackup.check()
                        self.send_json({"ok": True, "default_branch": info.get("default_branch", "")})
                    elif act == "upload":     # 지금 올리기 (force: 모르는 기록이 있어도 그 위에 이어서)
                        self.send_json(gitbackup.upload("직접", force=bool(d.get("force"))))
                    elif act == "restore":    # 고른 백업 시점으로 복원 (직전 상태는 로컬 before-restore 백업)
                        self.send_json(gitbackup.restore(d.get("sha", "")))
                    elif act == "disconnect":
                        gitbackup.disconnect()
                        self.send_json(gitbackup.status())
                    else:
                        self.send_json({"error": "not found"}, 404)
                except gitbackup.BackupError as e:
                    self.send_json({"error": str(e), "kind": e.kind}, 400)
            elif u.path == "/api/fonts":
                ext = Path("x" + q.get("ext", "")).suffix.lower()
                name = re.sub(r"[^\w가-힣 .\-]", "", q.get("name", "")).strip()[:40]
                if ext not in FONT_EXT or not name:
                    return self.send_json({"error": "폰트 이름과 형식(ttf/otf/woff/woff2)을 확인하세요"}, 400)
                if len(raw) < 1000:
                    return self.send_json({"error": "폰트 파일이 올바르지 않습니다"}, 400)
                FONT_DIR.mkdir(exist_ok=True)
                (FONT_DIR / (name + ext)).write_bytes(raw)
                self.send_json(font_files())
            else:
                self.send_json({"error": "not found"}, 404)
        except Exception as e:  # 화면에 원인을 보여주기 위함
            self.send_json({"error": str(e)}, 500)

    def do_DELETE(self):
        if not self._guard(True):
            return
        u = urllib.parse.urlparse(self.path)
        name = urllib.parse.unquote(u.path.rsplit("/", 1)[-1])
        if u.path.startswith("/api/terms/"):
            with db() as c:
                c.execute("DELETE FROM terms WHERE id=?", (name,))
            self.send_json({"ok": True})
        elif u.path.startswith("/api/progress/"):
            with db() as c:
                c.execute("DELETE FROM progress WHERE id=?", (name,))
            self.send_json({"ok": True})
        elif u.path.startswith("/api/sticky/"):
            with db() as c:
                c.execute("DELETE FROM sticky WHERE id=?", (name,))
                c.execute("DELETE FROM sticky_alarm WHERE sticky_id=?", (name,))
            self.send_json({"ok": True})
        elif u.path.startswith("/api/todo/"):
            with db() as c:
                c.execute("DELETE FROM todos WHERE id=?", (name,))
            self.send_json({"ok": True})
        elif u.path.startswith("/api/queries/"):
            query_delete(name)
            self.send_json({"ok": True})
        elif u.path.startswith("/api/commands/"):
            try:
                command_delete(int(name))
                self.send_json({"ok": True})
            except (ValueError, TypeError) as e:
                self.send_json({"error": str(e)}, 400)
        elif u.path.startswith("/api/cmdvars/"):
            try:
                var_delete(int(name))
                self.send_json({"ok": True})
            except (ValueError, TypeError) as e:
                self.send_json({"error": str(e)}, 400)
        elif u.path.startswith("/api/trouble/"):
            with db() as c:
                c.execute("DELETE FROM trouble WHERE id=?", (name,))
            self.send_json({"ok": True})
        elif u.path.startswith("/api/backups/"):
            p = backup_path(name)
            if p:
                p.unlink()
            self.send_json(list_backups())
        elif u.path.startswith("/api/fonts/"):
            p = FONT_DIR / name
            if "/" not in name and "\\" not in name and p.is_file():
                p.unlink()
            self.send_json(font_files())
        else:
            self.send_json({"error": "not found"}, 404)


class Server(ThreadingHTTPServer):
    # 윈도우에서는 재사용 허용 시 같은 포트에 서버가 중복으로 붙어 버린다.
    allow_reuse_address = False
