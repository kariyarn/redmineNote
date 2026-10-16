"""댓글에 단축어로 삽입할 문구를 저장하는 명령어 보관함.
문구 안의 #{이름} · #{이름(인수, …)} 은 명령어 변수(상수 · JavaScript 함수)로 바꿔 넣는다. 함수는 화면(별도 Worker)에서 실행하고, 서버는 저장만 한다."""
import datetime
import re
import sqlite3

from .storage import db


def command_row(row):
    d = {key: row[key] for key in ("id", "shortcut", "description", "created_at", "updated_at")}
    d["pinned"] = bool(row["pinned"])
    return d


def command_list():
    with db() as c:
        return [command_row(row) for row in c.execute(
            "SELECT * FROM commands ORDER BY shortcut COLLATE NOCASE, id LIMIT 5000"
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
                    "INSERT INTO commands (shortcut, description, pinned, created_at, updated_at) VALUES (?,?,?,?,?)",
                    (shortcut, description, pinned, now, now),
                )
                command_id = cur.lastrowid
            except sqlite3.IntegrityError as exc:
                if "UNIQUE constraint failed" in str(exc):
                    raise ValueError("이미 사용 중인 단축어예요") from exc
                raise
        return command_row(c.execute("SELECT * FROM commands WHERE id=?", (command_id,)).fetchone())


def command_delete(command_id):
    with db() as c:
        cur = c.execute("DELETE FROM commands WHERE id=?", (command_id,))
        if not cur.rowcount:
            raise ValueError("없는 명령어예요")


# ---------- 명령어 변수 ----------
VAR_KINDS = ("const", "func")
VAR_NAME = re.compile(r"^[^\W\d]\w{0,39}$")   # 글자(한글 포함) · _ 로 시작, 글자 · 숫자 · _ 만 (40자까지)


def var_row(row):
    return {key: row[key] for key in ("id", "name", "kind", "value", "description", "created_at", "updated_at")}


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
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        var_id = data.get("id")
        try:
            if var_id:
                if not c.execute("SELECT 1 FROM cmd_vars WHERE id=?", (var_id,)).fetchone():
                    raise ValueError("없는 변수예요")
                c.execute("UPDATE cmd_vars SET name=?, kind=?, value=?, description=?, updated_at=? WHERE id=?",
                          (name, kind, value, description, now, var_id))
            else:
                var_id = c.execute("INSERT INTO cmd_vars (name, kind, value, description, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                                   (name, kind, value, description, now, now)).lastrowid
        except sqlite3.IntegrityError as exc:
            if "UNIQUE constraint failed" in str(exc):
                raise ValueError("같은 이름의 변수가 이미 있어요") from exc
            raise
        return var_row(c.execute("SELECT * FROM cmd_vars WHERE id=?", (var_id,)).fetchone())


def var_delete(var_id):
    with db() as c:
        if not c.execute("DELETE FROM cmd_vars WHERE id=?", (var_id,)).rowcount:
            raise ValueError("없는 변수예요")
