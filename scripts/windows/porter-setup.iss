; Inno Setup script for Porter Windows — build on windows-latest only.
; Does not affect Mac DMG packaging.
#define MyAppName "Porter"
#ifndef MyAppVersion
  #define MyAppVersion "0.2.35"
#endif
#define MyAppPublisher "Gobinda Tarafdar"
#define MyAppURL "https://github.com/Gtarafdar/porter"
#define MyAppExeName "Porter.exe"

[Setup]
AppId={{A7C2E8F1-9B4D-4E6A-8C3F-1D2E3F4A5B6C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\Porter
DefaultGroupName=Porter
DisableProgramGroupPage=yes
LicenseFile=..\..\LICENSE
OutputDir=..\..\dist\windows
OutputBaseFilename=Porter-Setup-{#MyAppVersion}-windows-x64
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
; Do not reboot mid-install; Porter does not need a restart.
RestartIfNeededByRun=no
CloseApplications=yes
; Missing optional files must not abort install.
AllowNoIcons=yes
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:"; Flags: unchecked
Name: "firewall"; Description: "Allow Porter on private networks (TCP 47831)"; GroupDescription: "Network:"; Flags: checkedonce

[Files]
; Payload assembled by scripts/windows/assemble-payload.mjs (+ Porter.exe from win-launcher)
Source: "..\..\dist\windows\Porter\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Launch as the logged-in user (not elevated) — Setup is admin once; day-to-day Porter is not.
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Porter"; Flags: nowait postinstall skipifsilent runasoriginaluser
; Firewall is best-effort — never fail the install if netsh is blocked by policy.
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=""Porter"" >nul 2>&1 & netsh advfirewall firewall add rule name=""Porter"" dir=in action=allow program=""{app}\node.exe"" protocol=TCP localport=47831 profile=private >nul 2>&1"; Flags: runhidden; Tasks: firewall

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=""Porter"" >nul 2>&1"; Flags: runhidden
