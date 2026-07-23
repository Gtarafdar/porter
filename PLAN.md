# Porter — Product Plan & Roadmap

> Private AI + Finder-like file bridge across your Macs. **No cloud. No paid servers. No Apple Developer Program required.**

Source of truth for iterating from **mobile, another Mac, or Cursor**: https://github.com/Gtarafdar/porter

Patterns reused from **Slack Agent Bridge** (setup wizard + menu bar) and **FinderFlow** (icon pipeline / familiar Mac folder UX).

---

## Vision

Securely let Cursor (and you) **find, browse, copy, and later sync** approved project folders between computers.

---

## Constraints

| Constraint | Approach |
| --- | --- |
| $0 infrastructure | LAN Bonjour; optional free Tailscale |
| Low RAM | On-demand core; Sleep from UI/menu bar |
| No paid Apple Dev | Node UI + ad-hoc signed menu-bar `.app` |
| Security first | Allowlists, pair token, secret blocks, confirm, kill switch |
| Familiar UI | Finder-like dual-pane + professional icons (no emoji) |

---

## Done

### V1
- [x] Monorepo, MCP tools, Finder UI, Bonjour + pair token, activity, kill switch

### V1.1 (this phase)
- [x] Professional Porter icon set (app + favicon + menu-bar template)
- [x] SVG icon system in Finder UI (folder/file/devices/copy/settings…)
- [x] Setup wizard (welcome → name → share → pair → install Cursor MCP → done)
- [x] One-click **Install into Cursor mcp.json** (merges; keeps Slack Agent Bridge & others)
- [x] Menu-bar companion (`apps/mac-menubar`) — Open / Setup / Sleep / Wake / Start core / Disconnect
- [x] Sleep / Wake API + UI
- [x] Prefer Tailscale IPs when `tailscale status` is available
- [x] Chunked copy + SHA-256 + skip-if-identical resume helper
- [x] End-to-end test suite (`npm run test:e2e`)
- [ ] Push copy *to* remote Mac (still mostly pull-onto-this-Mac)
- [ ] Pairing QR / one-time code (token paste works today)

### Still open
- [ ] Hostname uniqueness guidance in wizard (macOS `.local` conflicts)
- [ ] V2 Project Packs + sync
- [ ] V3 optional computer assist

---

## Quick commands

```bash
git pull
npm install && npm run build
npm start                          # UI http://127.0.0.1:47831
npm run test:e2e                   # isolated e2e
npm run menubar:build && open apps/mac-menubar/dist/Porter.app
```

Menu bar tip: set `PORTER_HOME` to your clone path if it is not `~/Downloads/porter`.

First Gatekeeper open: right-click → Open (no paid Apple ID needed; ad-hoc sign).

---

## Architecture

```text
Menu bar (Swift) ──→ localhost:47831
Cursor MCP ────────→ packages/core/dist/mcp.js
Browser Finder UI ─→ same core (static + /api)
Core ──────────────→ Bonjour / Tailscale peers + allowlisted folders
```

---

## Security (honest)

Allowlists + pair token + sleep + no cloud. Residual risk if allowlists are too wide or token leaks. Do not claim zero risk.

---

## Iterate from phone / other Mac

1. Read this file on GitHub  
2. `git pull && npm install && npm run build && npm start`  
3. Run setup wizard → Install Cursor MCP  
4. Optional: `npm run menubar:build`
