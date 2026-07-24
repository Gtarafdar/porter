#!/bin/bash
# Dev launcher for a source checkout (not for end-user Porter.app installs).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export PORTER_OPEN_BROWSER="${PORTER_OPEN_BROWSER:-0}"
export PORTER_NO_BONJOUR="${PORTER_NO_BONJOUR:-1}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${TMPDIR:-/tmp}/porter.dev.log"
if [[ ! -f packages/core/dist/cli.js ]]; then
  npm run build >>"$LOG" 2>&1 || true
fi
NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "node not found" >>"$LOG"
  exit 1
fi
exec "$NODE" packages/core/dist/cli.js serve >>"$LOG" 2>&1
