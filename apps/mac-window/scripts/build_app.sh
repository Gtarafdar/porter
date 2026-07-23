#!/usr/bin/env bash
# Builds Porter native window .app (ad-hoc signed — no paid Apple Developer account).
# For local/dev: wraps http://127.0.0.1:47831 in a real Mac window.
# For release: scripts/build_distributable.sh embeds this binary into the full Porter.app.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="PorterWindow"
DISPLAY_NAME="Porter"
CONFIG="${CONFIG:-release}"
OUTPUT_DIR="dist"
APP_DIR="${OUTPUT_DIR}/${DISPLAY_NAME}.app"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
VERSION="${PORTER_VERSION:-0.2.14}"

echo "==> Building ${APP_NAME} (${CONFIG})"
swift build -c "${CONFIG}"

BIN_PATH="$(swift build -c "${CONFIG}" --show-bin-path)/${APP_NAME}"
echo "==> Assembling ${APP_DIR}"
rm -rf "${APP_DIR}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

cp "${BIN_PATH}" "${MACOS_DIR}/${DISPLAY_NAME}"
cat > "${CONTENTS_DIR}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${DISPLAY_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>local.porter.app</string>
  <key>CFBundleName</key>
  <string>${DISPLAY_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${DISPLAY_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
PLIST

# Prefer shared icon from menubar resources
ICON_SRC="../mac-menubar/Resources/AppIcon.icns"
if [[ -f "${ICON_SRC}" ]]; then
  cp "${ICON_SRC}" "${RESOURCES_DIR}/AppIcon.icns"
elif [[ -f "Resources/AppIcon.icns" ]]; then
  cp "Resources/AppIcon.icns" "${RESOURCES_DIR}/AppIcon.icns"
fi

echo "==> Ad-hoc codesign"
codesign --force --deep --sign - "${APP_DIR}" 2>/dev/null || true
touch "${APP_DIR}"

echo "Built: ${APP_DIR}"
echo "Run:   open \"${APP_DIR}\""
echo "Note:  needs Porter core on :47831 (npm start) unless Resources/node is bundled"
echo "Tip:   first open may need right-click → Open (Gatekeeper)"
