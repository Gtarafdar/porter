# Travel matrix (v1)

| Home (left behind) | Travel (you take) | Support |
| --- | --- | --- |
| Mac + Travel Ready / Set & forget | Mac | Supported (existing — must not regress) |
| Mac + Travel Ready / Set & forget | Windows | Supported (primary new path) |
| Windows (Porter running) | Mac or Windows | Peer works if awake; full Set & forget later |
| Windows sleeping, no auto-start | anything | Unsupported — document honestly |

## Rules

- Mac LaunchAgent / caffeinate / Tailscale Serve stay **darwin-only**
- Windows Setup installs to `C:\Program Files\Porter` (admin once)
- Prefer Tailscale `100.x` + same pair token for travel
- Do not claim Windows home Set & forget parity until Task Scheduler keep-alive ships
