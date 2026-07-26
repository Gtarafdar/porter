/**
 * Windows keep-alive via Task Scheduler (login start).
 * Does not touch macOS LaunchAgent / caffeinate paths.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appendActivity, loadConfig, saveConfig } from "../config.js";
import { isWin32 } from "./index.js";

export const WINDOWS_KEEPALIVE_TASK = "Porter";

/** Resolve Porter.exe for scheduled login start. */
export function resolveWindowsPorterExe(): string | null {
  const fromEnv = process.env.PORTER_RESOURCES?.trim();
  if (fromEnv) {
    const candidate = path.win32.join(fromEnv, "Porter.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const installed = path.win32.join(programFiles, "Porter", "Porter.exe");
  if (fs.existsSync(installed)) return installed;
  return null;
}

/** Build schtasks args (testable on any OS). */
export function windowsKeepAliveCreateArgs(exePath: string): string[] {
  const tr = `"${exePath.replace(/"/g, "")}"`;
  return [
    "/Create",
    "/TN",
    WINDOWS_KEEPALIVE_TASK,
    "/TR",
    tr,
    "/SC",
    "ONLOGON",
    "/RL",
    "LIMITED",
    "/F",
  ];
}

export function isWindowsKeepAliveInstalled(): boolean {
  if (!isWin32()) return false;
  try {
    execFileSync("schtasks", ["/Query", "/TN", WINDOWS_KEEPALIVE_TASK], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 8000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function installWindowsKeepAlive(): {
  ok: boolean;
  taskName: string;
  exePath: string;
  detail: string;
} {
  if (!isWin32()) {
    return {
      ok: false,
      taskName: "",
      exePath: "",
      detail: "Windows Task Scheduler keep-alive is only available on Windows",
    };
  }
  const exePath = resolveWindowsPorterExe();
  if (!exePath) {
    return {
      ok: false,
      taskName: WINDOWS_KEEPALIVE_TASK,
      exePath: "",
      detail:
        "Porter.exe not found — install to C:\\Program Files\\Porter (or set PORTER_RESOURCES)",
    };
  }
  try {
    execFileSync("schtasks", windowsKeepAliveCreateArgs(exePath), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
      windowsHide: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendActivity("keepalive", `Task Scheduler failed: ${msg}`, false, "system");
    return {
      ok: false,
      taskName: WINDOWS_KEEPALIVE_TASK,
      exePath,
      detail: `Could not create login task — try running Porter as the logged-in user (${msg})`,
    };
  }

  const c = loadConfig();
  if (!c.awayMode) {
    c.awayMode = {
      enabled: true,
      autoStartTunnel: false,
      preventSleep: false,
      keepAliveInstalled: true,
      preferTailscaleServe: true,
      serveUrl: null,
    };
  } else {
    c.awayMode.keepAliveInstalled = true;
  }
  saveConfig(c);
  appendActivity("keepalive", `Task Scheduler ${WINDOWS_KEEPALIVE_TASK} → ${exePath}`, true, "ui");

  return {
    ok: true,
    taskName: WINDOWS_KEEPALIVE_TASK,
    exePath,
    detail: "Porter will start at Windows login (Task Scheduler)",
  };
}

export function uninstallWindowsKeepAlive(): { ok: boolean; detail: string } {
  if (!isWin32()) return { ok: false, detail: "Windows only" };
  try {
    execFileSync("schtasks", ["/Delete", "/TN", WINDOWS_KEEPALIVE_TASK, "/F"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
      windowsHide: true,
    });
    return { ok: true, detail: "Removed Porter login task" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
