export interface DeviceInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  online: boolean;
  isLocal: boolean;
  via: "local" | "lan" | "tailscale";
}

export interface SharedFolder {
  id: string;
  path: string;
  label: string;
  permissions: string[];
}

export interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  extension?: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  action: string;
  detail: string;
  source?: string;
  ok: boolean;
}

export interface DeviceSettings {
  id: string;
  name: string;
  port: number;
  sleepAfterMinutes: number;
  allowSecretFiles: boolean;
  requireConfirmWrites: boolean;
  token: string;
  lan: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

export const porter = {
  devices: () => api<DeviceInfo[]>("/api/devices"),
  device: () => api<DeviceSettings>("/api/device"),
  updateDevice: (body: Partial<DeviceSettings> & { deviceName?: string; token?: string }) =>
    api<{ ok: boolean }>("/api/device", { method: "PATCH", body: JSON.stringify(body) }),
  folders: (deviceId = "local") =>
    api<SharedFolder[]>(`/api/folders?deviceId=${encodeURIComponent(deviceId)}`),
  addFolder: (path: string, label?: string, write = false) =>
    api<SharedFolder>("/api/folders", {
      method: "POST",
      body: JSON.stringify({
        path,
        label,
        permissions: write ? ["read", "copy", "write"] : ["read", "copy"],
      }),
    }),
  removeFolder: (id: string) =>
    api<{ ok: boolean }>(`/api/folders/${id}`, { method: "DELETE" }),
  list: (deviceId: string, path: string) =>
    api<FileEntry[]>(
      `/api/files/list?deviceId=${encodeURIComponent(deviceId)}&path=${encodeURIComponent(path)}`,
    ),
  search: (deviceId: string, q: string) =>
    api<unknown[]>(
      `/api/files/search?deviceId=${encodeURIComponent(deviceId)}&q=${encodeURIComponent(q)}`,
    ),
  copy: (body: {
    sourceDeviceId: string;
    sourcePath: string;
    destDeviceId: string;
    destPath: string;
    isDirectory?: boolean;
  }) => api<{ ok: boolean }>("/api/files/copy", { method: "POST", body: JSON.stringify(body) }),
  activity: () => api<ActivityEvent[]>("/api/activity"),
  kill: () => api<{ ok: boolean }>("/api/kill", { method: "POST", body: "{}" }),
  setToken: (token: string) =>
    api<{ ok: boolean }>("/api/pair/token", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
};
