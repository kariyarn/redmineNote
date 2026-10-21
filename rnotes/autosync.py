"""자동 가져오기: 설정한 간격(분)마다 서버가 스스로 레드마인에서 바뀐 일감을 가져온다.
창이 최소화돼 있거나 닫혀서 트레이에만 있어도 서버가 켜져 있는 동안 돌고, 영업일(토 · 일 · 공휴일 제외)의 업무 시간(08:30 ~ 18:30)에만 가져온다.
쉬는 날은 내장 공휴일 표(rnotes/holidays.py) · 설정의 추가 휴일로만 판단한다 (공휴일을 따로 받아 오지 않는다).
화면은 /api/autosync 로 결과를 가져가서, 바뀐 일감이 있으면 다시 읽어 그린다.
새 일감 · 남이 단 새 댓글(변경)이 있으면 알린다: 창이 보이면 화면이 알림 창을, 창이 안 보이면(최소화 · 가려짐 · 트레이) 서버가
오른쪽 아래 알림 창(popup, 누르면 그 노트의 새 댓글로)을 띄운다. 알림 창을 못 띄우거나 꺼 두었으면 예전처럼 트레이 말풍선."""
import collections
import datetime
import json
import time

from .config import RUN, STATE
from .holidays import extra_days, is_off_day
from .redmine import SYNC_LOCK, my_id, sync
from .storage import configured, db, get_settings


AUTO_TICK = 30                    # 서버가 가져올 때인지 확인하는 간격(초)
MIN_MINUTES, MAX_MINUTES = 5, 1440   # 간격(분): 레드마인 부하를 줄이려고 최소 5분
MAX_DAYS = 7                      # 가져올 기간(최근 N일)의 최대이자 기본값
WORK_START, WORK_END = datetime.time(8, 30), datetime.time(18, 30)   # 통상 업무 시간 ± 30분에만 가져온다
_RUNS = collections.deque(maxlen=50)   # 최근 자동 가져오기 결과. 화면은 seq 로 새것만 가져간다
_STATE = {"seq": 0, "try": 0.0}        # try: 마지막으로 시도한 시각 (실패해도 간격마다 한 번만 다시 시도)


def interval_min(s):
    """설정의 간격(분). 비었거나 0 이하 = 끔(0), 그 밖에는 5 ~ 1440 으로 맞춘다."""
    try:
        v = int(s.get("auto_sync_min") or 0)
    except ValueError:
        v = 0
    return max(MIN_MINUTES, min(MAX_MINUTES, v)) if v > 0 else 0


def range_days(s):
    """가져올 기간(최근 N일, 1 = 오늘만). 비었거나 잘못된 값이면 최대(7일)."""
    try:
        v = int(s.get("auto_sync_days") or 0)
    except ValueError:
        v = 0
    return min(MAX_DAYS, v) if v > 0 else MAX_DAYS


def in_window(now):
    return WORK_START <= now.time() <= WORK_END


def last_sync_at(s):
    """마지막 가져오기(직접 · 자동 · 처음 열 때 확인 모두) 시각. 한 번도 안 했으면 None."""
    try:
        return datetime.datetime.strptime(json.loads(s.get("last_sync") or "{}").get("at") or "", "%Y-%m-%d %H:%M")
    except (ValueError, TypeError, AttributeError):
        return None


def notify_on(s):
    """새 일감 · 새 댓글 알림 (설정 auto_sync_notify, 기본 켬)."""
    return str(s.get("auto_sync_notify") or "1") != "0"


def popup_on(s):
    """오른쪽 아래 알림 창 (설정 notify_popup, 기본 켬). 끄면 윈도우 알림(트레이 말풍선)으로 알린다."""
    return str(s.get("notify_popup") or "1") != "0"


def _new_issues(ids):
    """새로 들어온 일감의 번호 · 제목 · 프로젝트 · 역할 (알림에 쓴다)."""
    if not ids:
        return []
    with db() as c:
        rows = {r["issue_id"]: r for r in c.execute(
            f"SELECT issue_id, subject, project, roles FROM notes WHERE issue_id IN ({','.join('?' * len(ids))})", list(ids))}
    return [{"id": i, "subject": rows[i]["subject"] or "", "project": rows[i]["project"] or "", "roles": rows[i]["roles"] or ""} for i in ids
            if i in rows and "배포요청" not in (rows[i]["roles"] or "").split(",")]   # 배포요청 일감은 배포요청 화면에서만 (알림도 하지 않는다)


def _first_line(t, n=90):
    t = next((x.strip() for x in (t or "").splitlines() if x.strip()), "")
    return t[:n] + ("…" if len(t) > n else "")


def _activity(ids, before):
    """바뀐 일감마다, 가져오기 전 수정 시각(before) 뒤에 남이 단 댓글 · 변경. 내가 한 것은 뺀다 (배포요청 일감도 뺀다).
    [{id, subject, who, text, count}] — text 는 마지막 것의 첫 줄 (댓글) 또는 바뀐 항목 (변경)."""
    if not ids:
        return []
    me, me_name = my_id(), (STATE.get("me_name") or "").strip()
    with db() as c:
        rows = {r["issue_id"]: r for r in c.execute(
            f"SELECT issue_id, subject, roles, journals, changes FROM notes WHERE issue_id IN ({','.join('?' * len(ids))})", list(ids))}
    out = []
    for i in ids:
        r, since = rows.get(i), before.get(i) or ""
        if not r or not since or "배포요청" in (r["roles"] or "").split(","):
            continue
        ent = []
        try:
            for j in json.loads(r["journals"] or "[]"):
                u = j.get("user") or {}
                if (j.get("created_on") or "") > since and not (me and u.get("id") == me):
                    ent.append((j["created_on"], u.get("name") or "", _first_line(j.get("notes"))))
            for ch in json.loads(r["changes"] or "[]"):
                if (ch.get("created_on") or "") > since and not (me_name and (ch.get("user") or "").strip() == me_name):
                    it = (ch.get("items") or [{}])[0]
                    what = it.get("note") or (f"{it.get('old')} → {it.get('new')}" if it.get("old") and it.get("new") else it.get("new") or "")
                    ent.append((ch["created_on"], ch.get("user") or "", f"{it.get('label') or '변경'}: {what}".strip(": ")))
        except (ValueError, TypeError, KeyError, AttributeError):
            continue
        if ent:
            last = max(ent, key=lambda e: e[0])
            out.append({"id": i, "subject": r["subject"] or "", "who": last[1], "text": last[2], "count": len(ent)})
    return out


def _popup_items(new, act):
    """알림 창 내용. 많으면 앞의 몇 건만 따로 띄우고 나머지는 '…외 N건' 한 장으로 묶는다."""
    items = [{"id": x["id"], "new": True, "head": "🆕 새 레드마인 일감", "title": f"#{x['id']} {x['subject']}", "text": x["project"]} for x in new]
    items += [{"id": x["id"], "new": False, "head": f"💬 {x['who'] or '레드마인'}" + (f" 외 {x['count'] - 1}건" if x["count"] > 1 else ""),
               "title": f"#{x['id']} {x['subject']}", "text": x["text"] or "새 댓글이 있어요"} for x in act]
    if len(items) > 3:
        rest = items[2:]
        items = items[:2] + [{"id": None, "head": "레드마인 노트", "title": f"새 소식 {len(rest)}건 더",
                              "text": " · ".join(x["title"] for x in rest)}]
    return items


def _tray_notice(new, act=()):
    """앱 창을 보고 있지 않으면(최소화 · 가려짐 · 창 없음) 작업 표시줄 반짝임 + 오른쪽 아래 알림 창으로 알린다.
    알림 창을 띄울 수 없거나 꺼 두었으면 윈도우 알림(트레이 말풍선)으로 (attention.notify).
    보고 있으면 화면이 알림 창을 띄우므로 하지 않는다. 돌려주는 값: (윈도우 알림을 띄웠나, 알림 창을 띄웠나)."""
    from .attention import app_focused, notify, toast_on
    if app_focused():
        return False, False
    shown = False
    if popup_on(get_settings()) and RUN.popup:
        from .lifecycle import open_issue
        try:
            shown = RUN.popup.show(_popup_items(new, act), open_issue)
        except Exception:
            shown = False
    if new:
        title, text = f"🆕 새 레드마인 일감 {len(new)}건", " · ".join(f"#{x['id']} {x['subject']}" for x in new)
    else:
        title, text = f"💬 새 댓글 {sum(x['count'] for x in act)}건", " · ".join(f"#{x['id']} {x['who']}: {x['text']}" for x in act)
    r = notify(title, text, toast=not shown)   # 알림 창을 띄웠으면 반짝임만
    return r["toasted"], shown


def enabled(s=None):
    """자동 가져오기가 켜져 있는가. 켜져 있으면 창이 없어도 서버가 스스로 꺼지지 않는다 (lifecycle.idle_watchdog)."""
    return bool(interval_min(get_settings() if s is None else s)) and configured()


def _base(s):
    last = last_sync_at(s)
    return None if last is None else max(last.timestamp(), _STATE["try"])


def off_day(d, s=None):
    """자동 가져오기가 쉬는 날인가: 토 · 일 · 내장 공휴일 표 · 설정의 추가 휴일."""
    s = get_settings() if s is None else s
    return is_off_day(d.isoformat(), extra_days(s.get("holiday_extra")))


def due(now, s):
    """지금 가져올 때인가: 켜져 있고 · 영업일의 업무 시간이고 · 한 번은 가져온 적이 있고 · 마지막 가져오기(또는 시도)부터 간격이 지났을 때.
    처음 가져오기는 사용자가 직접(최근 1년) 하는 것이 맞아서, 한 번도 가져온 적이 없으면 하지 않는다."""
    m, base = interval_min(s), _base(s)
    if not m or base is None or not configured() or not in_window(now) or off_day(now.date(), s):
        return False
    return now.timestamp() - base >= m * 60


def next_at(now, s):
    """다음 자동 가져오기 예정 시각 (꺼져 있거나 한 번도 가져온 적이 없으면 None). 업무 시간 밖이거나 쉬는 날이면 다음 영업일 08:30."""
    m, base = interval_min(s), _base(s)
    if not m or base is None:
        return None
    t = max(datetime.datetime.fromtimestamp(base) + datetime.timedelta(minutes=m), now).replace(second=0, microsecond=0)
    if t.time() < WORK_START:
        t = datetime.datetime.combine(t.date(), WORK_START)
    elif t.time() > WORK_END:
        t = datetime.datetime.combine(t.date() + datetime.timedelta(days=1), WORK_START)
    for _ in range(31):   # 토 · 일 · 공휴일(내장 표 · 추가 휴일)은 건너뛴다
        if not off_day(t.date(), s):
            break
        t = datetime.datetime.combine(t.date() + datetime.timedelta(days=1), WORK_START)
    return t


def run_once(now=None):
    """때가 됐으면 한 번 가져온다. 결과(dict)를 돌려주고, 때가 아니거나 다른 가져오기가 돌고 있으면 None."""
    now = now or datetime.datetime.now()
    s = get_settings()
    if not due(now, s) or SYNC_LOCK.locked():
        return None
    _STATE["try"] = now.timestamp()
    d_from = (now.date() - datetime.timedelta(days=range_days(s) - 1)).isoformat()
    d_to = now.date().isoformat()
    run = {"at": now.isoformat(timespec="seconds"), "from": d_from, "to": d_to}
    try:
        with db() as c:   # 가져오기 전 수정 시각: 그 뒤에 달린 댓글 · 변경이 '새 소식'
            before = {r["issue_id"]: r["updated_on"] or "" for r in c.execute("SELECT issue_id, updated_on FROM notes")}
        r = sync(d_from, d_to)
        new, act = _new_issues(r["added_ids"]), _activity(r["changed_ids"], before)
        tray, pop = _tray_notice(new, act) if (new or act) and notify_on(s) else (False, False)
        run.update(added_ids=r["added_ids"], changed_ids=r["changed_ids"], failed=len(r["failed"]), aborted=r["aborted"], error="", new=new,
                   act=act, tray=tray, popup=pop)
    except Exception as e:   # SyncError 는 사용자에게 그대로 보여 줄 한국어 설명이다
        run.update(added_ids=[], changed_ids=[], failed=0, aborted=None, error=str(e)[:300] or "알 수 없는 오류예요", new=[], act=[], tray=False, popup=False)
    _STATE["seq"] += 1
    run["seq"] = _STATE["seq"]
    _RUNS.append(run)
    return run


def status(since=None, now=None):
    """화면용: 설정 · 업무 시간 · 다음 예정 시각 · 공휴일 · since 뒤의 결과들 (since 가 없으면 결과는 주지 않는다)."""
    now = now or datetime.datetime.now()
    s = get_settings()
    nxt = next_at(now, s)
    return {
        "enabled": enabled(s), "minutes": interval_min(s), "days": range_days(s), "notify": notify_on(s), "max_days": MAX_DAYS, "min_minutes": MIN_MINUTES,
        "window": [WORK_START.strftime("%H:%M"), WORK_END.strftime("%H:%M")], "in_window": in_window(now),
        "next": nxt.isoformat(timespec="minutes") if nxt else "", "seq": _STATE["seq"], "holiday": {"today_off": off_day(now.date(), s)},
        "runs": [r for r in list(_RUNS) if since is not None and r["seq"] > since],
    }


def tick(now=None):
    """한 번 확인: 가져올 때면 가져온다."""
    return run_once(now or datetime.datetime.now())


def autosync_loop():
    while True:
        time.sleep(AUTO_TICK)
        try:
            tick()
        except Exception:
            pass
