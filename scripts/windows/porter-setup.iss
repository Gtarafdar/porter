; Inno Setup script for Porter Windows — build on windows-latest only.
; Does not affect Mac DMG packaging.
#define MyAppName "Porter"
#ifndef MyAppVersion
  #define MyAppVersion "0.2.34"
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
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Porter"; Flags: nowait postinstall skipifsilent
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Porter"""; Flags: runhidden; Tasks: firewall
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Porter"" dir=in action=allow program=""{app}\node.exe"" protocol=TCP localport=47831 profile=private"; Flags: runhidden; Tasks: firewall

[UninstallRun]
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Porter"""; Flags: runhidden
