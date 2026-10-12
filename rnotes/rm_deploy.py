"""레드마인 검색 · 배포요청 일감과 로켓(대기/반영) 상태"""
import datetime
import re
import urllib.error
import urllib.parse
import urllib.request

from .redmine import cached, rm_get, rm_statuses
from .storage import db
from .textutil import plain


DEPLOY_PROJECT = "request-2021"   # 배포요청 프로젝트 (식별자)


def rm_peek(iid):
    """검색 결과를 노트에 넣기 전에 읽어 보기용 (읽기 전용: 저장하지 않는다). 본문 + 최근 댓글 5개."""
    def go():
        full = rm_get(f"/issues/{int(iid)}.json", {"include": "journals"})["issue"]
        js = [{"id": j.get("id"), "user": {"id": (j.get("user") or {}).get("id"), "name": (j.get("user") or {}).get("name", "")},
               "created_on": j.get("created_on", ""), "raw": j.get("notes", "")}
              for j in full.get("journals", []) if plain(j.get("notes", ""))]
        return {"id": full["id"], "subject": full.get("subject", ""), "project": (full.get("project") or {}).get("name", ""),
                "status": (full.get("status") or {}).get("name", ""), "assigned": (full.get("assigned_to") or {}).get("name", ""),
                "author": (full.get("author") or {}).get("name", ""), "updated_on": full.get("updated_on", ""),
                "desc_raw": full.get("description", "") or "", "journal_total": len(js), "journals": js[-5:]}
    return cached(f"peek:{int(iid)}", 120, go)


def rm_search(q, project=None, open_only=False, offset=0, days=None):
    """제목·번호로 레드마인 전체 검색 (이 서버 API 는 본문·댓글 검색을 지원하지 않는다)."""
    q = (q or "").strip()
    with db() as c:
        mine = {r[0] for r in c.execute("SELECT issue_id FROM notes")}

    def row(i):
        return {"id": i["id"], "subject": i.get("subject", ""), "project": (i.get("project") or {}).get("name", ""),
                "status": (i.get("status") or {}).get("name", ""), "assigned": (i.get("assigned_to") or {}).get("name", ""),
                "tracker": (i.get("tracker") or {}).get("name", ""), "updated_on": i.get("updated_on", ""), "mine": i["id"] in mine}
    m = re.fullmatch(r"#?(\d{1,8})", q)
    if m:   # 번호만 입력: 그 일감을 바로 조회
        try:
            return {"total": 1, "issues": [row(rm_get(f"/issues/{int(m.group(1))}.json", {})["issue"])], "byNumber": True}
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return {"total": 0, "issues": [], "byNumber": True}
            raise
    if not q:
        return {"total": 0, "issues": []}
    params = {"status_id": "open" if open_only else "*", "subject": "~" + q, "limit": 50, "offset": max(0, int(offset or 0)), "sort": "updated_on:desc"}
    if project:
        params["project_id"] = project
    try:
        nd = int(days or 0)
    except ValueError:
        nd = 0
    if nd > 0:   # 기간: 최근 N일 안에 바뀐 일감만 (전체를 뒤지면 느리다)
        params["updated_on"] = ">=" + (datetime.date.today() - datetime.timedelta(days=nd)).isoformat()
    d = rm_get("/issues.json", params)
    return {"total": d.get("total_count", 0), "issues": [row(i) for i in d.get("issues", [])]}


def rm_projects():
    return cached("projects", 3600, lambda: [{"id": x["id"], "name": x["name"], "identifier": x.get("identifier", "")}
                                             for x in rm_get("/projects.json", {"limit": 100}).get("projects", [])])


_DP_REQ = re.compile(r"요청\s*사유")           # 배포 요청 댓글의 양식 (- 요청 사유: … - 반영대상: …)
_DP_CUT = re.compile(r"[=+\-_*~]{8,}|절취선")   # 배포하는 분이 '여기까지 배포 끝'으로 올리는 구분선 댓글 (=====, +++ 절취선)


def deploy_comment_kind(notes):
    """배포요청 댓글 한 건을 R(요청) / C(구분선) / ?(그 밖) / ""(글 없음) 으로 나눈다."""
    p = plain(notes)
    if not p:
        return ""
    if _DP_REQ.search(p):
        return "R"
    if _DP_CUT.search(p):
        return "C"
    return "?"


def deploy_state(iid):
    """오늘 배포요청 일감의 진행(읽기 전용). 실제 이력을 보면 '상태 완료'는 첫 구분선과 함께 하루 안에 이미 찍히거나(요청이 하나도 없는 날도 완료),
    완료 뒤에도 요청이 계속 오므로, 상태가 아니라 댓글 흐름으로 판단한다:
      요청 댓글이 구분선(또는 완료로 바꾼 기록) 뒤에 남아 있으면 pending(대기), 마지막 표시 뒤에 요청이 없으면 landed(모두 배포),
      요청이 한 건도 없으면 idle."""
    d = rm_get(f"/issues/{int(iid)}.json", {"include": "journals"})["issue"]
    status = (d.get("status") or {}).get("name", "")
    done_ids = {str(s["id"]) for s in rm_statuses() if s["name"] == "완료"}
    js = sorted(d.get("journals", []), key=lambda j: (j.get("created_on", ""), j.get("id") or 0))   # 같은 시각이면 번호 순서
    pending = total = 0
    last_req = last_cut = ""
    for j in js:
        k, at = deploy_comment_kind(j.get("notes", "")), j.get("created_on", "")
        if k == "R":
            pending += 1; total += 1; last_req = at
        elif k == "C":
            pending = 0; last_cut = at
        for x in j.get("details", []) or []:   # 상태를 '완료'로 바꾼 것도 '여기까지 배포 끝' 표시로 본다
            if x.get("property") == "attr" and x.get("name") == "status_id" and str(x.get("new_value")) in done_ids:
                pending = 0; last_cut = at
    state = "idle" if total == 0 else ("pending" if pending else "landed")
    return {"id": int(iid), "status": status, "state": state, "pending": pending, "requests": total,
            "last_request_at": last_req, "last_cut_at": last_cut}


def deploy_issues(date=None, days=None):
    """배포요청 일감 (제목에 '배포요청 / 날짜'): 하루 한 건. date 가 있으면 그 날 것, days 가 있으면 최근 N일."""
    params = {"status_id": "*", "subject": "~배포요청", "limit": 100, "sort": "created_on:desc"}
    if days:
        params["updated_on"] = ">=" + (datetime.date.today() - datetime.timedelta(days=int(days))).isoformat()
    d = rm_get(f"/projects/{DEPLOY_PROJECT}/issues.json", params)
    out = []
    for i in d.get("issues", []):
        dm = re.search(r"(\d{4}-\d{2}-\d{2})", i.get("subject", ""))
        if "배포요청" not in i.get("subject", "") or not dm:
            continue
        if date and dm.group(1) != date:
            continue
        out.append({"id": i["id"], "subject": i["subject"], "date": dm.group(1), "status": (i.get("status") or {}).get("name", "")})
    return sorted(out, key=lambda x: x["date"], reverse=True)
