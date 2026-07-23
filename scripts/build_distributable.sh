#!/usr/bin/env bash
# Build a double-click Porter.app (+ zip) — no git clone required for end users.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${PORTER_VERSION:-0.2.3}"
OUT="${ROOT}/dist/release"
APP_DIR="${OUT}/Porter.app"
CONTENTS="${APP_DIR}/Contents"
MACOS="${CONTENTS}/MacOS"
RES="${CONTENTS}/Resources"
APP_RES="${RES}/app"
ZIP="${OUT}/Porter-${VERSION}-mac.zip"

echo "==> Building Porter packages"
npm run build

echo "==> Assembling ${APP_DIR}"
rm -rf "${OUT}"
mkdir -p "${MACOS}" "${APP_RES}/packages/core" "${APP_RES}/packages/protocol" "${RES}/ui"

# Portable Node (required — keeps install click-and-run)
NODE_SRC="$(command -v node)"
if [[ -z "${NODE_SRC}" ]]; then
  echo "error: node not found on PATH (need Node 20+ to package)" >&2
  exit 1
fi
cp "${NODE_SRC}" "${RES}/node"
chmod +x "${RES}/node"

# Optional: bundle cloudflared so home Mac needs no separate Homebrew step
CF=""
for c in /opt/homebrew/bin/cloudflared /usr/local/bin/cloudflared; do
  if [[ -x "$c" ]]; then CF="$c"; break; fi
done
if [[ -n "$CF" ]]; then
  echo "==> Bundling cloudflared from ${CF}"
  cp "$CF" "${RES}/cloudflared"
  chmod +x "${RES}/cloudflared"
else
  echo "==> cloudflared not found — Travel Ready will ask user to install it"
fi

# App runtime: compiled JS + production deps
cp -R packages/core/dist "${APP_RES}/packages/core/dist"
cp packages/core/package.json "${APP_RES}/packages/core/package.json"
cp -R packages/protocol/dist "${APP_RES}/packages/protocol/dist"
cp packages/protocol/package.json "${APP_RES}/packages/protocol/package.json"

# Minimal package.json for npm install inside the .app
cat > "${APP_RES}/package.json" <<'PKG'
{
  "name": "porter-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "bonjour-service": "^1.3.0",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "uuid": "^11.1.0",
    "zod": "^3.25.28"
  }
}
PKG

echo "==> Installing production node_modules inside .app"
(
  cd "${APP_RES}"
  npm install --omit=dev --no-fund --no-audit --no-package-lock
  mkdir -p node_modules/@porter
  rm -rf node_modules/@porter/protocol node_modules/@porter/core
  ln -s ../../packages/protocol node_modules/@porter/protocol
  ln -s ../../packages/core node_modules/@porter/core
)

# Finder UI
cp -R apps/desktop/dist/* "${RES}/ui/"

echo "==> Building native Mac window (WKWebView shell)"
(
  cd apps/mac-window
  swift build -c release
)
SWIFT_BIN="$(cd apps/mac-window && swift build -c release --show-bin-path)/PorterWindow"
cp "${SWIFT_BIN}" "${MACOS}/Porter"
chmod +x "${MACOS}/Porter"

# Headless core starter for LaunchAgent / scripts (does not open a window)
cat > "${MACOS}/porter-core" <<'CORE'
#!/bin/bash
set -euo pipefail
CONTENTS="$(cd "$(dirname "$0")/.." && pwd)"
RES="${CONTENTS}/Resources"
export PORTER_UI_DIR="${RES}/ui"
export PORTER_RESOURCES="${RES}"
export PORTER_NO_BONJOUR="${PORTER_NO_BONJOUR:-1}"
export PORTER_OPEN_BROWSER="0"
if [[ -x "${RES}/cloudflared" ]]; then
  export PATH="${RES}:${PATH}"
fi
LOG_DIR="${HOME}/Library/Logs/Porter"
mkdir -p "${LOG_DIR}" "${HOME}/Library/Application Support/Porter"
if curl -sf "http://127.0.0.1:47831/api/health" >/dev/null 2>&1; then
  exit 0
fi
cd "${RES}/app"
exec "${RES}/node" "${RES}/app/packages/core/dist/cli.js" serve >>"${LOG_DIR}/porter.log" 2>&1
CORE
chmod +x "${MACOS}/porter-core"

cat > "${CONTENTS}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Porter</string>
  <key>CFBundleIdentifier</key>
  <string>local.porter.app</string>
  <key>CFBundleName</key>
  <string>Porter</string>
  <key>CFBundleDisplayName</key>
  <string>Porter</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
</dict>
</plist>
PLIST

# Icon if present
if [[ -f apps/mac-menubar/Resources/AppIcon.icns ]]; then
  cp apps/mac-menubar/Resources/AppIcon.icns "${RES}/AppIcon.icns"
fi

# README for end users inside zip
cat > "${OUT}/HOW-TO-INSTALL.txt" <<'TXT'
Porter — private file bridge for your Macs
==========================================

Install (no Terminal / no git):
1. Unzip this archive
2. Drag Porter.app to Applications (or anywhere)
3. Double-click Porter.app — a normal Mac window opens (not a browser tab)
   First time: right-click → Open (Gatekeeper)
4. Follow the setup wizard inside the app

Same Wi‑Fi:
- Same pair token on both Macs
- Settings → Add peer → other Mac’s LAN IP

Travel / other country (pick BOTH for best reliability):
A) Cloudflare (bundled cloudflared inside Porter.app)
   Home Mac: Travel Ready → Set & forget → copy HTTPS URL
   Travel Mac: paste pair token + paste that HTTPS URL as peer
B) Tailscale (stable backup — NOT bundled; VPN requires official install)
   Travel Ready → “Install Tailscale (official)” OR https://tailscale.com/download/mac
   Same Tailscale account on both Macs → add 100.x IP as Fallback peer

Chrome extensions (optional):
- Everyday file copy does NOT require quitting Chrome
- Only when syncing Chrome Extensions folders: quit Chrome, share/copy, reopen Chrome

Home Mac must stay powered on with Porter running.

Logs: ~/Library/Logs/Porter/porter.log
Config: ~/.porter/
TXT

echo "==> Ad-hoc codesign"
codesign --force --deep --sign - "${APP_DIR}" 2>/dev/null || true
touch "${APP_DIR}"

echo "==> Creating ${ZIP}"
(
  cd "${OUT}"
  ditto -c -k --sequesterRsrc --keepParent "Porter.app" "Porter-${VERSION}-mac.zip"
  ditto -c -k --keepParent . "Porter-${VERSION}-mac-with-readme.zip" 2>/dev/null || true
)

rm -f "${ZIP}"
(
  cd "${OUT}"
  zip -qry "Porter-${VERSION}-mac.zip" Porter.app HOW-TO-INSTALL.txt
)

SIZE="$(du -sh "${APP_DIR}" | awk '{print $1}')"
echo ""
echo "Built: ${APP_DIR} (${SIZE})"
echo "Share: ${ZIP}"
echo "Open:  open \"${APP_DIR}\""
echo "Tip:   first open may need right-click → Open"
