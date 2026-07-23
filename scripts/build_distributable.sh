#!/usr/bin/env bash
# Build a double-click Porter.app (+ zip) — no git clone required for end users.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${PORTER_VERSION:-0.2.4}"
OUT="${ROOT}/dist/release"
APP_DIR="${OUT}/Porter.app"
CONTENTS="${APP_DIR}/Contents"
MACOS="${CONTENTS}/MacOS"
RES="${CONTENTS}/Resources"
APP_RES="${RES}/app"
ZIP="${OUT}/Porter-${VERSION}-mac.zip"
NODE_VER="${PORTER_NODE_VERSION:-20.18.2}"
CACHE="${ROOT}/dist/cache"

echo "==> Building Porter packages"
npm run build

echo "==> Assembling ${APP_DIR}"
rm -rf "${OUT}"
mkdir -p "${MACOS}" "${APP_RES}/packages/core" "${APP_RES}/packages/protocol" "${RES}/ui" "${CACHE}"

# Official Node binaries for both Mac chips (Homebrew node is often arm64-only + linked to Homebrew libs)
download_node() {
  local arch="$1" # arm64 | x64
  local dest="$2"
  local tarball="node-v${NODE_VER}-darwin-${arch}.tar.gz"
  local url="https://nodejs.org/dist/v${NODE_VER}/${tarball}"
  local cached="${CACHE}/${tarball}"
  if [[ ! -f "${cached}" ]]; then
    echo "==> Downloading Node ${NODE_VER} (${arch})"
    curl -fsSL "${url}" -o "${cached}.partial"
    mv "${cached}.partial" "${cached}"
  else
    echo "==> Using cached Node ${NODE_VER} (${arch})"
  fi
  local tmp
  tmp="$(mktemp -d)"
  tar -xzf "${cached}" -C "${tmp}"
  cp "${tmp}/node-v${NODE_VER}-darwin-${arch}/bin/node" "${dest}"
  chmod +x "${dest}"
  rm -rf "${tmp}"
}

download_node arm64 "${RES}/node-arm64"
download_node x64 "${RES}/node-x64"
# Convenience symlink/copy for tools that still look for Resources/node
HOST_ARCH="$(uname -m)"
if [[ "${HOST_ARCH}" == "x86_64" ]]; then
  cp "${RES}/node-x64" "${RES}/node"
else
  cp "${RES}/node-arm64" "${RES}/node"
fi
chmod +x "${RES}/node"

# Optional: bundle cloudflared so home Mac needs no separate Homebrew step
# Prefer official dual-arch downloads when available; fall back to local brew binary.
CF_VER="${PORTER_CLOUDFLARED_VERSION:-2026.7.3}"
download_cloudflared() {
  local arch="$1" # arm64 | amd64
  local dest="$2"
  local name="cloudflared-darwin-${arch}.tgz"
  local url="https://github.com/cloudflare/cloudflared/releases/download/${CF_VER}/${name}"
  local cached="${CACHE}/${name}"
  if [[ ! -f "${cached}" ]]; then
    echo "==> Downloading cloudflared ${CF_VER} (${arch})"
    if ! curl -fsSL "${url}" -o "${cached}.partial"; then
      rm -f "${cached}.partial"
      return 1
    fi
    mv "${cached}.partial" "${cached}"
  fi
  local tmp
  tmp="$(mktemp -d)"
  tar -xzf "${cached}" -C "${tmp}"
  # tarball contains a single `cloudflared` binary
  cp "${tmp}/cloudflared" "${dest}"
  chmod +x "${dest}"
  rm -rf "${tmp}"
}

if download_cloudflared arm64 "${RES}/cloudflared-arm64" && download_cloudflared amd64 "${RES}/cloudflared-x64"; then
  if [[ "${HOST_ARCH}" == "x86_64" ]]; then
    cp "${RES}/cloudflared-x64" "${RES}/cloudflared"
  else
    cp "${RES}/cloudflared-arm64" "${RES}/cloudflared"
  fi
  chmod +x "${RES}/cloudflared"
  echo "==> Bundled cloudflared ${CF_VER} (arm64 + x64)"
else
  CF=""
  for c in /opt/homebrew/bin/cloudflared /usr/local/bin/cloudflared; do
    if [[ -x "$c" ]]; then CF="$c"; break; fi
  done
  if [[ -n "$CF" ]]; then
    echo "==> Bundling local cloudflared from ${CF} (host arch only)"
    cp "$CF" "${RES}/cloudflared"
    chmod +x "${RES}/cloudflared"
  else
    echo "==> cloudflared not found — Travel Ready will ask user to install it"
  fi
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

ARCH="$(uname -m)"
pick_bin() {
  local arm="$1" x64="$2" fallback="$3"
  case "${ARCH}" in
    arm64)
      if [[ -x "${arm}" ]]; then echo "${arm}"; return; fi
      ;;
    x86_64)
      if [[ -x "${x64}" ]]; then echo "${x64}"; return; fi
      ;;
  esac
  if [[ -x "${fallback}" ]]; then echo "${fallback}"; return; fi
  return 1
}

NODE="$(pick_bin "${RES}/node-arm64" "${RES}/node-x64" "${RES}/node" || true)"
CF="$(pick_bin "${RES}/cloudflared-arm64" "${RES}/cloudflared-x64" "${RES}/cloudflared" || true)"

# Downloads from GitHub often quarantine nested binaries — clear so Node can run.
xattr -dr com.apple.quarantine \
  "${RES}/node" "${RES}/node-arm64" "${RES}/node-x64" \
  "${RES}/cloudflared" "${RES}/cloudflared-arm64" "${RES}/cloudflared-x64" \
  2>/dev/null || true

if [[ -n "${CF}" ]]; then
  export PORTER_CLOUDFLARED="${CF}"
  # Expose as the name `cloudflared` without relying on the host-arch copy in Resources
  # (that copy matches the build Mac, not necessarily this Mac).
  BIN_DIR="${HOME}/Library/Application Support/Porter/bin"
  if mkdir -p "${BIN_DIR}" 2>/dev/null; then
    ln -sfn "${CF}" "${BIN_DIR}/cloudflared" 2>/dev/null || true
    export PATH="${BIN_DIR}:${PATH}"
  fi
fi

LOG_DIR="${HOME}/Library/Logs/Porter"
mkdir -p "${LOG_DIR}" "${HOME}/Library/Application Support/Porter" 2>/dev/null || mkdir -p "${LOG_DIR}"
{
  echo "---- $(date -u +%Y-%m-%dT%H:%M:%SZ) porter-core start arch=${ARCH} node=${NODE:-missing} cloudflared=${CF:-missing} ----"
} >>"${LOG_DIR}/porter.log"

if [[ -z "${NODE}" ]]; then
  echo "error: no Node binary for arch ${ARCH} inside Porter.app" >>"${LOG_DIR}/porter.log"
  exit 1
fi

if curl -sf "http://127.0.0.1:47831/api/health" >/dev/null 2>&1; then
  exit 0
fi
cd "${RES}/app"
exec "${NODE}" "${RES}/app/packages/core/dist/cli.js" serve >>"${LOG_DIR}/porter.log" 2>&1
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

Works on Apple Silicon and Intel Macs (Node for both is inside the app).

If you see “Porter core did not start”:
- First open: right-click Porter.app → Open
- In the window: use Copy error / Show log folder (no Terminal needed)
- Or open: ~/Library/Logs/Porter/porter.log

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
