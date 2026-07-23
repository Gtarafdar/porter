export type PermissionMode = "read" | "copy" | "write" | "sync";

export interface DeviceInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  online: boolean;
  isLocal: boolean;
  via: "local" | "lan" | "tailscale" | "cloudflare";
  /** Full base URL for HTTPS tunnels (Cloudflare). When set, host/port are informational. */
  baseUrl?: string;
  /**
   * Backup path when primary fails (e.g. Cloudflare down → Tailscale IP).
   * Travel Macs should set Cloudflare as primary and Tailscale as fallback for unattended home.
   */
  fallbackHost?: string;
  fallbackPort?: number;
  fallbackBaseUrl?: string;
  /** Which path last succeeded. */
  activeVia?: "lan" | "tailscale" | "cloudflare";
}

export interface SharedFolder {
  id: string;
  path: string;
  label: string;
  permissions: PermissionMode[];
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

export interface SearchHit {
  path: string;
  relativePath: string;
  name: string;
  isDirectory: boolean;
  folderId: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  action: string;
  detail: string;
  source?: string;
  ok: boolean;
}

export interface CopyRequest {
  sourceDeviceId: string;
  sourcePath: string;
  destDeviceId: string;
  destPath: string;
}

export interface ApiError {
  error: string;
  code?: string;
}

export const DANGEROUS_PATH_FRAGMENTS = [
  "Library/Keychains",
  "Library/Cookies",
  ".ssh",
  ".gnupg",
  "Chrome/Default",
  "Google/Chrome",
  "Application Support/Google/Chrome",
  "Application Support/Slack",
] as const;

export const DEFAULT_SECRET_GLOBS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.p12",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  ".npmrc",
] as const;
