# Porter

Private **AI + Finder-like** file bridge across your Macs. No Porter cloud. No paid servers.

> Securely let Cursor (and you) find, browse, and copy approved folders between computers.

## Download (Mac — no git)

Pick your Mac chip (smaller downloads — about half the old universal zip):

> **Apple Silicon (M1/M2/M3/M4):** [⬇ Porter-0.2.8-mac-arm64.zip](https://github.com/Gtarafdar/porter/releases/latest/download/Porter-0.2.8-mac-arm64.zip)  
> **Intel Mac:** [⬇ Porter-0.2.8-mac-x64.zip](https://github.com/Gtarafdar/porter/releases/latest/download/Porter-0.2.8-mac-x64.zip)  
> Release page: https://github.com/Gtarafdar/porter/releases/tag/v0.2.8 · [All releases](https://github.com/Gtarafdar/porter/releases)

Not sure which chip?  menu → About This Mac → look for “Chip” (Apple) or “Processor” (Intel).

1. Unzip → drag **Porter.app** to **Applications** (important — don’t open from Downloads)
2. **First open:** right‑click → **Open** → Open (macOS warns because Porter is not paid Apple-notarized — this is normal for free local apps)
3. If still blocked: System Settings → Privacy & Security → **Open Anyway**
4. Share folders with **Choose folder…** (Finder picker) — no typing paths
5. Travel: **Travel Ready → Set & forget** (Cloudflare bundled). Tailscale optional via the official in-app button.

**Bundled:** Node + native Mac window + Finder UI + `cloudflared` (for that chip only)  
**Not bundled:** Tailscale

**Chrome:** Everyday file copy never requires quitting Chrome. Optional Chrome-extension sync only: quit Chrome → share/copy folders → reopen (see Settings).

**Security:** [SECURITY.md](SECURITY.md) · **Connect / travel:** [CONNECTING.md](CONNECTING.md) · **Roadmap:** [PLAN.md](PLAN.md)

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

Private / personal use — your project.
