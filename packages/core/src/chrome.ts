/**
 * Opt-in Chrome extension sync helpers.
 * Full Chrome profiles stay blocked; only Extensions + Local Extension Settings are shared.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addSharedFolder, appendActivity, humanError, loadConfig } from "./config.js";

const CHROME_ROOT = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "Default",
);

export const CHROME_EXTENSION_PATHS = {
  extensions: path.join(CHROME_ROOT, "Extensions"),
  localSettings: path.join(CHROME_ROOT, "Local Extension Settings"),
} as const;

export function isChromeExtensionsPath(target: string): boolean {
  const resolved = path.resolve(target);
  return (
    resolved === CHROME_EXTENSION_PATHS.extensions ||
    resolved.startsWith(CHROME_EXTENSION_PATHS.extensions + path.sep) ||
    resolved === CHROME_EXTENSION_PATHS.localSettings ||
    resolved.startsWith(CHROME_EXTENSION_PATHS.localSettings + path.sep)
  );
}

export function chromeRunning(): boolean {
  try {
    const out = execSync('pgrep -x "Google Chrome" 2>/dev/null || true', {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

export function chromeExtensionsStatus() {
  const running = chromeRunning();
  const hasExtensions = fs.existsSync(CHROME_EXTENSION_PATHS.extensions);
  const hasLocal = fs.existsSync(CHROME_EXTENSION_PATHS.localSettings);
  const c = loadConfig();
  const shared = c.sharedFolders.filter(
    (f) =>
      f.path === CHROME_EXTENSION_PATHS.extensions ||
      f.path === CHROME_EXTENSION_PATHS.localSettings,
  );
  return {
    chromeRoot: CHROME_ROOT,
    paths: CHROME_EXTENSION_PATHS,
    chromeRunning: running,
    hasExtensions,
    hasLocalSettings: hasLocal,
    shared,
    readyToShare: hasExtensions && !running,
    note: running
      ? "Quit Google Chrome completely before sharing or syncing extensions (optional feature only)."
      : !hasExtensions
        ? "No Chrome Extensions folder found yet — open Chrome once, install an extension, quit Chrome, then share."
        : !hasLocal
          ? "Extensions folder exists. Extension Data folder will be created on share if missing."
          : shared.length >= 2
            ? "Chrome Extensions + Extension Data are already shared. Copy them to the other Mac’s matching paths, then reopen Chrome."
            : "Optional: share Extensions + Local Extension Settings. Everyday file copy never needs quitting Chrome. Cookies/passwords stay blocked.",
  };
}

/**
 * Share only Extensions + Local Extension Settings (not full Chrome profile).
 * Requires Chrome to be quit. Path carve-out is in files.isDangerousPath.
 */
export function shareChromeExtensions(): {
  added: string[];
  skipped: string[];
  warning: string;
} {
  if (chromeRunning()) {
    throw new Error("Chrome must be quit before sharing extension folders.");
  }
  const added: string[] = [];
  const skipped: string[] = [];
  // Ensure Local Extension Settings exists so "Extension Data" can be shared
  if (
    fs.existsSync(CHROME_EXTENSION_PATHS.extensions) &&
    !fs.existsSync(CHROME_EXTENSION_PATHS.localSettings)
  ) {
    try {
      fs.mkdirSync(CHROME_EXTENSION_PATHS.localSettings, { recursive: true, mode: 0o700 });
    } catch (e) {
      skipped.push(
        `${CHROME_EXTENSION_PATHS.localSettings} (could not create: ${humanError(e)})`,
      );
    }
  }
  const targets: { path: string; label: string }[] = [
    { path: CHROME_EXTENSION_PATHS.extensions, label: "Chrome Extensions" },
    { path: CHROME_EXTENSION_PATHS.localSettings, label: "Chrome Extension Data" },
  ];
  for (const t of targets) {
    if (!fs.existsSync(t.path)) {
      skipped.push(`${t.label}: folder not found (${t.path})`);
      continue;
    }
    try {
      const before = loadConfig().sharedFolders.some((f) => f.path === t.path);
      addSharedFolder(t.path, t.label, ["read", "copy", "write"]);
      if (!before) added.push(t.label);
      else skipped.push(`${t.label}: already shared`);
    } catch (e) {
      skipped.push(`${t.label}: ${humanError(e)}`);
    }
  }
  appendActivity(
    "chrome_share",
    `shared ${added.length} chrome folder(s)`,
    added.length > 0 || skipped.every((s) => s.includes("already shared")),
    "ui",
    {
      humanMessage:
        added.length > 0
          ? `Chrome folders shared (${added.join(", ")}). On the other Mac: quit Chrome → copy into the same paths → reopen Chrome.`
          : skipped.every((s) => s.includes("already shared"))
            ? "Chrome extension folders were already shared."
            : `Could not share Chrome folders: ${skipped.join("; ")}`,
    },
  );
  if (added.length === 0 && skipped.some((s) => !s.includes("already shared"))) {
    throw new Error(skipped.join(" · ") || "Could not share Chrome extension folders.");
  }
  return {
    added,
    skipped,
    warning:
      "Quit Chrome on BOTH Macs. Share on home → copy folders to the same paths on travel → reopen Chrome. Cookies & passwords are never synced.",
  };
}
