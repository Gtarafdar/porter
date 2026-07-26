# Porter on Windows (preview)

Separate Windows product. **Does not change** the Mac DMG / Porter.app install path.

## Install

1. Download **[Porter-Setup-0.2.35-windows-x64.exe](https://github.com/Gtarafdar/porter/releases/download/v0.2.35/Porter-Setup-0.2.35-windows-x64.exe)**
2. Run Setup → allow UAC
3. Installs to `C:\Program Files\Porter`
4. Open Porter from Start Menu
5. Optional: allow firewall rule for private networks (TCP 47831)

Mac users: keep [v0.2.34](https://github.com/Gtarafdar/porter/releases/tag/v0.2.34) DMG — this Windows tag is not a Mac release.

## First use

1. Set the **same pair token** as your Mac(s)
2. Install [Tailscale](https://tailscale.com/download/windows) (same account)
3. **Add PC / Add Mac** → paste the other computer’s Tailscale `100.x` address + port `47831`
4. Share folders (enable write to receive copies)

## SmartScreen

Porter is MIT and not Microsoft-signed yet. Windows may show “Windows protected your PC”. Choose **More info → Run anyway**. Same class of warning as Mac Gatekeeper for unsigned apps.

## Limits (v1)

- x64 Windows first (ARM later)
- Full Travel Ready Set & forget remains **strongest on Mac home**; Windows can install a **login Task Scheduler** task via Set & forget
- Chrome Library helpers are macOS-only for now
- Prefer Tailscale over Cloudflare for travel

See [WINDOWS-SMOKE.md](WINDOWS-SMOKE.md), [TRAVEL-MATRIX.md](TRAVEL-MATRIX.md), and the shipping checklist [WINDOWS-STATUS.md](WINDOWS-STATUS.md).
