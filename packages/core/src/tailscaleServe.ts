/**
 * Private Tailscale Serve — expose local Porter to the same Tailscale account
 * via stable MagicDNS HTTPS (no public Cloudflare Quick Tunnel).
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { appendActivity, loadConfig, saveConfig, PORTER_DIR } from "./config.js";

const SERVE_STATE = path.join(PORTER_DIR, "tailscale-serve.json");

function tailscaleBin(): string {
  const candidates = [
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
    "/usr/local/bin/tailscale",
    "/opt/homebrew/bin/tailscale",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    return execSync("command -v tailscale", { encoding: "utf8" }).trim() || "tailscale";
  } catch {
    return "tailscale";
  }
}

export function isTailscaleInstalled(): boolean {
  if (fs.existsSync("/Applications/Tailscale.app")) return true;
  const bin = tailscaleBin();
  return bin !== "tailscale" || fs.existsSync(bin);
}

export function wizardTailscaleStatus(): {
  installed: boolean;
  connected: boolean;
  selfIp: string | null;
  sshLikelyEnabled: boolean | null;
  detail: string;
} {
  const installed = isTailscaleInstalled();
  const selfIp = getTailscaleSelfIp();
  const sshLikelyEnabled = detectTailscaleSsh();
  if (!installed) {
    return {
      installed: false,
      connected: false,
      selfIp: null,
      sshLikelyEnabled: null,
      detail: "Install Tailscale, then sign in with the same account on both Macs",
    };
  }
  if (!selfIp) {
    return {
      installed: true,
      connected: false,
      selfIp: null,
      sshLikelyEnabled,
      detail: "Open Tailscale and sign in — waiting for a 100.x address",
    };
  }
  return {
    installed: true,
    connected: true,
    selfIp,
    sshLikelyEnabled,
    detail: `Connected as ${selfIp}`,
  };
}

function runTs(args: string[], timeout = 12000): string {
  const bin = tailscaleBin();
  try {
    return execFileSync(bin, args, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const msg = `${err.stderr || ""} ${err.stdout || ""} ${err.message || ""}`.trim();
    throw new Error(msg || `tailscale ${args.join(" ")} failed`);
  }
}

export type TailscaleServeStatus = {
  available: boolean;
  configured: boolean;
  url: string | null;
  dnsName: string | null;
  selfIp: string | null;
  sshLikelyEnabled: boolean | null;
  detail: string;
};

function selfDnsName(): string | null {
  try {
    const raw = runTs(["status", "--json"], 8000);
    const parsed = JSON.parse(raw) as {
      Self?: { DNSName?: string; TailscaleIPs?: string[]; CapMap?: Record<string, unknown> };
      MagicDNSSuffix?: string;
    };
    const dns = parsed.Self?.DNSName?.replace(/\.$/, "") || null;
    return dns;
  } catch {
    return null;
  }
}

export function getTailscaleSelfIp(): string | null {
  try {
    const out = runTs(["ip", "-4"], 4000);
    return out.split(/\s+/).find((x) => x.startsWith("100.")) || null;
  } catch {
    try {
      const bin = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
      if (fs.existsSync(bin)) {
        const out = execFileSync(bin, ["ip", "-4"], { encoding: "utf8", timeout: 4000 }).trim();
        return out.split(/\s+/).find((x) => x.startsWith("100.")) || null;
      }
    } catch {
      // ignore
    }
    return null;
  }
}

export function isSandboxedTailscaleGui(): boolean {
  const bin = tailscaleBin();
  // App Store + Standalone GUI both run sandboxed Network Extension — cannot host Tailscale SSH.
  return bin.includes("Tailscale.app/Contents/MacOS/Tailscale");
}

/** Best-effort: can this Mac accept break-glass SSH to revive Porter while away? */
export function detectTailscaleSsh(): boolean | null {
  // GUI Tailscale on macOS cannot run the Tailscale SSH *server* (Apple sandbox).
  // CapMap often still lists ssh caps — do not treat that as “SSH enabled”.
  if (process.platform === "darwin" && isSandboxedTailscaleGui()) {
    return false;
  }
  try {
    const raw = runTs(["status", "--json"], 8000);
    const parsed = JSON.parse(raw) as {
      Self?: { CapMap?: Record<string, unknown> };
    };
    const caps = parsed.Self?.CapMap || {};
    for (const key of Object.keys(caps)) {
      if (/ssh/i.test(key)) return true;
    }
    return null;
  } catch {
    return null;
  }
}

/** macOS Remote Login (sshd) — practical break-glass when Tailscale SSH server is unavailable. */
export function detectRemoteLogin(): boolean | null {
  if (process.platform !== "darwin") return null;
  try {
    execFileSync("nc", ["-z", "127.0.0.1", "22"], {
      timeout: 1500,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function openRemoteLoginSettings(): { ok: boolean; detail: string } {
  if (process.platform !== "darwin") {
    return { ok: false, detail: "Remote Login settings are only available on macOS" };
  }
  try {
    // Sequoia / Sonoma Sharing pane
    execSync('open "x-apple.systempreferences:com.apple.Sharing-Settings.extension"', {
      timeout: 4000,
    });
    return {
      ok: true,
      detail:
        "Opened System Settings → Sharing. Turn on Remote Login, then return here and tap Refresh.",
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export function getTailscaleServeStatus(port = 47831): TailscaleServeStatus {
  const selfIp = getTailscaleSelfIp();
  const dnsName = selfDnsName();
  const sshLikelyEnabled = detectTailscaleSsh();
  if (!selfIp && !dnsName) {
    return {
      available: false,
      configured: false,
      url: null,
      dnsName: null,
      selfIp: null,
      sshLikelyEnabled,
      detail: "Tailscale not online — install/open Tailscale and sign in",
    };
  }

  let configured = false;
  let url: string | null = null;
  try {
    const st = runTs(["serve", "status", "--json"], 8000);
    if (st) {
      const parsed = JSON.parse(st) as {
        TCP?: Record<string, unknown>;
        Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
      };
      configured = Boolean(parsed.Web && Object.keys(parsed.Web).length);
      // Prefer HTTPS handler pointing at our port
      for (const [hostKey, web] of Object.entries(parsed.Web || {})) {
        for (const handler of Object.values(web.Handlers || {})) {
          const proxy = handler.Proxy || "";
          if (proxy.includes(String(port)) || proxy.includes("127.0.0.1")) {
            configured = true;
            const host = hostKey.replace(/:443$/, "").replace(/\.$/, "");
            url = host.startsWith("http") ? host : `https://${host}`;
          }
        }
      }
    }
  } catch {
    // serve status may fail if never configured
  }

  if (!url && dnsName) {
    // Expected Serve URL even before configure (for copy UI)
    url = configured ? `https://${dnsName}` : null;
  }

  // Persisted from last successful start
  try {
    if (fs.existsSync(SERVE_STATE)) {
      const saved = JSON.parse(fs.readFileSync(SERVE_STATE, "utf8")) as { url?: string };
      if (saved.url && configured) url = saved.url;
    }
  } catch {
    // ignore
  }

  if (!url && configured && dnsName) url = `https://${dnsName}`;

  return {
    available: true,
    configured,
    url,
    dnsName,
    selfIp,
    sshLikelyEnabled,
    detail: configured
      ? `Private Serve: ${url || dnsName}`
      : "Tailscale online — Set & forget will enable private Serve",
  };
}

export function startTailscaleServe(port: number): {
  ok: boolean;
  url: string | null;
  detail: string;
} {
  const dns = selfDnsName();
  const selfIp = getTailscaleSelfIp();
  if (!selfIp && !dns) {
    return {
      ok: false,
      url: null,
      detail: "Tailscale is not running — open Tailscale and sign in first",
    };
  }

  try {
    // Background HTTPS reverse-proxy to local Porter (tailnet-only, not Funnel/public)
    runTs(["serve", "--bg", "--yes", `${port}`], 20000);
  } catch (e) {
    // Older CLI may not support --yes
    try {
      runTs(["serve", "--bg", `${port}`], 20000);
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : String(e2);
      appendActivity("tailscale_serve", msg, false, "system");
      return { ok: false, url: null, detail: msg };
    }
  }

  const st = getTailscaleServeStatus(port);
  const url = st.url || (dns ? `https://${dns}` : null);
  fs.mkdirSync(PORTER_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(SERVE_STATE, JSON.stringify({ url, port, at: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });

  const c = loadConfig();
  if (!c.awayMode) {
    c.awayMode = {
      enabled: true,
      autoStartTunnel: false,
      preventSleep: true,
      keepAliveInstalled: false,
      preferTailscaleServe: true,
      serveUrl: url,
    };
  } else {
    c.awayMode.preferTailscaleServe = true;
    c.awayMode.serveUrl = url;
  }
  saveConfig(c);
  appendActivity("tailscale_serve", url || "started", true, "system");
  return {
    ok: true,
    url,
    detail: url
      ? `Private Tailscale Serve ready: ${url}`
      : "Serve started — enable HTTPS in Tailscale admin if the URL is missing",
  };
}

export function stopTailscaleServe(): void {
  try {
    runTs(["serve", "reset"], 10000);
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(SERVE_STATE)) fs.unlinkSync(SERVE_STATE);
  } catch {
    // ignore
  }
  const c = loadConfig();
  if (c.awayMode) {
    c.awayMode.serveUrl = null;
    saveConfig(c);
  }
}

export type TailnetPeerHint = {
  name: string;
  hostName: string;
  dnsName: string | null;
  ip: string | null;
  online: boolean;
  porterUrl: string;
};

/** List other devices on this Tailscale account for one-click Add Mac. */
export function listTailnetPeersForPorter(port = 47831): TailnetPeerHint[] {
  try {
    const raw = runTs(["status", "--json"], 8000);
    const parsed = JSON.parse(raw) as {
      Peer?: Record<
        string,
        {
          HostName?: string;
          DNSName?: string;
          Online?: boolean;
          Active?: boolean;
          TailscaleIPs?: string[];
        }
      >;
    };
    const out: TailnetPeerHint[] = [];
    for (const peer of Object.values(parsed.Peer || {})) {
      const ip = peer.TailscaleIPs?.find((x) => x.startsWith("100.")) || null;
      const dns = peer.DNSName?.replace(/\.$/, "") || null;
      const hostName = peer.HostName || dns || ip || "Mac";
      if (!ip && !dns) continue;
      out.push({
        name: hostName,
        hostName,
        dnsName: dns,
        ip,
        online: Boolean(peer.Online ?? peer.Active),
        porterUrl: ip ? `http://${ip}:${port}` : `https://${dns}`,
      });
    }
    return out.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function reviveCommandForPeer(
  hostName: string,
  opts?: { preferOsSsh?: boolean; selfIp?: string | null },
): string {
  const safe = hostName.replace(/\.local$/i, "").split(".")[0] || hostName;
  const user = os.userInfo().username || "$(whoami)";
  if (opts?.preferOsSsh) {
    const host = opts.selfIp || safe;
    return `ssh ${user}@${host} 'open -a Porter'`;
  }
  return `tailscale ssh ${safe} 'open -a Porter'`;
}
