# Porter — Landing page copy kit

Ready-to-paste sections for a marketing site. Tone: clear, confident, honest. Avoid hype and “AI-washed” filler.  
Facts and deeper detail: [PRODUCT.md](PRODUCT.md). Screenshots: [docs/assets/img/shots/](assets/img/shots/) (public-safe exports). Guide: [SCREENSHOTS.md](SCREENSHOTS.md).

**Brand:** Porter  
**Tagline options (pick one):**
1. Private AI + Finder bridge across your Macs  
2. Approved folders. Your Macs. Your AI tools. No Porter cloud.  
3. Not remote desktop. A private file bridge for humans and agents.

**Primary CTA:** Download for Mac (Apple Silicon) → GitHub Release DMG  
**Secondary CTA:** Read how connecting works · View on GitHub  

**Trust line under CTA:** MIT · No Porter cloud · Notarization: right-click → Open (normal for indie Mac apps)

---

## Hero

**Eyebrow:** Mac → Mac · LAN or Tailscale · MCP for AI IDEs  

**Headline:** Bring home folders to your travel Mac — and to Cursor — without TeamViewer or a cloud drive.

**Subhead:** Porter is a private Finder-like bridge. You choose the folders. You pair your Macs. AI tools talk to Porter through MCP — same allowlists, same activity log.

**CTA group:** Download DMG · See how it works  

**Hero visual:** Dual-pane Finder UI (redacted) — see shot H1 in SCREENSHOTS.md  

---

## Problem section — “The gap”

**Title:** Your files are on the other Mac. Your AI is on this one.

**Body:**
- iCloud and Drive sync everything or nothing — awkward for agents, noisy for disk  
- Remote desktop gives full screen control when you only needed a project folder  
- Pasting paths and zipping over chat does not scale  
- Public tunnels and “just open a port” are the wrong default for home machines  

**Close:** Porter exists for people who want **narrow, visible access** between their own Macs.

---

## What Porter is / isn’t

**Is:**
- Finder-style browse + copy between paired Macs  
- MCP bridge for Cursor, Claude Desktop, Claude Code, VS Code/Copilot  
- LAN at the desk; Tailscale when you travel  
- Optional Chrome extension **code + local data** copy  

**Isn’t:**
- TeamViewer / full remote control  
- A Porter cloud account  
- iPhone app (yet)  
- Apple ID auto-discovery  
- Dropbox-style two-way conflict sync  

---

## How it works (3 steps)

1. **Install on each Mac** — DMG → Applications → open once (right-click → Open if Gatekeeper asks)  
2. **Share folders + pair** — same pair token; Add Mac via LAN or Tailscale  
3. **Connect AI tools (optional)** — one click merges Porter MCP; ask the agent to list devices  

Optional fourth: **Travel Ready → Set & forget** on the home Mac before you leave.

---

## Why not TeamViewer

**Title:** Remote desktop remotes a computer. Porter bridges files.

**Points:**
- You see **folders you approved**, not the whole desktop  
- Copies can require **confirm** — clearer than silent remote clicks  
- AI IDEs get **structured tools** (search, read, copy), not screenshots of Finder  
- No vendor remote-admin cloud in the middle of your file path  

---

## Why Tailscale

**Title:** Private mesh, not “expose my Mac to the internet.”

**Benefits:**
- Stable private addresses when you’re away from home Wi‑Fi  
- Your Tailscale account is the reachability trust boundary  
- Porter’s pair token is the application trust boundary  
- Optional private Serve link on your Tailnet — not a public Funnel  

**Honest note:** Tailscale is a separate official install (VPN prompt is expected). Cloudflare Quick Tunnel is optional backup only — URLs can change.

---

## Security — “Narrow and visible”

**Title:** Four locks, on purpose

1. Who can reach the Mac → **Tailscale** (travel)  
2. What Porter allows → **pair token**  
3. Which paths → **shared folders only**  
4. What gets blocked by default → **secrets & dangerous profile paths**  

Plus: localhost-only settings, activity log, confirm writes.

**Link:** Security details → SECURITY.md / site `/security`

---

## AI / MCP section

**Title:** Same bridge for you and your agent

**Body:** Connect Cursor (recommended), Claude Desktop, Claude Code, or VS Code/Copilot. One Porter MCP — list devices, search, read, copy within shares.

**Benefit line:** Stop pasting repos into chat. Point the agent at Porter.

**Visual:** Settings → AI tools list (shot A1)

---

## Activity & trust

**Title:** See what happened

Searchable Activity: transfers, devices, shares, travel, MCP, system. Export JSON/CSV. Delete with confirms. Retention you control.

**Why it matters:** When an agent copies a file, you can prove it later.

---

## Chrome (optional)

**Title:** Bring extension code and settings with you

Share Chrome Extensions + Local Extension Settings between Macs. Not passwords. Not cookies. Quit Chrome, copy into the real Library paths — Porter helps route to the matching share.

**Link:** CHROME.md  

---

## Desk vs travel

| At the desk | On the road |
| --- | --- |
| Same Wi‑Fi + pair token | Tailscale + Travel Ready on home |
| Fast LAN copies | Stable `100.x` / MagicDNS |
| Tailscale optional | Remote Login for break-glass revive |

---

## Features grid (short cards)

- Dual-pane Finder UI  
- Approved folder shares  
- Pair token (no Porter account)  
- Travel Ready / keep-alive  
- Remove Mac  
- Push copy & one-way sync  
- Activity log management  
- Multi-IDE MCP  
- Optional Chrome extension data  
- In-app updates  
- MIT, $0 Porter cloud  

---

## Limitations (trust section — do not hide)

- Mac only for now (no phone app)  
- No iCloud auto-link  
- No two-way conflict sync  
- Apple Silicon primary builds  
- Not Apple-notarized — right-click → Open  
- Tailscale required for reliable travel  

---

## Gatekeeper / “malware” warning FAQ

**Q: macOS says Porter can’t be opened / may be malware. Is it?**  
**A:** Gatekeeper blocks apps that are not notarized with an Apple Developer ID. Porter is distributed as an MIT indie build from GitHub. Use right-click → Open, or Privacy & Security → Open Anyway, after installing to Applications. Download only from official Releases.

**Q: Why not the Mac App Store?**  
**A:** Not the priority for V1. The product is the private bridge; Store distribution can come later.

---

## About the maker (from Aligner site)

Source collected from: https://gtarafdar.github.io/aligner/ (About the maker)

### Photo

| Use | Path / URL |
| --- | --- |
| Local (Porter repo) | [`docs/assets/img/gobinda-tarafdar.png`](assets/img/gobinda-tarafdar.png) |
| Canonical (Aligner site) | https://gtarafdar.github.io/aligner/assets/gobinda-tarafdar.png |
| Alt text | Portrait of Gobinda Tarafdar |
| Suggested size | 140×140 (site) · source file 400×400 PNG |

### Name & role

**Gobinda Tarafdar**  
WordPress product marketer · stubborn problem-solver · lifelong Harry Potter devotee

### About copy (landing-ready)

By day I am the Product Marketing Specialist at [WPBakery](https://wpbakery.com/), the page builder that quietly powers a sizeable corner of the WordPress universe. Before that, I helped a single plugin cross **400,000+ active users**.

When the day-job owl flies home, I tinker on my own workshop of spells. **Porter** is one of them — a private Finder-like file bridge so you (and Cursor / Claude / Copilot) can reach approved folders across your Macs without TeamViewer or a Porter cloud.

*(Aligner page wording uses Aligner as the example project; swap the last sentence per product page as above.)*

### Social & support links

| Label | URL |
| --- | --- |
| X / Twitter | https://x.com/Gtarafdarr |
| LinkedIn | https://www.linkedin.com/in/gobinda-tarafdar/ |
| Donate | https://gtarafdar.com/donate |
| GitHub | https://github.com/Gtarafdar |

**CTA line (from Aligner):** A GitHub star helps others find it. A small donation keeps the workshop lit.  
Buttons: Star on GitHub · Donate · Follow on X · LinkedIn

### Also from the workshop (other apps & projects)

| Project | Description | Link |
| --- | --- | --- |
| **Porter** (this product) | Private AI + Finder file bridge across Macs | https://github.com/Gtarafdar/porter |
| [Aligner](https://gtarafdar.github.io/aligner/) | Free local Chrome toolkit — measure, inspect, a11y, WP tools, DESIGN.md for AI IDEs | https://gtarafdar.github.io/aligner/ · https://github.com/Gtarafdar/aligner |
| [WPBakery](https://wpbakery.com/) | Page builder I do product marketing for | https://wpbakery.com/ |
| [Docscriber](https://thedocscriber.com/) | Documentation, conjured | https://thedocscriber.com/ |
| [TheRecaller](https://therecaller.com/) | A memory charm for what you forget online | https://therecaller.com/ |
| [TheEditra](https://theeditra.com/) | AI video editor | https://theeditra.com/ |
| [The Quill Press](https://thequillpress.com/) | Tech news, Daily Prophet style | https://thequillpress.com/ |
| [Costlas](https://costlas.com/) | Cost of living for 140+ countries | https://costlas.com/ |
| [Auto AFK Slack](https://gtarafdar.github.io/auto-afk-slack/) | Lock your Mac, Slack goes AFK | https://gtarafdar.github.io/auto-afk-slack/ |
| [Slack Teammate Time](https://gtarafdar.github.io/slack-teammate-local-time/) | Teammate local times inline in Slack | https://gtarafdar.github.io/slack-teammate-local-time/ |
| [FinderFlow](https://gtarafdar.github.io/FinderFlow/) | Mac file manager with built-in editor | https://gtarafdar.github.io/FinderFlow/ |
| [Slack Agent Bridge](https://gtarafdar.github.io/slack-agent-bridge/) | MCP bridge for Cursor/Claude, local archive, automations | https://gtarafdar.github.io/slack-agent-bridge/ |
| [Broken Link Checker](https://gtarafdar.github.io/broken-link-checker/) | Find broken links without leaving the page — local Chrome toolbox | https://gtarafdar.github.io/broken-link-checker/ |

### Maker section layout (suggested)

```
[ photo 140px ]  Gobinda Tarafdar
                 role line
                 about paragraphs (2)
                 [X] [LinkedIn] [Donate] [GitHub]
Also from the workshop → compact grid or table of projects above
```

---

## Footer links

Download · Docs (CONNECTING) · Security · Chrome · GitHub · Releases · MIT License  
Maker: [Gobinda Tarafdar](https://github.com/Gtarafdar) · [Donate](https://gtarafdar.com/donate) · [X](https://x.com/Gtarafdarr) · [LinkedIn](https://www.linkedin.com/in/gobinda-tarafdar/) · [Aligner](https://gtarafdar.github.io/aligner/)

---

## Meta / SEO drafts

**Title:** Porter — Private file bridge for your Macs and AI IDEs  
**Description:** Finder-like copy between Macs over LAN or Tailscale. MCP for Cursor, Claude, and Copilot. No Porter cloud. Not remote desktop.  
**Author:** Gobinda Tarafdar · https://github.com/Gtarafdar
