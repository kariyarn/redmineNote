"""댓글에 단축어로 삽입할 문구를 저장하는 명령어 보관함.
문구 안의 #{이름} · #{이름(인수, …)} 은 명령어 변수(상수 · JavaScript 함수)로 바꿔 넣는다. 함수는 화면(별도 Worker)에서 실행하고, 서버는 저장만 한다."""
import datetime
import json
import re
import sqlite3

from .storage import db


def command_row(row):
    d = {key: row[key] for key in ("id", "shortcut", "description", "created_at", "updated_at", "position")}
    d["pinned"] = bool(row["pinned"])
    return d


def command_list():
    with db() as c:
        return [command_row(row) for row in c.execute(
            "SELECT * FROM commands ORDER BY position, id LIMIT 5000"
        )]


def command_save(data):
    shortcut = " ".join(str(data.get("shortcut") or "").split())[:40]
    description = str(data.get("description") or "").strip()[:20000]
    if not shortcut:
        raise ValueError("단축어를 입력해 주세요")
    if not description:
        raise ValueError("댓글에 넣을 설명을 입력해 주세요")
    pinned = 1 if data.get("pinned") else 0

    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        command_id = data.get("id")
        if command_id:
            old = c.execute("SELECT * FROM commands WHERE id=?", (command_id,)).fetchone()
            if not old:
                raise ValueError("없는 명령어예요")
            duplicate = c.execute(
                "SELECT id FROM commands WHERE shortcut=? COLLATE NOCASE AND id!=?",
                (shortcut, command_id),
            ).fetchone()
            if duplicate:
                raise ValueError("이미 사용 중인 단축어예요")
            c.execute("UPDATE commands SET shortcut=?, description=?, pinned=?, updated_at=? WHERE id=?",
                      (shortcut, description, pinned, now, command_id))
        else:
            try:
                cur = c.execute(
                    "INSERT INTO commands (shortcut, description, pinned, position, created_at, updated_at) "
                    "VALUES (?,?,?,?,?,?)",
                    (shortcut, description, pinned, c.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM commands").fetchone()[0], now, now),
                )
                command_id = cur.lastrowid
            except sqlite3.IntegrityError as exc:
                if "UNIQUE constraint failed" in str(exc):
                    raise ValueError("이미 사용 중인 단축어예요") from exc
                raise
        return command_row(c.execute("SELECT * FROM commands WHERE id=?", (command_id,)).fetchone())


def command_reorder(ids):
    if not isinstance(ids, list) or len(ids) > 5000 or any(type(command_id) is not int for command_id in ids):
        raise ValueError("명령어 순서가 올바르지 않아요")
    with db() as c:
        current = [row["id"] for row in c.execute("SELECT id FROM commands ORDER BY position, id LIMIT 5000")]
        if len(ids) != len(current) or set(ids) != set(current):
            raise ValueError("목록이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요")
        for position, command_id in enumerate(ids):
            c.execute("UPDATE commands SET position=? WHERE id=?", (position, command_id))
        return [command_row(row) for row in c.execute("SELECT * FROM commands ORDER BY position, id LIMIT 5000")]


def command_delete(command_id):
    with db() as c:
        cur = c.execute("DELETE FROM commands WHERE id=?", (command_id,))
        if not cur.rowcount:
            raise ValueError("없는 명령어예요")


# ---------- 명령어 변수 ----------
VAR_KINDS = ("const", "func")
VAR_NAME = re.compile(r"^[^\W\d]\w{0,39}$")   # 글자(한글 포함) · _ 로 시작, 글자 · 숫자 · _ 만 (40자까지)
# 함수 인자: 이름 · 타입 · 기본값. 함수 본문에서 이름 그대로 쓴다 (args[i] 도 계속 된다)
PARAM_MAX = 10
PARAM_TYPES = ("string", "number", "boolean", "date")
PARAM_NAME = re.compile(r"^[^\W\d]\w{0,29}$")
PARAM_RESERVED = {"ctx", "args", "arguments", "eval", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
                  "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if",
                  "implements", "import", "in", "instanceof", "interface", "let", "new", "null", "package", "private", "protected",
                  "public", "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "undefined", "var",
                  "void", "while", "with", "yield"}
BOOL_WORDS = {"true", "false", "1", "0", "예", "아니오", "y", "n", "yes", "no"}
DATE_WORD = re.compile(r"^(\d{4}-\d{2}-\d{2}|오늘|today|[+-]\d{1,4})$", re.I)   # 날짜 · 오늘 · +3 / -1 (오늘부터 며칠)


def clean_params(raw):
    """[{name, type, default}] 를 검사해 정리한다. 함수가 아니면 쓰지 않는다."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or "[]")
        except ValueError:
            raw = []
    if not isinstance(raw, list):
        raise ValueError("인자 목록이 잘못됐어요")
    if len(raw) > PARAM_MAX:
        raise ValueError(f"인자는 {PARAM_MAX}개까지예요")
    out, seen = [], set()
    for i, p in enumerate(raw, 1):
        p = p if isinstance(p, dict) else {}
        name = str(p.get("name") or "").strip()
        ptype = str(p.get("type") or "string")
        default = str(p.get("default") if p.get("default") is not None else "").strip()[:200]
        if not PARAM_NAME.match(name):
            raise ValueError(f"{i}번째 인자 이름은 글자나 _ 로 시작하고, 글자 · 숫자 · _ 만 쓸 수 있어요 (30자까지)")
        if name in PARAM_RESERVED:
            raise ValueError(f"‘{name}’ 은 인자 이름으로 쓸 수 없어요 (JavaScript 예약어 · ctx · args)")
        if name in seen:
            raise ValueError(f"인자 이름 ‘{name}’ 이 겹쳐요")
        if ptype not in PARAM_TYPES:
            raise ValueError(f"{i}번째 인자의 타입이 잘못됐어요")
        if default:
            if ptype == "number":
                try:
                    float(default)
                except ValueError:
                    raise ValueError(f"‘{name}’ 의 기본값은 숫자여야 해요") from None
            elif ptype == "boolean" and default.lower() not in BOOL_WORDS:
                raise ValueError(f"‘{name}’ 의 기본값은 true / false (예 / 아니오) 여야 해요")
            elif ptype == "date" and not DATE_WORD.match(default):
                raise ValueError(f"‘{name}’ 의 기본값은 YYYY-MM-DD · 오늘 · +3 처럼 써야 해요")
        seen.add(name)
        out.append({"name": name, "type": ptype, "default": default})
    return out


def var_row(row):
    d = {key: row[key] for key in ("id", "name", "kind", "value", "description", "created_at", "updated_at")}
    try:
        d["params"] = json.loads(row["params"] or "[]") if row["kind"] == "func" else []
    except ValueError:
        d["params"] = []
    return d


def var_list():
    with db() as c:
        return [var_row(row) for row in c.execute("SELECT * FROM cmd_vars ORDER BY name COLLATE NOCASE, id LIMIT 5000")]


def var_save(data):
    name = str(data.get("name") or "").strip()
    kind = str(data.get("kind") or "const")
    value = str(data.get("value") or "")[:20000]
    description = " ".join(str(data.get("description") or "").split())[:200]
    if not VAR_NAME.match(name):
        raise ValueError("변수 이름은 글자나 _ 로 시작하고, 글자 · 숫자 · _ 만 쓸 수 있어요 (40자까지)")
    if kind not in VAR_KINDS:
        raise ValueError("변수 유형은 상수 또는 함수예요")
    if kind == "func" and not value.strip():
        raise ValueError("함수 내용을 입력해 주세요 (값을 return 하는 JavaScript)")
    params = json.dumps(clean_params(data.get("params") or []) if kind == "func" else [], ensure_ascii=False)
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        var_id = data.get("id")
        try:
            if var_id:
                if not c.execute("SELECT 1 FROM cmd_vars WHERE id=?", (var_id,)).fetchone():
                    raise ValueError("없는 변수예요")
                c.execute("UPDATE cmd_vars SET name=?, kind=?, value=?, params=?, description=?, updated_at=? WHERE id=?",
                          (name, kind, value, params, description, now, var_id))
            else:
                var_id = c.execute("INSERT INTO cmd_vars (name, kind, value, params, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                                   (name, kind, value, params, description, now, now)).lastrowid
        except sqlite3.IntegrityError as exc:
            if "UNIQUE constraint failed" in str(exc):
                raise ValueError("같은 이름의 변수가 이미 있어요") from exc
            raise
        return var_row(c.execute("SELECT * FROM cmd_vars WHERE id=?", (var_id,)).fetchone())


def var_delete(var_id):
    with db() as c:
        if not c.execute("DELETE FROM cmd_vars WHERE id=?", (var_id,)).rowcount:
            raise ValueError("없는 변수예요")
