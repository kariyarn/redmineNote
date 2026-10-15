"""시험용 가짜 깃허브 (Git Data API 일부만). 메모리에만 저장하고 실제 깃허브에는 가지 않는다.
쓰는 곳: tests/test_gitbackup.py (같은 프로세스에서 start() 로 띄운다). 따로 띄우려면: python tests/fake_github.py <포트>"""
import base64, hashlib, json, re, sys, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "good-token"
REPO = "me/notes-backup"


class Git:
    def __init__(self):
        self.reset()

    def reset(self, private=True, push=True, empty=True, default="main"):
        self.private, self.push, self.default = private, push, default
        self.blobs, self.trees, self.commits, self.refs = {}, {}, {}, {}
        self.calls = []
        if not empty:   # README 하나로 시작한 저장소
            self.refs[default] = self.commit({"README.md": self.blob(b"# hi\n")}, [], "Initial commit")

    def blob(self, data):
        sha = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
        self.blobs[sha] = data
        return sha

    def tree(self, files):
        sha = hashlib.sha1(json.dumps(sorted(files.items())).encode()).hexdigest()
        self.trees[sha] = dict(files)
        return sha

    def commit(self, files, parents, msg):
        t = self.tree(files)
        sha = hashlib.sha1(json.dumps([t, parents, msg, len(self.commits)]).encode()).hexdigest()
        self.commits[sha] = {"tree": t, "parents": parents, "message": msg, "date": "2026-10-14T09:%02d:00Z" % (len(self.commits) % 60)}
        return sha

    def files_at(self, sha):
        return self.trees[self.commits[sha]["tree"]]

    def ancestors(self, sha):
        seen, todo = set(), [sha]
        while todo:
            s = todo.pop()
            if s not in seen:
                seen.add(s)
                todo += self.commits[s]["parents"]
        return seen

    def other_pc_push(self, branch="main"):
        """다른 PC가 올린 것처럼 기록 하나를 더한다."""
        head = self.refs[branch]
        files = dict(self.files_at(head))
        files["notes.db"] = self.blob(b"other pc db")
        self.refs[branch] = self.commit(files, [head], "백업 · 다른 PC")
        return self.refs[branch]


G = Git()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj=None, raw=None):
        body = raw if raw is not None else json.dumps(obj if obj is not None else {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/octet-stream" if raw is not None else "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def route(self, method):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        G.calls.append((method, u.path))
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            return self.send(401, {"message": "Bad credentials"})
        pre = f"/repos/{REPO}"
        if not u.path.startswith(pre):
            return self.send(404, {"message": "Not Found"})
        p = u.path[len(pre):]
        d = self.body() if method in ("POST", "PUT", "PATCH") else {}
        if p == "" and method == "GET":
            return self.send(200, {"private": G.private, "default_branch": G.default, "permissions": {"push": G.push}})
        if not G.push and method != "GET":
            return self.send(403, {"message": "Resource not accessible by personal access token"})
        m = re.match(r"^/git/ref/heads/(.+)$", p)
        if m and method == "GET":
            if not G.refs:
                return self.send(409, {"message": "Git Repository is empty."})
            b = urllib.parse.unquote(m.group(1))
            return self.send(200, {"object": {"sha": G.refs[b]}}) if b in G.refs else self.send(404, {"message": "Not Found"})
        m = re.match(r"^/git/refs/heads/(.+)$", p)
        if m and method == "PATCH":
            b = urllib.parse.unquote(m.group(1))
            if b not in G.refs:
                return self.send(422, {"message": "Reference does not exist"})
            if not d.get("force") and G.refs[b] not in G.ancestors(d["sha"]):
                return self.send(422, {"message": "Update is not a fast forward"})
            G.refs[b] = d["sha"]
            return self.send(200, {"object": {"sha": d["sha"]}})
        if p == "/git/refs" and method == "POST":
            b = d["ref"].removeprefix("refs/heads/")
            if b in G.refs:
                return self.send(422, {"message": "Reference already exists"})
            G.refs[b] = d["sha"]
            return self.send(201, {"object": {"sha": d["sha"]}})
        if p == "/contents/README.md" and method == "PUT":
            b = d.get("branch") or G.default
            if b in G.refs:
                return self.send(422, {"message": "sha wasn't supplied"})
            if G.refs and b != G.default:
                return self.send(404, {"message": "Branch not found"})
            G.refs[b] = G.commit({"README.md": G.blob(base64.b64decode(d["content"]))}, [], d["message"])
            return self.send(201, {"commit": {"sha": G.refs[b]}})
        if p == "/git/blobs" and method == "POST":
            return self.send(201, {"sha": G.blob(base64.b64decode(d["content"]))})
        m = re.match(r"^/git/blobs/([0-9a-f]+)$", p)
        if m and method == "GET":
            return self.send(200, raw=G.blobs[m.group(1)]) if m.group(1) in G.blobs else self.send(404, {"message": "Not Found"})
        m = re.match(r"^/git/commits/([0-9a-f]+)$", p)
        if m and method == "GET":
            c = G.commits.get(m.group(1))
            return self.send(200, {"sha": m.group(1), "tree": {"sha": c["tree"]}, "message": c["message"]}) if c else self.send(404, {"message": "Not Found"})
        m = re.match(r"^/git/trees/([0-9a-f]+)$", p)
        if m and method == "GET":
            t = G.trees.get(m.group(1))
            return self.send(200, {"tree": [{"path": k, "type": "blob", "sha": v} for k, v in t.items()]}) if t is not None else self.send(404, {"message": "Not Found"})
        if p == "/git/trees" and method == "POST":
            files = dict(G.trees[d["base_tree"]]) if d.get("base_tree") else {}
            for e in d["tree"]:
                if e["sha"] is None:
                    files.pop(e["path"], None)
                else:
                    files[e["path"]] = e["sha"]
            return self.send(201, {"sha": G.tree(files)})
        if p == "/git/commits" and method == "POST":
            files = G.trees[d["tree"]]
            return self.send(201, {"sha": G.commit(files, d["parents"], d["message"])})
        if p == "/commits" and method == "GET":
            head, out = G.refs.get(q.get("sha") or G.default), []
            while head:
                c = G.commits[head]
                par = c["parents"][0] if c["parents"] else None
                cur = G.files_at(head).get(q.get("path")) if q.get("path") else True
                prev = G.files_at(par).get(q.get("path")) if (par and q.get("path")) else None
                if cur and cur != prev:
                    out.append({"sha": head, "commit": {"message": c["message"], "committer": {"date": c["date"]}}})
                head = par
            return self.send(200, out[: int(q.get("per_page") or 30)])
        return self.send(404, {"message": "Not Found"})

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_PATCH(self):
        self.route("PATCH")


def start(port=0):
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == "__main__":
    s = start(int(sys.argv[1]) if len(sys.argv) > 1 else 18951)
    print("fake github on", s.server_address, flush=True)
    threading.Event().wait()
