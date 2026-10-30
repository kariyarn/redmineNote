"""첨부 삭제·댓글 수정: 기존 가짜 Redmine, 임시 홈, 루프백 전용 네트워크."""
import copy
import json
import os
import shutil
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid
import zlib
from concurrent.futures import ThreadPoolExecutor

from isolated_env import isolated_env, multipart_body

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node") or next((str(p) for p in (Path(sys.executable).parent.parent / "node/bin/node.exe",) if p.is_file()), None)
home, env, FP, AP = isolated_env("rn2-manage-", allow="93599,200")
os.environ.clear(); os.environ.update(env)
sys.path.insert(0, str(ROOT))
FAKE, BASE = f"http://127.0.0.1:{FP}", f"http://127.0.0.1:{AP}"


def http(url, body=None):
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json", "Origin": BASE})
    try:
        with urllib.request.urlopen(request, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ready(url):
    for _ in range(100):
        try:
            http(url); return
        except OSError:
            time.sleep(.05)
    raise RuntimeError("격리 가짜 서버를 시작하지 못했어요")


fake = subprocess.Popen([sys.executable, str(ROOT / "tests/fake_rm_write.py"), str(FP)], env=env)
ready(FAKE + "/__manages")
from rnotes import storage, redmine, rm_write as W, rm_manage as M, write_requests as J
storage.init_db()
redmine.fetch_ids([93599, 200]); redmine.my_id()
app = None


def start_app():
    global app
    if app:
        app.terminate(); app.wait(timeout=10)
    app = subprocess.Popen([sys.executable, str(ROOT / "main.py")], env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ready(BASE + "/api/config")
    config = http(BASE + "/api/config")[1]
    assert config["url"] == FAKE and Path(config["dataDir"]).resolve() == Path(home).resolve()


start_app()


class ManageTests(unittest.TestCase):
    def setUp(self):
        http(FAKE + "/__test/control", {})
        with storage.db() as c:
            c.execute("DELETE FROM write_requests"); c.execute("DELETE FROM write_log")
        W._REQUESTS.clear()
        self.iid = 93599
        self.make_fixture()

    def make_fixture(self):
        marker = uuid.uuid4().hex
        issue, _ = redmine.rm_issue(self.iid)
        status = 11 if issue["status"]["id"] == 5 else 5
        files = [{"filename": marker + suffix, "data": b"manage-file-binary"} for suffix in (".txt", "-other.txt")]
        code, result = W.do_write({"issue_id": self.iid, "notes": "fixture " + marker,
                                   "status_id": status, "request_id": uuid.uuid4().hex}, files)
        self.assertEqual(code, 200, result)
        issue, _ = redmine.rm_issue(self.iid)
        self.a = next(x for x in issue["attachments"] if x["filename"] == files[0]["filename"])
        self.other = next(x for x in issue["attachments"] if x["filename"] == files[1]["filename"])
        self.journal = issue["journals"][-1]
        redmine.invalidate_cached(("att", self.iid))

    def tearDown(self):
        http(FAKE + "/__test/control", {})

    def control(self, **values):
        http(FAKE + "/__test/control", values)

    def calls(self):
        return http(FAKE + "/__manages")[1]

    def body(self, operation):
        body = {"issue_id": self.iid, "request_id": uuid.uuid4().hex}
        if operation == "delete_attachment":
            body.update(target_id=self.a["id"], filename=self.a["filename"])
        else:
            code, original = M.journal_for_edit({"issue_id": self.iid, "journal_id": self.journal["id"]})
            self.assertEqual(code, 200, original)
            body.update(target_id=self.journal["id"], version=original["version"], notes="<p>edited\nline</p>")
        return body

    def api(self, operation, body):
        return http(BASE + ("/api/rm/attachment/delete" if operation == "delete_attachment" else "/api/rm/journal/edit"), body)

    def test_delete_refresh_history_download_and_other_targets(self):
        untouched, _ = redmine.rm_issue(200)
        listing = http(BASE + f"/api/rm/attachments?issue_id={self.iid}")[1]
        self.assertTrue(next(a for a in listing if a["id"] == self.a["id"])["can_delete"])
        self.assertFalse(next(a for a in listing if a["id"] == 77)["can_delete"])
        url = BASE + f"/api/rm/attachment?id={self.a['id']}&name=test.txt"
        with urllib.request.urlopen(url) as r:
            self.assertEqual(r.headers.get("Cache-Control"), "no-store")
            self.assertEqual(r.read(), b"manage-file-binary")
        body = self.body("delete_attachment")
        code, result = self.api("delete_attachment", body)
        self.assertEqual(code, 200, result)
        listing = http(BASE + f"/api/rm/attachments?issue_id={self.iid}")[1]
        ids = [a["id"] for a in listing]
        self.assertNotIn(self.a["id"], ids); self.assertIn(self.other["id"], ids)
        self.assertEqual(http(url)[0], 404)
        self.assertTrue(any(it.get("old") == self.a["filename"] and not it.get("new")
                            for change in result["note"]["changes"] for it in change["items"]))
        self.assertEqual(redmine.rm_issue(200)[0], untouched)
        self.assertEqual(self.calls()[-1]["method"], "DELETE")

    def test_delete_foreign_owner_and_missing_id(self):
        before = len(self.calls())
        for aid, code in ((77, 403), (999999999, 404)):
            body = {**self.body("delete_attachment"), "target_id": aid}
            self.assertEqual(self.api("delete_attachment", body)[0], code)
        self.assertEqual(len(self.calls()), before)

    def test_other_issue_ids_and_allow_list_are_rejected(self):
        body = self.body("delete_attachment")
        before = len(self.calls())
        self.assertEqual(self.api("delete_attachment", {**body, "issue_id": 200})[0], 404)
        self.assertEqual(self.api("delete_attachment", {**body, "issue_id": 999})[0], 403)
        edit = self.body("edit_journal")
        self.assertEqual(self.api("edit_journal", {**edit, "issue_id": 200})[0], 404)
        self.assertEqual(len(self.calls()), before)

    def test_delete_stale_filename(self):
        body = {**self.body("delete_attachment"), "filename": "different.txt"}
        before = len(self.calls())
        self.assertEqual(self.api("delete_attachment", body)[1]["code"], "changed")
        self.assertEqual(len(self.calls()), before)

    def test_delete_and_edit_permission_errors(self):
        for operation in M.OPERATIONS:
            with self.subTest(operation=operation):
                body = self.body(operation)
                self.control(manage_status=403)
                code, result = self.api(operation, body)
                self.assertEqual(code, 403, result)
                self.assertIn("권한", result["error"])
                self.assertTrue(result["retry_allowed"])
                self.assertEqual(J.get_request(body["request_id"])["state"], "released")
        self.control()

    def test_edit_existing_comment_preserves_journal_details(self):
        before, _ = redmine.rm_issue(self.iid)
        body = self.body("edit_journal")
        code, result = self.api("edit_journal", body)
        self.assertEqual(code, 200, result)
        after, _ = redmine.rm_issue(self.iid)
        self.assertEqual(len(after["journals"]), len(before["journals"]))
        journal = next(j for j in after["journals"] if j["id"] == self.journal["id"])
        self.assertEqual(journal["notes"], body["notes"])
        self.assertEqual(journal["details"], self.journal["details"])
        self.assertEqual(after["status"], before["status"])
        self.assertTrue(any(j["id"] == journal["id"] and j["raw"] == body["notes"] for j in result["note"]["journals"]))
        self.assertEqual(self.calls()[-1]["body"], {"journal": {"notes": body["notes"]}})

    def test_edit_foreign_author_and_empty_change_journal(self):
        before = len(self.calls())
        for jid in (901, 902):
            code, _ = http(BASE + f"/api/rm/journal?issue_id=200&journal_id={jid}")
            self.assertEqual(code, 403)
            body = {"issue_id": 200, "target_id": jid, "notes": "forbidden", "version": "fake", "request_id": uuid.uuid4().hex}
            self.assertEqual(self.api("edit_journal", body)[0], 403)
        self.assertEqual(len(self.calls()), before)
        self.assertEqual(self.api("delete_attachment", self.body("delete_attachment"))[0], 200)
        empty = redmine.rm_issue(self.iid)[0]["journals"][-1]
        self.assertEqual(M.journal_for_edit({"issue_id": self.iid, "journal_id": empty["id"]})[1]["code"], "not_comment")

    def test_explicit_permission_flags_and_invalid_targets(self):
        before = len(self.calls())
        issue, dev = redmine.rm_issue(self.iid)
        issue = copy.deepcopy(issue)
        next(a for a in issue["attachments"] if a["id"] == self.a["id"])["deletable"] = False
        next(j for j in issue["journals"] if j["id"] == self.journal["id"])["editable"] = False
        bodies = {op: self.body(op) for op in M.OPERATIONS}
        with patch.object(M, "rm_issue", return_value=(issue, dev)):
            for operation in M.OPERATIONS:
                self.assertEqual(M.manage_write(bodies[operation], operation)[0], 403)
        for target in (-1, "1/../2", None, 0):
            self.assertEqual(self.api("delete_attachment", {**bodies["delete_attachment"], "target_id": target})[0], 400)
        self.assertEqual(len(self.calls()), before)

    def test_code_boxes_line_breaks_and_format_are_not_transformed(self):
        for raw in ('<p>A<br />B</p>\n<pre><code class="python">\nx = "&lt;"\n\nprint(x)\n</code></pre>\n<p><b>bold</b> <a href="https://example.invalid">link</a></p>',
                    "Textile *bold*\n\n```python\nx = 1\n\nprint(x)\n```\nlast\n"):
            body = {**self.body("edit_journal"), "notes": raw}
            self.assertEqual(self.api("edit_journal", body)[0], 200)
            current = M.journal_for_edit({"issue_id": self.iid, "journal_id": self.journal["id"]})[1]
            self.assertEqual(current["raw"], raw)

    def test_unsupported_journal_api(self):
        for status in (404, 405, 501):
            with self.subTest(status=status):
                self.control(manage_status=status)
                body = self.body("edit_journal")
                code, result = self.api("edit_journal", body)
                self.assertEqual(code, 422, result)
                self.assertEqual(result["code"], "unsupported")
                self.assertIn("원본 Redmine", result["hint"])
                self.assertTrue(result["retry_allowed"])

    def test_edit_conflict_checks_remote_version(self):
        body = self.body("edit_journal")
        redmine.rm_put(f"/journals/{self.journal['id']}.json", {"journal": {"notes": "other session edit"}})
        before = len(self.calls())
        code, result = self.api("edit_journal", body)
        self.assertEqual(code, 409, result)
        self.assertEqual(result["code"], "changed")
        self.assertEqual(len(self.calls()), before)

    def test_server_error_no_resend_and_explicit_recovery(self):
        for operation in M.OPERATIONS:
            with self.subTest(operation=operation):
                body = self.body(operation)
                self.control(manage_status=500)
                code, result = self.api(operation, body)
                self.assertEqual(code, 502, result)
                self.assertTrue(result["needs_review"])
                count = len(self.calls())
                self.assertEqual(self.api(operation, body)[0], 409)
                self.assertEqual(self.api(operation, {**body, "request_id": uuid.uuid4().hex})[0], 409)
                recover = {"issue_id": self.iid, "request_id": body["request_id"], "decision": "check"}
                self.assertEqual(http(BASE + "/api/rm/manage/recover", recover)[0], 409)
                self.assertTrue(http(BASE + "/api/rm/manage/recover", {**recover, "decision": "not_applied"})[1]["retry_allowed"])
                self.assertEqual(len(self.calls()), count)
                self.control()

    def uncertain_response(self, operation, mode):
        body = self.body(operation)
        self.control(manage_response=mode)
        real_open = redmine.open_authenticated
        def short_timeout(request, timeout=30):
            return real_open(request, timeout=.05 if request.get_method() in ("PUT", "DELETE") else timeout)
        with patch.object(redmine, "open_authenticated", side_effect=short_timeout):
            code, result = M.manage_write(body, operation)
        self.assertEqual(code, 502, result)
        self.assertTrue(result["needs_review"])
        self.assertFalse(result.get("ok", False))
        count = len(self.calls())
        self.assertEqual(M.manage_write(body, operation)[0], 409)
        recover = {"issue_id": self.iid, "request_id": body["request_id"], "decision": "not_applied"}
        self.assertEqual(M.recover_manage(recover)[0], 409)  # 실제로 반영됐다면 재시도 준비도 거절한다.
        self.assertEqual(M.recover_manage({**recover, "decision": "check"})[0], 409)
        self.assertTrue(M.recover_manage({**recover, "decision": "applied"})[1]["ok"])
        self.assertEqual(len(self.calls()), count)

    def test_delete_timeout(self): self.uncertain_response("delete_attachment", "timeout")
    def test_delete_lost_response(self): self.uncertain_response("delete_attachment", "lost")
    def test_edit_timeout(self): self.uncertain_response("edit_journal", "timeout")
    def test_edit_lost_response(self): self.uncertain_response("edit_journal", "lost")

    def duplicate(self, operation):
        body = self.body(operation)
        self.control(manage_delay=.3)
        before = len(self.calls())
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = pool.submit(M.manage_write, body, operation)
            for _ in range(100):
                if len(self.calls()) > before: break
                time.sleep(.01)
            code, result = M.manage_write(body, operation)
            self.assertEqual(code, 409, result); self.assertEqual(result["code"], "busy")
            self.assertEqual(pending.result(timeout=10)[0], 200)
        self.assertTrue(M.manage_write(body, operation)[1]["replayed"])
        self.assertEqual(len(self.calls()), before + 1)

    def test_duplicate_delete(self): self.duplicate("delete_attachment")
    def test_duplicate_edit(self): self.duplicate("edit_journal")

    def test_intent_failure_never_mutates_remote(self):
        before = len(self.calls())
        for operation in M.OPERATIONS:
            with patch.object(J, "begin", side_effect=sqlite3.OperationalError("test")):
                self.assertEqual(M.manage_write(self.body(operation), operation)[0], 503)
        self.assertEqual(len(self.calls()), before)

    def test_restart_keeps_uncertain_and_completed_requests(self):
        body = self.body("edit_journal")
        self.control(manage_status=500)
        self.assertEqual(self.api("edit_journal", body)[0], 502)
        count = len(self.calls()); start_app()
        self.assertEqual(self.api("edit_journal", body)[0], 409)
        self.assertEqual(len(self.calls()), count)
        self.control()
        self.assertTrue(M.recover_manage({"issue_id": self.iid, "request_id": body["request_id"], "decision": "not_applied"})[1]["retry_allowed"])
        body = self.body("delete_attachment")
        self.assertEqual(self.api("delete_attachment", body)[0], 200)
        count = len(self.calls()); start_app()
        self.assertTrue(self.api("delete_attachment", body)[1]["replayed"])
        self.assertEqual(len(self.calls()), count)

    def test_auth_redirects_stay_blocked(self):
        for operation, method, path in (("delete_attachment", "DELETE", f"/attachments/{self.a['id']}.json"),
                                         ("edit_journal", "PUT", f"/journals/{self.journal['id']}.json")):
            for status in (301, 302, 303, 307, 308):
                body = self.body(operation)
                self.control(redirect_path=path, redirect_method=method, redirect_code=status)
                code, result = M.manage_write(body, operation)
                self.assertEqual(code, 502, result)
                self.assertEqual(result["kind"], "redirect")
                self.assertTrue(M.recover_manage({"issue_id": self.iid, "request_id": body["request_id"], "decision": "not_applied"})[1]["retry_allowed"])
        self.control()

    def test_manage_context_does_not_store_download_credentials(self):
        body = self.body("delete_attachment")
        issue, dev = redmine.rm_issue(self.iid)
        issue = copy.deepcopy(issue)
        target = next(a for a in issue["attachments"] if a["id"] == self.a["id"])
        target["content_url"] = "https://example.invalid?token=synthetic-download-secret"
        with patch.object(M, "rm_issue", return_value=(issue, dev)):
            self.assertEqual(M.manage_write(body, "delete_attachment")[0], 200)
        context = J.get_request(body["request_id"])["context"]
        self.assertNotIn("synthetic-download-secret", context)
        self.assertNotIn("good-key", context)
        self.assertNotIn("manage-file-binary", context)

    def test_formatted_comment_with_files_and_status(self):
        cases = {"html": '<h2>제목</h2><p><strong>굵게</strong><br>한국어 줄바꿈</p><table><tbody><tr><td>칸</td></tr></tbody></table><pre><code>x = 1\nprint(x)</code></pre>',
                 "markdown": '# 제목\n**굵게**\n\n[링크](https://example.invalid)\n|A|B|\n|---|---|\n|1|2|\n```python\nx = 1\n```',
                 "textile": 'h2. 제목\n*굵게*\n"링크":https://example.invalid\n|A|B|\n|1|2|',
                 "source": '\n원문 그대로\n\n끝\n'}
        for mode, raw in cases.items():
            with self.subTest(mode=mode):
                current, _ = redmine.rm_issue(self.iid)
                state = 11 if current["status"]["id"] == 5 else 5
                body = {"issue_id": self.iid, "notes": raw, "notes_format": mode, "status_id": state,
                        "assigned_to_id": 55, "request_id": uuid.uuid4().hex}
                files = [{"filename": mode + uuid.uuid4().hex + ".txt", "data": b"formatted-file"}]
                code, result = W.do_write(body, files)
                self.assertEqual(code, 200, result)
                issue = http(FAKE + "/__puts")[1][-1]["body"]["issue"]
                self.assertEqual(issue["notes"], raw)
                self.assertEqual(issue["status_id"], state)
                self.assertEqual(len(issue["uploads"]), 1)
                count = len(http(FAKE + "/__puts")[1])
                self.assertTrue(W.do_write(body, files)[1]["replayed"])
                self.assertEqual(len(http(FAKE + "/__puts")[1]), count)

    def test_formatted_edit_preserves_html_and_history(self):
        samples = ("<p><b>기존 서식</b> <a href=\"https://example.invalid?a=1&amp;b=2\">링크</a></p>\n"
                   "<table><tbody><tr><th>A</th><td>한국어</td></tr></tbody></table>"
                   "<pre><code class=\"language-python\">x = &lt;tag&gt;\n\nprint(x)</code></pre>",
                   "# Markdown\n**강조**\n\n```js\nconst x = 1;\n```",
                   'h2. Textile\n*강조*\n\n"링크":https://example.invalid')
        before = redmine.rm_issue(self.iid)[0]
        for mode, raw in zip(("html", "markdown", "textile"), samples):
            body = {**self.body("edit_journal"), "notes": raw, "notes_format": mode}
            code, result = self.api("edit_journal", body)
            self.assertEqual(code, 200, result)
            after = redmine.rm_issue(self.iid)[0]
            journal = next(j for j in after["journals"] if j["id"] == self.journal["id"])
            self.assertEqual(journal["notes"], raw)
            self.assertEqual(journal["details"], self.journal["details"])
            self.assertEqual(len(after["journals"]), len(before["journals"]))

    def test_html_security_rejected_before_remote_write(self):
        from rnotes.comment_format import check_format
        attacks = ('<script>alert(1)</script>', '<p onclick="alert(1)">x</p>',
                   '<a href="java&#x73;cript:alert(1)">x</a>', '<img src="https://outside.invalid/track">',
                   '<img src="data:image/svg+xml,x">', '<iframe src="https://outside.invalid"></iframe>',
                   '<p style="background:url(https://outside.invalid)">x</p>', '<svg onload="alert(1)"></svg>',
                   '<a href="//outside.invalid">x</a>', '<p style="position:fixed">x</p>',
                   '<img src="/system/x.png" onerror="alert(1)"')
        before_puts, before_manage = len(http(FAKE + "/__puts")[1]), len(self.calls())
        edit = self.body("edit_journal")
        for raw in attacks:
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError): check_format(raw, "html", FAKE)
                code, result = W.do_write({"issue_id": self.iid, "notes": raw, "notes_format": "html", "request_id": uuid.uuid4().hex})
                self.assertEqual(code, 400, result)
                self.assertEqual(self.api("edit_journal", {**edit, "notes": raw, "notes_format": "html"})[0], 400)
        self.assertEqual(len(http(FAKE + "/__puts")[1]), before_puts)
        self.assertEqual(len(self.calls()), before_manage)
        for mode in ("legacy", "source", "markdown", "textile"):
            with self.assertRaises(ValueError): check_format('<img src="/system/x.png" onerror="x()">', mode, FAKE)
        self.assertEqual(self.api("edit_journal", {**edit, "notes_format": "legacy"})[0], 400)
        check_format('```html\n<script>literal</script>\n```', "markdown", FAKE)
        check_format(f'<img src="{FAKE}/attachments/download/77/my%20image.png">', "html", FAKE)
        check_format('<img src="https://example.invalid:443/attachments/download/77/image.png">', "html", "https://example.invalid")
        self.assertIn('&lt;script&gt;', W.to_textile('```html\n<script>literal</script>\n```'))

    def test_editor_resources_are_bundled_and_served_locally(self):
        for resource in ("js/comment_editor.js", "css/comment_editor.css"):
            with urllib.request.urlopen(BASE + "/static/" + resource) as response:
                self.assertEqual(response.status, 200)
                self.assertGreater(len(response.read()), 100)
        index = (ROOT / "web/index.html").read_text(encoding="utf-8")
        self.assertLess(index.index("js/editor.js"), index.index("js/comment_editor.js"))
        self.assertLess(index.index("js/comment_editor.js"), index.index("js/note.js"))
        self.assertIn('--add-data "web;web"', (ROOT / "build.bat").read_text(encoding="utf-8-sig"))

    def test_empty_visual_comment_and_raw_length_limits(self):
        self.assertEqual(W.do_write({"issue_id": self.iid, "notes": "<p><br></p>", "notes_format": "html"})[0], 400)
        self.assertEqual(W.do_write({"issue_id": self.iid, "notes": " " * 20001 + "x", "notes_format": "source"})[0], 400)
        body = {"issue_id": self.iid, "notes": "<p>&nbsp;<br></p>", "notes_format": "html", "request_id": uuid.uuid4().hex}
        code, result = W.do_write(body, [{"filename": "empty-rich-file.txt", "data": b"x"}])
        self.assertEqual(code, 200, result)
        self.assertNotIn("notes", http(FAKE + "/__puts")[1][-1]["body"]["issue"])

    def test_full_editor_image_flow_with_real_local_http(self):
        if not NODE: self.skipTest("Node.js 없음: 전체 JS/HTTP 흐름 검사 미실행")
        result = subprocess.run([NODE, str(ROOT / "tests/test_comment_flow.js"), BASE, FAKE], env=env, cwd=ROOT,
                                capture_output=True, text=True, encoding="utf-8", timeout=45)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        print(result.stdout, flush=True)

    def test_raster_upload_then_explicit_html_comment_uses_rest_content_url(self):
        self.control(upload_token_only=True)
        png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082")
        pos = 8
        while pos < len(png):
            length = int.from_bytes(png[pos:pos + 4], "big")
            chunk = png[pos + 4:pos + 8 + length]
            self.assertEqual(zlib.crc32(chunk), int.from_bytes(png[pos + 8 + length:pos + 12 + length], "big"))
            pos += length + 12
        self.assertEqual(pos, len(png))
        name = "새 이미지 " + uuid.uuid4().hex + ".png"
        data = {"issue_id": self.iid, "notes": "", "request_id": uuid.uuid4().hex}
        raw, content_type = multipart_body(data, [(name, png)])
        before = redmine.rm_issue(self.iid)[0]
        puts = len(http(FAKE + "/__puts")[1])
        def send():
            request = urllib.request.Request(BASE + "/api/rm/write", raw, {"Content-Type": content_type, "Origin": BASE})
            with urllib.request.urlopen(request, timeout=10) as r:
                self.assertEqual(r.status, 200); return json.loads(r.read())
        self.assertTrue(send()["ok"]); self.assertTrue(send()["replayed"])
        self.assertEqual(len(http(FAKE + "/__puts")[1]), puts + 1)
        listing = http(BASE + f"/api/rm/attachments?issue_id={self.iid}")[1]
        attachment = next(a for a in listing if a["filename"] == name)
        self.assertEqual(attachment["content_type"], "image/png")
        self.assertEqual(attachment["content_url"], FAKE + f"/attachments/download/{attachment['id']}/" + urllib.parse.quote(name))
        payload = http(FAKE + "/__puts")[1][-1]["body"]["issue"]
        self.assertNotIn("notes", payload); self.assertEqual(payload["uploads"][0]["content_type"], "image/png")
        request = urllib.request.Request(BASE + f"/api/rm/attachment?id={attachment['id']}&name=" + urllib.parse.quote(name))
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.headers.get("Content-Type"), "image/png"); self.assertEqual(response.read(), png)
        notes = f'<p>한국어<br>새 이미지</p><p><img src="{attachment["content_url"]}" width="320" alt="새 이미지"></p>'
        body = {"issue_id": self.iid, "notes": notes, "notes_format": "html", "request_id": uuid.uuid4().hex,
                "status_id": 11 if before["status"]["id"] == 5 else 5}
        code, result = http(BASE + "/api/rm/write", body)
        self.assertEqual(code, 200, result)
        self.assertNotIn(BASE, notes); self.assertNotIn("/api/rm/", notes)
        after = redmine.rm_issue(self.iid)[0]
        self.assertEqual(after["journals"][-1]["notes"], notes)
        self.assertEqual(len(after["journals"]), len(before["journals"]) + 2)  # 명시적 첨부 + 명시적 댓글, 자동 추가 PUT 없음.
        self.assertEqual(len(http(FAKE + "/__puts")[1]), puts + 2)

    def test_image_comment_edit_preserves_source_and_other_journal_details(self):
        name = uuid.uuid4().hex + ".png"
        self.assertEqual(W.do_write({"issue_id": self.iid, "notes": "", "request_id": uuid.uuid4().hex},
                                    [{"filename": name, "data": b"\x89PNG\r\n\x1a\n"}])[0], 200)
        listing = W.rm_attachments(self.iid)
        a = next(a for a in listing if a["filename"] == name)
        raw = '<p>한국어\n둘째 줄 <a href="https://example.invalid">링크</a></p>' + f'<img src="{a["content_url"]}" width="240" alt="그림">' + '<table><tr><td>칸</td></tr></table><pre><code>&lt;img&gt;\n코드</code></pre>'
        before = redmine.rm_issue(self.iid)[0]
        code, result = self.api("edit_journal", {**self.body("edit_journal"), "notes": raw, "notes_format": "html"})
        self.assertEqual(code, 200, result)
        after = redmine.rm_issue(self.iid)[0]
        journal = next(j for j in after["journals"] if j["id"] == self.journal["id"])
        self.assertEqual(journal["notes"], raw); self.assertEqual(journal["details"], self.journal["details"])
        self.assertEqual(len(after["journals"]), len(before["journals"]))

    def test_unconfirmed_raster_upload_has_no_automatic_resend(self):
        self.assert_unconfirmed_raster("lost")

    def test_raster_timeout_has_no_automatic_resend(self):
        self.assert_unconfirmed_raster("timeout")

    def assert_unconfirmed_raster(self, mode):
        self.control(upload_token_only=True, put_response=mode)
        body = {"issue_id": self.iid, "notes": "", "request_id": uuid.uuid4().hex}
        files = [{"filename": uuid.uuid4().hex + ".png", "data": b"\x89PNG\r\n\x1a\n"}]
        real_open = redmine.open_authenticated
        errors = []
        def open_request(request, timeout=30):
            try: return real_open(request, timeout=.05 if request.get_method() == "PUT" else timeout)
            except Exception as e: errors.append(e); raise
        with patch.object(redmine, "open_authenticated", side_effect=open_request):
            code, result = W.do_write(body, files)
        self.assertEqual(len(errors), 1)
        if mode == "timeout": self.assertIsInstance(errors[0], TimeoutError)
        self.assertEqual(code, 502, result); self.assertTrue(result["needs_review"])
        count = len(http(FAKE + "/__puts")[1]); uploads = len(http(FAKE + "/__uploads")[1])
        self.assertEqual(W.do_write(body, files)[0], 409)
        self.assertEqual(W.do_write({**body, "request_id": uuid.uuid4().hex}, files)[0], 409)
        self.assertEqual(len(http(FAKE + "/__puts")[1]), count); self.assertEqual(len(http(FAKE + "/__uploads")[1]), uploads)

    def test_attachment_image_url_filters_credentials_origin_and_wrong_id(self):
        from rnotes.comment_format import attachment_image_url, check_format
        base = "https://redmine.example.invalid/team"
        good = base + "/attachments/download/77/my%20image.png"
        self.assertEqual(attachment_image_url(good, 77, base), good)
        for url in (good + "?key=synthetic-secret", good + "#token", good.replace("/77/", "/78/"),
                    good.replace("redmine.example.invalid", "outside.invalid"), good.replace("https://", "https://user:pass@"),
                    "http://127.0.0.1:8791/attachments/download/77/a.png", "/api/rm/attachment?id=77", "blob:local", "javascript:x()", "https://redmine.example.invalid:bad/attachments/download/77/a.png"):
            self.assertEqual(attachment_image_url(url, 77, base), "", url)
        for src in ("/api/rm/attachment?id=77", "http://127.0.0.1:8791/attachments/download/77/a.png", "blob:local", "file:///x.png"):
            with self.assertRaises(ValueError): check_format(f'<img src="{src}">', "html", base)

    def test_raster_mime_requires_matching_extension_and_binary_signature(self):
        for name, data, mime in (("a.png", b"\x89PNG\r\n\x1a\n", "image/png"), ("a.jpg", b"\xff\xd8\xff", "image/jpeg"),
                                 ("a.gif", b"GIF89a", "image/gif"), ("a.webp", b"RIFF0000WEBP", "image/webp"),
                                 ("a.png", b"<svg/>", ""), ("a.svg", b"<svg/>", ""), ("a.txt", b"\x89PNG\r\n\x1a\n", "")):
            self.assertEqual(W.raster_type(name, data), mime)

    def test_ckeditor_image_paths_bytes_and_png_decode(self):
        paths = ("/system/rich/rich_files/001/original/my%20image.png", "/system/attachments/001/%ED%95%9C%EA%B8%80.png",
                 "/attachments/thumbnail/77?size=128", "/rich/files/42/photo.png")
        for path in paths:
            with self.subTest(path=path):
                url = BASE + "/api/rm/img?p=" + urllib.parse.quote(path, safe="")
                with urllib.request.urlopen(url) as response:
                    self.assertEqual(response.headers.get("Content-Type"), "image/png"); data = response.read()
                self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                pos, compressed = 8, b""
                while pos < len(data):
                    length = int.from_bytes(data[pos:pos + 4], "big"); chunk = data[pos + 4:pos + 8 + length]
                    self.assertEqual(zlib.crc32(chunk), int.from_bytes(data[pos + 8 + length:pos + 12 + length], "big"))
                    if chunk[:4] == b"IDAT": compressed += chunk[4:]
                    pos += length + 12
                self.assertEqual(len(zlib.decompress(compressed)), 5)  # 1x1 RGBA + PNG filter byte
                self.assertEqual(http(FAKE + "/__test/requests")[1][-1]["path"], path.split("?")[0])

    def test_image_proxy_access_errors_and_redirects_are_distinct(self):
        path = "/system/rich/diagnostic.png"; url = BASE + "/api/rm/img?p=" + urllib.parse.quote(path, safe="")
        for status in (401, 403, 404):
            self.control(image_status=status, apply_to_download=True)
            code, result = http(url); self.assertEqual(code, status); self.assertEqual(result["upstream_status"], status)
            self.assertNotIn("good-key", json.dumps(result))
            code, result = http(BASE + "/api/rm/attachment?id=77&name=x.png")
            self.assertEqual(code, status); self.assertEqual(result["upstream_status"], status)
        for status in (301, 302, 303, 307, 308):
            self.control(redirect_path=path, redirect_method="GET", redirect_code=status)
            before = len(http(FAKE + "/__test/requests")[1]); code, result = http(url)
            self.assertEqual(code, 502); self.assertEqual(result["kind"], "redirect")
            self.assertEqual(len(http(FAKE + "/__test/requests")[1]), before + 1)
        self.control()
        self.assertEqual(http(BASE + "/api/rm/img?p=/system/rich/bad.txt")[0], 415)
        for path in ("/rich/files/?CKEditor=foo", "/system/x.png?key=synthetic-secret", "/system/%252e%252e/x.png", "https://outside.invalid/system/x.png"):
            self.assertEqual(http(BASE + "/api/rm/img?p=" + urllib.parse.quote(path, safe=""))[0], 400)

    def test_existing_ckeditor_html_edit_keeps_original_layout_and_images(self):
        raw = '<p style="margin:0;padding:0;line-height:1.6"><font face="Arial" color="#123456" size="3">앞 문단</font></p>\n' + '<p><img data-rich-file-id="42" src="/system/rich/rich_files/001/original/my%20image.png"></p>\n' + '<div>이미지 뒤<br>한국어</div><table><tr><td><img src="/system/attachments/001/b.png"></td></tr></table>'
        before = redmine.rm_issue(self.iid)[0]
        code, result = self.api("edit_journal", {**self.body("edit_journal"), "notes": raw, "notes_format": "html"})
        self.assertEqual(code, 200, result)
        after = redmine.rm_issue(self.iid)[0]; saved = next(j for j in after["journals"] if j["id"] == self.journal["id"])
        self.assertEqual(saved["notes"], raw); self.assertEqual(saved["details"], self.journal["details"])
        self.assertEqual(len(after["journals"]), len(before["journals"]))

    def test_safe_unknown_html_raw_compatibility_rejects_saved_script_urls(self):
        raw = '<p data-original="keep">원문 <img data-cke-saved-src="/system/rich/a.png" src="/system/rich/a.png"></p>'
        body = {**self.body("edit_journal"), "notes": raw}
        self.assertEqual(self.api("edit_journal", body)[0], 200)
        after = redmine.rm_issue(self.iid)[0]
        self.assertEqual(next(j for j in after["journals"] if j["id"] == self.journal["id"])["notes"], raw)
        body = {**self.body("edit_journal"), "notes": raw.replace('data-cke-saved-src="/system/rich/a.png"', 'data-cke-saved-src="javascript:alert(1)"')}
        self.assertEqual(self.api("edit_journal", body)[0], 400)

    def test_paragraph_and_line_break_html_persists_in_new_and_edited_comments(self):
        for fragment in ('<p>첫 번째 문단</p><p>두 번째 문단</p>', '<p>첫 번째 줄<br>두 번째 줄</p>',
                         '<p>첫 문단</p><p><br></p><p><br></p><p>끝 문단</p>',
                         '<ul><li>목록<ul><li>중첩</li></ul></li></ul><table><tr><td><p>표 안<br>줄</p></td></tr></table><pre><code>코드\n줄바꿈</code></pre>'):
            raw = '<p>' + uuid.uuid4().hex + '</p>' + fragment
            body = {"issue_id": self.iid, "request_id": uuid.uuid4().hex, "notes": raw, "notes_format": "html"}
            code, result = http(BASE + "/api/rm/write", body); self.assertEqual(code, 200, result)
            self.assertEqual(redmine.rm_issue(self.iid)[0]["journals"][-1]["notes"], raw)
            self.assertNotIn("data-ce-current", http(FAKE + "/__puts")[1][-1]["body"]["issue"]["notes"])
            edit = {**self.body("edit_journal"), "notes": raw, "notes_format": "html"}
            count = len(redmine.rm_issue(self.iid)[0]["journals"])
            code, result = self.api("edit_journal", edit); self.assertEqual(code, 200, result)
            after = redmine.rm_issue(self.iid)[0]
            self.assertEqual(len(after["journals"]), count)
            self.assertEqual(next(j for j in after["journals"] if j["id"] == self.journal["id"])["notes"], raw)


try:
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ManageTests))
finally:
    if app: app.terminate(); app.wait(timeout=10)
    fake.terminate(); fake.wait(timeout=10)
sys.exit(0 if result.wasSuccessful() else 1)
