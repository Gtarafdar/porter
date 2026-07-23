# Connect from home, travel, or another country

## Short answer

| Situation | What works |
| --- | --- |
| Both Macs on same Wi‑Fi | LAN IP + pair token |
| You are traveling / other country | **Tailscale** (free) + home Mac left **on** with Porter always running |
| Apple ID alone | **Does not** connect Porter |
| Phone | Not in this version |

**First time = one setup.** After that, reconnect is **automatic** when both Macs are online on Tailscale (saved peers are re-checked every 15s).

---

## What you must leave running at home

While you travel, the Mac at home/office must:

1. Stay **powered on** (sleep can break access — set Energy settings to prevent sleep, or use “Wake for network access” where possible)  
2. Stay connected to **internet**  
3. Run **Tailscale** (signed into your Tailscale account)  
4. Run **Porter** all the time (LaunchAgent / login item)

If that Mac is off or offline, nothing can reach its files — there is no Porter cloud.

---

## One-time setup for travel (do this before you leave)

### 1. Install Tailscale on **both** Macs (free)

https://tailscale.com/download

- Sign in with the **same Tailscale account** on Mac mini (home) and MacBook (travel)  
- Confirm each shows a `100.x.x.x` address  

### 2. Keep Porter always on (home Mac)

```bash
cd ~/Downloads/porter   # or your clone path
npm install && npm run build
```

Install login agent (starts Porter when you log in, restarts if it crashes):

```bash
cp scripts/local.porter.plist ~/Library/LaunchAgents/local.porter.plist
# edit paths inside the plist if your clone is not ~/Downloads/porter
launchctl bootout gui/$(id -u)/local.porter 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.porter.plist
curl http://127.0.0.1:47831/api/health
```

### 3. Pair once (same as before)

1. Same **pair token** on both Macs (Settings)  
2. On the travel MacBook: **Settings → Add peer** → home Mac’s **Tailscale IP** (`100.x.x.x`) + port `47831`  
3. Share folders on home Mac; enable **write** if you will push files home  

After this, when you open Porter abroad, the saved peer should show **online** once Tailscale connects — you do **not** re-enter the token every trip.

---

## While traveling

1. Open Tailscale on the MacBook (must be connected)  
2. Open Porter → home Mac should appear under Devices (saved peer)  
3. Browse / copy / sync as usual  

If offline: check Tailscale status, home Mac power, Porter health on home (`curl http://127.0.0.1:47831/api/health` via screen share or leave a monitor).

---

## Why not “fully automatic Apple ID”?

Apple ID / iCloud does not give apps a private tunnel to another Mac’s disks. Porter needs either:

- Same local network, or  
- A private mesh like **Tailscale** (identity + encrypted path, free for personal use)

That is the zero-server-cost way to reach home from another country.

---

## Checklist before a long trip

- [ ] Tailscale installed & logged in on home + travel Mac  
- [ ] Home Mac: Porter LaunchAgent loaded; `api/health` OK  
- [ ] Home Mac: won’t deep-sleep; internet stable  
- [ ] Same pair token; peer added with **100.x** IP (not only LAN `192.168`)  
- [ ] Test once from a different network (phone hotspot) before you fly  
