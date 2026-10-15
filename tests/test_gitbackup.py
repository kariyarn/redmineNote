"""깃허브 백업 시험 (임시 데이터 · 가짜 깃허브만 사용, 실제 깃허브에는 가지 않는다).  실행: python tests/test_gitbackup.py <프로젝트 폴더>"""
import os, sys, tempfile, json, io, zipfile, datetime as D, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fake_github as FG
srv = FG.start()
os.environ["REDMINE_NOTES_HOME"] = tempfile.mkdtemp()
os.environ["REDMINE_NOTES_NO_APPWIN"] = "1"
os.environ["REDMINE_NOTES_GITHUB_API"] = f"http://127.0.0.1:{srv.server_address[1]}"
sys.path.insert(0, sys.argv[1])   # 프로젝트 폴더(rnotes 가 있는 곳)
from rnotes import storage, config, gitbackup as GB
storage.init_db()
G = FG.G
ok = fail = 0
def t(name, cond):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name)
def raises(kind, fn, *a, **kw):
    try:
        fn(*a, **kw)
    except GB.BackupError as e:
        return e.kind == kind or print("   (kind)", e.kind, e)
    return False
def add_note(i):
    with storage.db() as c:
        c.execute("INSERT INTO notes (issue_id, subject) VALUES (?, ?)", (i, f"일감 {i}"))
def notes():
    with storage.db() as c:
        return c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
def head():
    return G.refs.get("main")

# 1. 설정값: 저장소 모양 · 브랜치 · 시간 · 시각
t("not connected", not GB.connected() and not GB.enabled())
t("bad repo", raises("config", GB.save_config, repo="not a repo"))
t("bad branch", raises("config", GB.save_config, branch="a..b"))
GB.save_config(repo="https://github.com/me/notes-backup.git", branch="", token="good-token")
d = GB.load()
t("repo normalized", d["repo"] == FG.REPO and d["branch"] == "main")
t("connected, still off", GB.connected() and not GB.enabled() and not GB.auto(d))
t("hours clamp", [GB.hours({"hours": v}) for v in ("", "0", "1", "5", "99", "x", "-3")] == [3, 0, 1, 5, 24, 3, 0] and GB.hours({}) == 3)
t("old settings migrate", GB.auto({"mode": "close"}) and GB.hours({"mode": "close"}) == 0 and GB.hours({"mode": "daily"}) == 24
  and GB.auto({"mode": "hours", "hours": 5}) and GB.hours({"mode": "hours", "hours": 5}) == 5 and not GB.auto({"mode": "off"}))
st = GB.status()
t("status hides token", st["token_set"] and "token" not in json.dumps(st).replace("token_set", ""))

# 2. 연결 확인: 토큰 틀림 · 공개 저장소 · 쓰기 권한 없음
GB.save_config(token="wrong")
t("bad token", raises("auth", GB.check))
GB.save_config(token="good-token")
G.reset(private=False)
t("public refused", raises("public", GB.upload))
t("nothing written to public repo", not any(m != "GET" for m, _ in G.calls))
G.reset(push=False)
t("no push permission", raises("auth", GB.upload))
G.reset()
t("check ok", GB.check()["default_branch"] == "main")
GB.save_config(repo="me/missing")
t("missing repo", raises("notfound", GB.check))
GB.save_config(repo=FG.REPO)

# 3. 빈 저장소에 처음 올리기 → 안내 파일 커밋 + 백업 커밋
add_note(1); add_note(2)
r = GB.upload("시험")
files = G.files_at(head())
t("first upload", r["ok"] and r["changed"] and r["commit"] == head())
t("files", {"README.md", "notes.db", "backup-info.json"} <= set(files))
info = json.loads(G.blobs[files["backup-info.json"]])
t("backup info", info["notes"] == 2 and info["reason"] == "시험" and info["app_version"] == config.APP_VERSION)
t("known saved", GB.load()["known"] == head() and GB.status()["last"]["ok"])
t("no token in backup", b"good-token" not in G.blobs[files["notes.db"]])

# 4. 바뀐 게 없으면 올리지 않는다 / 바뀌면 새 커밋
n_commits = len(G.commits)
r = GB.upload("시험")
t("no change -> no commit", r["ok"] and not r["changed"] and len(G.commits) == n_commits)
add_note(3)
first = head()
r = GB.upload("시험")
t("changed -> new commit", r["changed"] and head() != first and G.commits[head()]["parents"] == [first])
t("message", "노트 3건" in G.commits[head()]["message"])

# 5. 폰트는 올리지 않는다 (폰트만 바뀌면 새 커밋도 없다)
config.FONT_DIR.mkdir(exist_ok=True)
(config.FONT_DIR / "MyFont.ttf").write_bytes(b"F" * 2000)
n_commits = len(G.commits)
r = GB.upload()
t("fonts not uploaded", not r["changed"] and len(G.commits) == n_commits and not any(p.startswith("fonts/") for p in G.files_at(head())))

# 6. 다른 PC가 올린 기록이 있으면 멈춘다 → '그래도 이어서 올리기'(force)는 그 위에 이어서 (기록은 지우지 않는다)
other = G.other_pc_push()
add_note(4)
t("conflict", raises("conflict", GB.upload))
t("remote untouched", head() == other)
r = GB.upload(force=True)
t("force continues on top", r["changed"] and G.commits[head()]["parents"] == [other])
t("last error recorded then cleared", GB.status()["last"]["ok"] and GB.status()["last_ok"]["commit"] == head())

# 7. 백업 시점 목록 · 파일로 받기 · 복원
h = GB.history()
t("history newest first", len(h) >= 4 and h[0]["sha"] == head() and h[0]["at"] and "노트 4건" in h[0]["message"])
old = [x for x in h if "노트 2건" in x["message"]][0]
z = zipfile.ZipFile(io.BytesIO(GB.fetch_zip(old["sha"])))
t("zip has db only", z.namelist() == ["notes.db"])
t("bad sha", raises("config", GB.fetch_zip, "../../x"))
before = len(list(config.BACKUP_DIR.glob("before-restore-*.zip"))) if config.BACKUP_DIR.exists() else 0
r = GB.restore(old["sha"])
t("restored", r["notes"] == 2 and notes() == 2)
t("local font kept", (config.FONT_DIR / "MyFont.ttf").exists())
t("safety backup made", len(list(config.BACKUP_DIR.glob("before-restore-*.zip"))) == before + 1)
t("known = remote head after restore", GB.load()["known"] == head())
r = GB.upload()
t("upload after restore continues", r["changed"] and "노트 2건" in G.commits[head()]["message"])

# 8. 새 PC(이 PC가 아는 기록 없음)에서 노트 백업이 이미 있는 저장소 → 확인을 받는다
d = GB.load(); d.pop("known"); GB._save(d)
t("existing backup needs confirm", raises("conflict", GB.upload))
t("force ok", GB.upload(force=True)["ok"])

# 9. 기본 브랜치가 아닌 브랜치 · README 로 시작한 저장소
G.reset(empty=False)
GB.save_config(branch="backup")
t("branch change forgets known", "known" not in GB.load())
r = GB.upload()
t("new branch from default", r["changed"] and "backup" in G.refs and G.refs["main"] != G.refs["backup"])
t("main untouched", set(G.files_at(G.refs["main"])) == {"README.md"})
GB.save_config(branch="main")

# 10. 100MB 넘는 파일은 막는다
G.reset()
d = GB.load(); d.pop("known", None); GB._save(d)
GB.MAX_FILE, keep = 10, GB.MAX_FILE
t("too big", raises("size", GB.upload))
GB.MAX_FILE = keep

# 11. 언제 올리나: 닫을 때는 늘, 켜져 있는 동안 N시간마다 (0 = 닫을 때만). 꺼져 있던 사이에 지났으면 켤 때 한 번만
NOW = D.datetime(2026, 10, 14, 18, 0)
d = {"repo": FG.REPO, "token": "good-token", "auto": True, "hours": 3}
t("hours first", GB.due(NOW, d, None))
t("hours wait", not GB.due(NOW, d, NOW - D.timedelta(hours=2, minutes=59)))
t("hours due", GB.due(NOW, d, NOW - D.timedelta(hours=3)))
t("app off 3 days -> just due (once)", GB.due(NOW, d, NOW - D.timedelta(days=3)))
t("close only -> never timed", not GB.due(NOW, {**d, "hours": 0}, None) and GB.next_at(NOW, {**d, "hours": 0}) is None)
t("off", not GB.due(NOW, {**d, "auto": False}, None))
t("base = later of try / last ok", GB._base({"sched_try": "2026-10-14T10:00:00", "last_ok": {"at": "2026-10-14T12:00:00"}}) == D.datetime(2026, 10, 14, 12))
t("next", GB.next_at(NOW, {**d, "last_ok": {"at": "2026-10-14T17:00:00"}}) == D.datetime(2026, 10, 14, 20, 0))

# 12. tick
calls = []
real = GB.upload
def fake_up(reason="", force=False, now=None, wait=1):
    calls.append(reason); return {"ok": True}
GB.upload = fake_up
def fresh(hours_, base_ago=None):
    """시험 상태 초기화: 프로그램을 막 켠 것처럼"""
    dd = GB.load(); dd.pop("last_ok", None); dd["sched_try"] = (NOW - base_ago).isoformat() if base_ago else ""
    GB._save(dd); GB.save_config(auto_=True, hours_=hours_)
    GB._RT.update(was_open=False, pending=False, again="", started=False); calls.clear()
# 12-1. 꺼져 있던 사이에 N시간이 지났으면 켤 때 한 번만 (밀린 횟수만큼 올리지 않는다)
fresh(2, base_ago=D.timedelta(days=2))
GB.tick(now=NOW, window_open=None)
GB.tick(now=NOW + D.timedelta(seconds=30), window_open=True)
t("catch up once at start", calls == ["앱 켤 때 (밀린 백업)"])
# 12-2. 창을 닫는 순간 (N시간과 상관없이 늘)
fresh(0, base_ago=D.timedelta(minutes=5))
GB.tick(now=NOW, window_open=True); GB.tick(now=NOW, window_open=True)
t("open: nothing", calls == [])
GB.tick(now=NOW, window_open=False)
t("closed -> upload", calls == ["앱 닫을 때"])
GB.tick(now=NOW, window_open=False)
t("only once per close", calls == ["앱 닫을 때"])
# 12-3. 켜져 있는 동안 N시간마다
fresh(2, base_ago=D.timedelta(minutes=10))
GB.tick(now=NOW, window_open=True)
t("not yet", calls == [])
GB.tick(now=NOW + D.timedelta(hours=2), window_open=True)
t("hours tick", calls == ["2시간마다"])
GB.tick(now=NOW + D.timedelta(hours=3), window_open=True)
t("hours not again", len(calls) == 1)
GB.tick(now=NOW + D.timedelta(hours=3, minutes=1), window_open=False)
t("close resets the clock", calls[-1] == "앱 닫을 때")
GB.tick(now=NOW + D.timedelta(hours=4), window_open=False)
t("no hours right after close", len(calls) == 2)
# 12-4. 올리는 중에 들어온 요청은 쌓지 않고 마지막 것만 한 번
fresh(2, base_ago=D.timedelta(minutes=10))
def busy(reason="", force=False, now=None, wait=1):
    calls.append("busy:" + reason); raise GB.BackupError("이미 올리는 중이에요", "busy")
GB.upload = busy
for r in ("앱 닫을 때", "2시간마다", "다시 시도"):
    GB.run_scheduled(r)
t("queued only last", GB._RT["again"] == "다시 시도" and GB.status()["queued"])
GB.upload = fake_up; calls.clear()
GB.tick(now=NOW + D.timedelta(minutes=11), window_open=True)
GB.tick(now=NOW + D.timedelta(minutes=12), window_open=True)
t("queued request runs once", calls == ["다시 시도"] and not GB._RT["again"])
# 12-5. 실패하면 15분 뒤 다시 (충돌은 다시 하지 않는다)
def boom(reason="", force=False, now=None, wait=1):
    calls.append("fail:" + reason); raise GB.BackupError("연결 안 됨", "network")
GB.upload = boom
GB.tick(now=NOW + D.timedelta(hours=2, minutes=15), window_open=True)   # 12-4 에서 NOW+12분에 올렸으니 그로부터 2시간
t("failure -> pending", GB._RT["pending"] and calls[-1] == "fail:2시간마다")
n = len(calls)
GB.tick(now=NOW + D.timedelta(hours=2, minutes=16), window_open=True)
t("no immediate retry", len(calls) == n)
GB._RT["next_retry"] = time.time() - 1
GB.upload = fake_up
GB.tick(now=NOW + D.timedelta(hours=2, minutes=40), window_open=True)
t("retry later", calls[-1] == "다시 시도" and not GB._RT["pending"])
def conflict(reason="", force=False, now=None, wait=1):
    raise GB.BackupError("모르는 기록", "conflict")
GB.upload = conflict
GB.run_scheduled("x")
t("conflict not retried", not GB._RT["pending"])
# 12-6. 끄면 미뤄 둔 요청도 버린다
GB._RT["again"] = "x"; GB.save_config(auto_=False); GB.tick(now=NOW, window_open=True)
t("off clears queue", not GB._RT["again"] and GB.tick(now=NOW + D.timedelta(days=1), window_open=False) is None)
GB.upload = real

# 13. 연결 해제: 토큰을 지우고 끈다
GB.save_config(auto_=True)
GB.disconnect()
t("disconnect", not GB.connected() and not GB.auto(GB.load()) and GB.load().get("repo") == FG.REPO)

srv.shutdown()
print("OK", ok, "FAIL", fail)
sys.exit(1 if fail else 0)
