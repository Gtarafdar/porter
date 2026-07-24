# Porter

Private **AI + Finder-like** file bridge across your Macs. No Porter cloud. No paid servers.

> Securely let Cursor (and you) find, browse, and copy approved folders between computers.

## Download (Mac — no git)

Pick your Mac chip. Prefer the **DMG** (drag Porter → Applications). Zip is for in-app updates / CI:

> **Apple Silicon only (M1/M2/M3/M4):** [⬇ Porter-0.2.29-mac-arm64.dmg](https://github.com/Gtarafdar/porter/releases/latest/download/Porter-0.2.29-mac-arm64.dmg) · [zip](https://github.com/Gtarafdar/porter/releases/latest/download/Porter-0.2.29-mac-arm64.zip)  
> **Intel Mac:** not in this release — use an older [Intel build](https://github.com/Gtarafdar/porter/releases) or ask for a rebuild.  
> Release page: https://github.com/Gtarafdar/porter/releases/tag/v0.2.29 · [All releases](https://github.com/Gtarafdar/porter/releases)

Not sure which chip?  menu → About This Mac → look for “Chip” (Apple) or “Processor” (Intel).

1. Open the **DMG** → drag **Porter** to **Applications** → eject the disk image
2. Open Porter from **Applications** (FIRST TIME: right‑click → **Open** → Open — not notarized, normal for free MIT apps)
3. If still blocked: System Settings → Privacy & Security → **Open Anyway**
4. Setup: **Get Tailscale** → sign up / sign in (same account on every Mac) → **Open Tailscale** → approve VPN prompts → wait for green
5. Share folders with **Choose folder…** (Finder picker) — no typing paths
6. Travel: **Travel Ready → Set & forget**; enable **Tailscale SSH** before you leave. Cloudflare optional under Advanced.
7. Later updates: **Settings → This Mac → Check for updates** — public GitHub releases work without a token; optional PAT only if rate-limited. Installs the **zip**.

**Bundled:** Node + native Mac window + Finder UI + `cloudflared` (for that chip only)  
**Not bundled:** Tailscale  
**License:** [MIT](LICENSE)

**Chrome:** Everyday file copy never requires quitting Chrome. Optional Chrome-extension sync only: quit Chrome → share/copy folders → reopen (see [CHROME.md](CHROME.md)).

**Security:** [SECURITY.md](SECURITY.md) · **Connect / travel:** [CONNECTING.md](CONNECTING.md) · **Chrome extensions:** [CHROME.md](CHROME.md) · **Roadmap:** [PLAN.md](PLAN.md)

## What’s new in 0.2.29

- Setup Tailscale step: numbered install → signup → open app → approve VPN → wait for green
- Travel Ready shows steps + **Open Tailscale** / **Enable SSH settings**; “Safe to leave” only when SSH is confirmed
- Link Macs prefers Tailscale (Cloudflare marked advanced)
- Public-repo update copy (PAT optional); MIT license; DMG includes HOW-TO; docs scrubbed for open sharing
- Builds on 0.2.28 splash + Applications DMG

## What’s new in 0.2.28

- Native animated splash while the local engine starts (real phase labels; respects Reduce Motion)
- App Translocation warning includes **Open Applications** so the fix is one click away
- Primary download is a Cursor-style **DMG** (drag Porter → Applications); zip kept for in-app updates
- Builds on 0.2.27 GitHub-token update checks

## What’s new in 0.2.27

- Update checks use a GitHub token when available (fixes rate-limit / private-repo 403s)
- Settings → Updates: save a PAT; clearer errors when GitHub blocks anonymous requests
- Builds on 0.2.26 startup reliability (deferred Tailscale Serve + patient keep-alive)

## What’s new in 0.2.26

- Startup no longer freezes while configuring Tailscale Serve (UI and health stay responsive)
- Keep-alive is more patient — won’t kill a starting Porter and loop-restart
- Clearer Tailscale “it’s on” signal in setup; Travel Ready explains Serve may take a few seconds
- Builds on 0.2.25 onboarding (Tailscale wizard step, remote-only copy, Chrome dest routing)

## What’s new in 0.2.25

- Setup includes a **Tailscale check** step (install → connect → continue); same Wi‑Fi escape still available
- Copy is **between Macs only** — no more confusing same-Mac destination; right pane waits for a peer
- Chrome Extensions / Extension Data copies auto-route into the peer’s matching Chrome Library share
- Builds on 0.2.24 travel resilience (Tailscale-first, keep-alive takeover, exact pair-token auth)

## What’s new in 0.2.24

- Travel reliability: Tailscale-first (Serve + MagicDNS), hardened LaunchAgent / version takeover, Repair in Travel Ready
- Break-glass revive command + clearer errors when Tailscale is up but Porter is down
- Auto-update: refuse Downloads/App Translocation; rewrite keep-alive after install; prefer `/Applications`
- Security: pair token must match exactly (removed weak long-bearer fallback)
- Add Mac: pick peers from your Tailscale list

## What’s new in 0.2.23

- Fix false “Cloudflare tunnel dead” toast when checking for updates on an old Porter core
- Clearer message to install a fresh build so Updates / Install Now work

## What’s new in 0.2.22

- Chrome guide in Settings with clear steps + **Open Extension Data** / **Open Extensions** in Finder
- Easier to find Local Extension Settings folders for accurate copy

## What’s new in 0.2.21

- Cursor-style **New update available** pill (Later / Install Now) on every Mac
- Top bar **Updates** button always visible
- Install falls back to zip download if auto-replace isn’t possible

## What’s new in 0.2.20

- Home shows clearer guidance when a travel Mac was seen but has no return address yet
- Auto-attach Tailscale peer IP when possible so Home can browse Travel

## What’s new in 0.2.19

- **In-app auto-update** from GitHub Releases (Settings → Check for updates / Install & relaunch)
- Help menu → Check for Updates…

## What’s new in 0.2.18

- Copy now shows live progress (“Copying 1 of 3…”) and errors inside the dialog (no more silent stuck)
- Safer multi-select copy path

## What’s new in 0.2.17

- Folder copy no longer dies on one missing/broken file (skips and continues)
- Multi-select: ⌘/Ctrl-click files, then Copy N items
- Prefer **Tailscale** over flaky Cloudflare Quick Tunnel for transfers

## What’s new in 0.2.16

- Dead Cloudflare URLs no longer dump HTML — clear “URL changed” guidance + use Tailscale fallback
- Home Devices lists the travel Mac after it connects (inbound peer)
- Setup wizard Home shows Copy rows for token / LAN / Cloudflare / Tailscale (same labels as paste fields)
- Chrome Extension Data share no longer shows a false error banner

## What’s new in 0.2.15

- Travel Ready actually fits the window (no more cropped bottom) — checklist collapsed by default
- Force-refresh UI after updates (no stuck old modal in WebView cache)

## What’s new in 0.2.14

- **Travel Ready** modal fits MacBook screens (scroll body + sticky Close / Set & forget)
- Copy rows for pair token, Cloudflare, and Tailscale — nothing cut off at the bottom

## What’s new in 0.2.13

- **Join Home Mac → Continue** no longer stuck when Cloudflare/Home is briefly unreachable
- Saves Home address even if offline; sticky Continue on the setup wizard

## What’s new in 0.2.12

- Add Mac shows **this Mac’s** LAN / Tailscale / Cloudflare with **Copy** buttons
- Clear split: “Give these to the other Mac” vs “Paste from the other Mac”
- Start Cloudflare tunnel from Add Mac when URL is missing

## What’s new in 0.2.11

- **Add Mac** popup redesigned — fits MacBook screens (scroll + sticky Connect button)
- Clear 3-step connect: Copy IP → same token → paste other IP
- Travel options tucked under “Show travel options”

## What’s new in 0.2.10

- Search box on **both** panes (filters + searches shared folders)
- Pane titles show Mac names: **From · MacName** / **To · MacName** (no more “Drop here (this Mac)”)
- Copy button says **Copy to {Mac name}**

## What’s new in 0.2.9

- **Add Mac** button + clearer Settings (shows this Mac’s LAN IP to copy)
- “host required” fixed with in-panel guidance (fill the other Mac’s IP first)
- LAN Bonjour discovery enabled again so nearby Macs can appear automatically

## What’s new in 0.2.8

- Setup **Link Macs** step: choose **This is Home** (copy token) or **Join Home Mac** (paste token)
- Clearer Settings copy — no Porter account; same token on every Mac

## What’s new in 0.2.7

- Fix hang after `node-ok` — health check curl now times out; clears stuck process on port 47831
- Safer activity log writes (won’t crash the engine)

## What’s new in 0.2.6

- Clearer fix when an old Homebrew-linked Node fails (`libuv` missing)
- Warns if you open Porter from Downloads (App Translocation) — move to Applications
- Error panel shows only this launch’s log (not stale older failures)

## What’s new in 0.2.5

- **Smaller downloads** — separate Apple Silicon / Intel zips (no duplicate Node/cloudflared)
- **Choose folder…** — native Finder folder picker (no typing absolute paths)
- Clearer help when macOS shows a “malware” / Gatekeeper warning (Help menu + install notes)

## What’s new in 0.2.4

- Official Node (and cloudflared) that actually runs on the other Mac
- Engine start errors shown in the window + Copy error / Show log folder
- Clears Gatekeeper quarantine on nested binaries after GitHub download

## What’s new in 0.2.3

- **Native Mac window** (WKWebView shell) — real traffic lights / Dock; same Finder UI underneath
- Closing the window does **not** stop the Porter agent (like closing a browser tab)

## What’s new in 0.2.2

- Devices badge for Cloudflare vs Tailscale active path
- Timed Activity logs + clearer errors
- Optional Chrome extensions folder share

## What’s new in 0.2.1

- Hardened tunnel auth (Cloudflare traffic can no longer look like “localhost”)
- Admin UI / pair token / Travel Ready locked to this Mac only
- Set & forget keep-alive + Cloudflare↔Tailscale failover
- One-click official Tailscale download (not redistributed inside the zip)

## What’s new in 0.2

- Setup wizard (Cursor MCP one-click install — keeps Slack Agent Bridge entries)
- **One-click `Porter.app`** — `npm run package` → share the zip (no git clone for users)
- **Cloudflare Tunnel** away-from-home (travel Mac needs Porter only) **or** Tailscale
- Sleep / Wake, chunked copy + SHA-256 + Mbps, push / one-way sync
- `npm run test:e2e` — automated API checks
## What you get

- **Finder-style UI** — browse approved folders on this Mac (and paired Macs)
- **Cursor MCP** — list / search / read / copy across devices
- **$0 infra** — LAN, Cloudflare Quick Tunnel, or Tailscale
- **Security defaults** — folder allowlists, secret-file blocks, pair token, activity log

## Easy install (build from source)

```bash
npm install
npm run package   # full Porter.app with native window + Node + cloudflared
# or local window only (needs npm start for core):
npm start &
npm run window:build && open apps/mac-window/dist/Porter.app
```

Share `dist/release/Porter-*-mac.zip`.

## Requirements

- macOS 12+
- For **dev / packaging**: Node.js 20+
- For **end users of Porter.app**: nothing else for LAN + Cloudflare (Tailscale optional, official installer)

**Not Apple-ID sync. Not a phone app (yet).**

## Install from source (developers)

```bash
cd /path/to/porter
npm install
npm run build
```

## Run the app (Finder UI)

```bash
npm start
```

Opens `http://127.0.0.1:47831` — Porter’s Finder-like window.

1. **Share folder** — approve e.g. `/Users/you/Projects` (enable write on a destination folder to receive copies)
2. **Settings** — copy the **pair token** to the other Mac (same token on both)
3. Browse like Finder → select a file → **Copy to other pane**

### Dev UI (hot reload)

Terminal A: `npm start`  
Terminal B: `npm run dev:ui` → http://127.0.0.1:5173

## Connect Cursor (MCP)

Add to Cursor MCP settings (`~/.cursor/mcp.json` or project config):

```json
{
  "mcpServers": {
    "porter": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/porter/packages/core/dist/mcp.js"]
    }
  }
}
```

Keep `npm start` running on each Mac you want reachable. MCP tools talk to the local agent; remote devices appear after Bonjour discovery + matching pair token.

Example prompts:

- “List Porter devices and shared folders.”
- “Search for `checkout.css` on my other Mac and copy it into my local Projects folder.”

## Pair two Macs

1. Start Porter on both
2. Open **Settings** on Mac A → copy pair token
3. Paste the **same token** on Mac B → Save
4. Share folders on each Mac (with **write** on the Mac that should receive files)

Devices discover each other as `_porter._tcp` on the LAN.

## Security (honest)

| Protected | Residual risk |
| --- | --- |
| Only allowlisted folders | Anything inside an allowlisted folder can be read by AI |
| Secrets / Chrome profiles blocked by default | Turning “allow secrets” on increases risk |
| Pair token required for remote API | Anyone with your token on the LAN could call the API — keep token private |
| Kill switch / activity log | Compromised Mac can still abuse a running agent |

Porter does **not** claim zero risk. It keeps power **narrow and visible**.

## Not in V1 (coming next)

- Two-way sync / Project Packs (Slack tools, extension *source* folders)
- Push copy to remote Mac (V1 pulls onto this Mac)
- Full TeamViewer-style screen control (we give you a **real folder view** instead — safer and clearer)

## CLI

```bash
npm start                          # serve UI + agent
node packages/core/dist/cli.js share ~/Projects
node packages/core/dist/cli.js share-write ~/PorterInbox
node packages/core/dist/cli.js status
```

Config lives in `~/.porter/` (mode 0600).

## License

[MIT](LICENSE) — free to use, modify, and share.
