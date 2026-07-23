#!/bin/bash
# Always-on Porter launcher for the Mac that stays at home/office.
set -euo pipefail
export HOME="/Users/gtarafdar"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PORTER_OPEN_BROWSER="0"
export PORTER_NO_BONJOUR="1"
ROOT="/Users/gtarafdar/Downloads/porter"
cd "$ROOT"
LOG="/tmp/porter.stable.log"
if [[ ! -f packages/core/dist/cli.js ]]; then
  /opt/homebrew/bin/npm run build >>"$LOG" 2>&1 || npm run build >>"$LOG" 2>&1
fi
NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "node not found" >>"$LOG"
  exit 1
fi
exec "$NODE" packages/core/dist/cli.js serve
