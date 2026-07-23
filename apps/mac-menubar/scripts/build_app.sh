#!/usr/bin/env bash
# Builds Porter menu-bar .app (ad-hoc signed — no paid Apple Developer account).
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="PorterMenu"
DISPLAY_NAME="Porter"
CONFIG="${CONFIG:-release}"
OUTPUT_DIR="dist"
APP_DIR="${OUTPUT_DIR}/${DISPLAY_NAME}.app"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"

echo "==> Building ${APP_NAME} (${CONFIG})"
swift build -c "${CONFIG}"

BIN_PATH="$(swift build -c "${CONFIG}" --show-bin-path)/${APP_NAME}"
echo "==> Assembling ${APP_DIR}"
rm -rf "${APP_DIR}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

cp "${BIN_PATH}" "${MACOS_DIR}/${APP_NAME}"
cat > "${CONTENTS_DIR}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>local.porter.menubar</string>
  <key>CFBundleName</key>
  <string>${DISPLAY_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.2.0</string>
  <key>CFBundleVersion</key>
  <string>2</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

cp Resources/AppIcon.icns "${RESOURCES_DIR}/AppIcon.icns"
cp Resources/MenuBarIcon.png "${RESOURCES_DIR}/MenuBarIcon.png"
cp "Resources/MenuBarIcon@2x.png" "${RESOURCES_DIR}/MenuBarIcon@2x.png" 2>/dev/null || true
cp Resources/icon_1024.png "${RESOURCES_DIR}/icon_1024.png" 2>/dev/null || true

echo "==> Ad-hoc codesign"
codesign --force --deep --sign - "${APP_DIR}"
touch "${APP_DIR}"

echo "Built: ${APP_DIR}"
echo "Run:   open \"${APP_DIR}\""
echo "Tip:   first open may need right-click → Open (Gatekeeper)"
