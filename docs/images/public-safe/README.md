# Screenshot redaction audit (2026-07-25)

Public-safe exports live in [`docs/images/public-safe/`](images/public-safe/).

## Verdict

| # | File | Status | Notes |
| --- | --- | --- | --- |
| 01 | `01-finder-dual-pane.png` | **OK for public** | Header IPs/hostname, sidebar user paths, device names, personal Downloads folders mosaiced |
| 02 | `02-setup-link-macs-choice.png` | **OK** | Same background redactionsactions; wizard UI kept |
| 03 | `03-setup-join-home.png` | **OK** | Placeholder `100.x.x.x` / `192.168.x.x` left visible on purpose (generic UI copy, not your IPs) |
| 04 | `04-setup-home-copy-token.png` | **OK** | Your prior token mosaics kept; sidebar identity redacted |
| 05 | `05-setup-ai-tools.png` | **OK** | MCP `~` paths kept (no username); background identity redacted |
| 06 | `06-travel-ready.png` | **OK** | Live Cloudflare URL + Primary/token fields + sidebar redacted |
| 07 | `07-add-mac-settings.png` | **OK** | Copy fields mosaiced; device names/paths redacted |
| 08 | `08-settings-ai-tools.png` | **OK** | Device name field + header IPs + paths redacted; version `0.2.34` kept |
| 09 | `09-activity.png` | **OK** | Your TIME/ACTION/DETAIL mosaics sufficient; no leftover IPs/names |

## What still needed mosaicing (your originals)

These were **still readable** before the automated pass:

1. **Header status line** — `Gobindas-MacBook-Pro`, LAN `192.168.0.100`, Tailscale `100.104.91.108`
2. **DEVICES** — `Gobindas-MacBook-Pro`, `Gobindas-Mac-mini`
3. **Last path: cloudflare · has Tailscale fallback**
4. **APPROVED FOLDERS paths** — `/Users/gtarafdar/...` and wrapped `Support/Google/Chrome/...` lines
5. **From / Search / footer** — hostname repeats
6. **Downloads grid** — personal/media/project folders (`365.Days…`, `afk_slack…`, `ahrefs…`)
7. **Travel Ready** — live `https://sender-continent-alex-routes.trycloudflare.com`
8. **Settings → Device name** — hostname in the text field

## Safe to leave visible

- Porter logo, buttons, wizard steps, feature copy  
- Folder **labels** Downloads / Documents / Desktop / Chrome Extensions (without username paths)  
- MCP paths using `~` (Cursor / Claude)  
- Generic placeholders like `100.x.x.x:47831`  
- Activity SOURCE values `ui` / `wizard` / `system`  
- Version `0.2.34`

## Optional polish (not identity leaks)

Still visible in some grids (safe for privacy, optional for marketing polish):

- `Ads Roll Banner`, `Ai connector wp plugin`, `Aligner`, `backlink`, `acf form`, etc.

Re-mosaic those if you don’t want project names on the landing page. They do **not** expose username, LAN IP, Tailscale IP, pair token, or tunnel URL.

## Placeholder OK

`100.x.x.x:47831 or 192.168.x.x` in Join Home fields is **generic UI copy** — keep it.
