import type { DeviceInfo, FileEntry, SearchHit, SharedFolder } from "@porter/protocol";
import {
  getDevice,
  listDevices,
  localLanHint,
  networkInfo,
  noteSeenPeer,
  registerManualPeer,
  updatePeerActivePath,
} from "./discovery.js";
import fs from "node:fs";
import path from "node:path";
import {
  appendActivity,
  humanError,
  loadConfig,
  saveConfig,
  sanitizePeerBody,
} from "./config.js";

/** Resolve http(s) base for a peer (LAN / Tailscale / Cloudflare). */
export function deviceBaseUrl(device: DeviceInfo): string {
  if (device.baseUrl) return device.baseUrl.replace(/\/$/, "");
  if (device.via === "cloudflare" || device.port === 443) {
    return `https://${device.host}`;
  }
  return `http://${device.host}:${device.port}`;
}

export function deviceFallbackBaseUrl(device: DeviceInfo): string | null {
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

/** Ordered bases: Tailscale first (reliable), then LAN, Cloudflare last (Quick Tunnel URLs die often). */
export function peerBases(device: DeviceInfo): string[] {
  const primary = deviceBaseUrl(device);
  const fallback = deviceFallbackBaseUrl(device);
  const all = [...new Set([primary, fallback].filter(Boolean) as string[])];

  const isTs = (b: string) => /(?:^|\/\/|@)100\.\d+\.\d+\.\d+/.test(b) || b.includes("100.");
  const isCf = (b: string) =>
    b.startsWith("https://") ||
    b.includes(".trycloudflare.com") ||
    b.includes(".cfargotunnel.com");

  const ts = all.filter(isTs);
  const lan = all.filter((b) => !isTs(b) && !isCf(b));
  const cf = all.filter(isCf);

  // If last success was LAN and we're on same network, try LAN before Tailscale
  if (device.activeVia === "lan" && lan.length) {
    return [...new Set([...lan, ...ts, ...cf])];
  }
  return [...new Set([...ts, ...lan, ...cf])];
}

export function parsePeerAddress(input: string, defaultPort = 47831): {
  host: string;
  port: number;
  baseUrl?: string;
  via: "lan" | "tailscale" | "cloudflare";
} {
  const raw = input.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw);
    const isCf =
      u.hostname.endsWith(".trycloudflare.com") ||
      u.hostname.endsWith(".cfargotunnel.com");
    const port = u.port
      ? Number(u.port)
      : u.protocol === "https:"
        ? 443
        : 80;
    return {
      host: u.hostname,
      port,
      baseUrl: `${u.protocol}//${u.host}`,
      via: isCf || u.protocol === "https:" ? "cloudflare" : "lan",
    };
  }
  // host:port or bare host / Tailscale IP
  const [hostPart, portPart] = raw.includes(":")
    ? (() => {
        const idx = raw.lastIndexOf(":");
        return [raw.slice(0, idx), raw.slice(idx + 1)];
      })()
    : [raw, String(defaultPort)];
  const host = hostPart.trim();
  const port = Number(portPart) || defaultPort;
  const via = host.startsWith("100.")
    ? "tailscale"
    : host.endsWith(".trycloudflare.com")
      ? "cloudflare"
      : "lan";
  const baseUrl =
    via === "cloudflare" ? `https://${host}` : undefined;
  return { host, port, baseUrl, via };
}

function viaForBase(base: string, device: DeviceInfo): DeviceInfo["activeVia"] {
  if (base.startsWith("https")) return "cloudflare";
  if (base.includes("100.")) return "tailscale";
  if (device.via === "tailscale" || device.fallbackHost?.startsWith("100.")) {
    if (base.includes(device.fallbackHost || "___")) return "tailscale";
  }
  if (device.host.startsWith("100.")) return "tailscale";
  return device.via === "cloudflare" ? "cloudflare" : device.via === "tailscale" ? "tailscale" : "lan";
}

async function peerFetch(
  device: DeviceInfo,
  apiPath: string,
  init?: RequestInit,
): Promise<Response> {
  const config = loadConfig();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${config.token}`);
  headers.set("X-Porter-Device", config.deviceId);
  headers.set("X-Porter-Pair", config.token);
  headers.set("X-Porter-Device-Name", config.deviceName);
  try {
    const net = networkInfo();
    if (net.primaryLan) headers.set("X-Porter-Reply-Lan", net.primaryLan);
    if (net.tailscale.selfIp) headers.set("X-Porter-Reply-Tailscale", net.tailscale.selfIp);
  } catch {
    const lan = localLanHint();
    if (lan) headers.set("X-Porter-Reply-Lan", lan);
  }

  const bases = peerBases(device);
  let lastErr: unknown;
  for (const base of bases) {
    const isCf = base.startsWith("https://") || base.includes("trycloudflare");
    try {
      const res = await fetch(`${base}${apiPath}`, {
        ...init,
        headers,
        // Cloudflare Quick Tunnels often hang; fail over to Tailscale faster
        signal: AbortSignal.timeout(isCf ? 20_000 : 120_000),
      });
      const ct = res.headers.get("content-type") || "";
      // Never treat HTML error pages as a successful API response
      if (ct.includes("text/html") && apiPath.startsWith("/api/")) {
        lastErr = new Error(sanitizePeerBody(await res.text()));
        continue;
      }
      if (res.ok || (res.status < 500 && res.status !== 404)) {
        updatePeerActivePath(device.id, viaForBase(base, device) || "lan", base);
        return res;
      }
      lastErr = new Error(sanitizePeerBody(await res.text()));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? new Error(humanError(lastErr))
    : new Error("All peer paths failed");
}

export async function remoteListFolders(deviceId: string): Promise<SharedFolder[]> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const res = await peerFetch(device, "/api/folders");
  if (!res.ok) throw new Error(humanError(new Error(sanitizePeerBody(await res.text()))));
  return (await res.json()) as SharedFolder[];
}

export async function remoteListDirectory(
  deviceId: string,
  dirPath: string,
): Promise<FileEntry[]> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const res = await peerFetch(
    device,
    `/api/files/list?path=${encodeURIComponent(dirPath)}`,
  );
  if (!res.ok) throw new Error(humanError(new Error(sanitizePeerBody(await res.text()))));
  return (await res.json()) as FileEntry[];
}

export async function remoteSearch(deviceId: string, query: string): Promise<SearchHit[]> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const res = await peerFetch(
    device,
    `/api/files/search?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) throw new Error(humanError(new Error(sanitizePeerBody(await res.text()))));
  return (await res.json()) as SearchHit[];
}

export async function remoteReadFile(
  deviceId: string,
  filePath: string,
): Promise<{ path: string; content: string; truncated: boolean; size: number }> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const res = await peerFetch(
    device,
    `/api/files/read?path=${encodeURIComponent(filePath)}`,
  );
  if (!res.ok) throw new Error(humanError(new Error(sanitizePeerBody(await res.text()))));
  return (await res.json()) as {
    path: string;
    content: string;
    truncated: boolean;
    size: number;
  };
}

export async function remoteDownloadToLocal(
  deviceId: string,
  remotePath: string,
  localDest: string,
): Promise<{ bytes: number }> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const res = await peerFetch(
    device,
    `/api/files/download?path=${encodeURIComponent(remotePath)}`,
  );
  if (!res.ok) {
    throw new Error(humanError(new Error(sanitizePeerBody(await res.text()))));
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const { assertAllowed } = await import("./files.js");
  assertAllowed(path.dirname(localDest), "write");
  fs.mkdirSync(path.dirname(localDest), { recursive: true });
  fs.writeFileSync(localDest, buf);
  return { bytes: buf.length };
}

/** Push a local file onto a remote Porter (remote must allow write on dest folder). */
export async function remoteUploadFromLocal(
  deviceId: string,
  localPath: string,
  remoteDest: string,
): Promise<{ bytes: number }> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const { assertAllowed } = await import("./files.js");
  assertAllowed(localPath, "copy");
  const buf = fs.readFileSync(localPath);
  const res = await peerFetch(
    device,
    `/api/files/upload?path=${encodeURIComponent(remoteDest)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buf,
    },
  );
  if (!res.ok) {
    throw new Error(humanError(new Error(sanitizePeerBody(await res.text()))));
  }
  return { bytes: buf.length };
}

async function pingPeerUrl(
  baseUrl: string,
): Promise<{ ok: boolean; deviceId?: string; deviceName?: string }> {
  const config = loadConfig();
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/health`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return { ok: false };
  const data = (await res.json()) as {
    ok?: boolean;
    deviceId?: string;
    deviceName?: string;
  };
  const folders = await fetch(`${root}/api/folders`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      "X-Porter-Device": config.deviceId,
      "X-Porter-Pair": config.token,
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!folders.ok) {
    throw new Error(
      "Peer reachable but pair token rejected. Use the same token on both Macs.",
    );
  }
  return { ok: true, deviceId: data.deviceId, deviceName: data.deviceName };
}

export async function pingPeer(
  host: string,
  port: number,
): Promise<{ ok: boolean; deviceId?: string; deviceName?: string }> {
  const parsed = parsePeerAddress(
    host.includes("://") ? host : `${host}:${port}`,
    port,
  );
  return pingPeerUrl(parsed.baseUrl ?? `http://${parsed.host}:${parsed.port}`);
}

export async function addPeerByAddress(
  host: string,
  port: number,
  label?: string,
  fallback?: string,
): Promise<DeviceInfo> {
  const cleaned = host
    .trim()
    .replace(/^primary:\s*/i, "")
    .replace(/^fallback:\s*/i, "")
    .replace(/^["']|["']$/g, "");
  const parsed = parsePeerAddress(
    cleaned.includes("://") || cleaned.includes(".trycloudflare.com")
      ? cleaned
      : `${cleaned}:${port}`,
    port,
  );
  let ping: { ok: boolean; deviceId?: string; deviceName?: string } = { ok: false };
  try {
    ping = await pingPeerUrl(
      parsed.baseUrl ?? `http://${parsed.host}:${parsed.port}`,
    );
  } catch {
    ping = { ok: false };
  }

  let fallbackHost: string | undefined;
  let fallbackPort: number | undefined;
  let fallbackBaseUrl: string | undefined;
  if (fallback?.trim()) {
    const fb = parsePeerAddress(fallback.trim(), 47831);
    try {
      await pingPeerUrl(fb.baseUrl ?? `http://${fb.host}:${fb.port}`);
    } catch {
      // still store — may come online later
    }
    fallbackHost = fb.host;
    fallbackPort = fb.port;
    fallbackBaseUrl = fb.baseUrl;
  }

  const reachable = Boolean(ping.ok && ping.deviceId);
  const id =
    ping.deviceId ||
    `pending-${parsed.via}-${parsed.host}`.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 96);

  const device = registerManualPeer({
    id,
    name: label || ping.deviceName || parsed.host,
    host: parsed.host,
    port: parsed.port,
    via: parsed.via,
    baseUrl: parsed.baseUrl,
    fallbackHost,
    fallbackPort,
    fallbackBaseUrl,
    activeVia: parsed.via,
  });
  appendActivity(
    "peer_add",
    `${device.name} @ ${device.baseUrl || `${parsed.host}:${parsed.port}`}${
      fallbackHost ? ` (fallback ${fallbackBaseUrl || fallbackHost})` : ""
    }${reachable ? "" : " (saved offline — not reachable yet)"}`,
    reachable,
    "ui",
    {
      humanMessage: reachable
        ? `Connected to ${device.name}`
        : `Saved ${device.name} but could not reach it yet — check Home is online / URL is current`,
    },
  );
  return device;
}

export function authorizePeer(
  authHeader: string | undefined,
  peerId: string | undefined,
  pairHeader: string | undefined,
  meta?: {
    name?: string;
    replyLan?: string;
    replyTailscale?: string;
  },
): boolean {
  const config = loadConfig();
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const pair = pairHeader?.trim() || bearer;

  if (pair && pair === config.token) {
    if (peerId && !config.pairedDeviceIds.includes(peerId)) {
      config.pairedDeviceIds.push(peerId);
      saveConfig(config);
    }
    if (peerId) {
      noteSeenPeer({
        id: peerId,
        name: meta?.name,
        replyLan: meta?.replyLan,
        replyTailscale: meta?.replyTailscale,
      });
    }
    return true;
  }

  // Dangerous opt-in only. Never set in LaunchAgent / packaged app.
  if (
    process.env.PORTER_OPEN_LAN === "1" &&
    process.env.PORTER_I_UNDERSTAND_OPEN_LAN === "1"
  ) {
    console.warn(
      "[porter] WARNING: PORTER_OPEN_LAN is enabled — peer auth is disabled. Do not use on untrusted networks.",
    );
    return true;
  }

  return Boolean(
    peerId &&
      config.pairedDeviceIds.includes(peerId) &&
      bearer &&
      bearer.length >= 16,
  );
}

export function setSharedToken(token: string): void {
  const config = loadConfig();
  config.token = token.trim();
  saveConfig(config);
}

export function listKnownDevices(): DeviceInfo[] {
  return listDevices();
}
