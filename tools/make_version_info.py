"""exe 에 넣을 윈도우 버전 정보(속성 → 자세히: 파일 설명 · 제품 이름 · 버전 · 저작권)를 만든다.
버전 정보가 없는 PyInstaller exe 는 백신(Windows Defender 등)이 더 쉽게 오진하므로 build.bat 이 빌드 전에 부른다.
실행: python tools/make_version_info.py <출력 파일>   (버전 · 채널은 rnotes/config.py 에서 읽는다)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("REDMINE_NOTES_HOME", os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), "_vi_home"))
from rnotes.config import APP_TITLE, APP_VERSION, BETA  # noqa: E402

nums = tuple(int(x) for x in (APP_VERSION.split(".") + ["0"] * 4)[:4])
exe = os.environ.get("RN_EXE_NAME") or ("RedmineNotes2-Beta" if BETA else "RedmineNotes2")
TEMPLATE = f"""# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(filevers={nums}, prodvers={nums}, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('041204B0', [
      StringStruct('CompanyName', 'kariyarn'),
      StringStruct('FileDescription', {APP_TITLE!r}),
      StringStruct('FileVersion', {APP_VERSION!r}),
      StringStruct('InternalName', {exe!r}),
      StringStruct('LegalCopyright', 'kariyarn (github.com/kariyarn/redmineNote)'),
      StringStruct('OriginalFilename', {exe + '.exe'!r}),
      StringStruct('ProductName', {APP_TITLE!r}),
      StringStruct('ProductVersion', {APP_VERSION + (' beta' if BETA else '')!r})])]),
    VarFileInfo([VarStruct('Translation', [0x0412, 1200])])
  ]
)
"""
with open(sys.argv[1], "w", encoding="utf-8") as f:
    f.write(TEMPLATE)
print("version info:", sys.argv[1], APP_VERSION, "beta" if BETA else "stable")   # 콘솔 코드 페이지와 상관없게 ASCII 로
