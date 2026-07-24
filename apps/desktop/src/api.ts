export interface DeviceInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  online: boolean;
  isLocal: boolean;
  via: "local" | "lan" | "tailscale" | "cloudflare";
  baseUrl?: string;
  fallbackHost?: string;
  fallbackPort?: number;
  fallbackBaseUrl?: string;
  activeVia?: "lan" | "tailscale" | "cloudflare";
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
  humanMessage?: string;
  durationMs?: number;
  bytes?: number;
  mbps?: number;
  via?: string;
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
  sleeping?: boolean;
  wizardCompleted?: boolean;
}

export interface SetupSnapshot {
  completed: boolean;
  step: number;
  deviceName: string;
  deviceId: string;
  hasSharedFolder: boolean;
  hasWriteFolder: boolean;
  token: string;
  agentLinkAcknowledged: boolean;
  mcpInstalled: boolean;
  schemaVersion?: number;
  tailscaleSkipped?: boolean;
  sleeping: boolean;
  mcpEntryPath: string;
  mcpSnippet: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    const clipped = text.replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(
      res.ok
        ? `Bad response from Porter (${clipped || "empty"})`
        : clipped || res.statusText || `HTTP ${res.status}`,
    );
  }
  if (!res.ok) throw new Error(String(data.error || res.statusText || `HTTP ${res.status}`));
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
  /** Native Mac window Finder folder picker (falls back to null in plain browser). */
  pickFolder: () => pickFolderNative(),
  canPickFolder: () => canPickFolderNative(),
  list: (deviceId: string, path: string) =>
    api<FileEntry[]>(
      `/api/files/list?deviceId=${encodeURIComponent(deviceId)}&path=${encodeURIComponent(path)}`,
    ),
  search: (deviceId: string, q: string) =>
    api<
      {
        path: string;
        relativePath: string;
        name: string;
        isDirectory: boolean;
        folderId?: string;
      }[]
    >(
      `/api/files/search?deviceId=${encodeURIComponent(deviceId)}&q=${encodeURIComponent(q)}`,
    ),
  copy: (body: {
    sourceDeviceId: string;
    sourcePath: string;
    destDeviceId: string;
    destPath: string;
    isDirectory?: boolean;
  }) =>
    api<{
      ok: boolean;
      warning?: string;
      result?: {
        bytes?: number;
        mbps?: number;
        ms?: number;
        files?: number;
        sha256?: string;
        skipped?: number;
      };
    }>("/api/files/copy", { method: "POST", body: JSON.stringify(body) }),
  network: () =>
    api<{
      primaryLan: string | null;
      tailscale: { available: boolean; selfIp: string | null };
      bonjour: { enabled: boolean; disabledByEnv: boolean };
      guidance: string[];
    }>("/api/network"),
  activity: () => api<ActivityEvent[]>("/api/activity"),
  kill: () => api<{ ok: boolean }>("/api/kill", { method: "POST", body: "{}" }),
  setToken: (token: string) =>
    api<{ ok: boolean }>("/api/pair/token", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  addPeer: (host: string, port = 47831, name?: string, fallback?: string) =>
    api<DeviceInfo>("/api/peers", {
      method: "POST",
      body: JSON.stringify({ host, port, name, fallback: fallback || undefined }),
    }),
  startTunnel: () =>
    api<{ ok: boolean; publicUrl?: string; cloudflaredInstalled?: boolean }>(
      "/api/tunnel/start",
      { method: "POST", body: "{}" },
    ),
  stopTunnel: () =>
    api<{ ok: boolean }>("/api/tunnel/stop", { method: "POST", body: "{}" }),
  tunnelStatus: () =>
    api<{
      running: boolean;
      publicUrl: string | null;
      cloudflaredInstalled: boolean;
    }>("/api/tunnel"),
  setAndForget: (alsoStartCloudflare = false) =>
    api<{
      ok: boolean;
      tunnelUrl: string | null;
      serveUrl?: string | null;
      warnings: string[];
      keepalive: { ok: boolean; detail: string };
      folders: { added: string[]; skipped: string[] };
    }>("/api/away/set-and-forget", {
      method: "POST",
      body: JSON.stringify({ alsoStartCloudflare }),
    }),
  repairTravel: () =>
    api<{
      ok: boolean;
      warnings: string[];
      serveUrl?: string | null;
      keepalive: { ok: boolean; detail: string };
    }>("/api/away/repair", { method: "POST", body: "{}" }),
  openTailscaleDownload: () =>
    api<{ ok: boolean; url: string; note: string }>("/api/away/open-tailscale", {
      method: "POST",
      body: "{}",
    }),
  openTailscaleApp: () =>
    api<{ ok: boolean; detail: string }>("/api/away/open-tailscale-app", {
      method: "POST",
      body: "{}",
    }),
  openTailscaleSshSettings: () =>
    api<{ ok: boolean; detail: string }>("/api/away/open-tailscale-ssh", {
      method: "POST",
      body: "{}",
    }),
  openTailscaleSignup: () =>
    api<{ ok: boolean; url: string; note: string }>("/api/away/open-tailscale-signup", {
      method: "POST",
      body: "{}",
    }),
  tailscalePeers: () =>
    api<{
      peers: {
        name: string;
        hostName: string;
        dnsName: string | null;
        ip: string | null;
        online: boolean;
        porterUrl: string;
      }[];
    }>("/api/tailscale/peers"),
  startTailscaleServe: () =>
    api<{ ok: boolean; url: string | null; detail: string }>("/api/tailscale/serve/start", {
      method: "POST",
      body: "{}",
    }),
  chromeStatus: () =>
    api<{
      chromeRunning: boolean;
      hasExtensions: boolean;
      hasLocalSettings: boolean;
      readyToShare: boolean;
      note: string;
      shared: SharedFolder[];
      sharedExtensions?: boolean;
      sharedExtensionData?: boolean;
      paths: { extensions: string; localSettings: string };
      extensionIds?: string[];
      dataIds?: string[];
      steps?: { id: string; title: string; detail: string; done: boolean }[];
      chromeRoot?: string;
    }>("/api/chrome/status"),
  shareChromeExtensions: () =>
    api<{ ok: boolean; added: string[]; skipped: string[]; warning: string }>(
      "/api/chrome/share",
      { method: "POST", body: "{}" },
    ),
  revealChromeFolder: (which: "extensions" | "data" | "root" = "data") =>
    api<{ ok: boolean; path: string; note: string }>("/api/chrome/reveal", {
      method: "POST",
      body: JSON.stringify({ which }),
    }),
  checkUpdate: (refresh = false) =>
    api<{
      ok: boolean;
      currentVersion: string;
      latestVersion: string | null;
      updateAvailable: boolean;
      downloadUrl: string | null;
      assetName: string | null;
      releaseUrl: string | null;
      notes: string | null;
      arch: string;
      canAutoInstall: boolean;
      appPath: string | null;
      message: string;
      githubAuth?: boolean;
    }>(`/api/updates/check${refresh ? "?refresh=1" : ""}`),
  githubUpdateAuth: () =>
    api<{ configured: boolean; source: string | null }>("/api/updates/github-auth"),
  saveGithubUpdateToken: (token: string) =>
    api<{ ok: boolean; detail: string; configured: boolean; source: string | null }>(
      "/api/updates/github-token",
      { method: "POST", body: JSON.stringify({ token }) },
    ),
  applyUpdate: () =>
    api<{ ok: boolean; message: string; willRelaunch: boolean }>("/api/updates/apply", {
      method: "POST",
      body: "{}",
    }),
  syncOneWay: (body: { sourcePath: string; destDeviceId: string; destPath: string }) =>
    api<{ ok: boolean; result?: { files: number; mbps: number; ms: number } }>(
      "/api/sync/one-way",
      { method: "POST", body: JSON.stringify(body) },
    ),
  setup: () => api<SetupSnapshot>("/api/setup"),
  updateSetup: (body: {
    step?: number;
    completed?: boolean;
    agentLinkAcknowledged?: boolean;
    tailscaleSkipped?: boolean;
  }) =>
    api<SetupSnapshot>("/api/setup", { method: "PATCH", body: JSON.stringify(body) }),
  tailscaleSetupStatus: () =>
    api<{
      installed: boolean;
      connected: boolean;
      selfIp: string | null;
      sshLikelyEnabled: boolean | null;
      detail: string;
    }>("/api/tailscale/setup-status"),
  installCursorMcp: () =>
    api<{ ok: boolean; path: string; alreadyPresent: boolean; merged: boolean }>(
      "/api/mcp/install-cursor",
      { method: "POST", body: "{}" },
    ),
  sleep: () => api<{ ok: boolean }>("/api/sleep", { method: "POST", body: "{}" }),
  wake: () => api<{ ok: boolean }>("/api/wake", { method: "POST", body: "{}" }),
  travelReady: () =>
    api<{
      ready: boolean;
      unattendedReady?: boolean;
      deviceName: string;
      pairToken: string;
      tailscaleIp: string | null;
      serveUrl?: string | null;
      serveConfigured?: boolean;
      cloudflareUrl: string | null;
      peerAddress: string | null;
      fallbackAddress: string | null;
      lanIp: string | null;
      port: number;
      checks: { id: string; label: string; ok: boolean; detail: string }[];
      travelSteps: string[];
      safetyNote: string;
      keepAliveInstalled?: boolean;
      reviveCommand?: string;
      sshEnabled?: boolean | null;
      remoteLoginEnabled?: boolean | null;
      tailscaleSshSupported?: boolean;
      tunnel: {
        running: boolean;
        publicUrl: string | null;
        cloudflaredInstalled: boolean;
        wantRunning?: boolean;
        restartAttempts?: number;
      };
    }>("/api/travel-ready"),
  shareTravelPresets: () =>
    api<{ ok: boolean; added: string[]; skipped: string[] }>("/api/travel-presets", {
      method: "POST",
      body: "{}",
    }),
};

type PorterNativeWindow = Window & {
  __porterNative?: boolean;
  __porterPickFolder?: () => Promise<string | null>;
  __porterPickFolderResolve?: ((path: string | null) => void) | null;
  webkit?: { messageHandlers?: { porter?: { postMessage: (msg: unknown) => void } } };
};

export function canPickFolderNative(): boolean {
  const w = window as PorterNativeWindow;
  return Boolean(w.__porterNative || w.webkit?.messageHandlers?.porter || w.__porterPickFolder);
}

/** Opens the Mac Finder folder chooser when running inside Porter.app. */
export function pickFolderNative(): Promise<string | null> {
  const w = window as PorterNativeWindow;
  if (typeof w.__porterPickFolder === "function") {
    return w.__porterPickFolder();
  }
  if (w.webkit?.messageHandlers?.porter) {
    return new Promise((resolve) => {
      w.__porterPickFolderResolve = resolve;
      w.webkit!.messageHandlers!.porter!.postMessage({ type: "pickFolder" });
    });
  }
  return Promise.resolve(null);
}
