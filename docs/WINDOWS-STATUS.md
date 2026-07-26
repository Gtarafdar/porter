# Windows shipping checklist (status)

Living todo for the Windows peer product. Mac DMG / Travel Ready stay protected.

## Done

- [x] Platform adapters (`packages/core/src/platform/`)
- [x] Travel Ready / LaunchAgent / caffeinate locked to darwin
- [x] Windows dangerous-path fragments (Mac blocks kept)
- [x] UI: PC wording + hide Chrome helpers on win32
- [x] `Porter.exe` launcher + Setup EXE → `C:\Program Files\Porter`
- [x] Private firewall rule (TCP 47831) in installer
- [x] GitHub Actions Mac + Windows CI green
- [x] Pre-release **v0.2.35** with Setup EXE (Mac **Latest** remains **v0.2.34**)
- [x] README + docs/WINDOWS.md + WINDOWS-SMOKE + TRAVEL-MATRIX
- [x] Site download section for Windows (Mac buttons use Mac DMG release only)

## In progress / your action

- [ ] **L3 human smoke** on a Windows PC or VM — follow [WINDOWS-SMOKE.md](WINDOWS-SMOKE.md)  
  (Cannot finish from Mac alone; CI already proved build + health.)

## Later (not blocking preview)

- [ ] Code signing (reduce SmartScreen)
- [ ] Windows ARM64 Setup
- [ ] Windows Set & forget / Task Scheduler parity with Mac Travel Ready
- [ ] Windows Chrome helpers
- [ ] In-app auto-update for Windows
- [ ] Promote Windows out of pre-release after L3 smoke passes

## Mac safety locks

- [x] Do not mark Windows tag as GitHub **Latest**
- [x] Site Mac DMG picker skips Windows-only / prerelease tags without `.dmg`
- [x] Mac `test:e2e` / typecheck remain the merge gate
