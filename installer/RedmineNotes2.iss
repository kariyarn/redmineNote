; 레드마인 노트 설치 파일 (Inno Setup 6). 깃허브 Actions 의 build 가 만든다 — 직접 만들려면:
;   build.bat 으로 dist\RedmineNotes2.exe 를 만든 뒤  iscc /DAppVer=2.14.5 installer\RedmineNotes2.iss
; 관리자 권한 없이 내 계정에만 설치하고(%LOCALAPPDATA%\Programs\RedmineNotes2), 데이터(%APPDATA%\RedmineNotes2)는 건드리지 않는다.
; 새 버전 설치 = 같은 자리에 덮어쓰기. 켜져 있는 앱은 설치 전에 닫는다.
; 앱 안의 '업데이트'는 이 설치 파일을 /VERYSILENT /RELAUNCH=1 로 실행한다 (rnotes/updater.py) — 끝나면 앱을 다시 켠다.
#ifndef AppVer
  #define AppVer "0.0.0"
#endif

[Setup]
AppId={{8C1F5A52-6E2B-4C1E-9B53-2D7A1E4F9A10}
AppName=레드마인 노트
AppVersion={#AppVer}
AppVerName=레드마인 노트 {#AppVer}
AppPublisher=kariyarn
DefaultDirName={localappdata}\Programs\RedmineNotes2
DefaultGroupName=레드마인 노트
DisableProgramGroupPage=yes
DisableDirPage=yes
UsePreviousAppDir=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=RedmineNotes2-Setup-{#AppVer}
SetupIconFile=..\icon.ico
UninstallDisplayIcon={app}\RedmineNotes2.exe
UninstallDisplayName=레드마인 노트
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
Source: "..\dist\RedmineNotes2.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\레드마인 노트"; Filename: "{app}\RedmineNotes2.exe"
Name: "{autodesktop}\레드마인 노트"; Filename: "{app}\RedmineNotes2.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\RedmineNotes2.exe"; Description: "{cm:LaunchProgram,레드마인 노트}"; Flags: nowait postinstall skipifsilent
; 앱 안에서 업데이트할 때(/VERYSILENT /RELAUNCH=1): 조용히 설치한 뒤 새 버전을 다시 켠다
Filename: "{app}\RedmineNotes2.exe"; Flags: nowait; Check: ShouldRelaunch

[Code]
function ShouldRelaunch: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:RELAUNCH|0}') = '1');
end;
