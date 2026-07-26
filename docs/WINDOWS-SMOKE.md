# Windows smoke checklist (L3)

Use after installing [Porter-Setup-0.2.35-windows-x64.exe](https://github.com/Gtarafdar/porter/releases/download/v0.2.35/Porter-Setup-0.2.35-windows-x64.exe).

## Install

- [ ] Run Setup EXE → approve UAC
- [ ] Lands in `C:\Program Files\Porter`
- [ ] Start Menu → Porter opens UI (`http://127.0.0.1:47831`)
- [ ] Health shows `"ok": true` and `"platform":"win32"`
- [ ] If SmartScreen appears: More info → Run anyway (unsigned indie build)

## Firewall

- [ ] Rule named **Porter** exists (Private profile, TCP 47831 / node.exe)
- [ ] Not a blanket “allow all inbound”

## Pair + copy

- [ ] Same pair token as the other computer (Settings)
- [ ] Add peer via Tailscale `100.x:47831` or LAN IP
- [ ] Share a folder on both sides (write on destination)
- [ ] Copy one file **Windows → Mac**
- [ ] Copy one file **Mac → Windows**
- [ ] Copy one file **Windows → Windows** (if two PCs)

## Travel (supported v1)

- [ ] Home Mac has Travel Ready / Set & forget enabled
- [ ] Travel Windows can reach home Mac over Tailscale while away

## MCP (optional)

- [ ] Link Cursor or VS Code — config under `%USERPROFILE%\.cursor` or `%APPDATA%\Code`

## Uninstall

- [ ] Uninstall removes `C:\Program Files\Porter` and firewall rule
- [ ] Mac Porter still works (unchanged)

## Fail if

- Mac e2e / Travel Ready on home Mac regresses
- Installer requires admin every launch (only Setup should elevate)
- Pair token / localhost admin rules are weakened
