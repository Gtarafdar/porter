#!/usr/bin/env bash
# Build double-click Porter.app (+ zip). Default: one Mac chip only (much smaller).
# PORTER_ARCHES="arm64 x64" builds both zips from one run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${PORTER_VERSION:-$(node -p "require('./package.json').version")}"
OUT="${ROOT}/dist/release"
CACHE="${ROOT}/dist/cache"
NODE_VER="${PORTER_NODE_VERSION:-20.18.2}"
CF_VER="${PORTER_CLOUDFLARED_VERSION:-2026.7.3}"
HOST_ARCH="$(uname -m)"
if [[ "${HOST_ARCH}" == "x86_64" ]]; then HOST_ARCH="x64"; fi
# Default: only this Mac's chip (≈ half the old universal zip). Override: PORTER_ARCHES="arm64 x64"
ARCHES="${PORTER_ARCHES:-${HOST_ARCH}}"

echo "==> Building Porter packages"
npm run build

mkdir -p "${CACHE}"
rm -rf "${OUT}"
mkdir -p "${OUT}"

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
  cp "${tmp}/cloudflared" "${dest}"
  chmod +x "${dest}"
  rm -rf "${tmp}"
}

echo "==> Building native Mac window (WKWebView shell)"
SWIFT_BIN=""
# Prefer SwiftPM when a full Xcode/platform path is available; otherwise compile with swiftc + CLT SDK.
if (
  cd apps/mac-window
  swift build -c release
) 2>/tmp/porter-swift-build.err; then
  SWIFT_BIN="$(cd apps/mac-window && swift build -c release --show-bin-path)/PorterWindow"
else
  echo "==> swift build unavailable (Command Line Tools / missing PlatformPath) — using swiftc"
  cat /tmp/porter-swift-build.err | tail -5 || true
  SDKROOT="${SDKROOT:-$(xcrun --sdk macosx --show-sdk-path 2>/dev/null || echo /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk)}"
  HOST_M="$(uname -m)"
  TARGET_TRIPLE="arm64-apple-macos13.0"
  [[ "${HOST_M}" == "x86_64" ]] && TARGET_TRIPLE="x86_64-apple-macos13.0"
  mkdir -p apps/mac-window/.build/release
  SWIFT_BIN="${ROOT}/apps/mac-window/.build/release/PorterWindow"
  /usr/bin/swiftc -parse-as-library -sdk "${SDKROOT}" -target "${TARGET_TRIPLE}" -O \
    -framework AppKit -framework WebKit -framework QuartzCore -framework Foundation -framework UniformTypeIdentifiers \
    -o "${SWIFT_BIN}" \
    apps/mac-window/Sources/PorterWindow/*.swift
fi
if [[ ! -x "${SWIFT_BIN}" ]]; then
  echo "error: PorterWindow binary missing at ${SWIFT_BIN}" >&2
  echo "Install Xcode (or working Command Line Tools) and re-run packaging." >&2
  exit 1
fi
echo "==> Window binary: ${SWIFT_BIN}"

# Shared production node_modules (built once, copied per arch)
STAGE_APP="${OUT}/_stage_app"
rm -rf "${STAGE_APP}"
mkdir -p "${STAGE_APP}/packages/core" "${STAGE_APP}/packages/protocol"
cp -R packages/core/dist "${STAGE_APP}/packages/core/dist"
cp packages/core/package.json "${STAGE_APP}/packages/core/package.json"
cp -R packages/protocol/dist "${STAGE_APP}/packages/protocol/dist"
cp packages/protocol/package.json "${STAGE_APP}/packages/protocol/package.json"
cat > "${STAGE_APP}/package.json" <<'PKG'
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
echo "==> Installing production node_modules (once)"
(
  cd "${STAGE_APP}"
  npm install --omit=dev --no-fund --no-audit --no-package-lock
  mkdir -p node_modules/@porter
  rm -rf node_modules/@porter/protocol node_modules/@porter/core
  ln -s ../../packages/protocol node_modules/@porter/protocol
  ln -s ../../packages/core node_modules/@porter/core
)

build_one_arch() {
  local arch="$1" # arm64 | x64
  local app_dir="${OUT}/Porter-${arch}.app"
  local contents="${app_dir}/Contents"
  local macos="${contents}/MacOS"
  local res="${contents}/Resources"
  local app_res="${res}/app"
  local zip="${OUT}/Porter-${VERSION}-mac-${arch}.zip"
  local cf_dl_arch="arm64"
  [[ "${arch}" == "x64" ]] && cf_dl_arch="amd64"

  echo ""
  echo "==> Assembling ${app_dir} (${arch})"
  rm -rf "${app_dir}"
  mkdir -p "${macos}" "${app_res}" "${res}/ui"

  # One Node + one cloudflared for this chip only (no duplicates)
  download_node "${arch}" "${res}/node"
  # Refuse Homebrew-linked Node (breaks on Macs without brew / libuv)
  if otool -L "${res}/node" 2>/dev/null | grep -qE '/opt/homebrew/|/usr/local/opt/'; then
    echo "error: bundled Node links to Homebrew libs — refusing to package" >&2
    otool -L "${res}/node" >&2 || true
    exit 1
  fi
  if download_cloudflared "${cf_dl_arch}" "${res}/cloudflared"; then
    echo "==> Bundled cloudflared ${CF_VER} (${arch})"
  else
    echo "==> cloudflared download failed for ${arch} — Travel Ready may need a separate install"
  fi

  cp -R "${STAGE_APP}/." "${app_res}/"
  cp -R apps/desktop/dist/* "${res}/ui/"
  echo "${VERSION}" > "${res}/VERSION"
  cp "${SWIFT_BIN}" "${macos}/Porter"
  chmod +x "${macos}/Porter"

  cat > "${macos}/porter-core" <<'CORE'
#!/bin/bash
set -euo pipefail
CONTENTS="$(cd "$(dirname "$0")/.." && pwd)"
RES="${CONTENTS}/Resources"
export PORTER_UI_DIR="${RES}/ui"
export PORTER_RESOURCES="${RES}"
export PORTER_VERSION="$(cat "${RES}/VERSION" 2>/dev/null || echo unknown)"
# LAN discovery on (Bonjour). Set PORTER_NO_BONJOUR=1 only if it misbehaves.
export PORTER_NO_BONJOUR="${PORTER_NO_BONJOUR:-0}"
export PORTER_OPEN_BROWSER="0"

NODE="${RES}/node"
CF="${RES}/cloudflared"

# GitHub downloads quarantine nested binaries — clear so macOS will run them.
xattr -dr com.apple.quarantine "${CONTENTS}" 2>/dev/null || true

LOG_DIR="${HOME}/Library/Logs/Porter"
mkdir -p "${LOG_DIR}" "${HOME}/Library/Application Support/Porter" 2>/dev/null || mkdir -p "${LOG_DIR}"
log() { echo "---- $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >>"${LOG_DIR}/porter.log"; }

log "porter-core start arch=$(uname -m) node=${NODE} bundle=${CONTENTS}"
if [[ "${CONTENTS}" == *AppTranslocation* ]]; then
  log "warning: App Translocation — move Porter.app to /Applications"
fi

if [[ ! -x "${NODE}" ]]; then
  log "error: bundled Node missing or not executable at ${NODE}"
  exit 1
fi

# Catch old broken packages that shipped Homebrew Node (needs libuv.dylib).
if command -v otool >/dev/null 2>&1; then
  if otool -L "${NODE}" 2>/dev/null | grep -qE '/opt/homebrew/|/usr/local/opt/'; then
    log "error: bundled Node is linked to Homebrew (e.g. libuv). Delete this Porter.app and download 0.2.7+."
    exit 1
  fi
fi

if [[ -x "${CF}" ]]; then
  export PORTER_CLOUDFLARED="${CF}"
  export PATH="${RES}:${PATH}"
fi

# Prove Node can actually exec (surfaces dyld errors into the log).
if ! "${NODE}" -e "process.stdout.write('node-ok '+process.version+'\n')" >>"${LOG_DIR}/porter.log" 2>&1; then
  log "error: Node cannot run — re-download Porter for your Mac chip"
  exit 1
fi

# CRITICAL: always bound curl — a half-open listener on 47831 used to hang forever here
# (log stopped at node-ok; window timed out before serve started).
health_ok() {
  curl -sf -m 12 --connect-timeout 2 "http://127.0.0.1:47831/api/health" >/dev/null 2>&1
}

health_version() {
  curl -sf -m 12 --connect-timeout 2 "http://127.0.0.1:47831/api/health" 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

WANT_VER="$(cat "${RES}/VERSION" 2>/dev/null || echo unknown)"

if health_ok; then
  HAVE_VER="$(health_version)"
  if [[ -n "$HAVE_VER" && "$HAVE_VER" != "$WANT_VER" ]]; then
    log "healthy but version mismatch have=${HAVE_VER} want=${WANT_VER} — taking over"
    pkill -f 'packages/core/dist/cli.js serve' 2>/dev/null || true
    pkill -f 'Porter.app/Contents/Resources/node' 2>/dev/null || true
    sleep 0.6
  else
    log "already healthy — nothing to start"
    exit 0
  fi
fi

# Port held by a dead/stuck Porter? Give a slow-starting core a grace period first.
if lsof -nP -iTCP:47831 -sTCP:LISTEN >/dev/null 2>&1; then
  sleep 2
  if health_ok; then
    HAVE_VER="$(health_version)"
    if [[ -n "$HAVE_VER" && "$HAVE_VER" != "$WANT_VER" ]]; then
      log "healthy after grace but wrong version — taking over"
      pkill -f 'packages/core/dist/cli.js serve' 2>/dev/null || true
      pkill -f 'Porter.app/Contents/Resources/node' 2>/dev/null || true
      sleep 0.6
    else
      log "became healthy after grace — nothing to start"
      exit 0
    fi
  else
    log "warning: port 47831 is listening but /api/health failed — stopping stale Porter"
    pkill -f 'packages/core/dist/cli.js serve' 2>/dev/null || true
    pkill -f 'Porter.app/Contents/Resources/node' 2>/dev/null || true
    sleep 0.6
    if health_ok; then
      HAVE_VER="$(health_version)"
      if [[ -n "$HAVE_VER" && "$HAVE_VER" != "$WANT_VER" ]]; then
        log "still wrong version after clear — continuing start"
      else
        log "became healthy after clearing stale process"
        exit 0
      fi
    fi
  fi
fi

if [[ ! -d "${RES}/app" ]]; then
  log "error: missing ${RES}/app — reinstall Porter.app"
  exit 1
fi

log "starting serve…"
cd "${RES}/app"
# Replace this process with Node; keep logging.
exec "${NODE}" "${RES}/app/packages/core/dist/cli.js" serve >>"${LOG_DIR}/porter.log" 2>&1
CORE
  chmod +x "${macos}/porter-core"

  cat > "${contents}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
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

  if [[ -f apps/mac-menubar/Resources/AppIcon.icns ]]; then
    cp apps/mac-menubar/Resources/AppIcon.icns "${res}/AppIcon.icns"
  fi

  local chip_label="Apple Silicon (M1/M2/M3/M4)"
  [[ "${arch}" == "x64" ]] && chip_label="Intel Mac"

  cat > "${OUT}/HOW-TO-INSTALL-${arch}.txt" <<TXT
Porter ${VERSION} — ${chip_label}
==========================================

Preferred install (DMG):
1. Open Porter-${VERSION}-mac-${arch}.dmg
2. Drag Porter → Applications
3. Eject the disk image
4. Open Porter from Applications (FIRST TIME: right-click → Open → Open)
5. Inside Porter: use “Choose folder…” (Finder picker) — no typing paths

Zip install (in-app updates / CI):
1. Unzip this archive
2. Drag Porter.app to Applications (required — do not open from Downloads)
3. FIRST OPEN: right-click Porter.app → Open → Open

Gatekeeper (not Apple-notarized):
- macOS may show a malware warning — right-click → Open is the normal fix
- If blocked again: System Settings → Privacy & Security → Open Anyway
- Or once in Terminal:
  xattr -dr com.apple.quarantine /Applications/Porter.app

Share a folder: Share folder → Choose folder… → Approve

If you see libuv / Homebrew errors: you have an old broken build.
Delete Porter.app and download 0.2.7+ again.

Wrong chip? This build is for ${chip_label} only.
Apple Silicon: Porter-*-mac-arm64.dmg / .zip
Intel:         Porter-*-mac-x64.dmg / .zip

Travel: Travel Ready → Set & forget (Tailscale required for travel; cloudflared bundled as optional advanced).
Logs: ~/Library/Logs/Porter/porter.log
TXT

  echo "==> Ad-hoc codesign (${arch})"
  codesign --force --deep --sign - "${app_dir}" 2>/dev/null || true
  touch "${app_dir}"

  # Zip as Porter.app (standard name inside archive) — kept for in-app updater
  local stage_zip="${OUT}/_zip_${arch}"
  rm -rf "${stage_zip}"
  mkdir -p "${stage_zip}"
  cp -R "${app_dir}" "${stage_zip}/Porter.app"
  cp "${OUT}/HOW-TO-INSTALL-${arch}.txt" "${stage_zip}/HOW-TO-INSTALL.txt"
  rm -f "${zip}"
  (
    cd "${stage_zip}"
    zip -qry "${zip}" Porter.app HOW-TO-INSTALL.txt
  )
  rm -rf "${stage_zip}"

  # Cursor-style DMG (primary GitHub download)
  local dmg="${OUT}/Porter-${VERSION}-mac-${arch}.dmg"
  local stage_app="${OUT}/_dmg_app_${arch}"
  rm -rf "${stage_app}"
  mkdir -p "${stage_app}"
  cp -R "${app_dir}" "${stage_app}/Porter.app"
  bash "${ROOT}/scripts/build_dmg.sh" "${stage_app}/Porter.app" "${dmg}" "${VERSION}" "${arch}"
  rm -rf "${stage_app}"

  local size app_size dmg_size
  size="$(du -sh "${zip}" | awk '{print $1}')"
  dmg_size="$(du -sh "${dmg}" | awk '{print $1}')"
  app_size="$(du -sh "${app_dir}" | awk '{print $1}')"
  echo "Built: ${app_dir} (${app_size})"
  echo "DMG:   ${dmg} (${dmg_size})"
  echo "Zip:   ${zip} (${size})"

  # Convenience: host-arch app as Porter.app + generic zip/dmg names
  if [[ "${arch}" == "${HOST_ARCH}" ]]; then
    rm -rf "${OUT}/Porter.app"
    cp -R "${app_dir}" "${OUT}/Porter.app"
    cp "${OUT}/HOW-TO-INSTALL-${arch}.txt" "${OUT}/HOW-TO-INSTALL.txt"
    rm -f "${OUT}/Porter-${VERSION}-mac.zip"
    cp "${zip}" "${OUT}/Porter-${VERSION}-mac.zip"
    rm -f "${OUT}/Porter-${VERSION}-mac.dmg"
    cp "${dmg}" "${OUT}/Porter-${VERSION}-mac.dmg"
  fi
}

for a in ${ARCHES}; do
  case "${a}" in
    arm64|x64) build_one_arch "${a}" ;;
    *)
      echo "error: unknown arch '${a}' (use arm64 or x64)" >&2
      exit 1
      ;;
  esac
done

rm -rf "${OUT}/_stage_app"

echo ""
echo "Done. Prefer DMG for new installs; zip for in-app updates:"
ls -lh "${OUT}"/Porter-${VERSION}-mac*.{dmg,zip} 2>/dev/null || true
echo "Open host build:  open \"${OUT}/Porter.app\""
echo "Tip: first open may need right-click → Open (not Apple notarized)"
