import { spawn, type ChildProcess } from "node:child_process";
import { appendActivity, loadConfig, saveConfig, PORTER_DIR } from "./config.js";
import fs from "node:fs";
import path from "node:path";

const TUNNEL_STATE = path.join(PORTER_DIR, "tunnel.json");

let tunnelProc: ChildProcess | null = null;
let publicUrl: string | null = null;
let wantRunning = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let localPort = 47831;
let restartAttempts = 0;

function whichCloudflared(): string | null {
  const arch = process.arch; // 'arm64' | 'x64' | …
  const res = process.env.PORTER_RESOURCES;
  const fromEnvExplicit = process.env.PORTER_CLOUDFLARED || null;
  const candidates = [
    fromEnvExplicit,
    res ? path.join(res, arch === "arm64" ? "cloudflared-arm64" : "cloudflared-x64") : null,
    res ? path.join(res, "cloudflared") : null,
    path.join(process.env.HOME || "", "Library/Application Support/Porter/bin/cloudflared"),
    "/opt/homebrew/bin/cloudflared",
    "/usr/local/bin/cloudflared",
    "cloudflared",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (c === "cloudflared") return c;
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

function persistUrl(url: string): void {
  publicUrl = url;
  fs.mkdirSync(PORTER_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    TUNNEL_STATE,
    JSON.stringify(
      { publicUrl: url, startedAt: new Date().toISOString(), restarts: restartAttempts },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  const c = loadConfig();
  c.tunnelUrl = url;
  saveConfig(c);
}

export function getTunnelStatus(): {
  running: boolean;
  publicUrl: string | null;
  cloudflaredInstalled: boolean;
  cloudflaredPath: string | null;
  wantRunning: boolean;
  restartAttempts: number;
} {
  const bin = whichCloudflared();
  return {
    running: Boolean(tunnelProc && !tunnelProc.killed && publicUrl),
    publicUrl,
    cloudflaredInstalled: Boolean(bin),
    cloudflaredPath: bin,
    wantRunning,
    restartAttempts,
  };
}

function scheduleRestart(reason: string): void {
  if (!wantRunning) return;
  if (restartTimer) return;
  restartAttempts += 1;
  const delay = Math.min(60_000, 2000 * Math.min(restartAttempts, 10));
  appendActivity(
    "cloudflare_tunnel_restart",
    `${reason}; retry #${restartAttempts} in ${delay}ms`,
    false,
    "system",
  );
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void startCloudflareTunnel(localPort, { supervised: true }).catch((err) => {
      appendActivity(
        "cloudflare_tunnel_restart",
        err instanceof Error ? err.message : String(err),
        false,
        "system",
      );
      scheduleRestart("start failed");
    });
  }, delay);
}

/**
 * Start a Cloudflare Quick Tunnel to local Porter.
 * Watchdog keeps it alive while wantRunning is true.
 * Note: Quick Tunnel URL can change after a full process restart — pair Tailscale as fallback.
 */
export async function startCloudflareTunnel(
  port = 47831,
  opts?: { supervised?: boolean },
): Promise<{ publicUrl: string }> {
  localPort = port;
  wantRunning = true;

  if (publicUrl && tunnelProc && !tunnelProc.killed) {
    return { publicUrl };
  }

  const bin = whichCloudflared();
  if (!bin) {
    wantRunning = false;
    throw new Error(
      "cloudflared not installed. Run: brew install cloudflare/cloudflare/cloudflared (or use Porter.app which bundles it)",
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const args = ["tunnel", "--url", `http://127.0.0.1:${localPort}`, "--no-autoupdate"];
    tunnelProc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });

    const onData = (buf: Buffer) => {
      const text = buf.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !settled) {
        settled = true;
        restartAttempts = opts?.supervised ? restartAttempts : 0;
        persistUrl(match[0]);
        appendActivity("cloudflare_tunnel", match[0], true, "ui");
        resolve({ publicUrl: match[0] });
      }
    };

    tunnelProc.stdout?.on("data", onData);
    tunnelProc.stderr?.on("data", onData);
    tunnelProc.on("error", (err) => {
      tunnelProc = null;
      if (!settled) {
        settled = true;
        reject(err);
      } else if (wantRunning) {
        scheduleRestart(err.message);
      }
    });
    tunnelProc.on("exit", (code) => {
      tunnelProc = null;
      // Keep last known publicUrl until a new one arrives (travel may still have fallback)
      if (!settled) {
        settled = true;
        reject(new Error(`cloudflared exited early (code ${code})`));
        return;
      }
      if (wantRunning) {
        publicUrl = null;
        scheduleRestart(`exited code ${code}`);
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          tunnelProc?.kill("SIGTERM");
        } catch {
          // ignore
        }
        reject(new Error("Timed out waiting for Cloudflare tunnel URL"));
      }
    }, 45_000);
  });
}

export function stopCloudflareTunnel(): void {
  wantRunning = false;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (tunnelProc) {
    tunnelProc.kill("SIGTERM");
    tunnelProc = null;
  }
  publicUrl = null;
  restartAttempts = 0;
  try {
    if (fs.existsSync(TUNNEL_STATE)) fs.unlinkSync(TUNNEL_STATE);
  } catch {
    // ignore
  }
  const c = loadConfig();
  c.tunnelUrl = null;
  saveConfig(c);
  appendActivity("cloudflare_tunnel_stop", "stopped", true, "ui");
}

/** Call after Porter server is up — starts tunnel if away-mode asks for it. */
export async function maybeAutoStartTunnel(port: number): Promise<void> {
  const c = loadConfig();
  if (!c.awayMode?.enabled || !c.awayMode.autoStartTunnel) return;
  try {
    await startCloudflareTunnel(port);
  } catch (err) {
    appendActivity(
      "cloudflare_tunnel",
      err instanceof Error ? err.message : String(err),
      false,
      "system",
    );
    // watchdog will keep trying if wantRunning was set; ensure it is
    wantRunning = true;
    scheduleRestart("auto-start failed");
  }
}
