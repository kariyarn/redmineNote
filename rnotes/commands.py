"""댓글에 단축어로 삽입할 문구를 저장하는 명령어 보관함."""
import datetime
import sqlite3

from .storage import db


def command_row(row):
    return {key: row[key] for key in ("id", "shortcut", "description", "created_at", "updated_at")}


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
            c.execute("UPDATE commands SET shortcut=?, description=?, updated_at=? WHERE id=?",
                      (shortcut, description, now, command_id))
        else:
            try:
                cur = c.execute(
                    "INSERT INTO commands (shortcut, description, created_at, updated_at) VALUES (?,?,?,?)",
                    (shortcut, description, now, now),
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
