# Connect from home, travel, or another country

## First Tailscale install (both Macs)

1. In Porter setup, tap **Get Tailscale** (or open https://tailscale.com/download/mac)
2. **Sign up / sign in** (free) — use the **same account** on every Mac
3. Open the **Tailscale** app and approve any macOS **VPN / Network Extension** prompts
4. Wait until Porter shows a green **Signed in & connected** (`100.x` address)
5. Before travel: enable **Tailscale SSH** (Porter → Travel Ready → **Enable SSH settings**)

Porter does not bundle Tailscale. Same Wi‑Fi desk use can skip Tailscale; travel cannot.

---

## What actually works when you are away

You **cannot** manage the home Mac while traveling unless something keeps Porter alive **and** you have a revive path. So before you leave:

| Layer | Role |
| --- | --- |
| **Porter + LaunchAgent** | Starts at login, restarts if Porter crashes |
| **Tailscale (required)** | Private mesh — stable `100.x` / MagicDNS; primary travel path |
| **Tailscale Serve** | Optional stable HTTPS name on your Tailscale account (not public) |
| **Tailscale SSH** | Break-glass: from travel run `tailscale ssh <home> 'open -a Porter'` |
| **caffeinate** | Reduces sleep while Porter runs |
| **Cloudflare Quick Tunnel** | Optional advanced only — URLs can change after reboot |

**Critical truth:** Cloudflare *Quick* Tunnel URLs can change if the tunnel fully restarts. Prefer **Tailscale**. Do not rely on Cloudflare alone for unattended travel.

**Recommendation:** On the home Mac, open **Travel Ready → Set & forget**, enable **Tailscale SSH**, leave the Mac plugged in and logged in.

---

## One-time on the home Mac (before you leave)

1. Open Porter → **Travel Ready**
2. Click **Set & forget for travel** (shares work folders, installs auto-start, enables Tailscale Serve, keeps Mac awake)
3. Enable **Tailscale SSH** on this Mac (Tailscale app → Settings) — required to revive Porter while away
4. Confirm checklist is green — especially **Tailscale online**
5. Copy pair token + Tailscale address (and optional revive command)

Leave Mac **plugged in**, logged in, internet connected. Do not force-quit Porter.

---

## Travel Mac

1. Install Porter (**DMG** → drag to **Applications** — not Downloads)
2. Same **pair token**
3. **Settings → Add Mac**
   - Prefer: pick the home Mac from the **Tailscale list**, or paste `100.x.x.x:47831`
   - Optional fallback: Cloudflare URL (advanced)
4. If Tailscale shows the Mac online but Porter fails: copy the **Break-glass revive** command from Travel Ready on home (or run `tailscale ssh <name> 'open -a Porter'`)

---

## Chrome extensions (optional)

See the full guide: **[CHROME.md](CHROME.md)**.

---

## Same Wi‑Fi (desk)

Same pair token → Add Mac with LAN IP. No Cloudflare / Tailscale needed (Tailscale still fine).

---

## Why not Cloudflare alone?

| | Cloudflare Quick Tunnel | Tailscale |
| --- | --- | --- |
| Travel Mac apps | Porter only | Porter + Tailscale |
| Address stability | Can change after reboot | Stable `100.x` / MagicDNS |
| Best for | Optional convenience | Unattended reliability |

Use **Tailscale first**. Porter’s failover prefers Tailscale, then LAN, then Cloudflare.
