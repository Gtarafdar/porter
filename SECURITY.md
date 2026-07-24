# Security

Porter is a **local-first** file bridge. There is no Porter cloud and no remote admin backdoor.

## Trust model (travel)

| Layer | What it controls |
| --- | --- |
| **Tailscale account** | Which devices can reach your Mac on the private mesh |
| **Pair token** | What Porter allows after a connection (exact match required) |
| **Folder allowlists** | Which paths may be listed / copied |
| **Secret-path blocks** | `.env`, keys, Chrome profiles blocked by default |

## What is locked down

| Surface | Rule |
| --- | --- |
| Pair token / device settings / Travel Ready / tunnel controls | **Localhost UI only** |
| File APIs over LAN / Tailscale / Cloudflare | Require matching **pair token** (exact) |
| Cloudflare Quick Tunnel | Treated as **remote** even though it proxies via `127.0.0.1` (CF headers force auth) |
| Tailscale Serve | Private to your Tailscale account (not Funnel / not public internet) |
| Static Finder UI | Served to **localhost only** (not via public tunnel) |
| `PORTER_OPEN_LAN` | Disabled unless **both** `PORTER_OPEN_LAN=1` and `PORTER_I_UNDERSTAND_OPEN_LAN=1` |

## What is bundled

- **Node runtime** + Porter app code  
- **cloudflared** (when available at package time) for optional Cloudflare Tunnel  

## What is NOT bundled (on purpose)

- **Tailscale.app** — official install + your Tailscale login. Porter opens the [official Mac download](https://tailscale.com/download/mac) instead of shipping a third-party VPN binary.

Installing Tailscale asks macOS to approve a **VPN / Network Extension**. That is expected. Anyone on the **same Tailscale account** can reach your Mac on the private mesh — treat that account like a trust boundary (same as the pair token).

## Your responsibilities

1. Keep the **pair token** secret (treat like a password).  
2. Prefer **Tailscale** for travel; treat Cloudflare Quick Tunnel URLs as optional and secret.  
3. Enable **Remote Login** on the home Mac before you leave (break-glass revive). Tailscale’s Mac app has no SSH menu.  
4. Share only work folders — never the whole disk.  
5. Install Porter into **Applications** (not Downloads) so updates and keep-alive stay reliable.

## Report issues

Open a GitHub issue on this repository if you find an auth bypass.
