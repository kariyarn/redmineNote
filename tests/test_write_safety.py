"""쓰기 안전성 시험. 기존 fake_rm_write.py + 격리 홈 + 루프백 전용 네트워크만 사용."""
import copy
import io
import json
import os
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
from concurrent.futures import ThreadPoolExecutor

from isolated_env import isolated_env, multipart_body

ROOT = Path(__file__).resolve().parent.parent
home, env, FP, AP = isolated_env("rn2-safe-", allow="93599,200")
os.environ.clear()
os.environ.update(env)
sys.path.insert(0, str(ROOT))
FAKE = f"http://127.0.0.1:{FP}"
BASE = f"http://127.0.0.1:{AP}"


def http(url, body=None, raw=None, content_type="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, headers={"Content-Type": content_type, "Origin": BASE})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


fake = subprocess.Popen([sys.executable, str(ROOT / "tests/fake_rm_write.py"), str(FP)], env=env)
for _ in range(100):
    try:
        http(FAKE + "/__puts"); break
    except Exception:
        time.sleep(.05)
else:
    fake.terminate(); fake.wait(timeout=10)
    raise SystemExit("가짜 서버를 시작하지 못했으므로 시험 중단")

# 이 지점 이전에 sitecustomize 검사와 네트워크 가드가 이미 적용되어 있다.
from rnotes import storage, redmine, rm_write as W, write_requests as JOURNAL, gitbackup
from rnotes.http_client import RedirectBlocked
storage.init_db()
redmine.fetch_ids([93599, 200])
redmine.my_id()


class SafetyTests(unittest.TestCase):
    def setUp(self):
        http(FAKE + "/__test/control", {})
        with storage.db() as c:
            c.execute("DELETE FROM write_requests")
            c.execute("DELETE FROM write_log")
        W._REQUESTS.clear()
        self.app = None

    def tearDown(self):
        http(FAKE + "/__test/control", {})
        if self.app:
            self.app.terminate(); self.app.wait(timeout=10)

    def body(self, name="safe.bin", notes="", iid=93599):
        return {"issue_id": iid, "notes": notes, "request_id": uuid.uuid4().hex}, [{"filename": name, "data": b"safety-file"}]

    def counts(self):
        return len(http(FAKE + "/__uploads")[1]), len(http(FAKE + "/__puts")[1])

    def recover(self, b, decision="check"):
        return W.recover_write({"issue_id": b["issue_id"], "request_id": b["request_id"], "decision": decision})

    def start_app(self):
        self.app = subprocess.Popen([sys.executable, str(ROOT / "main.py")], env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                status, cfg = http(BASE + "/api/config")
                self.assertEqual(cfg["url"], FAKE)
                self.assertEqual(Path(cfg["dataDir"]).resolve(), Path(home).resolve())
                return
            except (OSError, urllib.error.URLError):
                time.sleep(.05)
        self.fail("격리 앱 서버가 뜨지 않음")

    def replay_http(self, b, files):
        raw, ct = multipart_body(b, [(f["filename"], f["data"]) for f in files])
        return http(BASE + "/api/rm/write", raw=raw, content_type=ct)

    def test_all_redirect_codes_methods_and_headers(self):
        for code in (301, 302, 303, 307, 308):
            for method, path, call in (
                ("GET", "/users/current.json", lambda: redmine.rm_get("/users/current.json", {}, retries=0)),
                ("POST", "/uploads.json", lambda: redmine.rm_upload("redirect.txt", b"x")),
                ("PUT", "/issues/93599.json", lambda: redmine.rm_put("/issues/93599.json", {"issue": {"notes": "redirect"}})),
            ):
                with self.subTest(code=code, method=method):
                    http(FAKE + "/__test/control", {"redirect_path": path, "redirect_method": method,
                                                    "redirect_code": code, "redirect_location": "http://outside.invalid/never"})
                    with self.assertRaises(RedirectBlocked):
                        call()
                    requests = http(FAKE + "/__test/requests")[1]
                    self.assertTrue(requests[-1]["has_key"])
                    self.assertNotIn("/__redirect_target", [r["path"] for r in requests])
        # 같은 origin도 거절: 리다이렉트를 통한 재요청 자체가 없어야 한다.
        http(FAKE + "/__test/control", {"redirect_path": "/users/current.json", "redirect_method": "GET", "redirect_code": 302,
                                        "redirect_location": FAKE + "/__redirect_target"})
        with self.assertRaises(ValueError):
            redmine.check_login(FAKE, "good-key")
        self.assertNotIn("/__redirect_target", [r["path"] for r in http(FAKE + "/__test/requests")[1]])

    def test_image_and_download_redirects_do_not_forward_credentials(self):
        self.start_app()
        for source, api in (("/system/rich/safe.png", "/api/rm/img?p=/system/rich/safe.png"),
                            ("/attachments/download/77/safe.txt", "/api/rm/attachment?id=77&name=safe.txt")):
            for code in (301, 302, 303, 307, 308):
                with self.subTest(source=source, code=code):
                    http(FAKE + "/__test/control", {"redirect_path": source, "redirect_method": "GET", "redirect_code": code})
                    status, result = http(BASE + api)
                    self.assertEqual(status, 502)
                    self.assertIn("리다이렉트", result["error"])

    def test_other_authenticated_provider_also_blocks_redirect(self):
        http(FAKE + "/__test/control", {"redirect_path": "/bearer-test", "redirect_method": "GET", "redirect_code": 302})
        with self.assertRaises(RedirectBlocked):
            gitbackup._req({"token": "synthetic-token"}, "GET", FAKE + "/bearer-test")

    def test_same_name_size_other_user_is_not_success(self):
        b, files = self.body("foreign-same.bin")
        status, result = W.do_write(b, files)
        self.assertEqual(status, 502)
        self.assertTrue(result["needs_review"])
        self.assertFalse(result.get("ok", False))
        before = self.counts()
        self.assertEqual(W.do_write(b, files)[0], 409)
        self.assertEqual(self.recover(b)[0], 409)
        self.assertEqual(before, self.counts())

    def test_explicit_id_author_and_same_journal_required(self):
        b, files = self.body("identity.bin", "identity note")
        self.assertEqual(W.do_write(b, files)[0], 200)
        context = json.loads(JOURNAL.get_request(b["request_id"])["context"])
        issue, dev = redmine.rm_issue(93599)
        for change in ("wrong_author", "missing_journal", "wrong_id"):
            with self.subTest(change=change):
                modified = copy.deepcopy(issue)
                aid = context["attachment_ids"][0]
                attachment = next(a for a in modified["attachments"] if a["id"] == aid)
                if change == "wrong_author":
                    attachment["author"]["id"] = 60
                elif change == "wrong_id":
                    attachment["id"] += 99999
                else:
                    modified["journals"] = [j for j in modified["journals"] if j["id"] in context["before_journals"]]
                with patch.object(W, "rm_issue", return_value=(modified, dev)):
                    self.assertFalse(W._verified_write(context))

    def test_token_only_upload_and_204_are_success(self):
        http(FAKE + "/__test/control", {"upload_token_only": True})
        cases = (("", ["no-id.txt"]), ("token-only comment", ["comment.bin"]),
                 ("token-only multiple", ["one.bin", "two.bin"]))
        real_put, real_upload = W.rm_put, W.rm_upload
        statuses, uploads = [], []
        def put(*args):
            status = real_put(*args)
            statuses.append(status)
            return status
        def upload(*args):
            result = real_upload(*args)  # 201과 유효한 token을 실제 HTTP로 검사한다.
            uploads.append(result)
            return result
        with patch.object(W, "rm_put", side_effect=put), patch.object(W, "rm_upload", side_effect=upload), \
                patch.object(W, "_verified_write", side_effect=AssertionError("정상 응답은 ID 검증이 필요 없음")):
            for notes, names in cases:
                with self.subTest(notes=notes, names=names):
                    b, _ = self.body(notes=notes)
                    files = [{"filename": name, "data": b"token-only-file"} for name in names]
                    before = self.counts()
                    status, result = W.do_write(b, files)
                    self.assertEqual(status, 200)
                    self.assertTrue(result["ok"])
                    self.assertFalse(result.get("needs_review", False))
                    self.assertFalse(result["verified"])
                    self.assertEqual(JOURNAL.get_request(b["request_id"])["state"], "succeeded")
                    self.assertEqual(self.counts(), (before[0] + len(files), before[1] + 1))
                    remote, _ = redmine.rm_issue(b["issue_id"])
                    self.assertTrue(set(names) <= {a["filename"] for a in remote["attachments"]})
                    completed = self.counts()
                    self.assertTrue(W.do_write(b, files)[1]["replayed"])
                    self.assertEqual(self.counts(), completed)
        self.assertEqual(statuses, [204, 204, 204])
        self.assertEqual(len(uploads), 4)
        self.assertTrue(all(u["token"] and u["attachment_id"] is None for u in uploads))

    def assert_token_only_response_uncertain(self, mode):
        http(FAKE + "/__test/control", {"upload_token_only": True, "put_response": mode})
        b, files = self.body("response-" + mode + ".bin", "response " + mode)
        real_open = redmine.open_authenticated
        errors = []
        def open_request(request, timeout=30):
            try:
                return real_open(request, timeout=0.05 if request.get_method() == "PUT" else timeout)
            except Exception as e:
                errors.append(e)
                raise
        with patch.object(redmine, "open_authenticated", side_effect=open_request):
            status, result = W.do_write(b, files)
        self.assertEqual(len(errors), 1)
        if mode == "timeout":
            self.assertIsInstance(errors[0], TimeoutError)
        else:
            from http.client import RemoteDisconnected
            self.assertIsInstance(errors[0], RemoteDisconnected)
        self.assertEqual(status, 502)
        self.assertTrue(result["needs_review"])
        self.assertFalse(result.get("ok", False))
        self.assertEqual(JOURNAL.get_request(b["request_id"])["state"], "uncertain")
        # 파일과 저널이 실제로 생겨도 ID 없는 불명확 응답을 성공으로 추정하지 않는다.
        remote, _ = redmine.rm_issue(b["issue_id"])
        self.assertIn(files[0]["filename"], [a["filename"] for a in remote["attachments"]])
        before = self.counts()
        self.assertEqual(self.recover(b)[0], 409)
        self.assertEqual(W.do_write(b, files)[0], 409)
        self.assertEqual(W.do_write({**b, "request_id": uuid.uuid4().hex}, files)[0], 409)
        self.assertEqual(self.counts(), before)

    def test_token_only_timeout_stays_uncertain(self):
        self.assert_token_only_response_uncertain("timeout")

    def test_token_only_lost_response_stays_uncertain(self):
        self.assert_token_only_response_uncertain("lost")

    def test_no_upload_id_error_stays_uncertain_until_manual_confirmation(self):
        b, files = self.body("no-id.txt", "5XXAPPLIED token-only ambiguous")
        status, result = W.do_write(b, files)
        self.assertEqual(status, 502)
        self.assertTrue(result["needs_review"])
        before = self.counts()
        self.assertEqual(self.recover(b)[0], 409)
        status, result = self.recover(b, "applied")
        self.assertEqual(status, 200)
        self.assertTrue(result["manual"])
        self.assertEqual(JOURNAL.get_request(b["request_id"])["state"], "confirmed")
        self.assertEqual(before, self.counts())

    def test_success_log_failure_then_real_process_restart(self):
        b, files = self.body("log-failure.bin")
        with patch.object(W, "write_log", side_effect=sqlite3.OperationalError("synthetic log failure")):
            status, result = W.do_write(b, files)
        self.assertEqual(status, 200)
        self.assertIsNone(result["log_id"])
        self.assertEqual(JOURNAL.get_request(b["request_id"])["state"], "succeeded")
        before = self.counts()
        self.start_app()
        status, result = self.replay_http(b, files)
        self.assertEqual(status, 200)
        self.assertTrue(result["replayed"])
        self.assertEqual(before, self.counts())

    def test_pending_survives_completion_storage_failure_and_restart(self):
        b, files = self.body("pending.bin")
        with patch.object(JOURNAL, "set_state", side_effect=sqlite3.OperationalError("synthetic failure")), \
                patch.object(W, "write_log", side_effect=sqlite3.OperationalError("synthetic failure")):
            status, result = W.do_write(b, files)
        self.assertEqual(status, 200)
        self.assertTrue(result["tracking_pending"])
        self.assertEqual(JOURNAL.get_request(b["request_id"])["state"], "pending")
        before = self.counts()
        self.start_app()
        status, result = self.replay_http(b, files)
        self.assertEqual(status, 409)
        self.assertTrue(result["needs_review"])
        status, result = http(BASE + "/api/rm/write/recover", {**b, "decision": "check"})
        self.assertEqual(status, 200)
        self.assertTrue(result["verified"])
        self.assertEqual(before, self.counts())

    def test_intent_storage_failure_never_sends_put(self):
        b, files = self.body("intent-failure.bin")
        before = self.counts()
        with patch.object(JOURNAL, "begin", side_effect=sqlite3.OperationalError("synthetic failure")):
            status, result = W.do_write(b, files)
        self.assertEqual(status, 503)
        self.assertEqual(result["code"], "journal_unavailable")
        self.assertEqual(self.counts()[1], before[1])
        self.assertEqual(W.do_write(b, files)[0], 200)
        self.assertEqual(self.counts()[0], before[0] + 1)

    def test_expired_token_requires_confirmation_and_new_request(self):
        b, files = self.body("expire-once.txt")
        status, result = W.do_write(b, files)
        self.assertEqual(status, 422)
        self.assertEqual(result["kind"], "upload_token")
        before = self.counts()
        self.assertEqual(W.do_write(b, files)[0], 409)
        other = {**b, "request_id": uuid.uuid4().hex}
        self.assertEqual(W.do_write(other, files)[0], 409)
        self.assertEqual(before, self.counts())
        self.assertTrue(self.recover(b, "not_applied")[1]["retry_allowed"])
        self.assertEqual(before, self.counts())
        self.assertEqual(W.do_write(b, files)[1]["code"], "request_closed")
        self.assertEqual(W.do_write(other, files)[0], 200)
        self.assertEqual(self.counts(), (before[0] + 1, before[1] + 1))

    def test_mask_before_truncation_boundaries(self):
        for length in (40, 512):
            secret = "BEGIN_SECRET_" + "z" * length
            for prefix in (0, 280, 295, 299, 300, 500):
                with self.subTest(length=length, prefix=prefix):
                    text = "x" * prefix + secret + " good-key"
                    error = urllib.error.HTTPError(FAKE, 422, "test", {}, io.BytesIO(json.dumps({"errors": [text]}).encode()))
                    detail = W.explain_write(error, [secret])[3]
                    expected = text.replace(secret, "[redacted]").replace("good-key", "[redacted]")[:300]
                    self.assertEqual(detail, expected)

    def test_other_issue_is_not_blocked_by_upload(self):
        b, files = self.body("slow.txt")
        before = self.counts()[0]
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = pool.submit(W.do_write, b, files)
            for _ in range(100):
                if self.counts()[0] > before:
                    break
                time.sleep(.01)
            status, result = W.do_write({"issue_id": 200, "notes": "other issue", "request_id": uuid.uuid4().hex})
            self.assertEqual(status, 200)
            self.assertEqual(pending.result(timeout=10)[0], 200)

    def test_durable_context_has_no_tokens_or_binary(self):
        b, files = self.body("private.bin")
        self.assertEqual(W.do_write(b, files)[0], 200)
        stored = JOURNAL.get_request(b["request_id"])["context"]
        tokens = [u["token"] for p in http(FAKE + "/__puts")[1] for u in p["body"]["issue"].get("uploads", [])]
        self.assertTrue(all(t not in stored for t in tokens))
        self.assertNotIn('"token"', stored)
        self.assertNotIn(files[0]["data"].decode(), stored)

    def test_atomic_pending_record_across_connections(self):
        import threading
        barrier = threading.Barrier(2)
        def attempt(_):
            barrier.wait(timeout=5)
            try:
                JOURNAL.begin(uuid.uuid4().hex, "same-scope", 93599, "same-signature", {})
                return True
            except RuntimeError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(attempt, range(2))), [False, True])


try:
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SafetyTests))
finally:
    fake.terminate(); fake.wait(timeout=10)
sys.exit(0 if result.wasSuccessful() else 1)
