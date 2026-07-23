# Porter

Private **AI + Finder-like** file bridge across your Macs. No Porter cloud. No paid servers.

> Securely let Cursor (and you) find, browse, and copy approved folders between computers.

## Download (Mac — no git)

> **Easy download:** [⬇ Porter-0.2.4-mac.zip](https://github.com/Gtarafdar/porter/releases/latest/download/Porter-0.2.4-mac.zip)  
> Release page: https://github.com/Gtarafdar/porter/releases/tag/v0.2.4 · [All releases](https://github.com/Gtarafdar/porter/releases)

1. Unzip → double‑click **Porter.app** (first time: right‑click → **Open**) — opens a **normal Mac window** (Dock icon, close/minimize/zoom), not a browser tab
2. Follow the setup wizard inside the app
3. For travel: **Travel Ready → Set & forget** (Cloudflare bundled). Install Tailscale from the in-app **official** button if you want the stable backup path.

**Bundled:** Node (Apple Silicon + Intel) + Porter native window + Finder UI + `cloudflared`  
**Not bundled:** Tailscale (VPN app — must install from [tailscale.com/download/mac](https://tailscale.com/download/mac); one-click button inside Porter)

**Chrome:** Everyday file copy never requires quitting Chrome. Optional Chrome-extension sync only: quit Chrome → share/copy folders → reopen (see Settings).

**Security:** [SECURITY.md](SECURITY.md) · **Connect / travel:** [CONNECTING.md](CONNECTING.md) · **Roadmap:** [PLAN.md](PLAN.md)

## What’s new in 0.2.4

- **Works on Intel + Apple Silicon** — official Node (and cloudflared) for both chips in one zip
- If the engine fails to start: **error text shown in the window** + Copy error / Show log folder (no Terminal hunting)
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
