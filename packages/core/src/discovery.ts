import Bonjour from "bonjour-service";
import type { DeviceInfo } from "@porter/protocol";
import { loadConfig, localDevice, PORTER_DIR } from "./config.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const SERVICE_TYPE = "porter";
let bonjour: InstanceType<typeof Bonjour> | null = null;
const remoteDevices = new Map<string, DeviceInfo>();
const MANUAL_PEERS_PATH = path.join(PORTER_DIR, "manual-peers.json");

function persistManualPeers(): void {
  const peers = [...remoteDevices.values()].filter((d) => !d.isLocal);
  fs.mkdirSync(PORTER_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(MANUAL_PEERS_PATH, JSON.stringify(peers, null, 2), { mode: 0o600 });
}

export function hydrateManualPeers(): void {
  try {
    if (!fs.existsSync(MANUAL_PEERS_PATH)) return;
    const peers = JSON.parse(fs.readFileSync(MANUAL_PEERS_PATH, "utf8")) as DeviceInfo[];
    for (const p of peers) {
      if (!p?.id || p.isLocal) continue;
      // Prefer Tailscale IP if we can map the device name later; keep saved host for now
      remoteDevices.set(p.id, { ...p, online: false });
    }
  } catch {
    // ignore
  }
}

function peerRoot(device: DeviceInfo): string {
  if (device.baseUrl) return device.baseUrl.replace(/\/$/, "");
  if (device.via === "cloudflare" || device.port === 443) {
    return `https://${device.host}`;
  }
  return `http://${device.host}:${device.port}`;
}

function peerFallbackRoot(device: DeviceInfo): string | null {
  if (device.fallbackBaseUrl) return device.fallbackBaseUrl.replace(/\/$/, "");
  if (device.fallbackHost) {
    if (
      device.fallbackHost.endsWith(".trycloudflare.com") ||
      (device.fallbackPort ?? 0) === 443
    ) {
      return `https://${device.fallbackHost}`;
    }
    return `http://${device.fallbackHost}:${device.fallbackPort ?? 47831}`;
  }
  return null;
}

async function probePeer(
  root: string,
  config: { token: string; deviceId: string },
): Promise<boolean> {
  const res = await fetch(`${root}/api/health`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return false;
  const folders = await fetch(`${root}/api/folders`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      "X-Porter-Device": config.deviceId,
      "X-Porter-Pair": config.token,
    },
    signal: AbortSignal.timeout(8000),
  });
  return folders.ok;
}

/** Re-ping saved peers and mark online/offline (call on a timer). Tries primary then fallback. */
export async function refreshPeerHealth(): Promise<void> {
  const config = loadConfig();
  for (const [id, device] of remoteDevices) {
    if (device.isLocal) continue;
    const roots: { root: string; via: DeviceInfo["activeVia"] }[] = [
      {
        root: peerRoot(device),
        via: device.via === "local" ? "lan" : device.via,
      },
    ];
    const fb = peerFallbackRoot(device);
    if (fb) {
      roots.push({
        root: fb,
        via: fb.startsWith("https")
          ? "cloudflare"
          : fb.includes("100.")
            ? "tailscale"
            : "lan",
      });
    }
    // Prefer last active path first
    if (device.activeVia === "tailscale" && roots.length > 1) {
      roots.reverse();
    }
    let online = false;
    let activeVia = device.activeVia;
    for (const r of roots) {
      try {
        if (await probePeer(r.root, config)) {
          online = true;
          activeVia = r.via;
          break;
        }
      } catch {
        // try next
      }
    }
    remoteDevices.set(id, { ...device, online, activeVia });
  }
}

export function updatePeerActivePath(
  id: string,
  via: DeviceInfo["activeVia"],
  _base?: string,
): void {
  const device = remoteDevices.get(id);
  if (!device || device.isLocal) return;
  if (device.activeVia === via) return;
  remoteDevices.set(id, { ...device, activeVia: via, online: true });
  persistManualPeers();
}

export function registerManualPeer(input: {
  id: string;
  name: string;
  host: string;
  port: number;
  via?: DeviceInfo["via"];
  baseUrl?: string;
  fallbackHost?: string;
  fallbackPort?: number;
  fallbackBaseUrl?: string;
  activeVia?: DeviceInfo["activeVia"];
}): DeviceInfo {
  const via: Exclude<DeviceInfo["via"], "local"> =
    input.via && input.via !== "local"
      ? input.via
      : input.baseUrl?.startsWith("https") || input.host.endsWith(".trycloudflare.com")
        ? "cloudflare"
        : input.host.startsWith("100.")
          ? "tailscale"
          : "lan";
  const existing = remoteDevices.get(input.id);
  const device: DeviceInfo = {
    id: input.id,
    name: input.name,
    host: input.host,
    port: input.port,
    online: true,
    isLocal: false,
    via,
    baseUrl: input.baseUrl,
    fallbackHost: input.fallbackHost ?? existing?.fallbackHost,
    fallbackPort: input.fallbackPort ?? existing?.fallbackPort,
    fallbackBaseUrl: input.fallbackBaseUrl ?? existing?.fallbackBaseUrl,
    activeVia: input.activeVia ?? via,
  };
  remoteDevices.set(input.id, device);
  persistManualPeers();
  return device;
}

/**
 * When another Mac calls us (same pair token), show it under Devices.
 * Prefer Tailscale reply address so Home can reach Travel later.
 */
export function noteSeenPeer(input: {
  id: string;
  name?: string;
  replyLan?: string;
  replyTailscale?: string;
}): void {
  const config = loadConfig();
  if (!input.id || input.id === config.deviceId) return;
  const existing = remoteDevices.get(input.id);
  const reply =
    (input.replyTailscale && input.replyTailscale.startsWith("100.")
      ? input.replyTailscale
      : null) ||
    (input.replyLan && /^\d+\.\d+\.\d+\.\d+$/.test(input.replyLan) ? input.replyLan : null);
  const host =
    reply ||
    existing?.host ||
    (existing?.baseUrl ? existing.host : "inbound");
  if (host === "inbound" && !existing) {
    // Still show the Mac so Home isn't empty — user can Add Mac with a real address later.
  }
  const via: Exclude<DeviceInfo["via"], "local"> = host.startsWith("100.")
    ? "tailscale"
    : host.endsWith(".trycloudflare.com") || existing?.via === "cloudflare"
      ? (existing?.via === "cloudflare" ? "cloudflare" : "lan")
      : "lan";
  const device: DeviceInfo = {
    id: input.id,
    name: input.name?.trim() || existing?.name || input.id.slice(0, 8),
    host: existing?.baseUrl ? existing.host : host === "inbound" ? existing?.host || host : host,
    port: existing?.port || 47831,
    online: true,
    isLocal: false,
    via: existing?.baseUrl ? existing.via : via,
    baseUrl: existing?.baseUrl,
    fallbackHost:
      existing?.fallbackHost ||
      (input.replyTailscale?.startsWith("100.") ? input.replyTailscale : undefined),
    fallbackPort: existing?.fallbackPort || (input.replyTailscale ? 47831 : undefined),
    fallbackBaseUrl: existing?.fallbackBaseUrl,
    activeVia: existing?.activeVia || via,
  };
  // If we learned a Tailscale IP and primary was placeholder inbound, promote it
  if (reply && (device.host === "inbound" || !existing)) {
    device.host = reply;
    device.via = reply.startsWith("100.") ? "tailscale" : "lan";
    device.activeVia = device.via;
  } else if (reply && reply.startsWith("100.") && !device.fallbackHost) {
    device.fallbackHost = reply;
    device.fallbackPort = 47831;
  }
  remoteDevices.set(input.id, device);
  persistManualPeers();
}

function getTailscaleStatus(): { selfIp?: string; peerIps: Map<string, string> } {
  const peerIps = new Map<string, string>();
  try {
    const selfOut = execSync("tailscale ip -4 2>/dev/null || true", {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
    const selfIp = selfOut.split(/\s+/).find((x) => x.startsWith("100.")) ;
    try {
      const status = execSync("tailscale status --json 2>/dev/null || true", {
        encoding: "utf8",
        timeout: 3000,
      }).trim();
      if (status) {
        const parsed = JSON.parse(status) as {
          Peer?: Record<string, { HostName?: string; DNSName?: string; TailscaleIPs?: string[] }>;
        };
        for (const peer of Object.values(parsed.Peer ?? {})) {
          const ip4 = peer.TailscaleIPs?.find((ip) => ip.includes("."));
          const host = (peer.HostName || peer.DNSName || "").replace(/\.$/, "");
          if (ip4 && host) peerIps.set(host.toLowerCase(), ip4);
        }
      }
    } catch {
      // ignore
    }
    return { selfIp, peerIps };
  } catch {
    return { peerIps };
  }
}

function lanAddresses(): string[] {
  try {
    const nets = os.networkInterfaces();
    const addrs: string[] = [];
    for (const list of Object.values(nets)) {
      if (!list) continue;
      for (const net of list) {
        if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
      }
    }
    return addrs;
  } catch {
    return [];
  }
}

export function startDiscovery(onChange?: () => void): void {
  if (bonjour) return;
  if (process.env.PORTER_NO_BONJOUR === "1") {
    console.warn("[porter] Bonjour disabled (PORTER_NO_BONJOUR=1)");
    return;
  }
  const config = loadConfig();
  try {
    bonjour = new Bonjour();
    bonjour.publish({
      name: `porter-${config.deviceId}`,
      type: SERVICE_TYPE,
      port: config.port,
      txt: {
        id: config.deviceId,
        deviceName: config.deviceName,
      },
    });

    const browser = bonjour.find({ type: SERVICE_TYPE });
    browser.on("up", (service: {
      txt?: Record<string, string>;
      name: string;
      port: number;
      host?: string;
      referer?: { address?: string };
      addresses?: string[];
    }) => {
      const id = String(service.txt?.id ?? "");
      if (!id || id === config.deviceId) return;
      const host =
        service.referer?.address ||
        service.addresses?.find((a: string) => a.includes(".")) ||
        service.host;
      if (!host) return;
      const ts = getTailscaleStatus();
      const nameHint = String(service.txt?.deviceName ?? service.name).toLowerCase();
      const tsIp =
        [...ts.peerIps.entries()].find(([h]) => nameHint.includes(h) || h.includes(nameHint))?.[1] ||
        (host.startsWith("100.") ? host : undefined);
      const preferHost = tsIp || host;
      const via = preferHost.startsWith("100.") ? "tailscale" : "lan";
      const existing = remoteDevices.get(id);
      remoteDevices.set(id, {
        id,
        name: String(service.txt?.deviceName ?? service.name),
        host: preferHost,
        port: service.port,
        online: true,
        isLocal: false,
        via,
        // Keep travel/Cloudflare paths if Bonjour only saw LAN
        baseUrl: existing?.baseUrl,
        fallbackHost: existing?.fallbackHost || (tsIp && tsIp !== preferHost ? tsIp : undefined),
        fallbackPort: existing?.fallbackPort,
        fallbackBaseUrl: existing?.fallbackBaseUrl,
        activeVia: existing?.activeVia || via,
      });
      onChange?.();
    });
    browser.on("down", (service: { txt?: Record<string, string> }) => {
      const id = String(service.txt?.id ?? "");
      if (!id) return;
      const existing = remoteDevices.get(id);
      if (!existing) return;
      // Never wipe manual / Cloudflare / Tailscale peers when LAN Bonjour drops
      if (existing.baseUrl || existing.fallbackHost || existing.via === "cloudflare") {
        remoteDevices.set(id, { ...existing, online: false });
      } else {
        remoteDevices.delete(id);
      }
      onChange?.();
    });
  } catch (err) {
    console.warn(
      "[porter] Bonjour discovery unavailable; local mode still works.",
      err instanceof Error ? err.message : err,
    );
    try {
      bonjour?.destroy();
    } catch {
      // ignore
    }
    bonjour = null;
  }
}

export function stopDiscovery(): void {
  bonjour?.destroy();
  bonjour = null;
  remoteDevices.clear();
}

export function listDevices(): DeviceInfo[] {
  const config = loadConfig();
  const local = localDevice(config);
  const remotes = [...remoteDevices.values()];
  return [local, ...remotes];
}

export function getDevice(id: string): DeviceInfo | undefined {
  const config = loadConfig();
  if (id === config.deviceId || id === "local") return localDevice(config);
  return remoteDevices.get(id);
}

export function localLanHint(): string {
  const addrs = lanAddresses();
  return addrs[0] ?? "127.0.0.1";
}

export function networkInfo() {
  const ts = getTailscaleStatus();
  const lan = lanAddresses();
  const bonjourDisabled = process.env.PORTER_NO_BONJOUR === "1";
  const remotes = [...remoteDevices.values()];
  return {
    lanIps: lan,
    primaryLan: lan[0] ?? null,
    tailscale: {
      available: Boolean(ts.selfIp),
      selfIp: ts.selfIp ?? null,
      peerCount: ts.peerIps.size,
    },
    bonjour: {
      enabled: !bonjourDisabled && bonjour !== null,
      disabledByEnv: bonjourDisabled,
      discoveredPeers: remotes.length,
    },
    devices: listDevices().map((d) => ({
      id: d.id,
      name: d.name,
      via: d.via,
      host: d.host,
      online: d.online,
    })),
    guidance: [
      "Same Wi‑Fi / LAN is usually fastest (often 50–900+ Mbps on Gigabit).",
      "Tailscale works off-LAN but adds latency — Porter prefers 100.x when Tailscale is up.",
      "Large folders use parallel file pulls (4 at a time) + 2 MiB chunks.",
      bonjourDisabled
        ? "Bonjour auto-discovery is off for stability on this Mac; add peers via same pair token + Tailscale/LAN IP when needed."
        : "Bonjour advertises this Mac on the LAN automatically.",
    ],
  };
}
