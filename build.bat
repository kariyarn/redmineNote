@echo off
rem 한 파일짜리 RedmineNotes2.exe 를 만든다 (쓰는 PC 에는 파이썬이 필요 없다).
rem 필요: python -m pip install pyinstaller
rem 결과: dist\RedmineNotes2.exe   (이 파일 하나만 나눠 주면 된다)
cd /d "%~dp0"
python -m PyInstaller --noconfirm --clean --onefile --noconsole --name RedmineNotes2 --icon icon.ico --paths . --add-data "web;web" --add-data "icon.ico;." main.py
if errorlevel 1 (
  echo.
  echo 빌드 실패
  pause
  exit /b 1
)
echo.
echo 완료: %~dp0dist\RedmineNotes2.exe
pause
