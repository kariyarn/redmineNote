"""메모(포스트잇) 저장"""
import datetime
import json
import re

from .memoimg import clean_names
from .storage import db


STICKY_COLORS = ("yellow", "pink", "green", "blue", "orange", "purple")


def sticky_row(r):
    out = {k: r[k] for k in ("id", "day", "text", "color", "x", "y", "w", "h", "z", "pinned", "created_at", "updated_at")}
    out["until"] = r["until"] or ""
    out["remind_time"] = r["remind_time"] or ""
    out["wake"] = 1 if r["wake"] else 0
    out["alarm_dates"] = alarm_dates_of(r)
    try:
        out["imgs"] = clean_names(json.loads(r["imgs"] or "[]"))
    except (ValueError, IndexError, KeyError):
        out["imgs"] = []
    return out


def alarm_dates_of(r):
    """기간 알림에서 사용자가 직접 고른 날짜들 (비어 있으면 '기간의 모든 평일')."""
    try:
        v = json.loads(r["alarm_dates"] or "[]")
    except (ValueError, IndexError, KeyError):
        return []
    return sorted({x for x in v if isinstance(x, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", x)}) if isinstance(v, list) else []


def clean_alarm_dates(raw, day, until):
    """고른 날짜 중 기간(시작일~종료일) 안에 있는 것만 남긴다. 하루짜리 메모에는 쓰지 않는다."""
    if not until or not isinstance(raw, list):
        return []
    return sorted({x for x in raw if isinstance(x, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", x) and day <= x <= until})[:366]


def sticky_save(d):
    """포스트잇 만들기/고치기. 값은 범위를 잘라서 저장한다."""
    day = str(d.get("day") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise ValueError("날짜 형식이 올바르지 않아요")
    text = str(d.get("text") or "")[:20000]
    color = d.get("color") if d.get("color") in STICKY_COLORS else "yellow"

    def num(k, lo, hi, dflt):
        try:
            return max(lo, min(hi, float(d.get(k, dflt))))
        except (TypeError, ValueError):
            return dflt

    x, y = num("x", -4000, 8000, 40), num("y", -4000, 8000, 40)   # 보드는 상하좌우로 늘어나므로 음수 자리도 허용
    w, h = num("w", 120, 900, 220), num("h", 100, 900, 200)
    pinned = 1 if d.get("pinned") else 0
    until = str(d.get("until") or "")
    if until and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", until):
        raise ValueError("종료일 형식이 올바르지 않아요")
    if until and until <= day:
        until = ""   # 시작일과 같거나 이르면 하루짜리
    rt = str(d.get("remind_time") or "").strip()
    if rt:
        m = re.fullmatch(r"(\d{1,2}):(\d{2})", rt)
        if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
            raise ValueError("알림 시각은 00:00 ~ 23:59 로 적어 주세요")
        rt = f"{int(m.group(1)):02d}:{m.group(2)}"
    wake = 1 if d.get("wake") else 0
    imgs = json.dumps(clean_names(d.get("imgs")))
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with db() as c:
        sid = d.get("id")
        if sid:
            old = c.execute("SELECT day, until, remind_time, armed_at, alarm_dates FROM sticky WHERE id=?", (sid,)).fetchone()
            if not old:
                raise ValueError("없는 포스트잇이에요")
            if "remind_time" not in d:   # 글·위치만 고치는 저장은 알림 설정을 건드리지 않는다
                rt, wake = old["remind_time"] or "", (c.execute("SELECT wake FROM sticky WHERE id=?", (sid,)).fetchone()[0] or 0)
            picks = clean_alarm_dates(d.get("alarm_dates"), day, until) if "alarm_dates" in d else clean_alarm_dates(alarm_dates_of(old), day, until)   # 보내지 않으면 그대로, 기간이 바뀌면 기간 밖 날짜는 뺀다
            changed = (rt != (old["remind_time"] or "")) or day != old["day"] or until != (old["until"] or "") or picks != alarm_dates_of(old)
            armed = (now if rt else "") if changed else (old["armed_at"] or "")   # 알림을 건(바꾼) 시각: 그 전의 시각은 소급해서 울리지 않는다
            z = int(d["z"]) if d.get("z") is not None else None
            if z is None:
                z = (c.execute("SELECT z FROM sticky WHERE id=?", (sid,)).fetchone() or [1])[0]
            if "imgs" not in d:   # 사진 목록을 보내지 않는 저장(예전 화면 · 고정 풀기 등)은 사진을 그대로 둔다
                imgs = (c.execute("SELECT imgs FROM sticky WHERE id=?", (sid,)).fetchone() or ["[]"])[0] or "[]"
            c.execute("UPDATE sticky SET day=?, text=?, color=?, x=?, y=?, w=?, h=?, z=?, pinned=?, until=?, remind_time=?, wake=?, armed_at=?, alarm_dates=?, imgs=?, updated_at=? WHERE id=?",
                      (day, text, color, x, y, w, h, z, pinned, until, rt, wake, armed, json.dumps(picks), imgs, now, sid))
            if changed:   # 날짜·시각이 바뀌면 예전 '확인함' 기록은 의미가 없다
                c.execute("DELETE FROM sticky_alarm WHERE sticky_id=?", (sid,))
        else:
            z = (c.execute("SELECT COALESCE(MAX(z),0)+1 FROM sticky WHERE day=?", (day,)).fetchone())[0]
            cur = c.execute("INSERT INTO sticky (day,text,color,x,y,w,h,z,pinned,until,remind_time,wake,armed_at,alarm_dates,imgs,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (day, text, color, x, y, w, h, z, pinned, until, rt, wake, now if rt else "", json.dumps(clean_alarm_dates(d.get("alarm_dates"), day, until)), imgs, now, now))
            sid = cur.lastrowid
        return sticky_row(c.execute("SELECT * FROM sticky WHERE id=?", (sid,)).fetchone())
