# Security

Porter is a **local-first** file bridge. There is no Porter cloud and no remote admin backdoor.

## What is locked down

| Surface | Rule |
| --- | --- |
| Pair token / device settings / Travel Ready / tunnel controls | **Localhost UI only** |
| File APIs over LAN / Tailscale / Cloudflare | Require matching **pair token** |
| Cloudflare Quick Tunnel | Treated as **remote** even though it proxies via `127.0.0.1` (CF headers force auth) |
| Static Finder UI | Served to **localhost only** (not via public tunnel) |
| `PORTER_OPEN_LAN` | Disabled unless **both** `PORTER_OPEN_LAN=1` and `PORTER_I_UNDERSTAND_OPEN_LAN=1` |

## What is bundled

- **Node runtime** + Porter app code  
- **cloudflared** (when available at package time) for Cloudflare Tunnel  

## What is NOT bundled (on purpose)

- **Tailscale.app** — it is a VPN / system-extension product that requires an official install and your Tailscale login. Porter opens the [official Mac download](https://tailscale.com/download/mac) instead of shipping a third-party VPN binary.

## Your responsibilities

1. Keep the **pair token** secret (treat like a password).  
2. Treat Cloudflare Quick Tunnel URLs as secret.  
3. Share only work folders — never the whole disk.  
4. Prefer **Tailscale as fallback** for unattended travel.

## Report issues

Open a GitHub issue on this repository if you find an auth bypass.
