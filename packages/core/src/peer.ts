import type { DeviceInfo, FileEntry, SearchHit, SharedFolder } from "@porter/protocol";
import { loadConfig, saveConfig } from "./config.js";
import { getDevice } from "./discovery.js";

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
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(60_000) });
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
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { assertAllowed } = await import("./files.js");
  assertAllowed(path.dirname(localDest), "write");
  fs.mkdirSync(path.dirname(localDest), { recursive: true });
  fs.writeFileSync(localDest, buf);
  return { bytes: buf.length };
}

/**
 * Personal LAN auth: devices that share the same pair secret (token copied once)
 * or that have been explicitly paired. Set the same token on both Macs via UI.
 */
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

  // Shared household secret: identical token on both machines
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
