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

> 새 버전 올리기: **Actions → build → Run workflow** 를 `main` 에서 돌리면 위 링크가 그 파일로 바뀝니다.
>
> 2.19 부터는 **앱 안에서 업데이트**할 수 있어요: 켤 때(하루 한 번) 새 버전을 확인해 알려 주고, **설정 → 일반 → 업데이트**에서 `받고 업데이트` → `바꾸고 다시 시작` 하면 앱이 잠깐 꺼졌다가 새 버전으로 켜져요. 설치 파일로 깐 경우는 새 설치 파일을 조용히 실행하고, exe 만 쓰는 경우는 exe 를 바꿔 끼워요. 처음 2.19 로 올라갈 때만 위 링크로 직접 받으면 돼요.

## 이런 도구입니다

- **내 일감을 노트로**: 레드마인에서 내 일감을 내려받아, 일감마다 처리 내용 · 고친 코드 · 판단 이유를 적어 둡니다.
- **안전한 쓰기**: 레드마인에서는 읽어 오기만 합니다. 사용자가 버튼을 직접 눌렀을 때만 **댓글 · 상태 · 담당자/개발담당자**를 올립니다. 삭제 기능은 없습니다.
- **내 PC 안에서만**: 서버는 `127.0.0.1` 에서만 열리고, API 키는 윈도우 계정별 암호화(DPAPI)로 저장합니다.
- **외부 패키지 없음**: 파이썬 표준 라이브러리만 씁니다. 화면은 같은 서버가 내려주는 순수 HTML/CSS/JS 입니다.

### 주요 기능
| 기능 | 설명 |
|---|---|
| 일감 노트 | 원문 · 댓글 이력 · 내 정리 기록(처리 내용 / 코드 / 이유) |
| 자동 가져오기 | 정한 간격마다 바뀐 일감을 가져옴 (트레이에서도, 영업일 08:30 ~ 18:30, 공휴일은 공공데이터포털 특일 정보), 새 일감 알림 |
| 깃허브 백업 | 내 비공개 깃허브 저장소에 노트를 자동으로 올림 (앱 닫을 때 + 켜져 있는 동안 N시간마다, 밀린 것은 켤 때 한 번). 복원은 백업 시점을 골라 직접 |
| 주제 사전 | 용어로 비슷한 일감에 바로 접근 |
| 메모 · 알림 | 포스트잇 메모, 달력, 알림(확인 / 미루기) |
| 보관함 | 왼쪽 메뉴에서 코드 · 쿼리 · 명령어를 선택. 코드/쿼리는 언어 · 코드 위치 · 버전 메모와 코드 색칠, 명령어는 내가 등록한 댓글 단축어와 문구 삽입 |
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
python tests/test_queries.py .
python tests/test_commands.py .
python tests/test_release.py main.py
python tests/test_write.py main.py
```

| 시험 | 확인하는 것 |
|---|---|
| `test_alarm.py` | 메모 알림 로직 |
| `test_autosync.py` | 자동 가져오기 로직 (간격 · 기간 · 업무 시간) |
| `test_gitbackup.py` | 깃허브 백업 (가짜 깃허브: 올리기 · 변경 없음 · 충돌 · 복원 · 올리는 때) |
| `test_update.py` | 앱 업데이트 (가짜 Releases: 확인 · 받기 · 크기/SHA-256/실행 파일 검증 · 바꾸기 준비 · 자동 확인) |
| `test_queries.py` | 보관함의 코드/쿼리 로직 |
| `test_commands.py` | 보관함의 명령어 로직 |
| `test_release.py` | 가져오기 · 검색 · 배포요청 |
| `test_write.py` | 레드마인 쓰기 API |
| `test_exe.py` | 빌드한 exe 점검 |
| `start_ui_test.py` | 가짜 레드마인으로 앱을 띄워 화면을 직접 확인 (`python tests/start_ui_test.py main.py`) |

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
  textutil.py           레드마인 본문(HTML) → 글자
  redmine.py            레드마인 읽기: API 호출 · 캐시 · 가져오기(sync) · 일감 저장 · 연관 일감
  rm_write.py           레드마인에 쓰기(댓글 · 상태 · 담당자) · 첨부 목록
  rm_deploy.py          레드마인 검색 · 배포요청 일감과 로켓(대기/착륙) 상태
  sticky.py             메모(포스트잇) 저장
  alarms.py             메모 알림 계산 · 달력 · 오늘 볼 메모
  holidays.py           대한민국 공휴일 표 · 쉬는 날 판단 (알림이 주말·공휴일을 건너뜀)
  autosync.py           자동 가져오기 (정한 간격마다 서버가 스스로 가져옴, 영업일 업무 시간에만)
  gitbackup.py          깃허브 백업 (비공개 저장소에 올리기 · 백업 시점 목록 · 복원)
  holiday_api.py        공휴일 API (공공데이터포털 '한국천문연구원_특일 정보', 매주 첫 영업일에 그 주 것)
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
2. 고친 뒤 위 **시험** 7종이 모두 통과하는지 확인합니다.
3. 외부 패키지는 추가하지 않습니다(표준 라이브러리만).
4. 실제 레드마인 주소 · API 키 · 회사 데이터는 올리지 마세요.
5. Pull Request 에 **무엇을 왜 바꿨는지** 적어 주세요.

## 라이선스

[MIT](LICENSE)
