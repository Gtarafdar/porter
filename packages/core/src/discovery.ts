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
      remoteDevices.set(p.id, { ...p, online: true });
    }
  } catch {
    // ignore
  }
}

export function registerManualPeer(input: {
  id: string;
  name: string;
  host: string;
  port: number;
}): DeviceInfo {
  const via = input.host.startsWith("100.") ? "tailscale" : "lan";
  const device: DeviceInfo = {
    id: input.id,
    name: input.name,
    host: input.host,
    port: input.port,
    online: true,
    isLocal: false,
    via,
  };
  remoteDevices.set(input.id, device);
  persistManualPeers();
  return device;
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
      remoteDevices.set(id, {
        id,
        name: String(service.txt?.deviceName ?? service.name),
        host: preferHost,
        port: service.port,
        online: true,
        isLocal: false,
        via,
      });
      onChange?.();
    });
    browser.on("down", (service: { txt?: Record<string, string> }) => {
      const id = String(service.txt?.id ?? "");
      if (id) {
        remoteDevices.delete(id);
        onChange?.();
      }
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
