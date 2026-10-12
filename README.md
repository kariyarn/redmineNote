# 레드마인 노트 2

내 레드마인 일감을 PC에 노트로 모아 두고, 처리 내용 · 수정한 코드 · 이유를 기록하는 **개인용 로컬 도구**입니다.
레드마인에서는 읽어 오기만 하고, 사용자가 직접 버튼을 눌렀을 때만 **댓글 · 상태 · 담당자/개발담당자**를 올립니다(삭제 기능 없음).
파이썬 **표준 라이브러리만** 씁니다(외부 패키지 없음). 서버는 `127.0.0.1` 에서만 열리고, 화면은 같은 서버가 내려주는 HTML/CSS/JS 입니다.

- 버전별 변경 내용: [`docs/CHANGELOG.md`](docs/CHANGELOG.md) · 요건 문서: [`docs/`](docs/)

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
  alarms.py             메모 알림 계산(떠야 할 알림 · 확인/미루기) · 달력 · 오늘 볼 메모
  trouble.py            트러블슈팅 문서
  queries.py            코드/쿼리 보관함 (언어 · 코드 위치 · 버전 메모 · 가져오기)
  fonts.py              글꼴 파일 목록
  http_handler.py       HTTP: 요청 검사(Host/Origin) · 모든 /api 경로 · /static
  lifecycle.py          창 열기 · 트레이 · 자동 종료 감시 · 알림 스케줄러
  main.py               서버 켜기(run)
  appwin.py tray.py secret.py   윈도우 전용 부품(앱 창 · 트레이 · API 키 암호화)
web/                    화면
  index.html            뼈대(마크업) + CSS/JS 불러오기
  css/*.css             테마 · 기본 · 레이아웃 · 노트 · 메모 · … · 달력 (v2.css = 새 디자인 전용, html[data-design=v2] 아래에만)
  js/*.js               기능별 스크립트 (v2.js = 새 디자인에서 버튼·제목의 이모지를 선 아이콘으로 바꿔 끼움) (codefmt.js = 코드 색칠 · 언어 추정 · 정리 · 이름표 복사, 외부 라이브러리 없음). 한 전역 범위를 같이 쓰므로 index.html 의 불러오는 순서가 중요합니다
tests/                  시험(가짜 레드마인으로 실행, 실제 레드마인·실제 데이터는 쓰지 않음)
tools/make_icon.py      아이콘 생성
docs/                   요건 · 변경 기록
```
의존 방향: `config → storage → redmine → rm_write / rm_deploy …(기능) → http_handler → main`. 거꾸로 import 하지 않습니다.

## 실행 · 시험 · 빌드
```
python main.py                       # 개발 실행 (http://127.0.0.1:8791)
python tests/test_alarm.py .         # 메모 알림 로직 (임시 DB)
python tests/test_queries.py .       # 쿼리 보관함 로직 (임시 DB)
python tests/test_release.py main.py # 가져오기 · 검색 · 배포요청 (가짜 레드마인)
python tests/test_write.py main.py   # 쓰기 API (가짜 레드마인)
build.bat                            # 단일 exe 만들기 (pyinstaller 필요)
```
- 환경 변수: `REDMINE_NOTES_HOME`(데이터 위치) · `REDMINE_NOTES_PORT`(기본 8791) · `REDMINE_NOTES_IDLE_SEC`(0 이면 자동 종료 안 함) · `REDMINE_NOTES_NO_APPWIN=1`(시험용: 브라우저/앱 창을 열지 않음) · `REDMINE_NOTES_ALARM_TICK`(알림 확인 간격 초).
- 화면 시험: `tests/start_ui_test.py main.py` 로 가짜 레드마인 + 임시 데이터로 앱을 띄운 뒤 브라우저로 접속(`RN_FAKE_PORT` / `RN_APP_PORT` / `RN_TEST_TTL` 로 포트·자동 종료 조절).

## 새 기능을 넣을 때
1. 서버: `rnotes/` 에 기능 모듈을 만들고(저장소 함수 → 로직), `http_handler.py` 에 경로만 연결합니다.
2. 화면: `web/js/` 에 파일을 만들고 `web/index.html` 의 `<script>` 목록에 알맞은 순서로 추가합니다(`boot.js` 는 항상 마지막).
3. 버전: `rnotes/config.py` 의 `APP_VERSION` 을 올리고 `docs/CHANGELOG.md` 에 적습니다.

## 기여하기
버그 제보 · 아이디어는 Issues 에, 코드 수정은 Pull Request 로 보내 주세요.
- 고친 뒤 위 `실행 · 시험 · 빌드` 의 시험 4종이 통과하는지 확인해 주세요.
- 실제 레드마인 주소 · API 키 · 회사 데이터는 올리지 마세요(시험은 가짜 레드마인으로 돌아갑니다).

## 라이선스
[MIT](LICENSE)
