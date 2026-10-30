"""HTML comments, images and attachment reads: isolated home and existing loopback fake."""
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid
import zlib

from isolated_env import isolated_env, multipart_body

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node") or next((str(p) for p in (Path(sys.executable).parent.parent / "node/bin/node.exe",) if p.is_file()), None)
home, env, FP, AP = isolated_env("rn2-comment-", allow="93599,200")
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
ready(FAKE + "/__puts")
from rnotes import storage, redmine, rm_write as W, write_requests as J
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


class CommentFeatureTests(unittest.TestCase):
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
        files = [{"filename": marker + suffix, "data": b"fixture-file-binary"} for suffix in (".txt", "-other.txt")]
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

    def test_retired_management_routes_are_absent_and_do_not_write(self):
        puts = len(http(FAKE + "/__puts")[1])
        uploads = len(http(FAKE + "/__uploads")[1])
        requests = len(http(FAKE + "/__test/requests")[1])
        # Intentional negative references: stale clients must not reach Redmine.
        self.assertEqual(http(BASE + "/api/rm/journal?issue_id=93599&journal_id=1")[0], 404)
        for route in ("/api/rm/journal/edit", "/api/rm/attachment/delete", "/api/rm/manage/recover"):
            code, result = http(BASE + route, {"issue_id": self.iid, "attachment_id": self.a["id"],
                                              "journal_id": self.journal["id"], "notes": "stale client"})
            self.assertEqual(code, 404, result)
        self.assertEqual(len(http(FAKE + "/__puts")[1]), puts)
        self.assertEqual(len(http(FAKE + "/__uploads")[1]), uploads)
        self.assertEqual(len(http(FAKE + "/__test/requests")[1]), requests)

    def test_attachment_read_and_download_without_management_metadata(self):
        code, attachments = http(BASE + f"/api/rm/attachments?issue_id={self.iid}")
        self.assertEqual(code, 200)
        current = next(a for a in attachments if a["id"] == self.a["id"])
        self.assertNotIn("can_delete", current)
        self.assertIn("content_url", current)
        with urllib.request.urlopen(BASE + f'/api/rm/attachment?id={current["id"]}&name=fixture.txt') as response:
            self.assertEqual(response.read(), b"fixture-file-binary")

    def test_old_management_ledger_is_preserved_without_blocking_new_comments(self):
        request_id = uuid.uuid4().hex
        J.begin(request_id, W._scope(7) + ":manage", self.iid, "old-management-signature", {"operation": "legacy"})
        code, result = W.do_write({"issue_id": self.iid, "request_id": uuid.uuid4().hex,
                                   "notes": "new comment with old pending management record"})
        self.assertEqual(code, 200, result)
        self.assertEqual(J.get_request(request_id)["state"], "pending")

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

    def test_html_security_rejected_before_remote_write(self):
        from rnotes.comment_format import check_format
        attacks = ('<script>alert(1)</script>', '<p onclick="alert(1)">x</p>',
                   '<a href="java&#x73;cript:alert(1)">x</a>', '<img src="https://outside.invalid/track">',
                   '<img src="data:image/svg+xml,x">', '<iframe src="https://outside.invalid"></iframe>',
                   '<p style="background:url(https://outside.invalid)">x</p>', '<svg onload="alert(1)"></svg>',
                   '<a href="//outside.invalid">x</a>', '<p style="position:fixed">x</p>',
                   '<img src="/system/x.png" onerror="alert(1)"')
        before_puts = len(http(FAKE + "/__puts")[1])
        for raw in attacks:
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError): check_format(raw, "html", FAKE)
                code, result = W.do_write({"issue_id": self.iid, "notes": raw, "notes_format": "html", "request_id": uuid.uuid4().hex})
                self.assertEqual(code, 400, result)
        self.assertEqual(len(http(FAKE + "/__puts")[1]), before_puts)
        for mode in ("legacy", "source", "markdown", "textile"):
            with self.assertRaises(ValueError): check_format('<img src="/system/x.png" onerror="x()">', mode, FAKE)
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

    def test_safe_unknown_html_raw_compatibility_rejects_saved_script_urls(self):
        raw = '<p data-original="keep">원문 <img data-cke-saved-src="/system/rich/a.png" src="/system/rich/a.png"></p>'
        body = {"issue_id": self.iid, "request_id": uuid.uuid4().hex, "notes_format": "source", "notes": raw}
        self.assertEqual(W.do_write(body)[0], 200)
        after = redmine.rm_issue(self.iid)[0]
        self.assertEqual(after["journals"][-1]["notes"], raw)
        body = {"issue_id": self.iid, "request_id": uuid.uuid4().hex, "notes_format": "source", "notes": raw.replace('data-cke-saved-src="/system/rich/a.png"', 'data-cke-saved-src="javascript:alert(1)"')}
        self.assertEqual(W.do_write(body)[0], 400)

    def test_paragraph_and_line_break_html_persists_in_new_comments(self):
        for fragment in ('<p>첫 번째 문단</p><p>두 번째 문단</p>', '<p>첫 번째 줄<br>두 번째 줄</p>',
                         '<p>첫 문단</p><p><br></p><p><br></p><p>끝 문단</p>',
                         '<ul><li>목록<ul><li>중첩</li></ul></li></ul><table><tr><td><p>표 안<br>줄</p></td></tr></table><pre><code>코드\n줄바꿈</code></pre>'):
            raw = '<p>' + uuid.uuid4().hex + '</p>' + fragment
            body = {"issue_id": self.iid, "request_id": uuid.uuid4().hex, "notes": raw, "notes_format": "html"}
            code, result = http(BASE + "/api/rm/write", body); self.assertEqual(code, 200, result)
            self.assertEqual(redmine.rm_issue(self.iid)[0]["journals"][-1]["notes"], raw)
            self.assertNotIn("data-ce-current", http(FAKE + "/__puts")[1][-1]["body"]["issue"]["notes"])



try:
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(CommentFeatureTests))
finally:
    if app: app.terminate(); app.wait(timeout=10)
    fake.terminate(); fake.wait(timeout=10)
sys.exit(0 if result.wasSuccessful() else 1)
