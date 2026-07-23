# Porter

Private **AI + Finder-like** file bridge across your Macs. No cloud. No paid servers. No Apple Developer Program required.

> Securely let Cursor (and you) find, browse, and copy approved folders between computers.

**Full roadmap:** [PLAN.md](PLAN.md) · **Connect a second Mac:** [CONNECTING.md](CONNECTING.md) (not automatic — same pair token + Add peer IP)

## What’s new in 0.2

- Setup wizard (Cursor MCP one-click install — keeps Slack Agent Bridge entries)
- Professional Porter icons + Finder SVG icons (no emoji)
- Menu bar app: `npm run menubar:build` → `open apps/mac-menubar/dist/Porter.app`
- Sleep / Wake, Tailscale IP preference, chunked copy + SHA-256 + Mbps
- **Add peer by IP**, **push to remote**, **one-way sync**
- `npm run test:e2e` — 10 automated checks

## What you get

- **Finder-style UI** — browse approved folders on this Mac (and paired Macs) with icons/list, breadcrumbs, dual-pane copy
- **Cursor MCP** — `list_devices`, `list_directory`, `search_files`, `read_file`, `copy_file`, `copy_folder`, …
- **On-demand** — start when you need it; Disconnect all kills the process
- **$0 infra** — LAN / Tailscale; no Porter cloud
- **Security defaults** — folder allowlists, secret-file blocks, dangerous path blocks, activity log, pair token

## Requirements

- Node.js 20+
- Two Macs on the same Wi‑Fi (or Tailscale)

**No paid Apple Developer account.** Porter runs as Node + a local web UI.

**Not Apple-ID sync. Not a phone app (yet).**

## Install (each Mac)

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
