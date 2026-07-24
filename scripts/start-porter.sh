#!/bin/bash
# Hassle-free Porter start — double-click or LaunchAgent (dev / source checkout).
# Prefer Porter.app from Applications for end users.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export PORTER_OPEN_BROWSER="${PORTER_OPEN_BROWSER:-0}"
export PORTER_NO_BONJOUR="${PORTER_NO_BONJOUR:-1}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${HOME}/Library/Logs/Porter/porter-dev.log"
mkdir -p "$(dirname "$LOG")"
mkdir -p "$HOME/Library/Application Support/Porter"

cd "$ROOT"
if [[ ! -f packages/core/dist/cli.js ]]; then
  npm run build >>"$LOG" 2>&1 || true
fi

# Already running?
if curl -sf "http://127.0.0.1:47831/api/health" >/dev/null 2>&1; then
  echo "Porter already healthy" >>"$LOG"
  exit 0
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "node not found" >>"$LOG"
  exit 1
fi
exec "$NODE" packages/core/dist/cli.js serve >>"$LOG" 2>&1
