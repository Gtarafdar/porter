/**
 * Travel-ready + set-and-forget for the home Mac you'll leave behind.
 *
 * Reliability model (when you cannot touch this Mac):
 * 1. LaunchAgent keeps Porter alive across login/crash
 * 2. Tailscale (required) — stable private mesh; Serve gives MagicDNS HTTPS
 * 3. Break-glass revive — macOS Remote Login (GUI Tailscale) or Tailscale SSH (CLI/daemon)
 * 4. caffeinate reduces sleep risk while Porter runs
 * 5. Cloudflare Quick Tunnel — optional advanced only (URLs rotate)
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
import {
  getTailscaleSelfIp,
  getTailscaleServeStatus,
  listTailnetPeersForPorter,
  reviveCommandForPeer,
  startTailscaleServe,
  detectTailscaleSsh,
  detectRemoteLogin,
  openRemoteLoginSettings,
  isSandboxedTailscaleGui,
} from "./tailscaleServe.js";

export function openTailscaleApp(): { ok: boolean; detail: string } {
  try {
    if (fs.existsSync("/Applications/Tailscale.app")) {
      execSync('open -a Tailscale', { timeout: 3000 });
      return { ok: true, detail: "Opened Tailscale — sign in with the same account on every Mac" };
    }
    execSync('open "https://tailscale.com/download/mac"', { timeout: 3000 });
    return {
      ok: true,
      detail: "Tailscale is not installed yet — opened the official download page",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Break-glass revive settings.
 * Tailscale’s Mac GUI app has no SSH toggle and cannot host Tailscale SSH (sandbox).
 * On macOS we open System Settings → Sharing → Remote Login instead.
 */
export function openTailscaleSshSettings(): { ok: boolean; detail: string } {
  if (process.platform === "darwin" && isSandboxedTailscaleGui()) {
    const opened = openRemoteLoginSettings();
    return {
      ok: opened.ok,
      detail: opened.ok
        ? "Tailscale’s Mac app has no SSH menu (Apple sandbox). Opened System Settings → Sharing — turn on Remote Login, then return here and tap Refresh. Docs: https://tailscale.com/kb/1193/tailscale-ssh"
        : opened.detail,
    };
  }
  // Non-GUI / Linux / open-source tailscaled: try enabling Tailscale SSH via CLI
  try {
    execSync("tailscale set --ssh", { timeout: 8000 });
    return {
      ok: true,
      detail: "Enabled Tailscale SSH on this node. Return here and tap Refresh / Repair.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/sandbox|does not run/i.test(msg) || process.platform === "darwin") {
      const opened = openRemoteLoginSettings();
      return {
        ok: opened.ok,
        detail: opened.ok
          ? "This Tailscale install cannot host Tailscale SSH. Opened System Settings → Sharing — turn on Remote Login."
          : opened.detail,
      };
    }
    return {
      ok: false,
      detail: `Could not enable Tailscale SSH (${msg.slice(0, 120)}). See https://tailscale.com/kb/1193/tailscale-ssh`,
    };
  }
}

export function travelReady() {
  const c = loadConfig();
  const net = networkInfo();
  const tsIp = getTailscaleSelfIp() || net.tailscale.selfIp || null;
  const serve = getTailscaleServeStatus(c.port);
  const tunnel = getTunnelStatus();
  const publicUrl = tunnel.running ? tunnel.publicUrl : null;
  const devices = listDevices();
  const remoteOnline = devices.filter((d) => !d.isLocal && d.online).length;
  const writeFolders = c.sharedFolders.filter(
    (f) => f.permissions.includes("write") || f.permissions.includes("sync"),
  );
  const keepAlive = isKeepAliveInstalled() || Boolean(c.awayMode?.keepAliveInstalled);
  const tsSsh = serve.sshLikelyEnabled ?? detectTailscaleSsh();
  const remoteLogin = detectRemoteLogin();
  const guiTs = process.platform === "darwin" && isSandboxedTailscaleGui();
  // Break-glass: Tailscale SSH when available; otherwise macOS Remote Login
  const breakGlassOk = tsSsh === true || remoteLogin === true;
  const serveUrl = serve.url || c.awayMode?.serveUrl || null;

  // Travel path: Tailscale required; Serve URL preferred; CF optional
  const remoteOk = Boolean(tsIp);

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
      id: "tailscale",
      label: "Tailscale online (required for travel)",
      ok: Boolean(tsIp),
      detail: tsIp
        ? `Stable IP: ${tsIp}`
        : "Install/open Tailscale on THIS Mac and log in before you leave",
    },
    {
      id: "serve",
      label: "Private Tailscale link (MagicDNS)",
      ok: Boolean(serve.configured && serveUrl),
      detail: serveUrl
        ? `Live: ${serveUrl}`
        : tsIp
          ? "Set & forget turns this on — wait a few seconds, or tap Repair"
          : "Needs Tailscale first",
    },
    {
      id: "ssh",
      label: guiTs
        ? "Break-glass revive (macOS Remote Login)"
        : "Tailscale SSH (break-glass revive while away)",
      ok: breakGlassOk,
      detail: guiTs
        ? remoteLogin === true
          ? "Remote Login is on — from travel: ssh user@100.x 'open -a Porter'"
          : "Tailscale’s Mac app has no SSH menu. System Settings → Sharing → turn on Remote Login"
        : tsSsh === true
          ? "Enabled — from travel you can restart Porter"
          : tsSsh === false
            ? "Enable Tailscale SSH (CLI) or use Remote Login, then Refresh"
            : "Enable break-glass access before you leave",
    },
    {
      id: "cloudflare",
      label: "Cloudflare Quick Tunnel (optional advanced)",
      ok: true, // never blocks readiness
      detail: publicUrl
        ? `Live: ${publicUrl} (URLs can change after reboot)`
        : "Off — use Tailscale instead (recommended)",
    },
    {
      id: "sleep",
      label: "Porter is awake (not sleeping)",
      ok: !c.sleeping,
      detail: c.sleeping ? "Click Wake" : c.awayMode?.preventSleep ? "Awake + caffeinate" : "Ready",
    },
  ];

  const coreOk =
    c.sharedFolders.length > 0 &&
    writeFolders.length > 0 &&
    c.token.length >= 16 &&
    !c.sleeping &&
    remoteOk;
  const ready = coreOk;
  // Unattended: keepalive + Tailscale + some break-glass path (Tailscale SSH or Remote Login)
  const unattendedReady = Boolean(
    coreOk && keepAlive && tsIp && breakGlassOk && (serve.configured || tsIp),
  );

  const peerHint =
    serveUrl || (tsIp ? `${tsIp}:${c.port}` : null) || publicUrl || null;
  const hostname = os.hostname().replace(/\.local$/i, "");

  return {
    ready,
    unattendedReady,
    deviceName: c.deviceName,
    hostname: os.hostname(),
    pairToken: c.token,
    tailscaleIp: tsIp,
    serveUrl,
    serveConfigured: serve.configured,
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
    sshEnabled: breakGlassOk ? true : tsSsh === false && remoteLogin === false ? false : null,
    remoteLoginEnabled: remoteLogin,
    tailscaleSshSupported: !guiTs,
    reviveCommand: reviveCommandForPeer(hostname, {
      preferOsSsh: guiTs || tsSsh !== true,
      selfIp: tsIp,
    }),
    travelSteps: [
      "On THIS (home) Mac: tap Set & forget once.",
      guiTs
        ? "Enable macOS Remote Login (System Settings → Sharing) for break-glass revive — Tailscale’s Mac app has no SSH menu."
        : "Enable Tailscale SSH (or Remote Login) before you leave.",
      "On travel Mac: same pair token → Add Mac → pick this Mac from Tailscale list (or paste Tailscale IP).",
      tsIp
        ? `Primary: ${serveUrl || `${tsIp}:${c.port}`}`
        : "Log Tailscale into this home Mac first.",
      publicUrl ? `Optional Cloudflare: ${publicUrl}` : "Cloudflare Quick Tunnel is optional.",
      "Leave Mac plugged in and logged in. Do not force-quit Porter.",
    ],
    peerAddress: peerHint,
    fallbackAddress: tsIp ? `${tsIp}:${c.port}` : null,
    safetyNote: guiTs
      ? "Travel uses your Tailscale account (private). Set & forget keeps Porter alive. Tailscale’s Mac app cannot host Tailscale SSH — turn on System Settings → Sharing → Remote Login so you can revive Porter with ssh while away. Cloudflare is optional."
      : "Travel uses your Tailscale account (private). Set & forget keeps Porter alive. Enable Tailscale SSH (or Remote Login) so you can revive Porter if it ever stops while you are away. Cloudflare Quick Tunnel is optional and can change after reboot.",
  };
}

/**
 * One-click: share folders + away mode + LaunchAgent + Tailscale Serve + prevent sleep.
 * Cloudflare Quick Tunnel is optional (started only if autoStartTunnel already true).
 */
export async function enableSetAndForget(opts?: {
  alsoStartCloudflare?: boolean;
}): Promise<{
  ok: boolean;
  travel: ReturnType<typeof travelReady>;
  keepalive: ReturnType<typeof installKeepAlive>;
  tunnelUrl: string | null;
  serveUrl: string | null;
  folders: { added: string[]; skipped: string[] };
  warnings: string[];
}> {
  const warnings: string[] = [];
  const folders = shareTravelPresets();

  const c = loadConfig();
  const alsoCf = Boolean(opts?.alsoStartCloudflare || c.awayMode?.autoStartTunnel);
  c.awayMode = {
    enabled: true,
    autoStartTunnel: alsoCf,
    preventSleep: true,
    keepAliveInstalled: c.awayMode?.keepAliveInstalled ?? false,
    preferTailscaleServe: true,
    serveUrl: c.awayMode?.serveUrl ?? null,
  };
  c.sleeping = false;
  saveConfig(c);

  const keepalive = installKeepAlive();
  if (!keepalive.ok) warnings.push(keepalive.detail);

  startPreventSleep();
  maybeStartPreventSleep();

  let serveUrl: string | null = null;
  try {
    const s = startTailscaleServe(c.port);
    serveUrl = s.url;
    if (!s.ok) warnings.push(s.detail);
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : String(e));
  }

  let tunnelUrl: string | null = null;
  if (alsoCf) {
    try {
      const t = await startCloudflareTunnel(c.port);
      tunnelUrl = t.publicUrl;
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (!getTailscaleSelfIp()) {
    warnings.push(
      "Tailscale is not online on this Mac. Travel will not work until Tailscale is signed in.",
    );
  }

  const ssh = detectTailscaleSsh();
  const remoteLogin = detectRemoteLogin();
  if (process.platform === "darwin" && isSandboxedTailscaleGui()) {
    if (remoteLogin !== true) {
      warnings.push(
        "Tailscale’s Mac app has no SSH menu (cannot host Tailscale SSH). Turn on System Settings → Sharing → Remote Login before you leave so you can revive Porter with ssh.",
      );
    }
  } else if (ssh === false || ssh === null) {
    warnings.push(
      "Enable Tailscale SSH (or macOS Remote Login) before you leave so you can revive Porter while away.",
    );
  }

  const travel = travelReady();
  return {
    ok: Boolean(getTailscaleSelfIp()) && keepalive.ok,
    travel,
    keepalive,
    tunnelUrl,
    serveUrl,
    folders,
    warnings,
  };
}

/** Repair = re-run Set & forget without forcing Cloudflare. */
export async function repairTravelReady(): Promise<ReturnType<typeof enableSetAndForget>> {
  return enableSetAndForget({ alsoStartCloudflare: false });
}

export { listTailnetPeersForPorter };

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
