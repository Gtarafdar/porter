/**
 * Travel-ready status for the home Mac you'll leave behind.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { addSharedFolder, loadConfig } from "./config.js";
import { listDevices, networkInfo } from "./discovery.js";

function tailscaleIp(): string | null {
  try {
    const bin = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
    const out = execSync(`"${bin}" ip -4 2>/dev/null || true`, {
      encoding: "utf8",
      timeout: 4000,
    }).trim();
    const ip = out.split(/\s+/).find((x) => x.startsWith("100."));
    return ip || null;
  } catch {
    return null;
  }
}

export function travelReady() {
  const c = loadConfig();
  const net = networkInfo();
  const tsIp = tailscaleIp() || net.tailscale.selfIp;
  const devices = listDevices();
  const remoteOnline = devices.filter((d) => !d.isLocal && d.online).length;
  const writeFolders = c.sharedFolders.filter(
    (f) => f.permissions.includes("write") || f.permissions.includes("sync"),
  );

  const checks = [
    {
      id: "porter",
      label: "Porter is running on this Mac",
      ok: true,
      detail: `Port ${c.port}`,
    },
    {
      id: "folders",
      label: "At least one folder is shared",
      ok: c.sharedFolders.length > 0,
      detail:
        c.sharedFolders.length > 0
          ? `${c.sharedFolders.length} folder(s)`
          : "Share Projects / work folders (not whole disk)",
    },
    {
      id: "write",
      label: "A write-enabled folder exists (to receive files)",
      ok: writeFolders.length > 0,
      detail:
        writeFolders.length > 0
          ? writeFolders.map((f) => f.label).join(", ")
          : "Share a folder with write permission",
    },
    {
      id: "token",
      label: "Pair token is set",
      ok: c.token.length >= 16,
      detail: "Copy this token to your travel Mac (Settings)",
    },
    {
      id: "tailscale",
      label: "Tailscale online (needed away from home)",
      ok: Boolean(tsIp),
      detail: tsIp
        ? `Use this IP on travel Mac: ${tsIp}`
        : "Open Tailscale app and log in",
    },
    {
      id: "sleep",
      label: "Porter is awake (not sleeping)",
      ok: !c.sleeping,
      detail: c.sleeping ? "Click Wake" : "Ready for remote access",
    },
  ];

  const ready = checks.every((x) => x.ok);

  return {
    ready,
    deviceName: c.deviceName,
    hostname: os.hostname(),
    pairToken: c.token,
    tailscaleIp: tsIp,
    lanIp: net.primaryLan,
    port: c.port,
    sharedFolders: c.sharedFolders,
    remoteOnline,
    checks,
    travelSteps: [
      "On travel Mac: install Porter + Tailscale (same Tailscale account).",
      "Settings → paste the same pair token.",
      `Settings → Add peer → ${tsIp || "100.x.x.x"} port ${c.port}.`,
      "Leave this Mac powered on + Tailscale + Porter running.",
      "System Settings → Energy: prevent deep sleep while plugged in.",
    ],
    safetyNote:
      "For safety Porter never shares the whole disk. Share only work folders you need on the road.",
  };
}

/** One-click share common work folders (safe presets — not entire home). */
export function shareTravelPresets(): { added: string[]; skipped: string[] } {
  const home = os.homedir();
  const presets: { path: string; label: string; write: boolean }[] = [];

  for (const name of ["Projects", "Developer", "dev", "Code"]) {
    const p = `${home}/${name}`;
    if (fs.existsSync(p)) presets.push({ path: p, label: name, write: true });
  }
  presets.push(
    { path: `${home}/Downloads`, label: "Downloads", write: true },
    { path: `${home}/Documents`, label: "Documents", write: false },
    { path: `${home}/Desktop`, label: "Desktop", write: false },
  );

  const added: string[] = [];
  const skipped: string[] = [];
  const existing = new Set(loadConfig().sharedFolders.map((f) => f.path));
  for (const p of presets) {
    if (existing.has(p.path) || !fs.existsSync(p.path)) {
      skipped.push(p.path);
      continue;
    }
    try {
      addSharedFolder(
        p.path,
        p.label,
        p.write ? ["read", "copy", "write"] : ["read", "copy"],
      );
      added.push(p.path);
    } catch {
      skipped.push(p.path);
    }
  }
  return { added, skipped };
}
