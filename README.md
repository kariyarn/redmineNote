# 레드마인 노트 2 (Redmine Notes 2)

> 내 레드마인 일감을 PC에 노트로 모아 두고, **처리 내용 · 수정한 코드 · 이유**를 기록하는 개인용 로컬 도구

![platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue)
![python](https://img.shields.io/badge/python-3.10%2B-blue)
![deps](https://img.shields.io/badge/dependencies-none-brightgreen)
![license](https://img.shields.io/badge/license-MIT-green)

### ⬇️ 최신 버전 내려받기

**[설치 파일 (RedmineNotes2-Setup.exe)](https://github.com/kariyarn/redmineNote/releases/latest/download/RedmineNotes2-Setup.exe)** — 권장 · 다시 설치하면 새 버전으로 덮어씀 · 데이터는 그대로
· [exe 만 (RedmineNotes2.exe)](https://github.com/kariyarn/redmineNote/releases/latest/download/RedmineNotes2.exe)
· [모든 버전](https://github.com/kariyarn/redmineNote/releases)

> 새 버전 올리기: **Actions → build → Run workflow** 를 `main` 에서 돌리면 정식 릴리스(`v<버전>`, Latest)가 되고 위 링크가 그 파일로 바뀝니다.
>
> 베타: PR 이 `main` 에 머지될 때마다 자동으로 **베타 릴리스**(`v<버전>-beta.<번호>`, Pre-release)를 쌓아요. 파일은 `RedmineNotes2-Beta-Setup-2.20.0-beta.3.exe` · `RedmineNotes2-Beta-2.20.0-beta.3.exe` 처럼 정식 파일과 이름이 달라요. [모든 버전](https://github.com/kariyarn/redmineNote/releases)에서 받을 수 있고, Latest 가 아니라서 위 링크와 정식 버전의 앱 안 업데이트에는 잡히지 않아요.
> - 베타는 **정식과 따로 설치 · 실행**돼요: 설치 위치(`%LOCALAPPDATA%\Programs\RedmineNotes2-Beta`) · exe 이름 · 포트(8792, 정식 8791) · 창 제목 `레드마인 노트 2 (베타)` · 작업 표시줄 묶음 · 트레이 · 앱 창 프로필 · 시작 메뉴/제거 항목이 모두 따로예요.
> - **노트 데이터(일감 · 메모 · 설정 · 백업)는 같이 써요**(`%APPDATA%\RedmineNotes2`). 그래서 정식과 베타는 **한 번에 하나만** 켤 수 있고, 다른 쪽이 켜져 있으면 알리고 끝나요.
> - 베타의 앱 안 업데이트는 가장 새 **베타**를 확인해요(빌드한 커밋으로 같은 빌드인지 봐요).
>
> 2.19 부터는 **앱 안에서 업데이트**할 수 있어요: 켤 때(하루 한 번) 새 버전을 확인해 알려 주고, **설정 → 일반 → 업데이트**에서 `받고 업데이트` → `바꾸고 다시 시작` 하면 앱이 잠깐 꺼졌다가 새 버전으로 켜져요. 설치 파일로 깐 경우는 새 설치 파일을 조용히 실행하고, exe 만 쓰는 경우는 exe 를 바꿔 끼워요. 처음 2.19 로 올라갈 때만 위 링크로 직접 받으면 돼요.

## 이런 도구입니다

- **내 일감을 노트로**: 레드마인에서 내 일감을 내려받아, 일감마다 처리 내용 · 고친 코드 · 판단 이유를 적어 둡니다.
- **안전한 쓰기**: 레드마인에서는 읽어 오기만 합니다. 사용자가 버튼을 직접 눌렀을 때만 **댓글 · 첨부파일 · 상태 · 담당자/개발담당자**를 올립니다. 본인 첨부 삭제와 본인 댓글 수정도 확인 후에만 실행합니다.
- **내 PC 안에서만**: 서버는 `127.0.0.1` 에서만 열리고, API 키는 윈도우 계정별 암호화(DPAPI)로 저장합니다.
- **외부 패키지 없음**: 파이썬 표준 라이브러리만 씁니다. 화면은 같은 서버가 내려주는 순수 HTML/CSS/JS 입니다.

### 주요 기능
| 기능 | 설명 |
|---|---|
| 일감 노트 | 원문 · 댓글 이력 · 내 정리 기록(처리 내용 / 코드 / 이유) |
| 자동 가져오기 | 정한 간격마다 바뀐 일감을 가져옴 (트레이에서도, 영업일 08:30 ~ 18:30, 공휴일은 내장 표 · 설정의 추가 휴일), 새 일감 알림 |
| 깃허브 백업 | 내 비공개 깃허브 저장소에 노트를 자동으로 올림 (앱 닫을 때 + 켜져 있는 동안 N시간마다, 밀린 것은 켤 때 한 번). 복원은 백업 시점을 골라 직접 |
| 주제 사전 | 용어로 비슷한 일감에 바로 접근 |
| 메모 · 알림 | 포스트잇 메모, 달력, 알림(확인 / 미루기) |
| 보관함 | 왼쪽 메뉴에서 코드 · 쿼리 · 명령어를 선택. 코드/쿼리는 언어 · 코드 위치 · 버전 메모와 코드 색칠, 명령어는 내가 등록한 댓글 단축어로 입력란을 그 문구로 바꿈(많으면 선택칸으로 접고 '버튼으로 꺼내 두기'한 것만 버튼). 문구 안의 `#{이름}` 은 직접 만든 변수(상수 · JavaScript 함수)로 바뀜 |
| 트러블슈팅 문서 | 문제 · 원인 · 해결 기록 |
| 배포요청 | 배포요청 일감에서 내 요청을 찾아 상태 표시 |
| 요약 · 그래프 | 기간별 처리 요약, 용어 · 일감 관계 그래프 |
| 디자인 전환 | 설정에서 `기존 / 새 디자인` 선택 |

## 빠르게 시작하기

**필요한 것**: Windows 10/11, [Python 3.10 이상](https://www.python.org/downloads/), 레드마인 계정(REST API 사용 가능)

```bash
git clone https://github.com/kariyarn/redmineNote.git
cd redmineNote
python main.py
```

1. 브라우저에서 <http://127.0.0.1:8791> 을 엽니다. 소스로 실행하면 창이 자동으로 열리지 않습니다.
2. 첫 화면에서 **레드마인 주소**와 **API 키**를 넣습니다.
   - API 키 찾는 곳: 레드마인 로그인 → 오른쪽 위 **내 계정** → **API 접근 키 → 표시**
3. 내 일감을 가져오면 끝입니다.

> 데이터는 `%APPDATA%\RedmineNotes2` 에 저장됩니다. 개발할 때 실제 데이터와 섞이지 않게 하려면 `REDMINE_NOTES_HOME` 으로 다른 폴더를 지정하세요(아래 환경 변수 참고).

## 빌드 (exe 만들기)

파일 하나짜리 `RedmineNotes2.exe` 를 만듭니다. 받는 PC에는 파이썬이 없어도 됩니다.

```bash
python -m pip install pyinstaller
build.bat
```

- 결과: `dist\RedmineNotes2.exe`
- `build.bat` 이 하는 일: PyInstaller로 `main.py` + `web/` 화면 + 아이콘을 한 파일로 묶습니다(`--onefile --noconsole`).
- **깃허브에서 만들기**: 저장소 **Actions → build → Run workflow**(브랜치 고르기) → 끝나면 그 실행 화면 아래 **Artifacts** 에서 `RedmineNotes2-<버전>` 을 받습니다. 안에 `RedmineNotes2-Setup-<버전>.exe`(설치 파일)와 `RedmineNotes2.exe` 가 들어 있습니다. PR 을 올려도 같은 빌드가 돌아갑니다.
- **설치 파일**: 관리자 권한 없이 `%LOCALAPPDATA%\Programs\RedmineNotes2` 에 설치하고 시작 메뉴(선택: 바탕화면) 바로가기를 만듭니다. 새 버전은 그냥 다시 설치하면 덮어쓰고, 켜져 있는 앱은 설치 전에 닫습니다. 데이터(`%APPDATA%\RedmineNotes2`)는 건드리지 않습니다. 직접 만들려면 [Inno Setup 6](https://jrsoftware.org/isinfo.php) 을 깔고 `build.bat` 뒤에 `iscc /DAppVer=<버전> installer\RedmineNotes2.iss`.
- 묶은 exe 점검(임시 데이터 · 임시 포트로 띄워 화면 파일이 들어 있는지 확인):

```bash
python tests/test_exe.py dist/RedmineNotes2.exe
```

## 시험

시험은 임시 데이터를 사용하며, 레드마인 연동이 필요한 경우에는 **가짜 레드마인**을 사용합니다. 실제 레드마인이나 실제 사용자 데이터를 쓰지 않습니다.

```bash
python tests/test_alarm.py .
python tests/test_autosync.py .
python tests/test_gitbackup.py .
python tests/test_update.py .
python tests/test_attention.py .
python tests/test_beta.py .
python tests/test_queries.py .
python tests/test_commands.py .
python tests/test_release.py main.py
python tests/test_write.py main.py
python tests/test_write_safety.py
python tests/test_manage.py
node tests/test_write_ui.js
node tests/test_manage_ui.js
node tests/test_comment_editor.js
python tests/test_comment_browser.py
```

| 시험 | 확인하는 것 |
|---|---|
| `test_alarm.py` | 메모 알림 로직 |
| `test_autosync.py` | 자동 가져오기 로직 (간격 · 기간 · 업무 시간) |
| `test_gitbackup.py` | 깃허브 백업 (가짜 깃허브: 올리기 · 변경 없음 · 충돌 · 복원 · 올리는 때) |
| `test_update.py` | 앱 업데이트 (가짜 Releases: 확인 · 받기 · 크기/SHA-256/실행 파일 검증 · 바꾸기 준비 · 자동 확인) |
| `test_beta.py` | 베타 채널 (포트 · 제목 · 데이터 폴더 공유 · 가장 새 베타 확인 · 같은 빌드/낮은 버전 무시 · 다른 채널이 켜져 있으면 끝내기) |
| `test_attention.py` | 안 보고 있을 때 알림 (보고 있는지 판단 · 작업 표시줄 반짝임 · 윈도우 알림 · 설정 끄기 · 메모 알림) |
| `test_queries.py` | 보관함의 코드/쿼리 로직 |
| `test_commands.py` | 보관함의 명령어 로직 |
| `test_release.py` | 가져오기 · 검색 · 배포요청 |
| `test_write.py` | 레드마인 쓰기 API |
| `test_write_safety.py` | 인증 리다이렉트 차단 · 첨부 ID/작성자/저널 검증 · 영속 상태/재시작 · 토큰 만료 · 오류 마스킹 · 일감별 동시 쓰기 |
| `test_manage.py` | 본인 첨부 삭제·다운로드 차단·삭제 이력, 본인 댓글 수정·서식/변경 이력 보존, 권한·충돌·API 미지원·응답 유실·중복/재시작 |
| `test_manage_ui.js` | 기존/새 디자인의 삭제 확인·댓글 편집·저장/취소·공유 초안·실패 유지·복구 (Node.js, 네트워크 없음) |
| `test_comment_editor.js` | DOM 대역에서 댓글 형식 변환·HTML/URL/CSS 차단·붙여넣기·한글 조합·실행 취소 검사. 네이티브 브라우저 명령·레이아웃 검사는 아님 |
| `test_comment_flow.js` | `test_manage.py`에서 자동 실행. 두 디자인의 실제 JS 편집기·업로드·댓글 저장을 임시 앱 HTTP와 기존 가짜 서버까지 연속 검사. Node.js 필요, DOM은 대역이며 소켓/DNS를 지정된 127.0.0.1 포트로 제한 |
| `test_comment_browser.py` | 임시 Chromium 프로필·차단 프록시·127.0.0.1 전용 CSP를 사용하는 실제 브라우저 검사. GPU/프로세스 권한이 없으면 명확히 SKIP. `--serve`는 로컬 수동 검사 페이지 제공 |
| `test_write_ui.js` | 기존/새 디자인의 파일 선택 공유 · 제거 · 실패 유지 · 성공 초기화 · 중복 클릭 · 미확정 요청 복구 (Node.js 필요, 네트워크 사용 없음) |
| `run_isolated.py` | 기존 로직 시험 8종을 소스 사본·임시 홈·루프백 통신으로 격리 실행 (`python tests/run_isolated.py`, 특정 시험은 뒤에 `alarm` 등 이름 지정) |
| `test_exe.py` | 빌드한 exe 점검 |
| `start_ui_test.py` | 가짜 레드마인으로 앱을 띄워 화면을 직접 확인 (`python tests/start_ui_test.py main.py`) |

`test_write.py`, `test_write_safety.py`, `test_manage.py`, `test_release.py`, `start_ui_test.py`, `run_isolated.py`는 `isolated_env.py`로 가짜 서버·임시 데이터·127.0.0.1 외 통신 차단을 검증한 뒤 시작합니다. 실제 Redmine에 연결된 개발 환경에서는 기존 로직 시험도 개별 명령 대신 `python tests/run_isolated.py`로 실행하세요. 수동 화면 확인은 `start_ui_test.py`가 출력하는 `READY http://127.0.0.1:<포트>`를 여세요. 종료는 Ctrl+C입니다.

댓글의 **＋ 파일 첨부**는 파일당 20MB·합계 50MB·최대 10개를 지원합니다. 파일은 브라우저 메모리에만 보관하므로 새로고침하면 다시 골라야 합니다. 업로드 토큰은 서버 메모리에만 있으며, 최종 PUT 전 업로드 단계에서 실패한 경우에만 재사용합니다. PUT 전에 요청 상태를 SQLite에 영속화하고, 미확정 요청은 서버 재시작 후에도 자동 재전송하지 않습니다. DB에는 토큰·바이너리를 저장하지 않습니다.

공식 업로드 API의 201 응답에 token만 있어도 지원하며, 최종 PUT이 명확한 2xx(일반적으로 204) 응답이면 정상 등록 성공으로 처리합니다. 업로드 ID는 필수가 아닙니다. 타임아웃·연결 끊김·서버 오류 등 응답이 불분명한 경우에만 명시적 첨부 ID, 변경 전후 목록, 작성자, 같은 새 변경 이력으로 반영 여부를 확인합니다. 파일명·크기만으로 성공을 추정하지 않으며, 증거가 부족하면 댓글·파일을 유지합니다. **반영 확인** 또는 Redmine에서 직접 확인한 뒤 **등록됨 확인**을 선택하세요. 전혀 반영되지 않은 것을 확인한 경우에만 **미등록 확인 / 재시도 준비** 후 올리기를 직접 누르세요. 토큰 만료도 같은 절차를 따르며, 일부만 반영됐다면 새로 보내지 말고 Redmine에서 정리하세요. 미등록 업로드 파일은 Redmine 측 정리 정책을 따릅니다.

API 키/Bearer 인증 요청은 같은 origin을 포함한 모든 301·302·303·307·308 리다이렉트를 거절합니다. 프록시 등이 리다이렉트하면 설정에서 최종 API 주소를 확인하세요.

첨부 목록의 **🗑 삭제**는 본인 첨부이며 로컬 쓰기 허용 범위에 있고 API가 명시적으로 삭제 불가라고 하지 않은 경우에 표시됩니다. 일감·첨부 ID·파일명을 확인한 후 원본 파일을 삭제하고 목록과 삭제 이력을 다시 읽습니다. 소유권은 서버에서 재검사하며, 최종 프로젝트 권한은 Redmine이 검사합니다. REST 응답에 전체 역할 권한이 없으면 본인 파일도 Redmine에서 403으로 거절할 수 있습니다.

본인 댓글의 **✎**로 편집창을 열어 저장하거나 취소할 수 있습니다. HTML은 시각/소스 편집으로, 과거 비HTML 및 지원 밖의 기존 HTML은 원문 호환 경로로 보존합니다. 같은 journal의 notes만 수정하며 코드·줄바꿈·상태·담당자 이력은 유지합니다. 원문/이력 해시로 충돌을 검사하고 API 미지원(404/405/501)이나 권한 거절은 원본 Redmine에서 확인하도록 안내합니다.

삭제·수정도 원격 요청 전에 기존 요청 원장에 기록하며, 같은 일감의 실행 중 락은 댓글 등록과 공유합니다. 미확정 관리 요청은 별도 범위로 보관해 새 댓글 등록까지 막지는 않습니다. 타임아웃·연결 끊김·서버 오류 시 무조건 성공으로 추정하거나 재전송하지 않습니다. 원본에서 확인한 뒤 **반영됨 확인** 또는 **미반영 확인 / 재시도 준비**를 선택하세요. 이 확인 자체는 원격 변경을 다시 보내지 않으며, 서버 조회 결과가 확인 내용과 맞지 않으면 계속 차단합니다. 편집 초안은 메모리에만 있어 새로고침하면 사라집니다. 다른 Redmine 화면에서 동시에 수정하는 경우 마지막 조회와 원격 PUT 사이의 경쟁까지 원자적으로 막는 기능은 없습니다.

## 댓글 편집기와 Redmine 호환성 (2.33.3)

신규 댓글은 **HTML 시각 편집**이 기본입니다. 형식 선택 메뉴 없이 아이콘 도구와 **HTML 소스 / 시각 편집** 전환을 사용합니다. 강조·문단·목록·정렬·글꼴/크기/색상·링크·표·이미지·코드·실행 취소를 지원하며, 브라우저가 실행할 수 없는 도구는 표시하지 않습니다. 버튼은 tooltip·aria-label·키보드 포커스·활성 상태를 제공합니다. 처리 내용과 명령어의 일반 텍스트/코드는 안전한 HTML로 삽입합니다.

일반 시각 편집에서 **Enter는 별도 p 문단**, **Shift+Enter는 같은 p 안의 br 줄바꿈**입니다. 브라우저의 문단/줄바꿈 명령을 사용하며 기본 문단 구분 설정은 실행 직후 원래 값으로 복구합니다. 한국어 조합 중 Enter는 가로채지 않습니다. 목록·표는 브라우저의 기존 구조 편집을 유지하고 코드 블록은 코드 안에 줄바꿈을 넣습니다. 미지원 명령은 기존 네이티브 키 동작으로 넘깁니다.

모든 최상위 일반 p에 점선과 작은 P를 유지하고 현재 커서 문단을 추가로 강조합니다. 하단에는 `body > p > strong` 같은 요소 경로를 보여 줍니다. 목록·표·코드·이미지 문단에는 경계를 붙이지 않습니다. 경계선/P는 편집기 CSS이고 요소 경로는 입력 영역 밖에 있으며, 내부 활성 문단 속성도 직렬화 시 제거합니다. Backspace/Delete는 브라우저의 삭제·병합을 유지하고, 일반 문단에서 삭제 후 생긴 직접 텍스트·새 div·빈 본문만 p로 복구합니다. 빈 편집기는 커서를 둘 수 있는 p/br을 사용하며 기존 소스의 정상 div와 특수 구조를 일괄 변환하지 않습니다. 소스·저장 HTML·댓글 이력에는 편집용 표시가 들어가지 않습니다. 정상 편집 화면의 불필요한 정책 안내는 숨기지만 정제·XSS·URL·인증 검증과 오류 안내는 유지합니다.

기존 HTML 댓글은 초기화·모드 전환만으로 다시 직렬화하지 않습니다. 과거 비HTML 댓글과 지원 밖의 기존 원문에는 내부 원문 호환 경로를 사용하며 Markdown/Textile 선택 메뉴는 없습니다. 위험한 태그·이벤트·URL·CSS는 렌더링과 전송에서 차단합니다. HTML 소스에 직접 쓴 안전한 내용을 시각 화면에서 확인할 수 있습니다. 회사에서 HTML 소스를 사용하는 정황은 확인됐지만 **실제 서버의 저장·정제 정책과 플러그인 호환성을 검증한 것은 아닙니다.**

### 기존 이미지와 댓글 이력

main의 이미지 프록시를 유지하면서 경로 인코딩을 보존합니다. 같은 origin의 `/system/rich/...`, `/system/attachments/...`, 표준 `/attachments/...` 및 원문에 실제로 있는 `/rich/files/<숫자>/파일` 이미지 참조만 처리합니다. 관리 화면 `/rich/files/?CKEditor=...`는 호출하지 않습니다. 썸네일 size/width/height/t의 제한된 숫자 쿼리 외 인증 쿼리·외부 origin·경로 우회는 거절합니다. 임의 쿠키/CSRF나 CKEditor 콜백을 사용하지 않습니다.

읽기용 HTML은 `.remote-html` 범위에서 표시하며 편집기 CSS와 분리합니다. HTML 서식용 줄바꿈을 정리하고 p/div의 기본 여백을 제한하며, 코드의 줄바꿈은 보존합니다. 본문에 이미 있는 첨부 ID 이미지는 댓글 밑에 다시 붙이지 않습니다. 401/403/404, 리다이렉트, 이미지가 아닌 응답, 브라우저 디코딩 오류는 구분해 안내합니다. 브라우저 로그인 세션으로 보이는 사진도 REST API 키로는 거절될 수 있습니다. 인증 리다이렉트는 같은 origin을 포함해 계속 차단합니다.

### 이미지 팝업

1. 이미지 아이콘을 눌러 팝업을 엽니다. 현재 일감의 REST 첨부와 이미 불러온 본문·댓글의 안전한 이미지 참조를 썸네일로 보여 줍니다. 회사 Rich Browser 전체 저장소를 조회하는 기능은 아닙니다.
2. **＋**로 PNG/JPG/GIF/WebP 파일을 선택합니다. 미리보기만 표시하며 파일은 메모리에 보관합니다. 파일당 20MB와 바이너리 서명을 검사합니다.
3. **업로드 · 일감에 첨부**를 눌러 기존 REST 업로드·요청 원장으로 파일만 등록합니다. 댓글·상태·담당자·기존 선택 파일은 함께 보내거나 초기화하지 않습니다.
4. 자동 갱신된 실제 첨부 ID와 content_url을 확인해 이미지를 누르면 커서 위치에 삽입됩니다. 이어서 텍스트를 작성하고 크기(너비)·문단 기준 위치·본문에서 제거·실행 취소를 사용할 수 있습니다. 마지막으로 댓글 **올리기** 또는 **수정 저장**을 누르세요.

팝업은 닫기·ESC·키보드 Tab을 지원합니다. 미리보기만으로 업로드하지 않으며, 업로드 성공 후 목록을 다시 읽습니다. 조회 실패·안전한 content_url 부재·브라우저 삽입 실패는 성공으로 꾸미지 않습니다. **목록 새로고침**은 조회만 수행합니다. 토큰에서 ID를 추측하거나 같은 파일명/크기로 다른 첨부를 자동 선택하지 않습니다.

REST 첨부와 Rich Browser는 별도 저장 구조일 수 있습니다. 신규 파일은 토큰만으로 최종 첨부 URL을 보장할 수 없어 선첨부와 댓글 저장을 별도 명시적 요청으로 유지합니다. 선첨부 이력이 남으며 편집 취소/저장 실패 후 파일은 원격에 남습니다. 불필요한 파일은 목록에서 직접 삭제하세요. 미확정이면 초안·파일을 유지하고 반영 확인 절차를 사용하며 자동으로 재전송하지 않습니다. 로컬 프록시·blob URL은 원격 댓글에 저장하지 않습니다. REST 주소가 다른 origin/서명 URL이면 지원하지 않으며 실제 회사에서의 렌더링 성공을 가짜 시험만으로 보장하지 않습니다.

첨부 행은 동일한 전체 너비의 Grid이며 삭제 가능 파일만 오른쪽 별도 버튼을 둡니다. 파일 박스 전체가 다운로드 링크이고, 박스 전체 hover 배경·테두리 강조를 사용합니다. 이미지 썸네일 클릭은 다운로드를 취소하고 확대하며, 이미지 박스에 키보드 포커스를 둔 경우 Enter는 다운로드·Space는 확대입니다. 삭제 버튼은 링크와 형제이며 간격 8px·높이·모서리를 맞춥니다. **삭제 아이콘과 글자만 빨간색**이며 배경·테두리는 파일 박스와 같은 테마 색상입니다. 본문 이미지 제거는 태그만 지우며 원격 파일 삭제는 별도 확인창을 사용합니다.

편집기는 프로젝트 MIT 코드·브라우저 DOM API·로컬 SVG/문자 아이콘을 사용합니다. 외부 라이브러리·CDN을 추가하지 않았습니다. 네이티브 편집 API의 장기 지원은 향후 점검 대상이며, 미지원 브라우저는 소스로 제한합니다. Windows 빌드의 기존 `--add-data "web;web"`로 리소스를 포함합니다. 정적 포함/HTTP 제공 검사와 실제 EXE/Installer 빌드는 구분합니다.

수동 검사: `python tests/start_ui_test.py main.py`의 READY 주소에서 기존/새 디자인과 테마를 바꾸어 확인하세요. `python tests/test_comment_browser.py --serve`는 루프백 전용 CSP의 브라우저 검사 페이지를 제공합니다. 자동 Chromium은 임시 프로필·차단 프록시를 사용하며 렌더러 권한 제한 시 SKIP입니다. DOM/실제 로컬 HTTP/PNG 압축 데이터 검증은 네이티브 선택 영역·그리기·픽셀 간격 검증을 대신하지 않습니다.

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `REDMINE_NOTES_HOME` | `%APPDATA%\RedmineNotes2` | 설정 · 데이터 위치 |
| `REDMINE_NOTES_PORT` | `8791` | 서버 포트 |
| `REDMINE_NOTES_IDLE_SEC` | `600` | 화면이 닫힌 뒤 자동 종료까지 초 (`0` = 끄지 않음) |
| `REDMINE_NOTES_NO_APPWIN` | | `1` 이면 브라우저/앱 창을 열지 않음 (시험용) |
| `REDMINE_NOTES_ALARM_TICK` | | 알림 확인 간격(초) |
| `REDMINE_NOTES_GITHUB_API` | `https://api.github.com` | 깃허브 백업이 부르는 API 주소 (시험용 가짜 깃허브) |
| `REDMINE_NOTES_UPDATE_API` | `https://api.github.com` | 앱 업데이트가 최신 릴리스를 확인하는 API 주소 (시험용 가짜 깃허브) |
| `REDMINE_NOTES_UPDATE_DRYRUN` | (없음) | `1` 이면 업데이트를 바꿀 때 도우미를 띄우지도 앱을 끄지도 않는다 (시험용) |
| `REDMINE_NOTES_UPDATE_MODE` | (자동) | `installer` · `exe` · `source` 로 설치 방식을 정해 둔다 (시험용) |

## 폴더 구조

```
main.py                 시작점 (python main.py)
rnotes/                 서버 (기능별 모듈, 위에서 아래로만 의존)
  config.py             경로 · 상수 · 첫 실행 준비 · 공유 상태(conn / STATE / RUN)
  storage.py            SQLite(db) · 스키마(init_db) · 설정값 · 백업/복원
  http_client.py        인증 요청의 모든 리다이렉트 차단 (공통 전송)
  write_requests.py     PUT 전 의도 기록 · 미확정 요청과 중복 전송 방지 (토큰/바이너리 제외)
  textutil.py           레드마인 본문(HTML) → 글자
  redmine.py            레드마인 읽기: API 호출 · 캐시 · 가져오기(sync) · 일감 저장 · 연관 일감
  rm_write.py           레드마인에 쓰기(댓글 · 상태 · 담당자) · 첨부 목록
  rm_manage.py          본인 첨부 삭제 · 본인 댓글 원문 수정 · 미확정 관리 요청 복구 (rm_write의 락/원장 재사용)
  comment_format.py     댓글 형식·HTML 태그/속성/URL 검증 (표준 라이브러리)
  rm_deploy.py          레드마인 검색 · 배포요청 일감과 로켓(대기/착륙) 상태
  sticky.py             메모(포스트잇) 저장
  alarms.py             메모 알림 계산 · 달력 · 오늘 볼 메모
  holidays.py           대한민국 공휴일 표 · 쉬는 날 판단 (알림 · 자동 가져오기가 주말·공휴일을 건너뜀)
  autosync.py           자동 가져오기 (정한 간격마다 서버가 스스로 가져옴, 영업일 업무 시간에만)
  gitbackup.py          깃허브 백업 (비공개 저장소에 올리기 · 백업 시점 목록 · 복원)
  trouble.py            트러블슈팅 문서
  queries.py            보관함의 코드/쿼리
  fonts.py              글꼴 파일 목록
  http_handler.py       HTTP: 요청 검사(Host/Origin) · 모든 /api 경로 · /static
  lifecycle.py          창 열기 · 트레이 · 자동 종료 감시 · 알림 스케줄러 (자동 가져오기가 켜져 있으면 꺼지지 않음)
  main.py               서버 켜기(run)
  appwin.py tray.py secret.py   윈도우 전용 부품(앱 창 · 트레이 · API 키 암호화)
web/                    화면
  index.html            뼈대 + CSS/JS 불러오기
  css/*.css             기능별 스타일 (v2.css = 새 디자인, html[data-design=v2] 아래에서만 적용)
  js/*.js               기능별 스크립트 (v2.js = 새 디자인 아이콘 교체)
tests/                  시험 (가짜 레드마인 · 가짜 깃허브)
tools/make_icon.py      아이콘 생성
docs/CHANGELOG.md       버전별 변경 기록
```

**의존 방향**: `config → storage → redmine → rm_write / rm_deploy …(기능) → http_handler → main`. 거꾸로 import 하지 않습니다.

> `web/js/*.js` 는 한 전역 범위를 같이 씁니다. 그래서 `index.html` 의 `<script>` 순서가 중요하고, `boot.js` 는 항상 마지막입니다.

## 새 기능을 넣을 때

1. **서버**: `rnotes/` 에 기능 모듈을 만들고(저장소 함수 → 로직), `http_handler.py` 에 경로만 연결합니다.
2. **화면**: `web/js/` 에 파일을 만들고 `web/index.html` 의 `<script>` 목록에 알맞은 순서로 추가합니다.
3. **디자인**: 새 디자인 전용 스타일은 `web/css/v2.css` 의 `html[data-design=v2]` 아래에 둡니다. 기존 디자인은 그대로 두세요.
4. **버전**: `rnotes/config.py` 의 `APP_VERSION` 을 올리고 `docs/CHANGELOG.md` 에 적습니다.

## 기여하기

버그 제보 · 아이디어는 [Issues](https://github.com/kariyarn/redmineNote/issues) 에, 코드 수정은 Pull Request 로 보내 주세요.

1. 저장소를 Fork 하고 새 브랜치를 만듭니다. (예: `fix/memo-alarm`)
2. 고친 뒤 기존 로직 8종과 변경한 기능의 연동·UI 시험을 모두 통과하는지 확인합니다. 기존 로직 8종은 `python tests/run_isolated.py`로 실행합니다.
3. 외부 패키지는 추가하지 않습니다(표준 라이브러리만).
4. 실제 레드마인 주소 · API 키 · 회사 데이터는 올리지 마세요.
5. Pull Request 에 **무엇을 왜 바꿨는지** 적어 주세요.

## 라이선스

[MIT](LICENSE)
