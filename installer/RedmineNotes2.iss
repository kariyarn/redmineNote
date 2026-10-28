; 레드마인 노트 설치 파일 (Inno Setup 6). 깃허브 Actions 의 build 가 만든다 — 직접 만들려면:
;   build.bat 으로 dist\RedmineNotes2.exe 를 만든 뒤  iscc /DAppVer=2.14.5 installer\RedmineNotes2.iss
; 관리자 권한 없이 내 계정에만 설치하고(%LOCALAPPDATA%\Programs\RedmineNotes2), 데이터(%APPDATA%\RedmineNotes2)는 건드리지 않는다.
; 새 버전 설치 = 같은 자리에 덮어쓰기. 켜져 있는 앱은 설치 전에 닫는다.
; 앱 안의 '업데이트'는 이 설치 파일을 /VERYSILENT /RELAUNCH=1 로 실행한다 (rnotes/updater.py) — 끝나면 앱을 다시 켠다.
#ifndef AppVer
  #define AppVer "0.0.0"
#endif
; 베타: iscc /DChannel=beta ... — 정식과 따로 설치된다 (AppId · 설치 폴더 · 이름 · exe 가 다름). 노트 데이터(%APPDATA%\RedmineNotes2)는 같이 쓴다.
#ifndef Channel
  #define Channel "stable"
#endif
#if Channel == "beta"
  #define AppIdGuid "{{3E7B1C94-5A2D-4F6E-8C31-9D4B7A2E6F58}"
  #define AppTitle "레드마인 노트 (베타)"
  #define AppExe "RedmineNotes2-Beta.exe"
  #define AppDirName "RedmineNotes2-Beta"
  #define SetupBase "RedmineNotes2-Beta-Setup-"
  #define AumId "RedmineNotes2.App.Beta"
#else
  #define AppIdGuid "{{8C1F5A52-6E2B-4C1E-9B53-2D7A1E4F9A10}"
  #define AppTitle "레드마인 노트"
  #define AppExe "RedmineNotes2.exe"
  #define AppDirName "RedmineNotes2"
  #define SetupBase "RedmineNotes2-Setup-"
  #define AumId "RedmineNotes2.App"
#endif

[Setup]
AppId={#AppIdGuid}
AppName={#AppTitle}
AppVersion={#AppVer}
AppVerName={#AppTitle} {#AppVer}
AppPublisher=kariyarn
DefaultDirName={localappdata}\Programs\{#AppDirName}
DefaultGroupName={#AppTitle}
DisableProgramGroupPage=yes
DisableDirPage=yes
UsePreviousAppDir=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename={#SetupBase}{#AppVer}
SetupIconFile=..\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppTitle}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no

#if FileExists(AddBackslash(CompilerPath) + "Languages\Korean.isl")
[Languages]
Name: "ko"; MessagesFile: "compiler:Languages\Korean.isl"
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; AppUserModelID: 앱 창(rnotes/appwin.py 의 AUMID)과 같은 앱 ID — 작업 표시줄이 이 바로가기(설치할 때마다 다시 만든다)로 창을 묶고 아이콘을 찾는다
Name: "{autoprograms}\{#AppTitle}"; Filename: "{app}\{#AppExe}"; AppUserModelID: "{#AumId}"
Name: "{autodesktop}\{#AppTitle}"; Filename: "{app}\{#AppExe}"; AppUserModelID: "{#AumId}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppTitle}}"; Flags: nowait postinstall skipifsilent
; 앱 안에서 업데이트할 때(/VERYSILENT /RELAUNCH=1): 조용히 설치한 뒤 새 버전을 다시 켠다
Filename: "{app}\{#AppExe}"; Flags: nowait; Check: ShouldRelaunch

[Code]
function ShouldRelaunch: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:RELAUNCH|0}') = '1');
end;
