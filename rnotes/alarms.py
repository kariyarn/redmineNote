"""메모 알림 계산: 지금 떠야 할 알림 · 확인/미루기 · 달력 · 오늘 볼 메모"""
import datetime
import html
import os
import re

from .holidays import extra_days, is_off_day
from .sticky import alarm_dates_of
from .storage import db, get_settings


# ───────── 메모 알림 ─────────
ALARM_TICK = float(os.environ.get("REDMINE_NOTES_ALARM_TICK") or 20)   # 서버가 알림을 확인하는 간격(초)
ALARM_CAP_DAYS = 366


def _text_preview(t, n=80):
    s = re.sub(r"<br\s*/?>|</p>|</div>", " ", t or "", flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n] + ("…" if len(s) > n else "")


def alarm_days(day, until):
    """알림이 울리는 날짜들: 하루짜리면 그 날, 기간이면 시작일~종료일 모두 (최대 366일)."""
    d0 = datetime.date.fromisoformat(day)
    d1 = datetime.date.fromisoformat(until) if until and until > day else d0
    return [(d0 + datetime.timedelta(i)).isoformat() for i in range(min((d1 - d0).days, ALARM_CAP_DAYS) + 1)]


def alarms_due(now=None):
    """지금 떠야 하는 알림을 메모별로 묶어서 돌려준다.
    규칙: 날짜별 울릴 시각(날짜+알림 시각)이 지났고 · 알림을 건 시각 이후이며 · 확인하지 않았고 · 다시 알림 시각이 지났을 때."""
    now = now or datetime.datetime.now()
    nowm = now.strftime("%Y-%m-%dT%H:%M")
    today = now.strftime("%Y-%m-%d")
    out = []
    extra = extra_days(get_settings().get("holiday_extra"))
    with db() as c:
        rows = c.execute("SELECT * FROM sticky WHERE remind_time != '' AND day<=? ORDER BY day, id", (today,)).fetchall()
        for r in rows:
            acks = {a["date"]: a for a in c.execute("SELECT * FROM sticky_alarm WHERE sticky_id=?", (r["id"],))}
            armed = (r["armed_at"] or "")[:16]
            hits = []
            picks = set(alarm_dates_of(r)) if r["until"] else set()
            for dt in alarm_days(r["day"], r["until"] or ""):
                if dt > today:
                    break
                if picks:   # 날짜를 직접 고른 기간 알림: 고른 날에만 (주말 · 공휴일이어도 고른 날은 울린다)
                    if dt not in picks:
                        continue
                elif r["until"] and is_off_day(dt, extra):   # 기본: 기간 알림은 주말 · 공휴일을 건너뛴다 (하루만 정한 알림은 그 날 그대로 울린다)
                    continue
                fire = f"{dt}T{r['remind_time']}"
                a = acks.get(dt)
                if a and a["acked_at"]:
                    continue
                if a and a["snooze_until"]:
                    if a["snooze_until"][:16] > nowm:
                        continue
                    hits.append((dt, a["snooze_until"][:16]))
                    continue
                if fire <= nowm and (not armed or fire >= armed):
                    hits.append((dt, fire))
            if hits:
                out.append({"id": r["id"], "day": r["day"], "until": r["until"] or "", "remind_time": r["remind_time"],
                            "text": r["text"], "preview": _text_preview(r["text"]), "color": r["color"], "wake": 1 if r["wake"] else 0,
                            "dates": [h[0] for h in hits], "count": len(hits), "fire_at": hits[0][1], "latest": hits[-1][1],
                            "single": not (r["until"] or "")})
    out.sort(key=lambda a: a["latest"])
    return out


def alarm_ack(d):
    """알림 처리. snooze=분 → 그만큼 뒤에 다시 · postpone → 하루짜리 메모를 내일 같은 시각으로 · 그 밖에는 확인(다시 안 뜸)."""
    sid = int(d.get("id") or 0)
    now = datetime.datetime.now()
    due = next((a for a in alarms_due(now) if a["id"] == sid), None)
    if not due:
        return {"ok": True, "n": 0}
    with db() as c:
        if d.get("postpone"):
            if not due["single"]:
                raise ValueError("기간 메모는 내일로 미룰 수 없어요 (매일 울려요)")
            tomorrow = (now.date() + datetime.timedelta(days=1)).isoformat()
            c.execute("UPDATE sticky SET day=?, armed_at=?, updated_at=? WHERE id=?", (tomorrow, now.isoformat(timespec="seconds"), now.isoformat(timespec="seconds"), sid))
            c.execute("DELETE FROM sticky_alarm WHERE sticky_id=?", (sid,))
            return {"ok": True, "n": due["count"], "day": tomorrow}
        mins = int(d.get("snooze") or 0)
        for dt in due["dates"]:
            if mins > 0:
                until = (now + datetime.timedelta(minutes=mins)).isoformat(timespec="seconds")
                c.execute("INSERT INTO sticky_alarm (sticky_id,date,acked_at,snooze_until) VALUES (?,?,NULL,?) "
                          "ON CONFLICT(sticky_id,date) DO UPDATE SET acked_at=NULL, snooze_until=excluded.snooze_until", (sid, dt, until))
            else:
                c.execute("INSERT INTO sticky_alarm (sticky_id,date,acked_at,snooze_until) VALUES (?,?,?,NULL) "
                          "ON CONFLICT(sticky_id,date) DO UPDATE SET acked_at=excluded.acked_at, snooze_until=NULL",
                          (sid, dt, now.isoformat(timespec="seconds")))
    return {"ok": True, "n": due["count"]}


def sticky_calendar(month):
    """달력용: 그 달에 걸치는 메모들 (날짜·기간·알림 시각·글 미리보기)."""
    if not re.fullmatch(r"\d{4}-\d{2}", month or ""):
        raise ValueError("month 는 YYYY-MM 형식이에요")
    first = month + "-01"
    y, m = int(month[:4]), int(month[5:])
    last = (datetime.date(y + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1)).isoformat()
    with db() as c:
        rows = c.execute("SELECT id, day, until, remind_time, alarm_dates, text, pinned FROM sticky WHERE day<=? AND COALESCE(NULLIF(until,''),day)>=? ORDER BY day, id LIMIT 2000", (last, first)).fetchall()
    return [{"id": r["id"], "day": r["day"], "until": r["until"] or "", "remind_time": r["remind_time"] or "", "alarm_dates": alarm_dates_of(r),
             "preview": _text_preview(r["text"], 40), "pinned": r["pinned"]} for r in rows]


def future_notice(now=None):
    """오늘 볼 메모: 오늘이 시작일이고 그 전 날에 만든 메모 (미래 날짜로 만들어 둔 것)."""
    today = (now or datetime.datetime.now()).strftime("%Y-%m-%d")
    with db() as c:
        return [{"id": r["id"], "preview": _text_preview(r["text"], 40)} for r in c.execute(
            "SELECT id, text FROM sticky WHERE day=? AND substr(created_at,1,10)<? ORDER BY id", (today, today))]


def alarm_pending():
    """앞으로 울릴 알림이 남아 있는가 (있으면 서버가 스스로 꺼지지 않는다)."""
    today = datetime.date.today().isoformat()
    with db() as c:
        return bool(c.execute("SELECT 1 FROM sticky WHERE remind_time != '' AND COALESCE(NULLIF(until,''),day)>=? LIMIT 1", (today,)).fetchone()) or bool(alarms_due())
