"""메모 알림 서버 로직 시험 (임시 데이터만 사용).  실행: python tests/test_alarm.py <프로젝트 폴더>"""
import os, sys, tempfile, datetime as D
tmp = tempfile.mkdtemp()
os.environ["REDMINE_NOTES_HOME"] = tmp
os.environ["REDMINE_NOTES_NO_APPWIN"] = "1"
sys.path.insert(0, sys.argv[1])   # 프로젝트 폴더(rnotes 가 있는 곳)
from rnotes import storage, sticky, alarms, lifecycle, config
from types import SimpleNamespace
S = SimpleNamespace(init_db=storage.init_db, db=storage.db, sticky_save=sticky.sticky_save, alarms_due=alarms.alarms_due, alarm_ack=alarms.alarm_ack,
                    sticky_calendar=alarms.sticky_calendar, future_notice=alarms.future_notice, alarm_pending=alarms.alarm_pending,
                    alarm_tick=lifecycle.alarm_tick, STATE=config.STATE)
S.init_db()
ok = fail = 0
def t(name, cond):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name)
now = D.datetime.now().replace(second=0, microsecond=0)
today = now.strftime("%Y-%m-%d")
def day(n): return (now.date() + D.timedelta(days=n)).isoformat()
def hm(m): return (now + D.timedelta(minutes=m)).strftime("%H:%M")

# 1. 시각이 없으면 알림 없음
s = S.sticky_save({"day": today, "text": "no time"})
t("no time", not S.alarms_due())
# 2. 검증
try: S.sticky_save({"day": today, "text": "x", "remind_time": "25:00"}); t("bad time", False)
except ValueError: t("bad time", True)
# 3. 방금 건 알림(과거 시각)은 소급하지 않는다
past = (now - D.timedelta(minutes=30)).strftime("%H:%M")
a = S.sticky_save({"day": today, "text": "past", "remind_time": past})
t("no retro", not S.alarms_due())
# 4. 1분 뒤 시각: 시계를 앞당겨 시험
b = S.sticky_save({"day": today, "text": "<p>soon</p>", "remind_time": hm(5), "wake": 1})
t("not yet", not S.alarms_due(now))
later = now + D.timedelta(minutes=6)
d = S.alarms_due(later)
t("due after", len(d) == 1 and d[0]["id"] == b["id"] and d[0]["preview"] == "soon" and d[0]["single"])
# 5. 확인하면 다시 안 뜬다
S.alarm_ack({"id": b["id"]}) if False else None
# alarm_ack 는 실제 now 를 쓰므로 직접 due 가 되도록 armed 를 과거로 옮기고 시각을 지금 이전으로
with S.db() as c:
    c.execute("UPDATE sticky SET armed_at=? , remind_time=? WHERE id=?", ((now - D.timedelta(hours=2)).isoformat(), hm(-1), b["id"]))
t("due now", [x["id"] for x in S.alarms_due()] == [b["id"]])
S.alarm_ack({"id": b["id"], "snooze": 10})
t("snoozed", not S.alarms_due())
t("snooze later", [x["id"] for x in S.alarms_due(now + D.timedelta(minutes=11))] == [b["id"]])
with S.db() as c:
    c.execute("UPDATE sticky_alarm SET snooze_until=? WHERE sticky_id=?", ((now - D.timedelta(minutes=1)).isoformat(), b["id"]))
t("snooze expired", len(S.alarms_due()) == 1)
S.alarm_ack({"id": b["id"]})
t("acked", not S.alarms_due())
# 6. 기간 메모: 매일, 지난 날은 묶음(N일치)
r = S.sticky_save({"day": day(-3), "until": day(1), "text": "range", "remind_time": hm(-1)})
with S.db() as c:
    c.execute("UPDATE sticky SET armed_at=? WHERE id=?", ((now - D.timedelta(days=5)).isoformat(), r["id"]))
d = [x for x in S.alarms_due() if x["id"] == r["id"]]
from rnotes import holidays as H0
want = [day(i) for i in range(-3, 1) if not H0.is_off_day(day(i))]      # 오늘 시험을 돌리는 날짜와 상관없이: 쉬는 날은 빼고 센다
t("range count", d and d[0]["dates"] == want and d[0]["count"] == len(want) and not d[0]["single"])
try: S.alarm_ack({"id": r["id"], "postpone": True}); t("range postpone", False)
except ValueError: t("range postpone", True)
S.alarm_ack({"id": r["id"]})
t("range acked", not [x for x in S.alarms_due() if x["id"] == r["id"]])
# 7. 하루짜리 내일로 미루기
p = S.sticky_save({"day": today, "text": "pp", "remind_time": hm(1)})
with S.db() as c:
    c.execute("UPDATE sticky SET armed_at=?, remind_time=? WHERE id=?", ((now - D.timedelta(hours=2)).isoformat(), hm(-1), p["id"]))
res = S.alarm_ack({"id": p["id"], "postpone": True})
t("postpone", res["day"] == day(1) and not [x for x in S.alarms_due() if x["id"] == p["id"]])
# 8. 글만 고치는 저장은 알림 설정/확인 기록을 지우지 않는다
row = S.sticky_save({"id": p["id"], "day": day(1), "text": "pp2", "remind_time": hm(-1)})
t("keep rt", row["remind_time"] == hm(-1))
row = S.sticky_save({"id": p["id"], "day": day(1), "text": "pp3"})
t("keep rt on text edit", row["remind_time"] == hm(-1))
# 9. 알림 끄기
row = S.sticky_save({"id": p["id"], "day": day(1), "text": "pp3", "remind_time": ""})
t("off", row["remind_time"] == "")
# 10. 달력
cal = S.sticky_calendar(today[:7])
t("calendar", any(x["id"] == r["id"] for x in cal) or r["day"][:7] != today[:7])
# 11. 미래 메모 알림: 어제 만든 오늘 메모
with S.db() as c:
    c.execute("UPDATE sticky SET created_at=? WHERE id=?", ((now - D.timedelta(days=2)).isoformat(), s["id"]))
t("notice", [n["id"] for n in S.future_notice()] == [s["id"]])
# 12. 대기 알림
S.sticky_save({"day": day(2), "text": "later", "remind_time": "09:00"})
t("pending", S.alarm_pending())
# 13. 깨우기(시험 모드: 열지 않고 센다)
S.STATE["alarm_poll"] = 0; lifecycle.app_window_open = lambda: False
w = S.sticky_save({"day": today, "text": "wk", "remind_time": hm(1), "wake": 1})
with S.db() as c:
    c.execute("UPDATE sticky SET armed_at=?, remind_time=? WHERE id=?", ((now - D.timedelta(hours=2)).isoformat(), hm(-1), w["id"]))
S.alarm_tick()
t("wake counted", S.STATE.get("wake_count") == 1)
S.alarm_tick()
t("wake once", S.STATE.get("wake_count") == 1)
# 14. 삭제 시 알림 기록 정리는 핸들러 쪽 — 여기서는 테이블 존재만
with S.db() as c:
    t("table", c.execute("SELECT count(*) FROM sticky_alarm").fetchone()[0] >= 1)

# 15. 기간 알림은 주말 · 공휴일을 건너뛴다 (2026-10-01 목 ~ 10-12 월: 토 3/10, 일 4/11, 대체공휴일 5, 한글날 9 제외)
from rnotes import holidays as H
r2 = S.sticky_save({"day": "2026-10-01", "until": "2026-10-12", "text": "skip", "remind_time": "09:00"})
with S.db() as c:
    c.execute("UPDATE sticky SET armed_at=? WHERE id=?", ("2026-09-01T00:00:00", r2["id"]))
d = [x for x in S.alarms_due(D.datetime(2026, 10, 12, 10, 0)) if x["id"] == r2["id"]]
t("skip off days", d and d[0]["dates"] == ["2026-10-01", "2026-10-02", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-12"])
r3 = S.sticky_save({"day": "2026-10-03", "text": "single on holiday", "remind_time": "09:00"})
with S.db() as c:
    c.execute("UPDATE sticky SET armed_at=? WHERE id=?", ("2026-09-01T00:00:00", r3["id"]))
d3 = [x for x in S.alarms_due(D.datetime(2026, 10, 3, 10, 0)) if x["id"] == r3["id"]]
t("single-day alarm still fires on a holiday", d3 and d3[0]["dates"] == ["2026-10-03"])
t("is_off_day", H.is_off_day("2026-10-04") and H.is_off_day("2026-10-09") and not H.is_off_day("2026-10-08") and H.is_off_day("2026-12-31", {"2026-12-31"}))
t("holiday list", "2026-10-05" in H.holiday_dates(2026) and len(H.holiday_dates(2027)) >= 15)

# 16. 기간 알림에서 날짜를 직접 고르면 그 날에만 (주말 · 공휴일이어도 고른 날은 울린다)
r4 = S.sticky_save({"day": "2026-10-01", "until": "2026-10-12", "text": "pick", "remind_time": "09:00", "alarm_dates": ["2026-10-03", "2026-10-08", "2026-11-01", "bad"]})
t("picks saved & clipped to range", r4["alarm_dates"] == ["2026-10-03", "2026-10-08"])
with S.db() as c:
    c.execute("UPDATE sticky SET armed_at=? WHERE id=?", ("2026-09-01T00:00:00", r4["id"]))
d4 = [x for x in S.alarms_due(D.datetime(2026, 10, 12, 10, 0)) if x["id"] == r4["id"]]
t("only picked days fire", d4 and d4[0]["dates"] == ["2026-10-03", "2026-10-08"] and d4[0]["count"] == 2)
r4b = S.sticky_save({"id": r4["id"], "day": "2026-10-01", "until": "2026-10-12", "text": "pick edited"})
t("text-only save keeps picks", r4b["alarm_dates"] == ["2026-10-03", "2026-10-08"])
r4c = S.sticky_save({"id": r4["id"], "day": "2026-10-01", "until": "2026-10-05", "text": "pick shrink", "remind_time": "09:00"})
t("range shrink prunes picks", r4c["alarm_dates"] == ["2026-10-03"])
r4d = S.sticky_save({"id": r4["id"], "day": "2026-10-01", "until": "2026-10-05", "text": "x", "remind_time": "09:00", "alarm_dates": []})
t("empty picks = default weekdays", r4d["alarm_dates"] == [])
r4e = S.sticky_save({"day": "2026-10-03", "text": "single ignores picks", "remind_time": "09:00", "alarm_dates": ["2026-10-03"]})
t("single-day ignores picks", r4e["alarm_dates"] == [])
cal = S.sticky_calendar("2026-10")
t("calendar has alarm_dates", any(x["id"] == r4["id"] and "alarm_dates" in x for x in cal))
print("OK", ok, "FAIL", fail)

