# 업무 회고 · SWOT 분석 요청 (레드마인 노트 2)

> 이 문서를 **내 PC의 레드마인 노트 2 데이터에 접근할 수 있는 AI 세션**에 그대로 붙여넣으세요.
> AI 는 아래 순서대로 ① 기록을 정리해 파일로 내보내고 ② 그 파일만 보고 SWOT 을 분석합니다.

---

## AI 에게: 지켜야 할 규칙

1. **읽기만 하세요.** 레드마인 노트 DB(`notes.db`)를 고치거나 지우거나 옮기지 마세요. 아래 스크립트는 DB 를 읽기 전용(`mode=ro`)으로 엽니다.
2. **레드마인 서버에 접속하지 마세요.** 이미 PC에 저장된 기록만 씁니다.
3. 시작하기 전에 사용자에게 **세 가지만** 물어보세요. 대답이 없으면 기본값으로 진행합니다.
   - 기간 (기본: 최근 90일)
   - 코드 원문 포함 여부 (기본: **제외**. 언어와 줄 수만 남김)
   - 다른 사람 댓글 포함 여부 (기본: 포함. 최근 5개만)
4. 분석은 **내보낸 파일 내용만** 근거로 합니다. 파일에 없는 내용은 추측하지 말고 "기록 없음"이라고 쓰세요.

## 1단계: 기록 내보내기

아래 파이썬 스크립트를 `swot_export.py` 로 저장하고 실행하세요. 파이썬 표준 라이브러리만 씁니다.
- 설정은 환경 변수로 바꿉니다: `SWOT_FROM`, `SWOT_TO` (YYYY-MM-DD), `SWOT_CODE=1` (코드 포함), `SWOT_COMMENTS=0` (댓글 제외), `SWOT_OUT` (저장할 파일 경로)
  - PowerShell 예: `$env:SWOT_FROM="2026-07-01"; python swot_export.py`
- DB 위치: `%APPDATA%\RedmineNotes2\notes.db`. 설정에서 데이터 위치를 옮겼다면 `%APPDATA%\RedmineNotes2\location.json` 의 `data_dir` 를 씁니다(스크립트가 알아서 찾음).
- 결과: 현재 폴더에 `swot-export-<시작>_<끝>.md`

**"내 일감" 기준**: 아래 중 하나라도 있으면 내 일감으로 봅니다. 앱 화면의 "내가 기록한 일감"과 같은 기준이에요.
- 요건을 직접 고침
- 처리 · 코드 · 이유 중 하나라도 씀
- 진행 기록이 있음

```python
"""레드마인 노트 2 → 업무 회고(SWOT 분석)용 마크다운 내보내기. 읽기 전용."""
import datetime as dt
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

# ===== 설정 (필요하면 여기만 바꾸세요) =====
FROM = os.environ.get("SWOT_FROM") or (dt.date.today() - dt.timedelta(days=90)).isoformat()
TO = os.environ.get("SWOT_TO") or dt.date.today().isoformat()
INCLUDE_CODE = os.environ.get("SWOT_CODE", "0") == "1"      # 1 이면 코드 원문 포함
INCLUDE_COMMENTS = os.environ.get("SWOT_COMMENTS", "1") == "1"  # 0 이면 다른 사람 댓글 제외
MAX_TEXT = 600                                               # 한 칸이 이보다 길면 줄임
OUT = Path(os.environ.get("SWOT_OUT") or f"swot-export-{FROM}_{TO}.md")
# ===========================================

DONE = ["완료", "최종확인요청", "작업완료", "검수완료(승인)"]
HOLD = ["중단", "보류", "검토중(보류)", "검토중(반려)"]


def find_db():
    home = Path(os.environ.get("REDMINE_NOTES_HOME") or Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / "RedmineNotes2")
    try:
        d = json.loads((home / "location.json").read_text(encoding="utf-8-sig")).get("data_dir")
        if d and (Path(d) / "notes.db").exists():
            return Path(d) / "notes.db"
    except Exception:
        pass
    return home / "notes.db"


def short(s, n=MAX_TEXT):
    s = re.sub(r"\n{3,}", "\n\n", (s or "").strip())
    return s if len(s) <= n else s[:n].rstrip() + f" …(이하 {len(s) - n}자 생략)"


def quote(s):
    return "\n".join("  > " + line for line in short(s).splitlines()) if (s or "").strip() else "  > (기록 없음)"


def day(s):
    return (s or "")[:10]


def code_summary(s):
    blocks = re.findall(r"```(\w*)\n(.*?)```", s or "", re.S)
    if not blocks:
        lines = len([x for x in (s or "").splitlines() if x.strip()])
        return f"코드/메모 {lines}줄 (원문 생략)" if lines else ""
    return "코드 상자 " + ", ".join(f"{lang or '언어 미지정'} {len(body.strip().splitlines())}줄" for lang, body in blocks) + " (원문 생략)"


def main():
    path = find_db()
    if not path.exists():
        sys.exit(f"DB 를 찾지 못했어요: {path}")
    c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)   # 읽기 전용으로 연다
    c.row_factory = sqlite3.Row
    cols = {r["name"] for r in c.execute("PRAGMA table_info(notes)")}
    g = lambda r, k: r[k] if k in cols and r[k] is not None else ""

    prog, todos, troubles = {}, {}, {}
    for r in c.execute("SELECT * FROM progress ORDER BY day, id"):
        prog.setdefault(r["issue_id"], []).append(r)
    for r in c.execute("SELECT * FROM todos ORDER BY pos, id"):
        todos.setdefault(r["issue_id"], []).append(r)
    for r in c.execute("SELECT * FROM trouble"):
        n = re.sub(r"\D", "", r["rm_no"] or "")
        if n:
            troubles.setdefault(int(n), []).append(r)

    cases = []
    for n in c.execute("SELECT * FROM notes"):
        iid = n["issue_id"]
        req_edited = (n["requirement"] or "").strip() != (n["description"] or "").strip() and (n["requirement"] or "").strip()
        mine = req_edited or any(g(n, k).strip() for k in ("action", "code_change", "reason")) or prog.get(iid)
        if not mine:
            continue
        pg = [p for p in prog.get(iid, []) if FROM <= p["day"] <= TO]
        changes = json.loads(g(n, "changes") or "[]")
        stat = [(day(ch["created_on"]), it.get("old", ""), it.get("new", ""), ch.get("user", ""))
                for ch in changes for it in ch["items"] if it["label"] == "상태"]
        touched = [p["day"] for p in prog.get(iid, [])] + [s[0] for s in stat] + [day(n["updated_on"])]
        if not pg and not any(FROM <= d <= TO for d in touched):
            continue
        cases.append((n, pg, stat, changes))

    cases.sort(key=lambda x: (x[1][0]["day"] if x[1] else day(x[0]["updated_on"])))
    out = []
    w = out.append

    # ---- 요약 지표 (프로그램이 계산) ----
    n_done = sum(1 for n, *_ in cases if n["rm_status"] in DONE)
    n_hold = sum(1 for n, *_ in cases if n["rm_status"] in HOLD)
    reopen_total, spans = 0, []
    by_tracker, by_project = {}, {}
    for n, pg, stat, _ in cases:
        reopen_total += sum(1 for s in stat if s[1] in DONE and s[2] not in DONE)
        by_tracker[n["tracker"]] = by_tracker.get(n["tracker"], 0) + 1
        by_project[n["project"]] = by_project.get(n["project"], 0) + 1
        allp = prog.get(n["issue_id"], [])
        done_at = next((s[0] for s in reversed(stat) if s[2] in DONE), "")
        if allp and done_at:
            spans.append((dt.date.fromisoformat(done_at) - dt.date.fromisoformat(allp[0]["day"])).days)

    w("# 업무 기록 회고 자료 (SWOT 분석용)\n")
    w(f"- 기간: {FROM} ~ {TO}")
    w(f"- 만든 시각: {dt.datetime.now():%Y-%m-%d %H:%M} · 레드마인 노트 2에서 자동 추출")
    w(f"- 코드 원문: {'포함' if INCLUDE_CODE else '제외 (언어 · 줄 수만)'} · 다른 사람 댓글: {'포함' if INCLUDE_COMMENTS else '제외'}\n")
    w("## 요약 지표 (프로그램이 계산한 사실)\n")
    w(f"- 기록이 있는 일감: **{len(cases)}건** (완료 {n_done} · 중단/보류 {n_hold} · 진행/대기 {len(cases) - n_done - n_hold})")
    w(f"- 완료 후 다시 열린 횟수(재오픈): **{reopen_total}회**")
    if spans:
        w(f"- 첫 진행 기록 → 완료까지: 평균 **{sum(spans) / len(spans):.1f}일** · 가장 짧게 {min(spans)}일 · 가장 길게 {max(spans)}일 ({len(spans)}건 기준)")
    w(f"- 기간 안 진행 기록: {sum(len(p) for _, p, _, _ in cases)}개 · 트러블슈팅 문서가 연결된 일감: {sum(1 for n, *_ in cases if n['issue_id'] in troubles)}건")
    w("- 트래커별: " + ", ".join(f"{k} {v}" for k, v in sorted(by_tracker.items(), key=lambda x: -x[1])))
    w("- 프로젝트별: " + ", ".join(f"{k} {v}" for k, v in sorted(by_project.items(), key=lambda x: -x[1])) + "\n")

    # ---- 일감별 사례 ----
    w("## 일감별 사례\n")
    for n, pg, stat, changes in cases:
        iid = n["issue_id"]
        td = todos.get(iid, [])
        allp = prog.get(iid, [])
        done_at = next((s[0] for s in reversed(stat) if s[2] in DONE), "")
        reopen = sum(1 for s in stat if s[1] in DONE and s[2] not in DONE)
        span = (dt.date.fromisoformat(done_at) - dt.date.fromisoformat(allp[0]["day"])).days if allp and done_at else None
        w(f"### #{iid} {n['subject']}")
        w(f"- 구분: {n['project']} · {n['tracker']} · 레드마인 상태 **{n['rm_status']}** · 내 역할 {n['roles'] or '-'}")
        meta = [f"진행 기록 {len(allp)}개" + (f" ({allp[0]['day']} ~ {allp[-1]['day']})" if allp else "")]
        if td:
            meta.append(f"할 일 {sum(1 for t in td if t['done'])}/{len(td)} 완료")
        if span is not None:
            meta.append(f"완료까지 {span}일")
        if reopen:
            meta.append(f"⚠ 재오픈 {reopen}회")
        w("- 지표: " + " · ".join(meta) + "\n")

        w("**1. 무엇을 요구받았나 (요건)**")
        w(quote(n["requirement"] or n["description"]) + "\n")

        w("**2. 어떻게 고민하고 진행했나 (시간순)**")
        if pg:
            for p in pg:
                w(f"- {p['day']}: " + short(p["text"], 300).replace("\n", " / "))
        else:
            w("- (기간 안 진행 기록 없음)")
        if td:
            w("- 할 일 목록: " + " · ".join(("☑ " if t["done"] else "☐ ") + (t["text"] or "").strip() for t in td))
        w("")

        w("**3. 무엇을 했나 (처리 내용)**")
        w(quote(g(n, "action")) + "\n")
        cc = g(n, "code_change")
        if cc.strip():
            w("**고친 코드**")
            w(("```\n" + short(cc, 1500) + "\n```") if INCLUDE_CODE else "- " + code_summary(cc))
            w("")
        w("**4. 왜 그렇게 했나 (판단 이유)**")
        w(quote(g(n, "reason")) + "\n")

        w("**5. 결과는 어땠나**")
        if stat:
            w("- 상태 흐름: " + " → ".join(f"{s[2]}({s[0][5:]})" for s in stat))
        if INCLUDE_COMMENTS:
            js = json.loads(n["journals"] or "[]")
            for j in js[-5:]:
                who = (j.get("user") or {}).get("name", "")
                w(f"- 댓글 {day(j.get('created_on'))} {who}: " + short(j.get("notes", ""), 200).replace("\n", " / "))
        for t in troubles.get(iid, []):
            w(f"- 트러블슈팅 「{t['title']}」({t['status']}) — 증상: {short(t['symptom'], 150)} / 원인: {short(t['cause'], 150)} / 해결: {short(t['solution'], 150)}")
        w("\n---\n")

    OUT.write_text("\n".join(out), encoding="utf-8")
    print(f"저장했어요: {OUT.resolve()}  (일감 {len(cases)}건, {OUT.stat().st_size // 1024}KB)")


main()
```

실행 후 저장된 파일 경로와 일감 수를 사용자에게 알려 주세요. 파일이 너무 크면(약 300KB 이상) 기간을 나눠 다시 실행하자고 제안하세요.

## 2단계: SWOT 분석

내보낸 파일을 처음부터 끝까지 읽고, 아래 형식으로 분석하세요.

### 분석 관점

각 일감은 **요건 → 고민 과정 → 처리 → 판단 이유 → 결과** 순서로 정리되어 있습니다. 결과만 보지 말고 **생각하고 판단한 과정**을 보세요.

- **강점 (S)**: 반복해서 잘 되는 것
  - 예: 원인을 빨리 좁힘, 판단 이유가 분명함, 재오픈 없이 끝남, 트러블슈팅을 문서로 남김
- **약점 (W)**: 반복되는 실수나 빈틈
  - 예: 재오픈, 오래 걸린 일감의 공통점, 고민 없이 바로 처리, 이유를 안 남김, 할 일을 끝까지 안 닫음
- **기회 (O)**: 기록에서 보이는, 키우면 좋을 영역
  - 예: 자주 맡는 업무 종류, 남이 자주 묻는 영역, 쌓인 노하우를 문서나 도구로 만들 수 있는 것
- **위협 (T)**: 그대로 두면 문제가 될 위험
  - 예: 같은 장애가 계속 반복됨, 특정 프로젝트에 업무가 몰림, 혼자만 아는 지식, 보류 · 중단이 쌓임

### 근거 규칙

- 모든 항목에 **근거 일감 번호**를 붙이세요 (예: `#1234, #1301`). 근거가 일감 1건뿐이면 "약한 근거"라고 표시하세요.
- **사실**(요약 지표 · 상태 흐름 · 날짜)과 **해석**(AI의 판단)을 구분해서 쓰세요.
- 칭찬이나 비판을 부풀리지 마세요. 기록이 부족해서 판단할 수 없는 부분은 따로 모으세요.

### 출력 형식

```markdown
# 업무 회고 SWOT (기간)

## 한 줄 요약

## 강점 (S)
| 강점 | 근거 일감 | 관찰된 패턴 (사실 → 해석) |

## 약점 (W)
| 약점 | 근거 일감 | 관찰된 패턴 | 개선 제안 (구체적 행동 1개) |

## 기회 (O)
| 기회 | 근거 일감 | 어떻게 살릴지 |

## 위협 (T)
| 위협 | 근거 일감 | 미리 막는 방법 |

## 고민 · 판단 방식 분석
- 문제를 받았을 때 주로 어떤 순서로 접근하는지 (진행 기록 기반)
- 판단 이유를 남기는 습관 (이유 칸을 채운 비율과 질)
- 오래 걸린 일감 Top 3 와 그 공통점

## 기록 자체에 대한 피드백
- 분석하기에 부족했던 기록 (예: 이유 칸이 비어 있음, 결과가 없음)
- 다음부터 기록하면 분석이 더 정확해질 항목

## 다음 기간 실천 과제 3개
```

분석이 끝나면 결과를 `swot-result-<시작>_<끝>.md` 로 저장하고 경로를 알려 주세요.
