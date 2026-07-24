# Porter — Product brief (source of truth)

Use this document for **README**, **landing page**, press, and support.  
Version context: **0.2.34** (Apple Silicon). License: MIT. Repo: https://github.com/Gtarafdar/porter

Related: [SECURITY.md](../SECURITY.md) · [CONNECTING.md](../CONNECTING.md) · [CHROME.md](../CHROME.md) · [docs/LANDING.md](LANDING.md) · [docs/SCREENSHOTS.md](SCREENSHOTS.md)

---

## 1. The problem Porter solves

You have more than one Mac (desk + travel, home + office). You want to:

- Browse and copy **real project folders** between them  
- Let **Cursor / Claude / Copilot** find and pull files from the other Mac  
- Do it **without** uploading everything to Dropbox/iCloud Drive as the AI path  
- Do it **without** giving a remote-control tool full screen + keyboard access  
- Keep cost at **$0 infrastructure** (no Porter cloud bill)

**Porter is the private bridge:** approved folders only, Finder-like UI, AI tools via MCP, Mac-to-Mac over LAN or Tailscale.

It is **not** “sync my whole life to the cloud.”  
It is **not** “remote desktop into my Mac.”

---

## 2. Why this app exists (why it was built)

Built for a practical workflow:

- Work on a **travel Mac** while **home Mac** still holds the real projects  
- Use **AI IDEs** that need file access — but only to folders you explicitly share  
- Stay productive on the road with **Tailscale** (private mesh), not a public “open my Mac to the internet” product  
- Prefer a **folder view + confirm copy** over opaque remote-control sessions  

**What improved over early Porter (through 0.2.34):**

| Area | Improvement |
| --- | --- |
| Setup | Guided wizard: name → shares → Tailscale → pair → AI tools |
| Travel | Travel Ready / Set & forget, keep-alive, Tailscale Serve, Remote Login break-glass |
| Devices | Add Mac (LAN / Tailscale list / CF), Remove Mac + soft-forget |
| Files | Dual-pane Finder UI, multi-select, progress, push copy, one-way sync |
| AI | One MCP for Cursor, Claude Desktop, Claude Code, VS Code/Copilot |
| Visibility | Full Activity view + retention, categories, export, delete |
| Chrome (optional) | Share extension **code + local extension data** between Macs |
| Trust | Pair-token hardening, localhost-only admin, secret/path blocks |
| Install | DMG → Applications, splash, in-app updates from GitHub |

---

## 3. Why Porter is not TeamViewer (or AnyDesk / Chrome Remote Desktop)

| | **TeamViewer-style remote desktop** | **Porter** |
| --- | --- | --- |
| What you see | Full screen, mouse, keyboard | **Folders you approved** — Finder-like panes |
| Power | Control the whole Mac | List / search / read / copy within allowlists |
| Typical risk | Session takeover, shoulder-surf UI, broad access | Narrow file surface + confirm writes |
| AI fit | Awkward (screenshot/desktop agents) | Native **MCP tools** for IDEs |
| Cloud account | Often vendor cloud / relay | **No Porter cloud**; your Tailscale or LAN |
| Best for | “Fix my mom’s Mac” support | “Get that project file / let Cursor pull it” |

**Difference in one line:** TeamViewer remotes a **computer**; Porter bridges **approved files** between your Macs (and your AI tools).

We intentionally do **not** ship full screen control in V1 — a real folder view is safer and clearer for this job.

---

## 4. Why Tailscale — benefits and why it’s more secure than “open tunnels”

### What Tailscale does for Porter

- Puts your Macs on a **private mesh** (MagicDNS / `100.x` addresses)  
- Same Tailscale **account** = your trust boundary for who can reach the machine  
- Works from hotels / other countries without opening home router ports  
- Optional **Tailscale Serve**: private HTTPS name on *your* Tailnet (not public Funnel)

### Benefits vs alternatives

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| **Same LAN** | Fast, simple desk use | Useless when you leave Wi‑Fi |
| **Tailscale (recommended for travel)** | Stable private path, no Porter cloud | Must install Tailscale + approve VPN once |
| **Cloudflare Quick Tunnel (advanced)** | Travel Mac can use Porter without Tailscale client | URL can **change** after reboot — bad alone for unattended |

**Porter failover preference:** Tailscale → LAN → Cloudflare.

### Why this is more secure than “just expose the app”

1. **No Porter backend** storing your files or sessions.  
2. Tailscale identity gates **who can reach** the Mac; Porter’s **pair token** gates **what Porter allows** after connect.  
3. Admin actions (token, Travel Ready, tunnels) stay **localhost-only** — not exposed on the tunnel.  
4. Cloudflare tunnels are treated as **remote** (auth required even when proxied to localhost).  
5. Tailscale Serve is **not** public internet Funnel.

See [SECURITY.md](../SECURITY.md).

---

## 5. How Porter ensures security

**Layers (all required in practice for travel):**

1. **Tailscale account** — who can reach the Mac on the mesh  
2. **Pair token** — exact match for remote Porter APIs (treat like a password)  
3. **Folder allowlists** — only shared paths can be listed/copied  
4. **Secret / dangerous path blocks** — `.env`, keys, Keychains, cookies, full Chrome profiles blocked by default (Chrome **Extensions** + **Local Extension Settings** are an explicit carve-out)  
5. **Confirm writes** — UI confirmation before copies (default on)  
6. **Activity log** — what happened, when, OK/failed, duration  
7. **Localhost UI** — Finder UI and settings not served as a public website  

**Honest residual risk:** anything inside an allowlisted folder can be read by a connected AI/agent; a stolen pair token on your mesh is dangerous; a compromised Mac can abuse a running agent. Porter keeps power **narrow and visible** — it does not claim zero risk.

**Your responsibilities:** secret token, prefer Tailscale, share only work folders, install to Applications, enable Remote Login before unattended travel.

---

## 6. Why the app is required (when you need it)

You need Porter when:

- Two or more **Macs** must share project folders without full disk sync products  
- An **AI IDE** on Mac A must search/read/copy from Mac B’s approved folders  
- You travel and still need home projects **privately**  
- You refuse “upload everything to a SaaS so the agent can see it”  
- You want a **human Finder UI** and an **AI tool path** on the same bridge  

You do **not** need Porter for: single-Mac work, iPhone-only workflows (out of scope), or full remote desktop support sessions.

---

## 7. Key features (what + why helpful)

### Finder-like dual pane
Browse shared folders on this Mac and the other; search; multi-select; copy with progress.  
**Why:** Same mental model as Finder — anyone can use it without learning a new “sync product.”

### Approved folder shares
Native **Choose folder…**; permissions read / copy / write.  
**Why:** Explicit consent; never “whole disk by default.”

### Pairing (no Porter account)
One **pair token** + Add Mac (LAN IP, Tailscale peer list, or optional Cloudflare URL).  
**Why:** No cloud signup; same secret on every Mac.

### Devices + Remove Mac
See connected Macs; remove with confirm; soft-forget so removed Macs don’t instantly reappear.  
**Why:** Control who stays in your list when Macs move or get retired.

### Travel Ready / Set & forget
Checklist + one action: share presets, keep-alive LaunchAgent, Tailscale Serve, prevent sleep; copy addresses + revive command.  
**Why:** Unattended home Mac stays reachable when you’re away.

### Sleep / wake
Pause remote work; wake from UI.  
**Why:** Explicit off-switch without quitting the whole install story.

### Push copy + one-way sync
Push files to the other Mac; one-way sync API/flows for folder trees.  
**Why:** Not only “pull to me” — send work home or keep a tree aligned one way.

### Activity log management
Full Activity view: search, OK/Failed filter, timing, pagination.  
Settings: categories (transfers, devices, shares, travel, MCP, system), retain days, max events, keep failures.  
Export JSON/CSV via **macOS Save dialog**; multi-select delete / clear with confirms; auto-prune.  
**Why:** Auditability — see what AI and UI did; keep disk use bounded; export for your records.

### AI tools (MCP)
One Porter MCP server; one-click Connect for popular IDEs.  
**Why:** Agents use the **same allowlists and pair rules** as the Finder UI — not a second backdoor.

### Chrome extension + data sharing (optional)
Share **Chrome Extensions** (code) and **Chrome Extension Data** (local settings by extension ID).  
Everyday file copy does **not** require quitting Chrome; this optional flow does (both Macs).  
**Never** copies passwords, cookies, or full profiles.  
**Why:** Move your real extension setup home ↔ travel without rebuilding settings by hand. See [CHROME.md](../CHROME.md).

### Updates
Check GitHub releases; install zip into Applications Porter.app; optional PAT if rate-limited.  
**Why:** Stay current without App Store.

### Native Mac app experience
DMG install, splash while engine starts, real traffic lights, Dock reopen (engine can keep running).  
**Why:** Feels like a normal Mac app, not a terminal ritual.

---

## 8. Modes: desk LAN vs travel

| Mode | When | What you need |
| --- | --- | --- |
| **Same LAN / desk** | Both Macs on home/office Wi‑Fi | Porter + same pair token + LAN (or Bonjour). Tailscale optional. |
| **Travel** | Different networks / countries | Tailscale on both (same account), Travel Ready on home, Remote Login for break-glass. Cloudflare optional backup only. |

**Benefits of LAN:** lowest latency, simplest.  
**Benefits of Tailscale travel:** private, stable addresses, no port-forwarding, works with Porter keep-alive for unattended home.

---

## 9. MCP — why we provide it, what’s supported, what’s recommended

### Why MCP
AI IDEs increasingly speak **Model Context Protocol**. Porter exposes tools (`list_devices`, `list_shared_folders`, `list_directory`, `search_files`, `read_file`, `copy_file`, `copy_folder`, `add_shared_folder`, `porter_status`) so the agent works through **Porter policy**, not raw disk mounts of your whole home folder.

### Supported (one-click / Repair in Porter 0.2.34+)

| Client | Status | Notes |
| --- | --- | --- |
| **Cursor** | Supported (recommended default) | `~/.cursor/mcp.json` |
| **Claude Desktop** | Supported | Quit & reopen after Connect |
| **Claude Code** | Supported | `~/.claude.json` |
| **VS Code / Copilot** | Supported | User `mcp.json`; use **Agent** mode |

Same `mcp.js` capabilities for all — Connect only writes that app’s config.

### Recommended
1. Keep **Porter running** on Macs you want reachable  
2. Share only the folders the agent should see  
3. Connect **Cursor** first (most tested), then others as needed  
4. After Connect: reload MCP / quit+reopen host app  
5. Ask the agent to **list Porter devices** before copying  

### How an AI IDE works with Porter

```text
AI IDE  →  Porter MCP (this Mac)  →  Porter core  →  paired Mac’s shared folders
```

The IDE does **not** magically see home Desktop. It only sees what you shared and paired.

### Benefit
- Agents search and copy across Macs with the same rules as you  
- No “paste the whole repo into chat”  
- Activity log records MCP actions under **AI / MCP**

---

## 10. Limitations (say these clearly)

- **No iPhone / iPad app** (Mac + AI IDEs for this version)  
- **No Apple ID / iCloud auto-discovery** — same iCloud ≠ linked in Porter  
- **No two-way sync with conflict UI** — copy and one-way sync instead  
- **Not notarized / not Mac App Store** — first open needs right-click → Open (see below)  
- **Apple Silicon** builds in current release line (Intel = older builds if any)  
- **Tailscale** required for reliable travel (not bundled)  
- Chrome extension flow: **Default** profile, manual copy, quit Chrome — not live sync  
- Full remote desktop / TeamViewer-style control: **out of scope**

---

## 11. Apple Developer ID / Gatekeeper — blocker, how to overcome, why it’s normal

### What happens
macOS may say the app can’t be opened because it is from an unidentified developer or was not **notarized**. That is **Gatekeeper**, not an antivirus verdict that Porter is malware.

### Why we don’t require App Store / Dev ID for V1
- MIT / free distribution from GitHub Releases  
- Notarization needs Apple Developer Program + ongoing signing pipeline  
- Product priority was private bridge + AI, not Store distribution  

### How users overcome it (safe, normal for indie Mac apps)

1. Install via **DMG → drag to Applications** (not run from Downloads)  
2. First launch: **right-click Porter → Open → Open**  
3. If still blocked: **System Settings → Privacy & Security → Open Anyway**  
4. Prefer downloads from the **official GitHub Releases** page for this repo  

### What we tell users
- This is **expected** for non-notarized Mac software  
- Porter is **not** malware; Gatekeeper is a distribution friction, not a content scan of “this binary steals passwords”  
- We ship **ad-hoc signed** builds; quarantine attributes are cleared on nested helpers where possible after download  

---

## 12. Easy for anyone — UI principles

- Setup wizard in plain language (Home vs Join)  
- **Choose folder…** instead of typing paths  
- Dual panes labeled with **Mac names**  
- Travel Ready checklist with green/red meaning  
- Settings tabs: Connect vs This Mac  
- AI tools listed with Connect / Repair / Copy snippet  
- Activity as a first-class view, not a hidden log file  
- Dock icon to reopen; close window without “losing” the engine  

---

## 13. Where to get all details

| Need | Go here |
| --- | --- |
| Download / install | [README.md](../README.md) + [GitHub Releases](https://github.com/Gtarafdar/porter/releases) |
| Travel / Tailscale / pair | [CONNECTING.md](../CONNECTING.md) |
| Security model | [SECURITY.md](../SECURITY.md) |
| Chrome extensions + data | [CHROME.md](../CHROME.md) |
| Landing page copy | [docs/LANDING.md](LANDING.md) |
| Screenshot checklist | [docs/SCREENSHOTS.md](SCREENSHOTS.md) |
| Roadmap / out of scope | [PLAN.md](../PLAN.md) |

**In the app:** Settings → This Mac (updates, AI tools, Chrome, Activity log settings) · Activity view · Travel Ready · Devices.

---

## 14. One-paragraph pitch (reuse anywhere)

**Porter** is a private, Finder-like file bridge between your Macs. Share only the folders you approve, copy them between machines on the same Wi‑Fi or over Tailscale when you travel, and connect Cursor, Claude, or Copilot through MCP so AI can search and pull those same folders — without a Porter cloud, without remote-desktop control of your whole Mac, and without uploading everything to a sync SaaS just so an agent can see it.
