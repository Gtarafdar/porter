#!/bin/bash
# Hassle-free Porter start — double-click or LaunchAgent.
set -euo pipefail
export HOME="/Users/gtarafdar"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export PORTER_OPEN_BROWSER="${PORTER_OPEN_BROWSER:-0}"
export PORTER_NO_BONJOUR="1"

ROOT="/Users/gtarafdar/Downloads/porter"
LOG="/Users/gtarafdar/Library/Logs/Porter.log"
mkdir -p "$(dirname "$LOG")"
mkdir -p "$HOME/Library/Application Support/Porter"

cd "$ROOT"
if [[ ! -f packages/core/dist/cli.js ]]; then
  npm run build >>"$LOG" 2>&1 || true
fi

# Already running?
if curl -sf "http://127.0.0.1:47831/api/health" >/dev/null 2>&1; then
  # Prefer native window if present
  if [[ -d "$ROOT/dist/release/Porter.app" ]]; then
    open "$ROOT/dist/release/Porter.app"
  elif [[ "$PORTER_OPEN_BROWSER" == "1" ]]; then
    open "http://127.0.0.1:47831/"
  fi
  exit 0
fi

NODE="$(command -v node)"
nohup "$NODE" "$ROOT/packages/core/dist/cli.js" serve >>"$LOG" 2>&1 &
echo $! > "$HOME/Library/Application Support/Porter/porter.pid"

# Wait for health
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:47831/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [[ -d "$ROOT/dist/release/Porter.app" ]]; then
  open "$ROOT/dist/release/Porter.app"
elif [[ "$PORTER_OPEN_BROWSER" == "1" ]]; then
  open "http://127.0.0.1:47831/"
fi
exit 0
