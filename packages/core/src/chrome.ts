/**
 * Opt-in Chrome extension sync helpers.
 * Full Chrome profiles stay blocked; only Extensions + Local Extension Settings are shared.
 */
import { execFileSync, execSync } from "node:child_process";
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

export type ChromeRevealWhich = "extensions" | "data" | "root";

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

function listExtensionIds(dir: string, limit = 12): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .slice(0, limit);
  } catch {
    return [];
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
  const sharedExt = shared.some((f) => f.path === CHROME_EXTENSION_PATHS.extensions);
  const sharedData = shared.some((f) => f.path === CHROME_EXTENSION_PATHS.localSettings);
  const dataIds = listExtensionIds(CHROME_EXTENSION_PATHS.localSettings);
  const extIds = listExtensionIds(CHROME_EXTENSION_PATHS.extensions);

  const steps: { id: string; title: string; detail: string; done: boolean }[] = [
    {
      id: "quit",
      title: "Quit Google Chrome on this Mac",
      detail: running
        ? "Chrome is still running — quit it fully (Chrome menu → Quit)."
        : "Chrome is quit — good.",
      done: !running,
    },
    {
      id: "share",
      title: "Share both Chrome folders in Porter",
      detail: sharedExt && sharedData
        ? "Both folders are approved (with write) — ready to copy."
        : "Tap “Share Chrome folders” so Porter can see Extensions + Extension Data.",
      done: sharedExt && sharedData,
    },
    {
      id: "open",
      title: "Open Extension Data in Finder (optional)",
      detail:
        "Use “Open Extension Data” to see the ID folders you’ll copy. Do not use Downloads.",
      done: hasLocal,
    },
    {
      id: "other",
      title: "On the other Mac: same share + quit Chrome",
      detail:
        "Share Chrome folders there too, then copy INTO those Chrome Library paths (not Downloads).",
      done: false,
    },
    {
      id: "reopen",
      title: "Reopen Chrome and check chrome://extensions",
      detail:
        "If an extension is missing, install it once from the Web Store, quit Chrome, then copy only that ID’s data folder.",
      done: false,
    },
  ];

  return {
    chromeRoot: CHROME_ROOT,
    paths: CHROME_EXTENSION_PATHS,
    chromeRunning: running,
    hasExtensions,
    hasLocalSettings: hasLocal,
    shared,
    sharedExtensions: sharedExt,
    sharedExtensionData: sharedData,
    readyToShare: hasExtensions && !running,
    extensionIds: extIds,
    dataIds,
    steps,
    note: running
      ? "Quit Google Chrome completely before sharing or syncing extensions (optional feature only)."
      : !hasExtensions
        ? "No Chrome Extensions folder yet — open Chrome, install an extension, quit Chrome, then share."
        : sharedExt && sharedData
          ? "Ready. Copy Chrome Extensions + Chrome Extension Data to the other Mac’s matching folders."
          : "Share the folders below, then copy them with Porter to the other Mac’s same Chrome paths.",
  };
}

/** Reveal Chrome folders in Finder so users can see exact ID folders to copy. */
export function revealChromeFolder(which: ChromeRevealWhich): {
  ok: boolean;
  path: string;
  note: string;
} {
  let target =
    which === "extensions"
      ? CHROME_EXTENSION_PATHS.extensions
      : which === "data"
        ? CHROME_EXTENSION_PATHS.localSettings
        : CHROME_ROOT;

  if (which === "data" && !fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(target)) {
    throw new Error(
      which === "extensions"
        ? "Chrome Extensions folder not found. Open Chrome once, install an extension, quit Chrome, then try again."
        : `Folder not found: ${target}`,
    );
  }

  try {
    execFileSync("/usr/bin/open", [target], { timeout: 5000 });
  } catch (e) {
    throw new Error(
      `Could not open Finder (${humanError(e)}). Grant Porter Full Disk Access in System Settings → Privacy & Security if macOS blocks Library folders.`,
    );
  }

  appendActivity("chrome_reveal", target, true, "ui", {
    humanMessage: `Opened in Finder: ${path.basename(target)}`,
  });

  const label =
    which === "extensions"
      ? "Chrome Extensions"
      : which === "data"
        ? "Chrome Extension Data (Local Extension Settings)"
        : "Chrome Default profile";

  return {
    ok: true,
    path: target,
    note: `Opened “${label}” in Finder. Copy the ID folders inside with Porter — don’t paste into Downloads.`,
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
      "Next: on BOTH Macs quit Chrome → Share Chrome folders → copy Extensions + Extension Data into the matching Chrome Library folders (use Open Extension Data) → reopen Chrome. Cookies & passwords are never synced.",
  };
}
