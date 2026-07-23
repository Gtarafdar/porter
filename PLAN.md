# Porter — Product Plan & Roadmap

Repo: https://github.com/Gtarafdar/porter

## Connecting another Mac (not automatic)

**Apple ID does not connect Porter.** Same iCloud login alone will not sync or discover devices.

**Phone / iPad:** skipped this version — Mac + Cursor only. See [CONNECTING.md](CONNECTING.md).

### Required steps on the other Mac

1. `git clone` / `git pull` this repo  
2. `npm install && npm run build` then start Porter  
3. Paste the **same pair token** (Settings)  
4. **Add peer** with this Mac’s LAN or Tailscale IP + port `47831`  
5. Share folders (enable **write** to receive copies / sync)

Then: browse, pull, **push**, or **one-way sync**.

---

## Done

- [x] V1 core + Finder UI + MCP  
- [x] Setup wizard + Cursor MCP merge + menu bar  
- [x] Crisp SVG icons  
- [x] Sleep/wake, Tailscale prefer, Mbps timing, parallel transfers  
- [x] Manual peer add (IP) — reliable when Bonjour is off  
- [x] Push copy to remote Mac  
- [x] One-way sync (`POST /api/sync/one-way`)  
- [x] CONNECTING.md guide  
- [x] E2E 10/10  

## Explicitly out / later

- [ ] Phone app  
- [ ] Auto-sync via Apple ID / iCloud (use iCloud or Porter one-way sync instead)  
- [ ] Two-way sync with conflict UI  
- [ ] QR pairing (token paste works)

---

## Run

```bash
npm install && npm run build
PORTER_NO_BONJOUR=1 nohup node packages/core/dist/cli.js serve >> /tmp/porter.log 2>&1 &
open http://127.0.0.1:47831/
```
