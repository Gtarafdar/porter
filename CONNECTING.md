# Connect another Mac to Porter

**Not automatic.** Installing Porter on a second Mac does **not** auto-link via Apple ID. You pair once with a shared secret, then devices talk **directly** (LAN or Tailscale). No Porter cloud.

## What you need

1. Porter running on **both** Macs  
2. The **same pair token** in Settings on both  
3. Same Wi‑Fi **or** free Tailscale on both  
4. Approved folders on each Mac (enable **write** where you want to receive files)

Phone / iPad: **not supported** in this version (skip). Use the Mac app + Cursor.

Apple ID / iCloud: **not used** by Porter. Same Apple login alone will **not** sync Porter folders. (iCloud Desktop/Documents is separate.)

---

## Step-by-step (Mac A ↔ Mac B)

### On Mac A (already set up)

1. Open http://127.0.0.1:47831/  
2. **Settings** → copy **Pair token**  
3. Note this Mac’s LAN IP from the header (e.g. `192.168.0.107`)  
4. If you use Tailscale, note the `100.x` address too  

### On Mac B (new Mac)

```bash
git clone https://github.com/Gtarafdar/porter.git
cd porter
npm install && npm run build
PORTER_NO_BONJOUR=1 PORTER_OPEN_BROWSER=0 nohup node packages/core/dist/cli.js serve >> /tmp/porter.log 2>&1 &
open http://127.0.0.1:47831/
```

1. Run **Setup** wizard → paste the **same pair token** from Mac A  
2. **Share folder** (Projects) with **write** if this Mac should receive copies  
3. **Settings → Add peer** (or Devices) → enter Mac A’s IP and port `47831`  
4. You should see Mac A under Devices → browse its approved folders  

### Back on Mac A

Add Mac B as a peer the same way (Mac B’s IP + `47831`) if it does not appear automatically.

> Bonjour auto-discovery is **off by default** on some Macs for stability. Manual peer IP is the reliable path. Tailscale: use each Mac’s `100.x` IP instead of LAN.

---

## After pairing — what works

| Action | How |
| --- | --- |
| Browse remote folders | Click the other device → approved folders |
| Copy **from** other Mac **to** this Mac | Select file → Copy to other pane / MCP `copy_file` |
| Copy **to** other Mac | Push copy (dest = remote device) when remote folder has write |
| One-way sync pack | Settings / MCP `sync_to_device` for a shared folder → remote path |
| Cursor AI | Install MCP on **each** Mac (`Setup → Link Cursor`) |

---

## Checklist

- [ ] Same pair token on both Macs  
- [ ] Porter process running on both (`curl http://127.0.0.1:47831/api/health`)  
- [ ] Peer added by IP (or Tailscale IP)  
- [ ] Folders shared; write enabled on destination  
- [ ] Firewall allows TCP **47831** on both Macs  

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Other Mac missing | Add peer by IP; check same token; check Tailscale/LAN |
| 401 Unauthorized | Tokens differ — paste identical token on both |
| 503 Sleeping | Wake Porter on that Mac (menu bar or UI) |
| Slow copies | Prefer same Wi‑Fi over Tailscale for big folders |
| Link dead on this Mac | Restart: `scripts/run-porter.sh` or `node packages/core/dist/cli.js serve` |
