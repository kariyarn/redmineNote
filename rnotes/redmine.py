"""레드마인 읽기: API 호출 · 캐시 · 가져오기(sync) · 일감 저장(upsert) · 연관 일감"""
import datetime
import json
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .config import LINKED_LIMIT, STATE, conn
from .storage import configured, db, ensure_daily_backup
from .textutil import make_draft, plain


# ---------- Redmine ----------
class SyncError(Exception):
    """가져오기를 이어갈 수 없는 오류. 메시지는 사용자에게 그대로 보여 줄 한국어 설명이다."""


def explain(e):
    """예외 -> (종류, 사용자용 사유, 조치 안내, 건너뜀 여부). 건너뜀 = 정상적으로 못 받는 일감(권한 없음·삭제됨)."""
    if isinstance(e, urllib.error.HTTPError):
        c = e.code
        if c == 401:
            return ("key", "API 키가 거절됐어요", "설정에서 API 키를 다시 입력하세요", False)
        if c == 403:
            return ("forbidden", "볼 권한이 없는 일감이에요", "정상입니다. 자동으로 건너뜁니다", True)
        if c == 404:
            return ("gone", "삭제됐거나 없는 일감이에요", "정상입니다. 자동으로 건너뜁니다", True)
        if c == 429:
            return ("busy", "레드마인이 요청을 제한하고 있어요", "잠시 뒤에 다시 가져오세요", False)
        if c >= 500:
            return ("server", f"레드마인 서버 오류예요 (HTTP {c})", "잠시 뒤에 다시 가져오세요", False)
        return ("http", f"레드마인이 오류로 응답했어요 (HTTP {c})", "같은 오류가 계속되면 알려 주세요", False)
    if isinstance(e, TimeoutError) or "timed out" in str(e).lower():
        return ("timeout", "레드마인 응답이 너무 늦어요 (시간 초과)", "VPN·네트워크를 확인하고 다시 가져오세요", False)
    if isinstance(e, urllib.error.URLError):
        return ("network", "레드마인에 연결할 수 없어요", "VPN·네트워크를 확인하고 다시 가져오세요", False)
    if isinstance(e, sqlite3.OperationalError) and "locked" in str(e).lower():
        return ("locked", "저장소를 잠시 다른 곳에서 쓰고 있어요", "잠시 뒤에 다시 가져오세요", False)
    if isinstance(e, (KeyError, ValueError, json.JSONDecodeError)):
        return ("data", "레드마인 응답 형식이 예상과 달라요", f"자세한 값: {e}", False)
    return ("other", "알 수 없는 오류예요", str(e)[:120], False)


def rm_get(path, params, retries=2):
    """레드마인 GET. 일시적인 오류(서버 5xx·제한·시간 초과·연결 끊김)는 잠깐 쉬었다가 최대 2번 다시 시도한다."""
    url = f"{conn.url}{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"X-Redmine-API-Key": conn.key})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if (e.code >= 500 or e.code == 429) and attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            slow = isinstance(e, TimeoutError) or "timed out" in str(e).lower()
            if attempt < (1 if slow else retries):  # 응답이 늦는 경우는 1번만 다시 시도한다 (한 건에 몇 분씩 걸리지 않게)
                time.sleep(1.5 * (attempt + 1))
                continue
            raise


def my_id():
    """내 레드마인 사용자 번호 (내가 단 댓글을 찾는 데 쓴다)."""
    if STATE["me_id"] is None and configured():
        try:
            u = rm_get("/users/current.json", {})["user"]
            STATE["me_id"] = u["id"]
            STATE["me_name"] = ((u.get("lastname") or "") + (u.get("firstname") or "")).strip() or u.get("login")
        except Exception:
            return None
    return STATE["me_id"]


def check_login(url, key):
    """입력한 주소·키로 레드마인에 로그인되는지 확인하고 사용자 정보를 돌려준다."""
    req = urllib.request.Request(f"{url}/users/current.json", headers={"X-Redmine-API-Key": key})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))["user"]
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ValueError("API 키가 올바르지 않습니다. 레드마인 '내 계정'에서 키를 다시 복사해 보세요.")
        raise ValueError(f"레드마인이 오류로 응답했습니다 ({e.code}). 주소를 확인하세요.")
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ValueError("레드마인에 연결할 수 없습니다. 주소와 네트워크(VPN)를 확인하세요.")
    except Exception:
        raise ValueError("레드마인 응답을 읽을 수 없습니다. 주소가 맞는지 확인하세요.")


def fetch_list(extra, date_from, date_to):
    """기간 내 수정된 일감 목록(가벼운 정보)을 페이지 단위로 모두 가져온다."""
    found, offset = {}, 0
    while True:
        params = {
            "status_id": "*",
            "updated_on": f"><{date_from}|{date_to}",
            "limit": 100,
            "offset": offset,
            **extra,
        }
        data = rm_get("/issues.json", params)
        for i in data["issues"]:
            found[i["id"]] = i
        offset += 100
        if offset >= data["total_count"]:
            return found


def collect_links(iid, full, description, journals):
    """상위/하위/관계 일감과 본문에 적힌 #번호 언급을 모은다."""
    out = set()
    if full.get("parent"):
        out.add((iid, full["parent"]["id"], "상위"))
    for r in full.get("relations", []):
        other = r["issue_to_id"] if r["issue_id"] == iid else r["issue_id"]
        out.add((iid, other, "관계:" + r["relation_type"]))
    text = description + "\n" + "\n".join(j["notes"] for j in journals)
    for m in re.findall(r"#(\d{4,6})\b", text):
        if int(m) != iid:
            out.add((iid, int(m), "언급"))
    return out


# ---------- 변경 이력 (레드마인 journal details) -> 이름으로 풀어서 저장 ----------
_NAMES = {}
_ATTR_LABEL = {"status_id": "상태", "assigned_to_id": "담당자", "priority_id": "우선순위", "tracker_id": "트래커", "done_ratio": "진척도",
               "subject": "제목", "description": "설명", "project_id": "프로젝트", "category_id": "분류", "fixed_version_id": "대상 버전",
               "parent_id": "상위 일감", "start_date": "시작일", "due_date": "완료기한", "estimated_hours": "추정 시간", "is_private": "비공개"}
_REL = {"relates": "관련", "duplicates": "중복", "duplicated": "중복됨", "blocks": "선행", "blocked": "후행", "precedes": "앞", "follows": "뒤",
        "copied_to": "복사됨", "copied_from": "복사 원본"}


def _cached_name(key, fn):
    if key in _NAMES:
        return _NAMES[key]
    try:
        v = fn()
    except Exception:
        v = None
    _NAMES[key] = v
    return v


def user_name(uid):
    def load():
        u = rm_get(f"/users/{int(uid)}.json", {})["user"]
        return " ".join(f'{u.get("lastname", "")} {u.get("firstname", "")}'.split()) or u.get("login")
    return _cached_name(("user", str(uid)), load)


def _lookup(kind, val):
    if val in (None, ""):
        return ""
    v = str(val)
    try:
        if kind == "status_id":
            return next((x["name"] for x in rm_statuses() if str(x["id"]) == v), None) or f"#{v}"
        if kind == "tracker_id":
            lst = _cached_name(("trackers",), lambda: rm_get("/trackers.json", {})["trackers"]) or []
            return next((x["name"] for x in lst if str(x["id"]) == v), None) or f"#{v}"
        if kind == "priority_id":
            lst = _cached_name(("prio",), lambda: rm_get("/enumerations/issue_priorities.json", {})["issue_priorities"]) or []
            return next((x["name"] for x in lst if str(x["id"]) == v), None) or f"#{v}"
        if kind == "assigned_to_id":
            return user_name(v) or f"#{v}"
        if kind == "project_id":
            return _cached_name(("project", v), lambda: rm_get(f"/projects/{v}.json", {})["project"]["name"]) or f"#{v}"
        if kind == "category_id":
            return _cached_name(("cat", v), lambda: rm_get(f"/issue_categories/{v}.json", {})["issue_category"]["name"]) or f"#{v}"
        if kind == "fixed_version_id":
            return _cached_name(("ver", v), lambda: rm_get(f"/versions/{v}.json", {})["version"]["name"]) or f"#{v}"
        if kind == "parent_id":
            return f"#{v}"
        if kind == "done_ratio":
            return f"{v}%"
        if kind == "is_private":
            return "예" if v in ("1", "true") else "아니오"
    except Exception:
        pass
    return v


def build_changes(full):
    """journals 의 변경 내역을 사람이 읽는 말로. [{id, user, created_on, items:[{label, old, new, note}]}]"""
    cf_names = {str(c.get("id")): c.get("name") for c in full.get("custom_fields", [])}
    out = []
    for j in full.get("journals", []):
        items = []
        for dt in j.get("details", []) or []:
            prop, name, old, new = dt.get("property"), str(dt.get("name")), dt.get("old_value"), dt.get("new_value")
            if prop == "attr":
                if name == "description":
                    items.append({"label": "설명", "note": "수정됨"})
                elif name == "subject":
                    items.append({"label": "제목", "old": old or "", "new": new or ""})
                else:
                    items.append({"label": _ATTR_LABEL.get(name, name), "old": _lookup(name, old), "new": _lookup(name, new)})
            elif prop == "cf":
                label = cf_names.get(name) or f"항목 {name}"
                is_user = "담당자" in label

                def val(x):
                    if x in (None, ""):
                        return ""
                    return (user_name(x) or f"#{x}") if is_user and str(x).isdigit() else str(x)
                items.append({"label": label, "old": val(old), "new": val(new)})
            elif prop == "attachment":
                items.append({"label": "첨부", "new": new or name})
            elif prop == "relation":
                items.append({"label": "관계", "new": f"{_REL.get(name, name)} #{new}" if new else "", "old": f"{_REL.get(name, name)} #{old}" if old else ""})
        if items:
            out.append({"id": j.get("id"), "user": (j.get("user") or {}).get("name", ""), "created_on": j.get("created_on", ""), "items": items})
    return out


def upsert_issue(c, iid, role_text, exists):
    """일감 상세를 받아 저장(신규) 또는 갱신하고, 연결 정보도 다시 만든다."""
    full = rm_get(f"/issues/{iid}.json", {"include": "journals,relations"})["issue"]
    time.sleep(0.05)
    description = plain(full.get("description", ""))
    desc_raw = full.get("description", "") or ""
    try:
        changes_json = json.dumps(build_changes(full), ensure_ascii=False)
    except Exception:
        changes_json = "[]"   # 이름을 못 풀어도 일감 저장은 막지 않는다
    journals = [
        {**j, "notes": plain(j.get("notes", "")), "raw": j.get("notes", "")}
        for j in full.get("journals", [])
        if plain(j.get("notes", ""))
    ]
    if exists:   # 가져오기가 역할을 다시 계산해도, 내가 직접 붙인 구분(추가됨 · 배포요청)은 지우지 않는다
        old = c.execute("SELECT roles FROM notes WHERE issue_id=?", (iid,)).fetchone()
        keep = [r for r in ((old["roles"] if old else "") or "").split(",") if r in ("추가됨", "배포요청")]
        base = [x for x in role_text.split(",") if x and x not in keep and not (x == "연관" and keep)]
        role_text = ",".join(base + keep) or role_text
    fields = (
        full["subject"],
        full["project"]["name"],
        full["tracker"]["name"],
        full["status"]["name"],
        full.get("author", {}).get("name", ""),
        full.get("assigned_to", {}).get("name", ""),
        full["updated_on"],
        description,
        json.dumps(journals, ensure_ascii=False),
        role_text,
        int(full.get("author", {}).get("id") or 0),
    )
    if not exists:
        c.execute(
            "INSERT INTO notes (subject,project,tracker,rm_status,author,"
            "assignee,updated_on,description,journals,roles,author_id,issue_id,"
            "requirement,desc_raw,changes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            fields + (iid, make_draft(description), desc_raw, changes_json),
        )
    else:
        # 내가 쓴 칸(요건/처리/코드/이유)은 건드리지 않는다.
        # 단, 요건이 아직 '레드마인 본문 그대로'(직접 고치지 않음)라면 본문이 바뀐 것도 따라간다.
        old = c.execute(
            "SELECT description, requirement FROM notes WHERE issue_id=?", (iid,)
        ).fetchone()
        if old and old["requirement"].strip() == (old["description"] or "").strip():
            c.execute("UPDATE notes SET requirement=? WHERE issue_id=?", (description, iid))
        c.execute(
            "UPDATE notes SET subject=?,project=?,tracker=?,rm_status=?,"
            "author=?,assignee=?,updated_on=?,description=?,journals=?,"
            "roles=?,author_id=?,desc_raw=?,changes=? WHERE issue_id=?",
            fields + (desc_raw, changes_json, iid),
        )
    c.execute("DELETE FROM links WHERE src=?", (iid,))
    c.executemany(
        "INSERT OR IGNORE INTO links (src,dst,kind) VALUES (?,?,?)",
        collect_links(iid, full, description, journals),
    )
    c.execute("DELETE FROM skipped WHERE issue_id=?", (iid,))


def try_upsert(c, iid, role_text, exists, failed, subject=None):
    """한 건이 실패해도 나머지는 계속 저장되도록 감싼다. 성공하면 True. 실패하면 사유를 failed 에 구조화해서 남긴다."""
    try:
        upsert_issue(c, iid, role_text, exists)
        c.commit()
        return True
    except Exception as e:
        try:
            c.rollback()
        except Exception:
            pass
        kind, reason, hint, skip = explain(e)
        if kind in ("forbidden", "gone"):  # 권한 없음/삭제: 자동 재시도하지 않는다
            try:
                c.execute(
                    "INSERT OR REPLACE INTO skipped (issue_id, reason) VALUES (?,?)",
                    (iid, "권한 없음" if kind == "forbidden" else "삭제됨/없음"),
                )
                c.commit()
            except Exception:
                pass
        failed.append({"id": iid, "subject": subject or "", "kind": kind, "reason": reason, "hint": hint, "skip": skip})
    return False


def fetch_linked(c, failed, limit=LINKED_LIMIT, passes=2):
    """연결(상위/하위/관계/#언급)돼 있지만 저장되지 않은 일감을 받아 저장한다."""
    added = 0
    for _ in range(passes):
        ids = [
            r[0]
            for r in c.execute(
                "SELECT DISTINCT dst FROM links WHERE dst NOT IN (SELECT issue_id FROM notes)"
                " AND dst NOT IN (SELECT issue_id FROM skipped) LIMIT ?",
                (limit - added,),
            )
        ]
        if not ids:
            break
        for iid in ids:
            if try_upsert(c, iid, "연관", False, failed):
                added += 1
        if added >= limit:
            break
    return added


SYNC_LOCK = threading.Lock()   # 가져오기는 한 번에 하나씩 (직접 가져오기와 자동 가져오기가 겹치지 않게)


def sync(date_from, date_to):
    """내가 담당자 / 개발담당자 / 관람자인 일감만 가져온다. 연결된 다른 일감은 자동으로 받지 않는다
    (필요하면 노트 안의 '연결된 일감'에서 한 건씩 눌러서 받는다). 다른 가져오기가 돌고 있으면 끝날 때까지 기다린다."""
    with SYNC_LOCK:
        return _sync(date_from, date_to)


def _sync(date_from, date_to):
    try:
        ensure_daily_backup()  # 가져오기 전에 하루 한 번 자동 백업
    except Exception:
        pass
    queries = {
        "담당자": {"assigned_to_id": "me"},
        "개발담당자": {f"cf_{conn.dev_field}": "me"},
        "관람자": {"watcher_id": "me"},
    }
    listed, roles = {}, {}
    for role, extra in queries.items():
        try:
            items = fetch_list(extra, date_from, date_to)
        except Exception as e:
            kind, reason, hint, _ = explain(e)
            raise SyncError(f"'{role}' 목록을 가져오지 못했어요 — {reason}. {hint}")
        for iid, issue in items.items():
            listed[iid] = issue
            roles.setdefault(iid, []).append(role)

    added_ids, changed_ids, unchanged = [], [], 0
    failed = []
    consec, aborted = 0, None  # 연결 문제(시간 초과·네트워크·서버 오류)가 연속으로 나면 계속해도 소용없으니 멈춘다
    with db() as c:
        local, no_author = {}, set()
        for r in c.execute("SELECT issue_id, updated_on, author_id FROM notes"):
            local[r["issue_id"]] = r["updated_on"]
            if not r["author_id"]:
                no_author.add(r["issue_id"])
        for iid, brief in listed.items():
            role_text = ",".join(roles[iid])
            # 이미 받았고 레드마인 수정 시각이 같으면 상세를 다시 받지 않는다(부하 감소).
            # 단, 작성자 ID 가 없는(2.15.3 전에 받은) 일감은 한 번 다시 받아 채운다. 레드마인에서 바뀐 것은 아니라서 '변경'으로 세지 않는다.
            same = local.get(iid) == brief["updated_on"]
            if same and iid not in no_author:
                old = c.execute("SELECT roles FROM notes WHERE issue_id=?", (iid,)).fetchone()
                keep = [r for r in ((old["roles"] if old else "") or "").split(",") if r in ("추가됨", "배포요청")]   # 직접 붙인 구분은 유지
                c.execute("UPDATE notes SET roles=? WHERE issue_id=?", (",".join([x for x in role_text.split(",") if x not in keep] + keep), iid))
                c.commit()
                unchanged += 1
            elif try_upsert(c, iid, role_text, iid in local, failed, brief.get("subject")):
                if same:
                    unchanged += 1
                else:
                    (changed_ids if iid in local else added_ids).append(iid)
                consec = 0
            else:
                consec = consec + 1 if failed[-1]["kind"] in ("timeout", "network", "server", "busy") else 0
                if consec >= 3:
                    aborted = failed[-1]["reason"]
                    break
    bad = [f for f in failed if not f["skip"]]       # 확인이 필요한 실패
    skipped = [f for f in failed if f["skip"]]       # 정상적으로 건너뛴 것 (권한 없음·삭제됨)
    result = {
        "found": len(listed),
        "added": len(added_ids),
        "changed": len(changed_ids),
        "unchanged": unchanged,
        "failed": bad,
        "skipped": skipped,
        "added_ids": added_ids,
        "changed_ids": changed_ids,
        "aborted": aborted,
    }
    try:  # 마지막 가져오기 기록 (화면 위쪽에 '마지막 가져오기 …'로 보여 주고, 실패 사유는 나중에 다시 볼 수 있게 남긴다)
        info = {
            "at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "from": date_from,
            "to": date_to,
            "found": result["found"],
            "added": result["added"],
            "changed": result["changed"],
            "failed": len(bad),
            "skipped": len(skipped),
            "aborted": aborted,
            "failures": bad[:60],
            "skipped_list": skipped[:60],
        }
        with db() as c2:
            c2.execute(
                "INSERT INTO settings (key,value) VALUES ('last_sync',?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (json.dumps(info, ensure_ascii=False),),
            )
    except Exception:
        pass
    return result


ADD_ROLES = ("연관", "추가됨", "배포요청")   # 직접 추가한 일감의 구분: 추가됨(검색으로 추가) · 배포요청(배포요청 화면)


def fetch_ids(ids, role="연관"):
    """화면에서 '받지 않은 일감'을 눌렀을 때 / 검색·배포요청에서 '노트에 추가'를 눌렀을 때: 지정한 일감을 바로 받아 저장한다."""
    role = role if role in ADD_ROLES else "연관"
    failed, got = [], []
    with db() as c:
        for iid in ids:
            c.execute("DELETE FROM skipped WHERE issue_id=?", (iid,))  # 직접 요청이면 다시 시도
            row = c.execute("SELECT roles FROM notes WHERE issue_id=?", (iid,)).fetchone()
            if row:
                if role != "연관" and role not in row["roles"].split(","):   # 이미 있는 일감: 구분만 덧붙인다 (참조뿐이었다면 바꾼다)
                    cur = row["roles"].strip()
                    c.execute("UPDATE notes SET roles=? WHERE issue_id=?", (role if cur in ("", "연관") else cur + "," + role, iid))
                got.append(iid)
            elif try_upsert(c, iid, role, False, failed):
                got.append(iid)
    return {"got": got, "failed": failed}


_CACHE = {}

def cached(key, ttl, fn):
    now = time.time()
    v = _CACHE.get(key)
    if v and now - v[0] < ttl:
        return v[1]
    r = fn()
    _CACHE[key] = (now, r)
    return r


def rm_statuses():
    return cached("statuses", 3600, lambda: [{"id": x["id"], "name": x["name"]} for x in rm_get("/issue_statuses.json", {})["issue_statuses"]])


def rm_members(pid):
    """프로젝트 구성원(사용자). 100명씩 나눠서 모두 받는다."""
    def load():
        out, off = {}, 0
        while True:
            d = rm_get(f"/projects/{pid}/memberships.json", {"limit": 100, "offset": off})
            for m in d.get("memberships", []):
                u = m.get("user")
                if u:
                    out[u["id"]] = u["name"]
            off += 100
            if off >= d.get("total_count", 0) or not d.get("memberships"):
                break
        return [{"id": i, "name": n} for i, n in sorted(out.items(), key=lambda x: x[1])]
    return cached(("mem", pid), 600, load)


def rm_issue(iid):
    d = rm_get(f"/issues/{iid}.json", {"include": "journals"})["issue"]
    dev = next((c.get("value") for c in d.get("custom_fields", []) if str(c.get("id")) == str(conn.dev_field)), None)
    try:
        dev = int(dev) if dev not in (None, "", []) else None
    except (TypeError, ValueError):
        dev = None
    return d, dev


def rm_put(path, payload):
    """레드마인 PUT. 쓰기는 중복될 수 있어서 자동으로 다시 시도하지 않는다."""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"{conn.url}{path}", data=data, method="PUT",
                                 headers={"X-Redmine-API-Key": conn.key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status
