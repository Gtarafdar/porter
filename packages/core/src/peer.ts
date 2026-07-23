import type { DeviceInfo, FileEntry, SearchHit, SharedFolder } from "@porter/protocol";
import { getDevice, listDevices, registerManualPeer } from "./discovery.js";
import fs from "node:fs";
import path from "node:path";
import {
  appendActivity,
  loadConfig,
  saveConfig,
} from "./config.js";

async function peerFetch(
  device: DeviceInfo,
  apiPath: string,
  init?: RequestInit,
): Promise<Response> {
  const config = loadConfig();
  const url = `http://${device.host}:${device.port}${apiPath}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${config.token}`);
  headers.set("X-Porter-Device", config.deviceId);
  headers.set("X-Porter-Pair", config.token);
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(120_000) });
}

export async function remoteListFolders(deviceId: string): Promise<SharedFolder[]> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const res = await peerFetch(device, "/api/folders");
  if (!res.ok) throw new Error(await res.text());
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
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as FileEntry[];
}

export async function remoteSearch(deviceId: string, query: string): Promise<SearchHit[]> {
  const device = getDevice(deviceId);
  if (!device || device.isLocal) throw new Error("Remote device not found");
  const res = await peerFetch(
    device,
    `/api/files/search?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) throw new Error(await res.text());
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
  if (!res.ok) throw new Error(await res.text());
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
  if (!res.ok) throw new Error(await res.text());
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
  if (!res.ok) throw new Error(await res.text());
  return { bytes: buf.length };
}

export async function pingPeer(
  host: string,
  port: number,
): Promise<{ ok: boolean; deviceId?: string; deviceName?: string }> {
  const config = loadConfig();
  const res = await fetch(`http://${host}:${port}/api/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return { ok: false };
  const data = (await res.json()) as {
    ok?: boolean;
    deviceId?: string;
    deviceName?: string;
  };
  const folders = await fetch(`http://${host}:${port}/api/folders`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      "X-Porter-Device": config.deviceId,
      "X-Porter-Pair": config.token,
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!folders.ok) {
    throw new Error(
      "Peer reachable but pair token rejected. Use the same token on both Macs.",
    );
  }
  return { ok: true, deviceId: data.deviceId, deviceName: data.deviceName };
}

export async function addPeerByAddress(
  host: string,
  port: number,
  label?: string,
): Promise<DeviceInfo> {
  const ping = await pingPeer(host, port);
  if (!ping.ok || !ping.deviceId) throw new Error("Could not reach peer health endpoint");
  const device = registerManualPeer({
    id: ping.deviceId,
    name: label || ping.deviceName || host,
    host,
    port,
  });
  appendActivity("peer_add", `${device.name} @ ${host}:${port}`, true, "ui");
  return device;
}

export function authorizePeer(
  authHeader: string | undefined,
  peerId: string | undefined,
  pairHeader: string | undefined,
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
    return true;
  }

  if (process.env.PORTER_OPEN_LAN === "1") return true;

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
