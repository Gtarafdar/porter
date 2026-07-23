#!/bin/bash
# Stable Porter launcher — use this instead of Cursor-background terminals.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export HOME="${HOME:-/Users/$(id -un)}"
export PORTER_OPEN_BROWSER="${PORTER_OPEN_BROWSER:-0}"
# Bonjour can crash Node on some network states; peer Tailscale/LAN IPs still work when set.
export PORTER_NO_BONJOUR="${PORTER_NO_BONJOUR:-1}"
cd "$ROOT"
if [[ ! -f packages/core/dist/cli.js ]]; then
  npm run build
fi
exec node packages/core/dist/cli.js serve
