# Porter — Screenshot & capture guide

Goal: marketing and README images that look polished and **never leak secrets**.

Official product story: [PRODUCT.md](PRODUCT.md) · Landing copy: [LANDING.md](LANDING.md)

---

## Before you capture (demo hygiene)

Create a **demo profile** mindset (or temporarily sanitize UI):

| Hide / fake | Examples |
| --- | --- |
| Pair token | Never show full token; blur or use `••••••••••••` |
| Device IDs | Blur hex IDs in Activity / Settings |
| Tailscale / LAN IPs | Blur `100.x` and `192.168.x` or use fake `100.64.0.1` |
| Cloudflare URLs | Blur entirely |
| Absolute home paths | Prefer folder **names** (Projects) not `/Users/realname/...` |
| GitHub PAT / update token | Never open that field filled |
| Chrome extension IDs | Blur long ID folder names if recognizable |
| Email / Tailscale account | Out of frame |
| Other MCP servers in snippets | Crop or blur third-party keys |

**Recommended demo names:** Macs `Home Mac` / `Travel Mac`; folders `Projects`, `Inbox`; files `readme-draft.md`, `styles.css`.

**Window size:** ~1440×900 or 1280×800 for consistent crops. Light mode preferred for landing (Porter’s warm UI). Clean Desktop wallpaper behind if window is floating.

**Beautify:**
- Hide personal menu-bar icons if the menubar is visible  
- Close unrelated notifications  
- Use a finished setup (wizard completed) unless the shot *is* the wizard  
- Prefer `/Applications/Porter.app` (no “downloaded from internet” banners mid-shot)

---

## Shot list (all useful assets)

Capture these as PNG (Retina if possible). Suggested filenames for `docs/images/` or landing `public/`.

### Hero / product

| ID | Shot | What to show | Redact |
| --- | --- | --- | --- |
| **H1** | Dual-pane Finder | From · Home Mac / To · Travel Mac; folders visible; Copy button | Paths, IPs in sidebars |
| **H2** | Copy confirm | Confirm dialog mid-copy | Destination absolute paths |
| **H3** | Multi-select + progress | Several files selected; progress toast | — |

### Setup & connect

| ID | Shot | What to show | Redact |
| --- | --- | --- | --- |
| **S1** | Welcome / Home vs Join | Wizard early step | — |
| **S2** | Share folders | Choose folder + write checkbox | Full path string |
| **S3** | Tailscale step | Green “connected” status | Tailscale IP |
| **S4** | Link Macs / pair | Token field | **Token fully blurred** |
| **S5** | Link AI tools | Cursor / Claude / VS Code rows | Config absolute paths in snippets (blur `args` path or crop) |

### Settings

| ID | Shot | What to show | Redact |
| --- | --- | --- | --- |
| **A1** | AI tools (MCP) | Connect / Repair / Copy snippet | Paths in hints if sensitive |
| **A2** | Connected Macs | Device list + Remove | IPs, IDs |
| **A3** | Updates | Version 0.2.34; no PAT typed | — |
| **A4** | Chrome extensions | Share Chrome folders steps | Library paths usernames |
| **A5** | Activity log settings | Categories + retain days | — |

### Travel

| ID | Shot | What to show | Redact |
| --- | --- | --- | --- |
| **T1** | Travel Ready checklist | Mostly green checks | Pair token row, IPs, revive SSH user@host |
| **T2** | Set & forget success | Confirmation / copy rows with **blurred** values | Everything secret |

### Activity

| ID | Shot | What to show | Redact |
| --- | --- | --- | --- |
| **L1** | Activity view | Mix of transfer + MCP rows; search box | Detail column paths/tokens |
| **L2** | Export Save dialog | Native Save panel (filename `porter-activity.json`) | Destination folder username |

### Chrome (optional story)

| ID | Shot | What to show | Redact |
| --- | --- | --- | --- |
| **C1** | Chrome shares in pane | “Chrome Extensions” / “Chrome Extension Data” labels | Extension ID folder names |
| **C2** | Settings Chrome block | Share / Open Extension Data buttons | Full Library path |

### Trust / Gatekeeper (support article)

| ID | Shot | What to show | Redact |
| --- | --- | --- | --- |
| **G1** | Right-click → Open | Finder context menu on Porter.app | — |
| **G2** | Privacy & Security Open Anyway | System Settings (crop personal) | Apple ID name |

---

## How to redact (tools)

1. Capture with **Cmd+Shift+4** (selection) or **Cmd+Shift+5**.  
2. Open in Preview / Figma / CleanShot: draw **solid rounded blurs** over secrets (prefer blur over black bars for polish).  
3. Export PNG; avoid uploading unredacted originals to public chats.  
4. Optional: slight **inner padding crop** so the window chrome feels intentional.

**Do not** use real pair tokens even “just for a second” in cloud screenshot tools.

---

## Beautification checklist

- [ ] One primary window; no overlapping clutter  
- [ ] Consistent Mac names across all shots  
- [ ] No red error toasts unless documenting an error  
- [ ] Activity rows look realistic but harmless (`copy · Projects/app.css · 120 ms`)  
- [ ] MCP snippet cropped so only `"porter"` + `"command": "node"` show, args blurred  
- [ ] Same scale/alignment if used in a 3-up landing strip  

---

## Landing page placement map

| Section | Shot IDs |
| --- | --- |
| Hero | H1 |
| How it works | S2, S4 (redacted), S5 |
| vs TeamViewer | H1 (folder view) |
| Tailscale / travel | T1 (redacted) |
| AI / MCP | A1, S5 |
| Activity | L1 |
| Chrome | C1 or A4 |
| Gatekeeper FAQ | G1 |

---

## What this agent cannot do automatically

Live, beautified captures of **your** Porter window with perfect redaction need to be taken on your Mac (or via a controlled demo account).  

After you capture raw PNGs into e.g. `docs/images/raw/`, ask in Agent mode to help **review redaction**, rename, and wire them into README/landing.

---

## Minimal README image set (if you only have time for five)

1. H1 Dual-pane  
2. S5 AI tools  
3. T1 Travel Ready (redacted)  
4. L1 Activity  
5. G1 Right-click Open  
