"""실행 채널: stable(정식) / beta(베타).
CI(.github/workflows/build.yml)가 베타를 빌드할 때 이 파일을 CHANNEL = "beta" 와 빌드한 커밋으로 바꿔 쓴다. 저장소에는 늘 stable 로 둔다.
소스 실행 · 시험에서는 환경 변수 REDMINE_NOTES_CHANNEL · REDMINE_NOTES_BUILD 로 바꿀 수 있다."""
CHANNEL = "stable"
BUILD = ""   # 빌드한 커밋 (베타의 앱 안 업데이트가 '같은 빌드인지' 알아보는 데 쓴다)
