"""원격 쓰기 의도 기록. 토큰·바이너리 없이 재시작 후 미확정 요청을 차단한다."""
import datetime
import json

from .storage import db


def get_request(request_id):
    with db() as c:
        row = c.execute("SELECT * FROM write_requests WHERE request_id=?", (request_id,)).fetchone()
    return dict(row) if row else None


def unresolved(scope, issue_id):
    with db() as c:
        row = c.execute("SELECT * FROM write_requests WHERE scope=? AND issue_id=? "
                        "AND state IN ('pending','uncertain','token_rejected') ORDER BY created_at LIMIT 1",
                        (scope, issue_id)).fetchone()
    return dict(row) if row else None


def begin(request_id, scope, issue_id, signature, context):
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        # 여러 프로세스가 같은 DB를 사용해도 확인과 기록 사이에 끼어들 수 없다.
        c.execute("BEGIN IMMEDIATE")
        if c.execute("SELECT 1 FROM write_requests WHERE scope=? AND issue_id=? "
                     "AND state IN ('pending','uncertain','token_rejected')", (scope, issue_id)).fetchone():
            raise RuntimeError("확인이 필요한 요청이 이미 있어요")
        c.execute("INSERT INTO write_requests (request_id,scope,issue_id,signature,state,context,created_at,updated_at) "
                  "VALUES (?,?,?,?, 'pending',?,?,?)",
                  (request_id, scope, issue_id, signature, json.dumps(context, ensure_ascii=False), now, now))


def set_state(request_id, state):
    if state not in ("succeeded", "confirmed", "uncertain", "token_rejected", "released"):
        raise ValueError("잘못된 요청 상태")
    with db() as c:
        c.execute("UPDATE write_requests SET state=?,updated_at=? WHERE request_id=?",
                  (state, datetime.datetime.now().isoformat(timespec="seconds"), request_id))


def recently_succeeded(scope, signature):
    since = (datetime.datetime.now() - datetime.timedelta(seconds=60)).isoformat(timespec="seconds")
    with db() as c:
        return c.execute("SELECT 1 FROM write_requests WHERE scope=? AND signature=? AND state IN ('succeeded','confirmed') AND updated_at>=?",
                         (scope, signature, since)).fetchone() is not None
