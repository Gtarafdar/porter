/**
 * Travel-ready + set-and-forget for the home Mac you'll leave behind.
 *
 * Reliability model (when you cannot touch this Mac):
 * 1. LaunchAgent keeps Porter alive across login/crash
 * 2. Cloudflare tunnel auto-starts + watchdog restarts if cloudflared dies
 * 3. Tailscale is the STABLE backup (IP does not change) — required for true unattended
 * 4. caffeinate reduces sleep risk while Porter runs
 *
 * Cloudflare Quick Tunnel alone is NOT enough after a full reboot (URL changes).
 * Always enable Tailscale as fallback on the travel Mac.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { addSharedFolder, loadConfig, saveConfig } from "./config.js";
import { listDevices, networkInfo } from "./discovery.js";
import { getTunnelStatus, startCloudflareTunnel } from "./tunnel.js";
import {
  installKeepAlive,
  isKeepAliveInstalled,
  maybeStartPreventSleep,
  startPreventSleep,
} from "./keepalive.js";

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
  const tunnel = getTunnelStatus();
  // Only treat as live when the process still holds a URL (avoid stale config URLs)
  const publicUrl = tunnel.running ? tunnel.publicUrl : null;
  const devices = listDevices();
  const remoteOnline = devices.filter((d) => !d.isLocal && d.online).length;
  const writeFolders = c.sharedFolders.filter(
    (f) => f.permissions.includes("write") || f.permissions.includes("sync"),
  );
  const keepAlive = isKeepAliveInstalled() || Boolean(c.awayMode?.keepAliveInstalled);

  // Away path: Tailscale (stable) and/or live Cloudflare tunnel
  const remoteOk = Boolean(tsIp) || Boolean(publicUrl);

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
      id: "keepalive",
      label: "Auto-start at login (survives crash / reboot login)",
      ok: keepAlive,
      detail: keepAlive
        ? "LaunchAgent installed"
        : "Click “Set & forget for travel” once before you leave",
    },
    {
      id: "cloudflare",
      label: "Cloudflare Tunnel (easy path from travel Mac)",
      ok: Boolean(publicUrl),
      detail: publicUrl
        ? `Live: ${publicUrl}`
        : tunnel.cloudflaredInstalled
          ? "Not running — start via Set & forget or Start Tunnel"
          : "cloudflared missing (Porter.app bundles it)",
    },
    {
      id: "tailscale",
      label: "Tailscale online (REQUIRED backup if tunnel URL changes)",
      ok: Boolean(tsIp),
      detail: tsIp
        ? `Stable IP: ${tsIp} — add as fallback on travel Mac`
        : "Install/open Tailscale on THIS Mac and log in before you leave",
    },
    {
      id: "sleep",
      label: "Porter is awake (not sleeping)",
      ok: !c.sleeping,
      detail: c.sleeping ? "Click Wake" : c.awayMode?.preventSleep ? "Awake + caffeinate" : "Ready",
    },
  ];

  // "ready" = can travel today; "unattendedReady" = safe to leave without touching home Mac
  const coreOk =
    c.sharedFolders.length > 0 &&
    writeFolders.length > 0 &&
    c.token.length >= 16 &&
    !c.sleeping &&
    remoteOk;
  const ready = coreOk;
  const unattendedReady = Boolean(
    coreOk && keepAlive && tsIp && (publicUrl || tsIp),
  );
  const peerHint = publicUrl || (tsIp ? `${tsIp}:${c.port}` : null);

  return {
    ready,
    unattendedReady,
    deviceName: c.deviceName,
    hostname: os.hostname(),
    pairToken: c.token,
    tailscaleIp: tsIp,
    cloudflareUrl: publicUrl,
    tunnel: {
      running: tunnel.running,
      publicUrl,
      cloudflaredInstalled: tunnel.cloudflaredInstalled,
      wantRunning: tunnel.wantRunning,
      restartAttempts: tunnel.restartAttempts,
    },
    awayMode: c.awayMode,
    keepAliveInstalled: keepAlive,
    lanIp: net.primaryLan,
    port: c.port,
    sharedFolders: c.sharedFolders,
    remoteOnline,
    checks,
    travelSteps: [
      "On THIS (home) Mac: click “Set & forget for travel” once.",
      "On travel Mac: same pair token.",
      publicUrl
        ? `Add peer PRIMARY: ${publicUrl}`
        : "Add peer PRIMARY: start Cloudflare Tunnel first, or use Tailscale IP.",
      tsIp
        ? `Add peer FALLBACK: ${tsIp} port ${c.port} (Tailscale — survives Cloudflare URL change).`
        : "Also log Tailscale into this home Mac so travel has a stable backup path.",
      "Leave Mac plugged in. Do not force-quit Porter.",
    ],
    peerAddress: peerHint,
    fallbackAddress: tsIp ? `${tsIp}:${c.port}` : null,
    safetyNote:
      "Leave-and-forget needs BOTH Cloudflare (easy) and Tailscale (stable backup). Quick Tunnel URLs can change after a full reboot; Tailscale IP does not. Porter never shares the whole disk.",
  };
}

/**
 * One-click: share folders + enable away mode + LaunchAgent + tunnel + prevent sleep.
 */
export async function enableSetAndForget(): Promise<{
  ok: boolean;
  travel: ReturnType<typeof travelReady>;
  keepalive: ReturnType<typeof installKeepAlive>;
  tunnelUrl: string | null;
  folders: { added: string[]; skipped: string[] };
  warnings: string[];
}> {
  const warnings: string[] = [];
  const folders = shareTravelPresets();

  const c = loadConfig();
  c.awayMode = {
    enabled: true,
    autoStartTunnel: true,
    preventSleep: true,
    keepAliveInstalled: c.awayMode?.keepAliveInstalled ?? false,
  };
  c.sleeping = false;
  saveConfig(c);

  const keepalive = installKeepAlive();
  if (!keepalive.ok) warnings.push(keepalive.detail);

  startPreventSleep();
  maybeStartPreventSleep();

  let tunnelUrl: string | null = null;
  try {
    const t = await startCloudflareTunnel(c.port);
    tunnelUrl = t.publicUrl;
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : String(e));
  }

  if (!tailscaleIp()) {
    warnings.push(
      "Tailscale is not online on this Mac. Without it, a reboot that changes the Cloudflare URL cannot be fixed while you are away.",
    );
  }

  return {
    ok: warnings.length === 0 || Boolean(tunnelUrl),
    travel: travelReady(),
    keepalive,
    tunnelUrl,
    folders,
    warnings,
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
