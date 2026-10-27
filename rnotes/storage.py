"""SQLite(db) · 스키마(init_db) · 설정값 · 백업/복원"""
import datetime
import io
import json
import shutil
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

from .config import APP_VERSION, AUTO_BACKUP_KEEP, BACKUP_DIR, CFG, DB_PATH, FONT_DIR, FONT_EXT, HOME_DIR, STATE, UPGRADE_BACKUP_KEEP, _write_config, conn
from .textutil import plain


def note_count():
    try:
        with db() as c:
            return c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    except Exception:
        return 0


def configured():
    return bool(conn.url and conn.key)


if "api_key" in CFG and conn.key and "api_key_enc" not in CFG and sys.platform == "win32":
    try:  # 예전에 평문으로 저장된 키는 이번 실행에서 암호화해서 다시 저장한다
        _write_config(conn.url, conn.key, conn.dev_field)
    except Exception:
        pass


def save_config(url, key, field_id):
    """설정 파일에 저장하고 바로 적용한다. API 키는 이 파일에만 있고 화면으로는 돌려주지 않는다."""
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    _write_config(url, key, field_id)
    conn.url, conn.key, conn.dev_field = url, key, field_id
    STATE["me_id"] = STATE["me_name"] = None


# ---------- DB ----------
def db():
    c = sqlite3.connect(DB_PATH, timeout=30)   # 다른 저장과 겹쳐도 30초까지 기다린다 (database is locked 방지)
    c.row_factory = sqlite3.Row
    return c


def _ver(v):
    return tuple(int(x) if x.isdigit() else 0 for x in str(v or "0").split("."))


def pre_upgrade_check():
    """프로그램 버전이 바뀐 뒤 처음 켤 때, DB 구조를 손대기 전에 백업을 따로 만든다.
    DB 가 더 새 버전으로 만들어진 것이면(낮은 프로그램으로 열면) 아무것도 바꾸지 않고 경고만 한다."""
    if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
        return
    with db() as c:
        names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "notes" not in names:
            return
        row = c.execute("SELECT value FROM settings WHERE key='app_version'").fetchone() if "settings" in names else None
    stored = row[0] if row else "0"
    if _ver(stored) > _ver(APP_VERSION):
        STATE["newer_db"] = stored
        return
    if stored != APP_VERSION:
        try:
            BACKUP_DIR.mkdir(exist_ok=True)
            snapshot_zip(BACKUP_DIR / f"before-upgrade-v{stored}-to-v{APP_VERSION}-{stamp()}.zip")
            for old in sorted(BACKUP_DIR.glob("before-upgrade-*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)[UPGRADE_BACKUP_KEEP:]:
                old.unlink()
        except Exception:
            pass  # 백업이 안 돼도 구조 변경은 '추가만' 하므로 계속 진행


# 명령어 변수 기본값. (판, 이름, 유형, 값, 인자, 설명) — 판마다 한 번만 넣는다 (지우거나 고쳐도 다시 넣지 않고, 같은 이름이 있으면 건너뛴다).
# 1판: 예전 날짜 자동 입력 #{nextTue} · #{nextThu} 를 잇는다. 2판: 함수 도움말의 예제들 (인자 사용)
DEFAULT_CMD_VARS = (
    (1, "today", "func", "return ctx.fmt(ctx.now);", [], "오늘 날짜 (YYYY-MM-DD)"),
    (1, "nextTue", "func", "return ctx.fmt(ctx.nextWeekday(2));", [], "돌아오는 화요일 (오늘이 화요일이면 오늘)"),
    (1, "nextThu", "func", "return ctx.fmt(ctx.nextWeekday(4));", [], "돌아오는 목요일 (오늘이 목요일이면 오늘)"),
    (2, "after", "func", "return ctx.fmt(ctx.addDays(days));",
     [{"name": "days", "type": "number", "default": "1"}], "며칠 뒤 날짜: #{after(3)}"),
    (2, "now", "func", "return ctx.fmt(ctx.now, format);",
     [{"name": "format", "type": "string", "default": "YYYY-MM-DD HH:mm"}], "형식을 정한 지금 시각: #{now(MM/DD HH:mm)}"),
    (2, "next", "func", "const w = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }[day];\nreturn ctx.fmt(ctx.nextWeekday(w ?? 2));",
     [{"name": "day", "type": "string", "default": "화"}], "돌아오는 요일(한글): #{next(목)}"),
    (2, "dday", "func", "const today = new Date(ctx.now);\ntoday.setHours(0, 0, 0, 0);\nconst d = Math.round((target - today) / 86400000);\n"
     "return d > 0 ? `D-${d}` : d === 0 ? \"D-Day\" : `D+${-d}`;",
     [{"name": "target", "type": "date", "default": "오늘"}], "남은 날: #{dday(2026-12-31)}"),
    (2, "issueTitle", "func", "if (!ctx.issue) return \"\";\nreturn `#${ctx.issue.id} ${ctx.issue.subject}`;", [], "지금 일감 번호와 제목"),
    (2, "sign", "func", "return `${ctx.vars.team ?? \"\"} ${ctx.me.name}`.trim();", [], "상수 team 과 내 이름 (team 이 없으면 이름만)"),
)


def seed_cmd_vars(c):
    row = c.execute("SELECT value FROM settings WHERE key='cmd_vars_seeded'").fetchone()
    done = int(row[0]) if row and str(row[0]).isdigit() else 0
    todo = [v for v in DEFAULT_CMD_VARS if v[0] > done]
    if not todo:
        return
    now = datetime.datetime.now().isoformat(timespec="seconds")
    for _, name, kind, value, params, desc in todo:
        c.execute("INSERT OR IGNORE INTO cmd_vars (name, kind, value, params, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                  (name, kind, value, json.dumps(params, ensure_ascii=False), desc, now, now))
    c.execute("INSERT INTO settings (key,value) VALUES ('cmd_vars_seeded',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              (str(max(v[0] for v in DEFAULT_CMD_VARS)),))


def init_db():
    pre_upgrade_check()
    with db() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS notes (
                issue_id INTEGER PRIMARY KEY,
                subject TEXT, project TEXT, tracker TEXT, rm_status TEXT,
                author TEXT, assignee TEXT, updated_on TEXT,
                description TEXT, journals TEXT, roles TEXT,
                requirement TEXT DEFAULT '', action TEXT DEFAULT '',
                work_status TEXT DEFAULT '대기'
            );
            CREATE TABLE IF NOT EXISTS terms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                term TEXT UNIQUE, description TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS links (
                src INTEGER, dst INTEGER, kind TEXT,
                PRIMARY KEY (src, dst, kind)
            );
            -- 권한 없음/삭제 등으로 받을 수 없는 일감 (자동 재시도 방지)
            CREATE TABLE IF NOT EXISTS skipped (
                issue_id INTEGER PRIMARY KEY, reason TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY, value TEXT
            );
            -- 일감별 진행 기록: 같은 일감도 날짜마다 "어디까지 했는지"를 따로 남긴다
            CREATE TABLE IF NOT EXISTS progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_id INTEGER, day TEXT, text TEXT,
                created_at TEXT, updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_progress_issue ON progress(issue_id);
            -- 노트마다 내가 적는 할 일 체크리스트
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_id INTEGER, text TEXT, done INTEGER DEFAULT 0,
                pos INTEGER DEFAULT 0, created_at TEXT, done_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_todos_issue ON todos(issue_id);
            -- 앱이 레드마인에 쓴 내용의 기록 (댓글 · 상태 · 담당자)
            CREATE TABLE IF NOT EXISTS write_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                at TEXT, issue_id INTEGER, action TEXT, sig TEXT,
                payload TEXT, ok INTEGER, result TEXT
            );
            -- 포스트잇 메모: 레드마인·사전·검색과 상관없는 별개의 메모 (하루 = 보드 한 장)
            CREATE TABLE IF NOT EXISTS sticky (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL, text TEXT DEFAULT '', color TEXT DEFAULT 'yellow',
                x REAL DEFAULT 40, y REAL DEFAULT 40, w REAL DEFAULT 220, h REAL DEFAULT 200, z INTEGER DEFAULT 1,
                pinned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sticky_day ON sticky(day);
            -- 트러블슈팅: 레드마인·사전·검색과 상관없는 독립 정리집 (한 건 = 증상/원인/해결/참고 한 장)
            CREATE TABLE IF NOT EXISTS trouble (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT '', status TEXT DEFAULT '진행 중', tags TEXT DEFAULT '[]',
                symptom TEXT DEFAULT '', cause TEXT DEFAULT '', solution TEXT DEFAULT '', notes TEXT DEFAULT '',
                rm_no TEXT DEFAULT '', day TEXT, created_at TEXT, updated_at TEXT
            );
            -- 쿼리 보관함 (2.10): 자주 쓰는 SQL 한 건 = 제목 · 용도 · DB 종류 · 쿼리 · 태그 · 고정 · 사용 횟수
            CREATE TABLE IF NOT EXISTS queries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT '', purpose TEXT DEFAULT '', db_kind TEXT DEFAULT '', lang TEXT DEFAULT '', sql TEXT DEFAULT '', tags TEXT DEFAULT '[]', rm_nos TEXT DEFAULT '[]', code_locs TEXT DEFAULT '[]',
                pinned INTEGER DEFAULT 0, use_count INTEGER DEFAULT 0, last_used_at TEXT DEFAULT '',
                day TEXT, created_at TEXT, updated_at TEXT
            );
            -- 코드/쿼리 보관함의 버전 메모(고치기 직전 내용, 항목마다 최근 10개)
            CREATE TABLE IF NOT EXISTS query_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, query_id INTEGER NOT NULL,
                title TEXT DEFAULT '', purpose TEXT DEFAULT '', lang TEXT DEFAULT '', sql TEXT DEFAULT '', saved_at TEXT
            );
            -- 명령어 보관함: 댓글에 단축어로 삽입할 문구
            CREATE TABLE IF NOT EXISTS commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shortcut TEXT NOT NULL, description TEXT NOT NULL,
                created_at TEXT, updated_at TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_commands_shortcut ON commands(shortcut COLLATE NOCASE);
            -- 명령어 변수: 문구 안의 #{이름} 을 바꿔 넣는다. kind = const(값 그대로) / func(JavaScript 함수 본문을 실행한 결과)
            CREATE TABLE IF NOT EXISTS cmd_vars (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'const', value TEXT NOT NULL DEFAULT '',
                params TEXT DEFAULT '[]', description TEXT DEFAULT '', created_at TEXT, updated_at TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cmd_vars_name ON cmd_vars(name COLLATE NOCASE);
            -- 메모 알림: 날짜(또는 기간)마다 '확인했는지 / 다시 알림 시각'을 기록 (없으면 아직 확인 안 한 것)
            CREATE TABLE IF NOT EXISTS sticky_alarm (
                sticky_id INTEGER NOT NULL, date TEXT NOT NULL, acked_at TEXT, snooze_until TEXT,
                PRIMARY KEY (sticky_id, date)
            );
            -- 원문 꾸미기 (2.26): 레드마인 원문은 그대로 두고, 고른 글자 위에 형광펜 · 밑줄 · 굵게 · 메모를 덧입힌다.
            -- 고른 글자(quote)와 그 앞뒤 글자(prefix · suffix)로 다시 찾는다 (원문이 조금 바뀌어도 따라가도록). start 는 찾을 때의 참고 위치
            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL,
                quote TEXT NOT NULL, prefix TEXT DEFAULT '', suffix TEXT DEFAULT '', start INTEGER DEFAULT 0,
                color TEXT DEFAULT '', under INTEGER DEFAULT 0, bold INTEGER DEFAULT 0, memo TEXT DEFAULT '',
                created_at TEXT, updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_annotations_issue ON annotations(issue_id);
            -- 코드 이력의 이름(테이블·파일·함수)마다 내가 붙이는 설명
            CREATE TABLE IF NOT EXISTS code_notes (
                token TEXT PRIMARY KEY, description TEXT, updated_at TEXT
            );
            """
        )
        # 기존 DB에 새 칸이 없으면 추가한다.
        cols = {r["name"] for r in c.execute("PRAGMA table_info(notes)")}
        for col in ("code_change", "reason"):
            if col not in cols:
                c.execute(f"ALTER TABLE notes ADD COLUMN {col} TEXT DEFAULT ''")
        if "desc_raw" not in cols:  # 2.4: 본문 원문(HTML/Textile 그대로: 사진 표시용)
            c.execute("ALTER TABLE notes ADD COLUMN desc_raw TEXT DEFAULT ''")
        if "changes" not in cols:  # 2.4: 상태·담당자 등 변경 이력 (이름으로 풀어서 저장)
            c.execute("ALTER TABLE notes ADD COLUMN changes TEXT DEFAULT '[]'")
        if "author_id" not in cols:  # 2.16.1: 작성자 레드마인 ID (0 = 아직 모름 → 다음 가져오기에서 다시 받아 채운다)
            c.execute("ALTER TABLE notes ADD COLUMN author_id INTEGER DEFAULT 0")
        if "starred" not in cols:  # 즐겨찾기(상단 고정)
            c.execute("ALTER TABLE notes ADD COLUMN starred INTEGER DEFAULT 0")
        if "rec_mode" not in cols:
            # 기록 모드: 'none'(기록 불필요, 기본) / 'record'(기록). 이미 뭔가 써 둔 노트는 처음 한 번만 '기록'으로 옮긴다.
            c.execute("ALTER TABLE notes ADD COLUMN rec_mode TEXT DEFAULT 'none'")
            c.execute(
                "UPDATE notes SET rec_mode='record' WHERE"
                " TRIM(COALESCE(action,''))!='' OR TRIM(COALESCE(code_change,''))!=''"
                " OR TRIM(COALESCE(reason,''))!=''"
                " OR (TRIM(COALESCE(requirement,''))!='' AND TRIM(requirement)!=TRIM(COALESCE(description,'')))"
                " OR issue_id IN (SELECT issue_id FROM progress)"
            )
        tcols = {r["name"] for r in c.execute("PRAGMA table_info(terms)")}
        if "aliases" not in tcols:  # 대체 용어 (쉼표로 구분)
            c.execute("ALTER TABLE terms ADD COLUMN aliases TEXT DEFAULT ''")
        scols = {r["name"] for r in c.execute("PRAGMA table_info(sticky)")}
        if "pinned" not in scols:  # 2.3.1: 고정(핀)
            c.execute("ALTER TABLE sticky ADD COLUMN pinned INTEGER DEFAULT 0")
        q_cols = {r["name"] for r in c.execute("PRAGMA table_info(queries)")}
        if "rm_nos" not in q_cols:  # 2.11.0: 쿼리에 연관된 레드마인 번호들 (JSON 목록)
            c.execute("ALTER TABLE queries ADD COLUMN rm_nos TEXT DEFAULT '[]'")
        if "lang" not in q_cols:  # 2.13.0: 언어(비어 있으면 자동 추정)
            c.execute("ALTER TABLE queries ADD COLUMN lang TEXT DEFAULT ''")
        if "code_locs" not in q_cols:  # 2.13.0: 코드 위치(클래스 · 파일 이름 등, JSON 목록)
            c.execute("ALTER TABLE queries ADD COLUMN code_locs TEXT DEFAULT '[]'")
        pg_cols = {r["name"] for r in c.execute("PRAGMA table_info(progress)")}
        for col, ddl in (("x", "REAL"), ("y", "REAL"), ("w", "REAL"), ("h", "REAL"), ("z", "INTEGER DEFAULT 0"),
                         ("color", "TEXT DEFAULT ''"), ("pinned", "INTEGER DEFAULT 0")):
            if col not in pg_cols:  # 2.23.0: 진행 기록 보드(포스트잇)의 자리 · 크기 · 색 · 고정 (x 가 비어 있으면 아직 놓지 않은 것)
                c.execute(f"ALTER TABLE progress ADD COLUMN {col} {ddl}")
        todo_cols = {r["name"] for r in c.execute("PRAGMA table_info(todos)")}
        if "archived_at" not in todo_cols:  # 2.8.0: 완료한 체크리스트를 지우지 않고 '보관'(숨김)
            c.execute("ALTER TABLE todos ADD COLUMN archived_at TEXT")
        for col, ddl in (("remind_time", "TEXT DEFAULT ''"), ("armed_at", "TEXT DEFAULT ''"), ("wake", "INTEGER DEFAULT 0"), ("alarm_dates", "TEXT DEFAULT ''")):
            if col not in scols:  # 2.8.1: 메모 알림 (시각 · 알림을 건 시각 · 창이 닫혀 있어도 앱을 다시 열지)
                c.execute(f"ALTER TABLE sticky ADD COLUMN {col} {ddl}")
        if "imgs" not in scols:  # 2.24.0: 붙여 넣은 사진 이름들 (JSON 목록, 파일은 데이터 폴더의 memo_img/)
            c.execute("ALTER TABLE sticky ADD COLUMN imgs TEXT DEFAULT '[]'")
        if "until" not in scols:  # 2.7.0: 노출 기간의 종료일 (비어 있으면 그 날 하루만)
            c.execute("ALTER TABLE sticky ADD COLUMN until TEXT DEFAULT ''")
        cmd_cols = {r["name"] for r in c.execute("PRAGMA table_info(commands)")}
        if "pinned" not in cmd_cols:  # 2.18.0: 버튼으로 꺼내 두기 (명령어가 많아 선택칸으로 접혀도 버튼으로 남긴다)
            c.execute("ALTER TABLE commands ADD COLUMN pinned INTEGER DEFAULT 0")
        if "position" not in cmd_cols:  # 2.21.2: 등록 순서와 사용자가 바꾼 순서 보존
            c.execute("ALTER TABLE commands ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
            for position, row in enumerate(c.execute("SELECT id FROM commands ORDER BY id")):
                c.execute("UPDATE commands SET position=? WHERE id=?", (position, row["id"]))
        if "params" not in {r["name"] for r in c.execute("PRAGMA table_info(cmd_vars)")}:  # 2.18.0: 함수 인자 [{name, type, default}]
            c.execute("ALTER TABLE cmd_vars ADD COLUMN params TEXT DEFAULT '[]'")
        seed_cmd_vars(c)
        repair_truncated_requirements(c)
        c.execute("DELETE FROM settings WHERE key='holiday_api'")  # 2.22.7: 공휴일 API 를 뺐다 — 받아 두었던 공휴일 · 오류 기록을 지운다 (쉬는 날은 내장 표 · 추가 휴일로)
        if not STATE["newer_db"]:  # 더 새 버전의 DB 는 버전 기록을 낮추지 않는다
            c.execute("INSERT INTO settings (key,value) VALUES ('app_version',?) "
                      "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (APP_VERSION,))


def get_settings():
    with db() as c:
        return {r["key"]: r["value"] for r in c.execute("SELECT key, value FROM settings")}


# ---------- 백업 / 복원 ----------
def stamp():
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def snapshot_zip(dest):
    """DB(안전한 스냅샷)와 등록한 폰트를 zip 하나로 묶는다."""
    tmp = Path(tempfile.mkdtemp())
    try:
        snap = tmp / "notes.db"
        src, dst = sqlite3.connect(DB_PATH), sqlite3.connect(snap)
        try:
            src.backup(dst)
        finally:
            src.close()
            dst.close()
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(snap, "notes.db")
            if FONT_DIR.exists():
                for f in FONT_DIR.iterdir():
                    if f.is_file():
                        z.write(f, "fonts/" + f.name)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def list_backups():
    BACKUP_DIR.mkdir(exist_ok=True)
    out = []
    for f in sorted(BACKUP_DIR.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True):
        st = f.stat()
        out.append(
            {
                "name": f.name,
                "size": st.st_size,
                "mtime": datetime.datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
            }
        )
    return out


def ensure_daily_backup():
    """하루에 한 번 자동 백업하고, 오래된 자동 백업은 정리한다."""
    BACKUP_DIR.mkdir(exist_ok=True)
    today = BACKUP_DIR / f"auto-{datetime.date.today():%Y%m%d}.zip"
    if not today.exists():
        snapshot_zip(today)
    for old in sorted(BACKUP_DIR.glob("auto-*.zip"), reverse=True)[AUTO_BACKUP_KEEP:]:
        old.unlink(missing_ok=True)


def backup_path(name):
    """백업 폴더 안의 zip만 허용한다 (경로 조작 방지)."""
    if not name or "/" in name or "\\" in name or not name.endswith(".zip"):
        return None
    p = BACKUP_DIR / name
    return p if p.is_file() else None


def restore_bytes(data):
    """zip(또는 .db) 백업으로 현재 데이터를 교체한다. 교체 직전에 안전 백업을 만든다."""
    tmp = Path(tempfile.mkdtemp())
    try:
        fonts = []
        if data[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = z.namelist()
                if "notes.db" not in names:
                    raise ValueError("notes.db 가 없는 백업 파일입니다")
                (tmp / "notes.db").write_bytes(z.read("notes.db"))
                for n in names:
                    base = Path(n).name
                    if n.startswith("fonts/") and base and Path(base).suffix.lower() in FONT_EXT:
                        fonts.append((base, z.read(n)))
        elif data[:16] == b"SQLite format 3\x00":
            (tmp / "notes.db").write_bytes(data)
        else:
            raise ValueError("지원하지 않는 파일입니다 (이 프로그램이 만든 zip 또는 db 파일만 가능)")

        chk = sqlite3.connect(tmp / "notes.db")
        try:
            tabs = {r[0] for r in chk.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"notes", "terms"} <= tabs:
                raise ValueError("이 프로그램의 백업 파일이 아닙니다")
            if chk.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("손상된 파일입니다")
        finally:
            chk.close()

        BACKUP_DIR.mkdir(exist_ok=True)
        snapshot_zip(BACKUP_DIR / f"before-restore-{stamp()}.zip")  # 되돌릴 수 있게
        src, dst = sqlite3.connect(tmp / "notes.db"), sqlite3.connect(DB_PATH)
        try:
            src.backup(dst)
        finally:
            src.close()
            dst.close()
        FONT_DIR.mkdir(exist_ok=True)
        for base, b in fonts:
            (FONT_DIR / base).write_bytes(b)
        init_db()  # 옛 버전 백업이면 새 칸을 보강한다
        with db() as c:
            n = c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
            t = c.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
        return {"notes": n, "terms": t, "fonts": len(fonts)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)




def repair_truncated_requirements(c):
    """예전 버전은 요건 초안을 500자에서 잘라 '...'을 붙였다. 직접 고치지 않은 것만 원문 전체로 복구한다."""
    n = 0
    for r in c.execute(
        "SELECT issue_id, description, requirement FROM notes WHERE requirement LIKE '%...'"
    ).fetchall():
        old = plain(r["description"])  # 예전 방식(이중 가공)
        if len(old) > 500 and r["requirement"] == old[:500] + "...":
            c.execute(
                "UPDATE notes SET requirement=? WHERE issue_id=?", (r["description"], r["issue_id"])
            )
            n += 1
    return n
