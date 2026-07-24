#!/usr/bin/env bash
# Build a Cursor-style DMG: Porter.app + Applications symlink + branded background.
# Usage: bash scripts/build_dmg.sh <Porter.app> <output.dmg> [version] [arch]
set -euo pipefail

APP_SRC="${1:?path to Porter.app}"
DMG_OUT="${2:?output .dmg path}"
VERSION="${3:-unknown}"
ARCH="${4:-arm64}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/porter-dmg.XXXXXX")"
DEVICE=""
VOLNAME="Porter ${VERSION}"
MOUNT_PATH="/Volumes/${VOLNAME}"

cleanup() {
  if [[ -n "${DEVICE}" ]]; then
    hdiutil detach "${DEVICE}" -force >/dev/null 2>&1 || true
  fi
  if [[ -d "${MOUNT_PATH}" ]]; then
    hdiutil detach "${MOUNT_PATH}" -force >/dev/null 2>&1 || true
  fi
  rm -rf "${STAGE}"
}
trap cleanup EXIT

mkdir -p "${STAGE}/volume"
cp -R "${APP_SRC}" "${STAGE}/volume/Porter.app"
ln -s /Applications "${STAGE}/volume/Applications"

# Short install notes on the volume (zip also ships HOW-TO)
cat > "${STAGE}/volume/HOW-TO-INSTALL.txt" <<TXT
Porter ${VERSION} (${ARCH})
===========================

1. Drag Porter → Applications
2. Eject this disk image
3. Open Porter from Applications
   FIRST TIME: right-click → Open → Open
   (not Apple-notarized — normal for free MIT apps)
4. Setup: install Tailscale → sign in (same account on every Mac) → approve VPN prompts
5. Travel: Travel Ready → Set & forget; enable Tailscale SSH before you leave

In-app updates use the .zip release asset, not this DMG.
Logs: ~/Library/Logs/Porter/porter.log
TXT

BG_DIR="${STAGE}/volume/.background"
mkdir -p "${BG_DIR}"
BG_PNG="${BG_DIR}/background.png"

if [[ -f "${ROOT}/scripts/dmg/background.png" ]]; then
  cp "${ROOT}/scripts/dmg/background.png" "${BG_PNG}"
elif [[ -x /usr/bin/swift ]]; then
  /usr/bin/swift "${ROOT}/scripts/dmg/GenerateBackground.swift" "${BG_PNG}" 660 420
else
  echo "error: missing scripts/dmg/background.png and cannot run GenerateBackground.swift" >&2
  exit 1
fi

RW="${STAGE}/porter-rw.dmg"
rm -f "${RW}" "${DMG_OUT}"
# Detach any stale volume with the same name
if [[ -d "${MOUNT_PATH}" ]]; then
  hdiutil detach "${MOUNT_PATH}" -force >/dev/null 2>&1 || true
fi

hdiutil create -volname "${VOLNAME}" -srcfolder "${STAGE}/volume" -ov -format UDRW -fs HFS+ "${RW}" >/dev/null

# Mount under /Volumes so Finder sees the named disk (custom mountpoints break osascript)
ATTACH_OUT="$(hdiutil attach -readwrite -noverify -noautoopen "${RW}")"
DEVICE="$(echo "${ATTACH_OUT}" | awk 'NR==1{print $1}')"

# Wait briefly for Finder/volume registration
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -d "${MOUNT_PATH}/Porter.app" ]] && break
  sleep 0.2
done

set +e
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "${VOLNAME}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 160, 860, 580}
    set opts to the icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to 112
    set text size of opts to 12
    try
      set background picture of opts to file ".background:background.png"
    end try
    set position of item "Porter.app" to {180, 185}
    set position of item "Applications" to {480, 185}
    update without registering applications
    delay 0.6
    close
  end tell
end tell
APPLESCRIPT
AS_OK=$?
set -e
if [[ "${AS_OK}" -ne 0 ]]; then
  echo "warning: Finder DMG layout skipped (osascript exit ${AS_OK}) — icons still present" >&2
fi

sync
hdiutil detach "${DEVICE}" >/dev/null 2>&1 || hdiutil detach "${MOUNT_PATH}" -force >/dev/null 2>&1 || true
DEVICE=""

mkdir -p "$(dirname "${DMG_OUT}")"
hdiutil convert "${RW}" -format UDZO -imagekey zlib-level=9 -o "${DMG_OUT}" >/dev/null
echo "Built DMG: ${DMG_OUT} ($(du -sh "${DMG_OUT}" | awk '{print $1}')) (${ARCH})"
