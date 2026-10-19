@echo off
rem 한 파일짜리 RedmineNotes2.exe 를 만든다 (쓰는 PC 에는 파이썬이 필요 없다).
rem 필요: python -m pip install pyinstaller
rem   백신(Windows Defender) 오진을 줄이려면 부트로더를 직접 컴파일해 설치 (CI 와 같게, Visual Studio C++ 도구 필요):
rem   set PYINSTALLER_COMPILE_BOOTLOADER=1 ^&^& python -m pip install --force-reinstall --no-cache-dir --no-binary pyinstaller pyinstaller
rem 결과: dist\RedmineNotes2.exe   (이 파일 하나만 나눠 주면 된다)
cd /d "%~dp0"
rem 베타는 CI 가 RN_EXE_NAME=RedmineNotes2-Beta 로 부른다 (정식과 exe 이름을 따로)
if not defined RN_EXE_NAME set RN_EXE_NAME=RedmineNotes2
rem exe 속성(파일 설명 · 제품 이름 · 버전)을 넣는다: 버전 정보가 없는 exe 는 백신이 더 쉽게 오진한다
if not exist build mkdir build
python tools\make_version_info.py build\version_info.txt
if errorlevel 1 exit /b 1
python -m PyInstaller --noconfirm --clean --onefile --noconsole --name %RN_EXE_NAME% --icon icon.ico --version-file build\version_info.txt --paths . --add-data "web;web" --add-data "icon.ico;." main.py
if errorlevel 1 (
  echo.
  echo 빌드 실패
  if not defined CI pause
  exit /b 1
)
echo.
echo 완료: %~dp0dist\%RN_EXE_NAME%.exe
rem 깃허브 Actions(CI)에서 돌릴 때는 멈추지 않는다
if not defined CI pause
