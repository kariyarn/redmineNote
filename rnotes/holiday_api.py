"""공휴일 API: 공공데이터포털 '한국천문연구원_특일 정보'의 공휴일 정보 조회(getRestDeInfo)로 이번 주 공휴일을 받아 둔다.
매주 첫 영업일에 그 주(월 ~ 일) 것만 받는다. 받은 공휴일은 자동 가져오기가 쉬는 날을 판단할 때 쓴다 (내장 공휴일 표 · 설정의 추가 휴일과 함께).
인증키는 아래 SERVICE_KEY 로 고정한다 (사용자가 넣지 않는다). 화면 · 응답 · 백업에는 나오지 않는다."""
import datetime
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from .holidays import extra_days, is_off_day
from .storage import db, get_settings


API_BASE = os.environ.get("REDMINE_NOTES_HOLIDAY_API") or "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService"   # 시험 때만 가짜 서버로 바꾼다
# 공공데이터포털 '한국천문연구원_특일 정보' 일반 인증키 (개발계정, 활용기간 ~ 2028-05-08). 사용자 입력 없이 이 키로 고정한다 (2026-10-14 요청).
# 저장소가 공개되거나 키가 새면 포털에서 재발급하고 여기만 바꾼다. 시험에서는 REDMINE_NOTES_HOLIDAY_KEY 로 바꿔 쓴다 (실제 키가 가짜 서버로 가지 않게).
SERVICE_KEY = "14532088ff5ab00e5f555dd746e6de6a798ab6053e009e1b372462d7e537555f"
CACHE_KEY = "holiday_api"                   # settings: 받은 주별 공휴일 · 마지막 오류 (화면이 바꿀 수 없는 서버 전용 키)
RETRY_SEC = 3600                           # 받지 못했으면 1시간 뒤에 다시 (그 주 안에서)
KEEP_WEEKS = 60                            # 받은 주를 이만큼만 남긴다
_LOCK = threading.Lock()


class HolidayApiError(Exception):
    """공휴일 API 를 쓰지 못한 이유. 메시지는 사용자에게 그대로 보여 줄 한국어 설명이다."""


# ---------- 인증키 ----------
def _read_key():
    env = os.environ.get("REDMINE_NOTES_HOLIDAY_KEY")   # 시험 전용 (빈 값 = 키 없음)
    return SERVICE_KEY if env is None else env.strip()


def has_key():
    return bool(_read_key())


# ---------- API 호출 ----------
def _http_get(url):
    """(HTTP 상태, 본문) 을 돌려준다. 연결이 안 되면 HolidayApiError."""
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read()
        except Exception:
            return e.code, b""
    except (urllib.error.URLError, TimeoutError, OSError):
        raise HolidayApiError("공휴일 API 에 연결할 수 없어요 — 네트워크를 확인하세요 (다음에 다시 시도해요)")


_AUTH_CODES = {"20", "30", "31", "32", "33"}   # 접근 거부 · 등록 안 된 키 · 기한 만료 · 등록 안 된 IP · 서명 안 된 요청


def _api_error(code, msg, status):
    if code == "22":
        return HolidayApiError("공휴일 API 오늘 호출 한도를 넘었어요 — 내일 다시 시도해요")
    if code in _AUTH_CODES or status in (401, 403):
        return HolidayApiError(f"공휴일 API 인증키가 거절됐어요 ({msg or code or status}) — 내장 인증키의 활용 기간 · 승인 상태를 확인해야 해요(관리자에게 알려 주세요). 그동안은 내장 공휴일 표로 판단해요")
    return HolidayApiError(f"공휴일 API 가 오류로 응답했어요 ({msg or code or ('HTTP ' + str(status))})")


def _parse(status, body):
    """응답 → [(YYYY-MM-DD, 이름, 공휴일 여부)]. JSON 을 먼저 보고, 아니면 XML (기본 형식이 XML 이다)."""
    text = (body or b"").decode("utf-8", "replace").strip()
    try:
        d = json.loads(text)
    except ValueError:
        d = None
    if isinstance(d, dict):
        err = d.get("OpenAPI_ServiceResponse")
        if err:
            h = err.get("cmmMsgHeader") or {}
            raise _api_error(str(h.get("returnReasonCode") or ""), h.get("errMsg") or h.get("returnAuthMsg") or "", status)
        resp = d.get("response") or {}
        head = resp.get("header") or {}
        if str(head.get("resultCode") or "00") != "00":
            raise _api_error(str(head.get("resultCode")), head.get("resultMsg") or "", status)
        items = (resp.get("body") or {}).get("items") or {}
        item = items.get("item") if isinstance(items, dict) else None   # 없으면 items 가 "" 로 온다
        rows = item if isinstance(item, list) else ([item] if isinstance(item, dict) else [])
    else:
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            raise _api_error("", "", status) if status >= 400 else HolidayApiError("공휴일 API 응답을 읽을 수 없어요")
        reason = root.findtext(".//returnReasonCode")
        if reason or root.tag == "OpenAPI_ServiceResponse":
            raise _api_error(reason or "", root.findtext(".//errMsg") or "", status)
        code = root.findtext(".//resultCode")
        if code and code != "00":
            raise _api_error(code, root.findtext(".//resultMsg") or "", status)
        rows = [{c.tag: c.text for c in it} for it in root.iter("item")]
    if status >= 400:
        raise _api_error("", "", status)
    out = []
    for r in rows:
        ld = re.sub(r"\D", "", str(r.get("locdate") or ""))
        if len(ld) == 8:
            out.append((f"{ld[:4]}-{ld[4:6]}-{ld[6:]}", str(r.get("dateName") or "공휴일"), str(r.get("isHoliday") or "").upper() == "Y"))
    return out


def fetch_month(key, year, month):
    sk = key if "%" in key else urllib.parse.quote(key, safe="")   # 포털의 'Encoding' 키(이미 %XX)는 그대로
    q = urllib.parse.urlencode({"solYear": f"{year:04d}", "solMonth": f"{month:02d}", "numOfRows": 100, "_type": "json"})
    return _parse(*_http_get(f"{API_BASE}/getRestDeInfo?serviceKey={sk}&{q}"))


def week_start(d):
    return d - datetime.timedelta(days=d.weekday())   # 그 주 월요일


def fetch_week(monday, key=None):
    """그 주(월 ~ 일)의 공휴일 {날짜: 이름}. 주가 두 달에 걸치면 두 번 부른다."""
    key = key or _read_key()
    if not key:
        raise HolidayApiError("공휴일 API 인증키가 없어요")
    days = [monday + datetime.timedelta(days=i) for i in range(7)]
    want = {d.isoformat() for d in days}
    out = {}
    for y, m in sorted({(d.year, d.month) for d in days}):
        for ds, name, holiday in fetch_month(key, y, m):
            if holiday and ds in want:
                out[ds] = name
    return dict(sorted(out.items()))


# ---------- 받아 둔 공휴일 ----------
def _cache(s=None):
    try:
        c = json.loads((s if s is not None else get_settings()).get(CACHE_KEY) or "{}")
    except ValueError:
        c = {}
    if not isinstance(c, dict):
        c = {}
    c.setdefault("weeks", {})
    return c


def _save_cache(c):
    weeks = c.get("weeks") or {}
    c["weeks"] = {k: weeks[k] for k in sorted(weeks)[-KEEP_WEEKS:]}
    with db() as conn:
        conn.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                     (CACHE_KEY, json.dumps(c, ensure_ascii=False)))


def fetched_days(s=None):
    """지금까지 받아 둔 공휴일 {날짜: 이름}."""
    out = {}
    for w in _cache(s)["weeks"].values():
        out.update(w.get("days") or {})
    return out


def off_day(d, s=None):
    """자동 가져오기가 쉬는 날인가: 토 · 일 · 내장 공휴일 표 · 설정의 추가 휴일 · 공휴일 API 로 받은 공휴일."""
    s = get_settings() if s is None else s
    return is_off_day(d.isoformat(), extra_days(s.get("holiday_extra")) | set(fetched_days(s)))


def fetch_and_store(monday, now=None):
    """그 주 공휴일을 받아서 남긴다. 실패하면 이유를 남기고 HolidayApiError 를 다시 던진다."""
    now = now or datetime.datetime.now()
    with _LOCK:
        c = _cache()
        c["try_at"] = now.timestamp()
        try:
            days = fetch_week(monday)
        except HolidayApiError as e:
            c.update(error=str(e), error_at=now.isoformat(timespec="minutes"))
            _save_cache(c)
            raise
        c["weeks"][monday.isoformat()] = {"at": now.isoformat(timespec="minutes"), "days": days}
        c.update(error="", error_at="")
        _save_cache(c)
        return days


def maybe_fetch_week(now=None, s=None):
    """매주 첫 영업일에 그 주 공휴일을 받는다. 이미 받았거나 · 인증키가 없거나 · 오늘이 쉬는 날(아는 범위에서)이면 하지 않는다.
    앱이 월요일에 꺼져 있었으면 그 주에 처음 켜진 영업일에 받는다. 받지 못하면 1시간 뒤에 다시. 받았으면 {날짜: 이름}, 아니면 None."""
    now = now or datetime.datetime.now()
    s = get_settings() if s is None else s
    monday, c = week_start(now.date()), _cache(s)
    if monday.isoformat() in c["weeks"] or not has_key() or off_day(now.date(), s):
        return None
    if c.get("try_at") and now.timestamp() - float(c["try_at"]) < RETRY_SEC:
        return None
    try:
        return fetch_and_store(monday, now)
    except HolidayApiError:
        return None


def status(now=None, s=None):
    """화면용: 인증키가 있는지(키 자체는 주지 않는다) · 이번 주에 받은 공휴일 · 마지막 오류 · 오늘 쉬는 날인지."""
    now = now or datetime.datetime.now()
    s = get_settings() if s is None else s
    monday, c = week_start(now.date()), _cache(s)
    w = c["weeks"].get(monday.isoformat())
    return {
        "key_set": has_key(), "week": [monday.isoformat(), (monday + datetime.timedelta(days=6)).isoformat()],
        "fetched": bool(w), "fetched_at": (w or {}).get("at", ""), "days": [{"date": k, "name": v} for k, v in ((w or {}).get("days") or {}).items()],
        "error": c.get("error") or "", "error_at": c.get("error_at") or "", "today_off": off_day(now.date(), s),
    }
