# Porter — Product Plan & Roadmap

> Private AI + Finder-like file bridge across your Macs. **No cloud. No paid servers. No Apple Developer Program required.**

This file is the source of truth for iterating from **mobile, another Mac, or Cursor**.

---

## Vision

Securely let Cursor (and you) **find, browse, copy, and later sync** approved project folders between computers — like a private AirDrop + AI MCP bridge, not TeamViewer screen control.

**Positioning:** Your private AI workspace across every device.

---

## Constraints (non-negotiable)

| Constraint | Approach |
| --- | --- |
| $0 infrastructure | No custom backend. LAN Bonjour; optional free Tailscale |
| Low RAM | On-demand agent; sleep when idle; no always-on full-disk index |
| No paid Apple Dev account | Node + local web UI; optional ad-hoc `.app` later |
| Security first | Allowlists, pair token, secret/dangerous path blocks, confirm writes, kill switch |
| Familiar UI | Finder-like dual-pane browse of **folders** (not full remote desktop in V1) |

---

## Architecture

```text
Cursor / AI IDE
      ↓
Local MCP (stdio)     +     Finder UI (browser → localhost)
      ↓                            ↓
              Porter Core (Node)
      ↓
Bonjour / Tailscale peer HTTP + shared pair token
      ↓
Remote Porter agent → approved folders only
```

**Repo layout**

```text
porter/
  apps/desktop/       # React Finder-like UI
  packages/core/      # Agent, HTTP API, MCP, discovery, transfer
  packages/protocol/  # Shared types
  PLAN.md             # This file
  README.md           # Setup / run
  mcp.cursor.json     # Cursor MCP example (absolute path — edit per machine)
```

Config on each Mac: `~/.porter/` (never commit this).

---

## Done (V1 — shipped in repo)

- [x] Monorepo scaffold (protocol, core, desktop)
- [x] Local allowlist + folder share CLI/UI
- [x] MCP tools: `list_devices`, `list_shared_folders`, `list_directory`, `search_files`, `read_file`, `copy_file`, `copy_folder`, `add_shared_folder`, `porter_status`
- [x] Finder-like dual-pane UI (devices, crumbs, icons/list, confirm copy, activity, settings, disconnect)
- [x] Bonjour discovery (`_porter._tcp`) + peer API with pair token
- [x] Dangerous path + secret-file defaults
- [x] Activity log + kill switch
- [x] README / MCP example / no Apple Dev run path

**Run:** `npm install && npm run build && npm start` → http://127.0.0.1:47831

---

## Next (iterate in order)

### V1.1 — reliability

- [ ] Prefer Tailscale `100.x` IPs when Tailscale is up
- [ ] Chunked transfer + SHA-256 verify + resume for large folders
- [ ] Push copy *to* remote Mac (V1 today mostly pulls onto this Mac)
- [ ] Sleep/wake agent timer from UI
- [ ] Pairing QR / one-time code (stronger than copy-paste token)
- [ ] Fix dual-Mac hostname collisions (unique Computer Name / Local Host Name per Mac)

### V2 — don’t lose work

- [ ] **Project Packs** — named packs for apps you built (e.g. Slack tools, extension *source* folders)
- [ ] One-way sync (mirror pack to other Mac)
- [ ] Two-way sync with conflict folder / newest-wins rules
- [ ] Never auto-sync: Keychain, Chrome/Safari full profiles, Slack app data, `.env` secrets (explicit opt-in only)

### V3 — optional computer assist

- [ ] Open app / check if local service running
- [ ] Screenshot with confirmation
- [ ] Controlled remote actions (still not full TeamViewer unless you explicitly want it)

---

## Security model (honest)

**Reduces risk:** allowlists only; pair token; read/copy default; write confirm; no Porter cloud; activity log; disconnect all; block secrets/browser profiles by default.

**Residual risk (cannot be zero):** AI can read anything inside an allowlisted folder; stolen pair token on LAN is bad; malware on a Mac can abuse a running agent; Tailscale widens reach to your tailnet — keep that private.

**Do not claim “no security risk.”** Keep allowlists tight.

---

## Pairing two Macs (checklist)

1. Clone this repo on both Macs  
2. `npm install && npm run build && npm start` on both  
3. Settings → set the **same pair token** on both  
4. Share folders (enable **write** on the Mac that receives copies)  
5. Same Wi‑Fi **or** Tailscale  
6. Cursor MCP: point `mcp.cursor.json` args to that machine’s absolute `packages/core/dist/mcp.js`

**Hostname note:** If macOS says `Something.local` is already in use, rename under System Settings → General → Sharing so each Mac has a unique local hostname. Porter uses its own device id + Bonjour service; rename does not break Porter.

---

## Out of scope (for now)

- Paid cloud relay / file hosting  
- App Store distribution / notarization  
- Auto-cloning full Chrome profiles  
- Unrestricted remote shell / root  
- Windows (Mac-first)

---

## How to iterate from phone / other Mac

1. Open this GitHub repo  
2. Edit `PLAN.md` checkboxes or open Issues for each next task  
3. On a Mac: `git pull && npm install && npm run build && npm start`  
4. In Cursor: continue from `PLAN.md` + `README.md`

Suggested issue labels: `v1.1`, `v2-sync`, `security`, `ui`, `mcp`.
