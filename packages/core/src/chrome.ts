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
      ? "Quit Google Chrome completely before sharing or syncing extensions."
      : "Chrome extensions + Local Extension Settings can be shared (opt-in). Cookies/passwords stay blocked.",
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
  const targets: { path: string; label: string }[] = [
    { path: CHROME_EXTENSION_PATHS.extensions, label: "Chrome Extensions" },
    { path: CHROME_EXTENSION_PATHS.localSettings, label: "Chrome Extension Data" },
  ];
  for (const t of targets) {
    if (!fs.existsSync(t.path)) {
      skipped.push(t.path);
      continue;
    }
    try {
      addSharedFolder(t.path, t.label, ["read", "copy", "write"]);
      added.push(t.path);
    } catch (e) {
      skipped.push(`${t.path} (${humanError(e)})`);
    }
  }
  appendActivity(
    "chrome_share",
    `shared ${added.length} chrome folder(s)`,
    added.length > 0,
    "ui",
    {
      humanMessage:
        added.length > 0
          ? `Chrome extensions folders shared (${added.length}). On the other Mac: copy into matching Chrome paths, then restart Chrome.`
          : "Could not share Chrome extension folders.",
    },
  );
  return {
    added,
    skipped,
    warning:
      "Quit Chrome on BOTH Macs. Share on home → copy/sync folders to the same paths on travel Mac → reopen Chrome. Cookies & passwords are never synced.",
  };
}
