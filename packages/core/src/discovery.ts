import Bonjour from "bonjour-service";
import type { DeviceInfo } from "@porter/protocol";
import { loadConfig, localDevice } from "./config.js";
import os from "node:os";
import { execSync } from "node:child_process";

const SERVICE_TYPE = "porter";
let bonjour: InstanceType<typeof Bonjour> | null = null;
const remoteDevices = new Map<string, DeviceInfo>();

function getTailscaleIps(): Set<string> {
  try {
    const out = execSync("tailscale ip -4 2>/dev/null || true", {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
    if (!out) return new Set();
    return new Set(out.split(/\s+/).filter(Boolean));
  } catch {
    return new Set();
  }
}

function lanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

export function startDiscovery(onChange?: () => void): void {
  if (bonjour) return;
  const config = loadConfig();
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
    const ts = getTailscaleIps();
    const via =
      host.startsWith("100.") || [...ts].some((ip) => host === ip)
        ? "tailscale"
        : "lan";
    remoteDevices.set(id, {
      id,
      name: String(service.txt?.deviceName ?? service.name),
      host,
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
