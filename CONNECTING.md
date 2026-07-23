# Connect from home, travel, or another country

## What actually works when you are away

You **cannot** manage the home Mac while traveling. So the home Mac must run **unattended**.

| Layer | Role |
| --- | --- |
| **Porter + LaunchAgent** | Starts at login, restarts if Porter crashes |
| **Cloudflare Tunnel** | Easy HTTPS path for travel Mac (Porter only) |
| **Tailscale** | **Stable backup** — IP does not change after reboot |
| **caffeinate** | Reduces sleep while Porter is running |

**Critical truth:** Cloudflare *Quick* Tunnel URLs can change if the tunnel fully restarts after a reboot. If that happens and you only saved the old HTTPS link, you are stuck unless **Tailscale fallback** is configured.

**Recommendation:** Always use **Set & forget for travel** on the home Mac, and on the travel Mac add **primary = Cloudflare URL** + **fallback = Tailscale `100.x` IP**.

---

## One-time on the home Mac (before you leave)

1. Open Porter → **Travel Ready**
2. Click **Set & forget for travel** (shares work folders, installs auto-start, starts Cloudflare, keeps Mac awake)
3. Confirm checklist is green — especially **Tailscale online**
4. Copy pair token + primary URL + fallback Tailscale address

Leave Mac **plugged in**, logged in, internet connected. Do not force-quit Porter.

---

## Travel Mac

1. Install Porter (zip / `Porter.app` — no git)
2. Same **pair token**
3. **Settings → Add peer**
   - Host: Cloudflare `https://….trycloudflare.com`
   - Fallback: `100.x.x.x:47831` (home Tailscale IP)
4. If Cloudflare fails, Porter automatically tries Tailscale

---

## Chrome extensions (optional)

- **Normal file sharing** (Projects, Downloads, etc.) never requires quitting Chrome.
- **Optional** Chrome Extensions sync only: quit Chrome on both Macs → Settings → Share Chrome extensions folders → copy those folders on the other Mac into the same Chrome paths → reopen Chrome.
- Passwords and cookies are never synced.

---

## Same Wi‑Fi (desk)

Same pair token → Add peer with LAN IP. No Cloudflare / Tailscale needed.

---

## Why not Cloudflare alone?

| | Cloudflare Quick Tunnel | Tailscale |
| --- | --- | --- |
| Travel Mac apps | Porter only | Porter + Tailscale |
| Address stability | Can change after reboot | Stable `100.x` |
| Best for | Convenience | Unattended reliability |

Use **both**. Porter’s failover uses Cloudflare first, Tailscale second.
