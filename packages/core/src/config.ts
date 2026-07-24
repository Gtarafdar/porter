import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import type { ActivityEvent, DeviceInfo, PermissionMode, SharedFolder } from "@porter/protocol";

const HOME = os.homedir();
export const PORTER_DIR = path.join(HOME, ".porter");
export const CONFIG_PATH = path.join(PORTER_DIR, "config.json");
export const ACTIVITY_PATH = path.join(PORTER_DIR, "activity.json");
export const PAIRING_PATH = path.join(PORTER_DIR, "pairing.json");

export interface WizardState {
  completed: boolean;
  step: number;
  agentLinkAcknowledged: boolean;
  mcpInstalled: boolean;
  /** Bump when wizard step layout changes (Tailscale step inserted). */
  schemaVersion?: number;
  /** User chose same-Wi‑Fi only (skipped Tailscale gate). */
  tailscaleSkipped?: boolean;
}

export const WIZARD_SCHEMA_VERSION = 2;

export interface PorterConfig {
  deviceId: string;
  deviceName: string;
  port: number;
  sharedFolders: SharedFolder[];
  sleepAfterMinutes: number;
  allowSecretFiles: boolean;
  requireConfirmWrites: boolean;
  pairedDeviceIds: string[];
  /**
   * Device IDs intentionally removed from this Mac’s list.
   * Blocks Bonjour / noteSeenPeer re-add until the user Adds that Mac again.
   */
  forgottenDeviceIds: string[];
  token: string;
  wizard: WizardState;
  sleeping: boolean;
  /** Last Cloudflare Quick Tunnel URL (home Mac), if started. */
  tunnelUrl?: string | null;
  /**
   * Unattended away-mode (home Mac). When enabled:
   * - keep Mac awake while Porter runs (caffeinate)
   * - LaunchAgent restarts Porter on crash
   * - prefer Tailscale Serve (private MagicDNS) for travel
   * - optional Cloudflare Quick Tunnel (advanced; URLs can change)
   */
  awayMode?: {
    enabled: boolean;
    autoStartTunnel: boolean;
    preventSleep: boolean;
    keepAliveInstalled: boolean;
    /** Prefer private Tailscale Serve over public Quick Tunnel for travel. */
    preferTailscaleServe?: boolean;
    /** Last known Tailscale Serve HTTPS URL (MagicDNS). */
    serveUrl?: string | null;
  };
}

function defaultName(): string {
  return os.hostname().replace(/\.local$/i, "") || "Mac";
}

export function ensurePorterDir(): void {
  if (!fs.existsSync(PORTER_DIR)) {
    fs.mkdirSync(PORTER_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(): PorterConfig {
  ensurePorterDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    const config: PorterConfig = {
      deviceId: createHash("sha256").update(randomBytes(32)).digest("hex").slice(0, 16),
      deviceName: defaultName(),
      port: 47831,
      sharedFolders: [],
      sleepAfterMinutes: 5,
      allowSecretFiles: false,
      requireConfirmWrites: true,
      pairedDeviceIds: [],
      forgottenDeviceIds: [],
      token: randomBytes(24).toString("hex"),
      wizard: {
        completed: false,
        step: 0,
        agentLinkAcknowledged: false,
        mcpInstalled: false,
        schemaVersion: WIZARD_SCHEMA_VERSION,
        tailscaleSkipped: false,
      },
      sleeping: false,
      tunnelUrl: null,
      awayMode: {
        enabled: false,
        autoStartTunnel: false,
        preventSleep: false,
        keepAliveInstalled: false,
        preferTailscaleServe: true,
        serveUrl: null,
      },
    };
    saveConfig(config);
    return config;
  }
  const loaded = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<PorterConfig>;
  // Migrate older configs without breaking existing installs
  let wizardStep = loaded.wizard?.step ?? 0;
  let schemaVersion = loaded.wizard?.schemaVersion ?? 1;
  // Schema 2 inserted Tailscale at step 3 — bump mid-wizard users past the insertion point once
  if (!loaded.wizard?.completed && schemaVersion < WIZARD_SCHEMA_VERSION && wizardStep >= 3) {
    wizardStep += 1;
  }
  schemaVersion = WIZARD_SCHEMA_VERSION;

  const config: PorterConfig = {
    deviceId: loaded.deviceId ?? createHash("sha256").update(randomBytes(32)).digest("hex").slice(0, 16),
    deviceName: loaded.deviceName ?? defaultName(),
    port: loaded.port ?? 47831,
    sharedFolders: loaded.sharedFolders ?? [],
    sleepAfterMinutes: loaded.sleepAfterMinutes ?? 5,
    allowSecretFiles: loaded.allowSecretFiles ?? false,
    requireConfirmWrites: loaded.requireConfirmWrites ?? true,
    pairedDeviceIds: loaded.pairedDeviceIds ?? [],
    forgottenDeviceIds: loaded.forgottenDeviceIds ?? [],
    token: loaded.token ?? randomBytes(24).toString("hex"),
    wizard: {
      completed: loaded.wizard?.completed ?? false,
      step: wizardStep,
      agentLinkAcknowledged: loaded.wizard?.agentLinkAcknowledged ?? false,
      mcpInstalled: loaded.wizard?.mcpInstalled ?? false,
      schemaVersion,
      tailscaleSkipped: loaded.wizard?.tailscaleSkipped ?? false,
    },
    sleeping: loaded.sleeping ?? false,
    tunnelUrl: loaded.tunnelUrl ?? null,
    awayMode: {
      enabled: loaded.awayMode?.enabled ?? false,
      autoStartTunnel: loaded.awayMode?.autoStartTunnel ?? false,
      preventSleep: loaded.awayMode?.preventSleep ?? false,
      keepAliveInstalled: loaded.awayMode?.keepAliveInstalled ?? false,
      preferTailscaleServe: loaded.awayMode?.preferTailscaleServe ?? true,
      serveUrl: loaded.awayMode?.serveUrl ?? null,
    },
  };
  // Persist migration once so step bump does not re-apply incorrectly after user goes back
  if ((loaded.wizard?.schemaVersion ?? 1) < WIZARD_SCHEMA_VERSION) {
    saveConfig(config);
  }
  return config;
}

export function saveConfig(config: PorterConfig): void {
  ensurePorterDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function localDevice(config: PorterConfig): DeviceInfo {
  return {
    id: config.deviceId,
    name: config.deviceName,
    host: "127.0.0.1",
    port: config.port,
    online: true,
    isLocal: true,
    via: "local",
  };
}

export function loadActivity(): ActivityEvent[] {
  ensurePorterDir();
  if (!fs.existsSync(ACTIVITY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(ACTIVITY_PATH, "utf8")) as ActivityEvent[];
  } catch {
    return [];
  }
}

export function queryActivity(opts?: {
  q?: string;
  ok?: boolean | null;
  limit?: number;
  offset?: number;
}): { events: ActivityEvent[]; total: number; limit: number; offset: number } {
  let events = loadActivity();
  const q = opts?.q?.trim().toLowerCase();
  if (q) {
    events = events.filter((e) => {
      const hay = [e.action, e.detail, e.humanMessage, e.source, e.via]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (opts?.ok === true || opts?.ok === false) {
    events = events.filter((e) => e.ok === opts.ok);
  }
  const total = events.length;
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  return {
    events: events.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export function isDeviceForgotten(deviceId: string): boolean {
  if (!deviceId) return false;
  return loadConfig().forgottenDeviceIds.includes(deviceId);
}

export function forgetDeviceId(deviceId: string): void {
  if (!deviceId) return;
  const config = loadConfig();
  if (!config.forgottenDeviceIds.includes(deviceId)) {
    config.forgottenDeviceIds.push(deviceId);
  }
  config.pairedDeviceIds = config.pairedDeviceIds.filter((id) => id !== deviceId);
  saveConfig(config);
}

export function clearForgottenDeviceId(deviceId: string): void {
  if (!deviceId) return;
  const config = loadConfig();
  const next = config.forgottenDeviceIds.filter((id) => id !== deviceId);
  if (next.length === config.forgottenDeviceIds.length) return;
  config.forgottenDeviceIds = next;
  saveConfig(config);
}

export function appendActivity(
  action: string,
  detail: string,
  ok: boolean,
  source = "local",
  meta?: {
    humanMessage?: string;
    durationMs?: number;
    bytes?: number;
    mbps?: number;
    via?: string;
  },
): ActivityEvent {
  const events = loadActivity();
  const event: ActivityEvent = {
    id: randomBytes(8).toString("hex"),
    at: new Date().toISOString(),
    action,
    detail,
    source,
    ok,
    humanMessage: meta?.humanMessage,
    durationMs: meta?.durationMs,
    bytes: meta?.bytes,
    mbps: meta?.mbps,
    via: meta?.via,
  };
  events.unshift(event);
  try {
    fs.writeFileSync(ACTIVITY_PATH, JSON.stringify(events.slice(0, 500), null, 2), {
      mode: 0o600,
    });
  } catch (err) {
    console.warn("[porter] could not write activity log:", err instanceof Error ? err.message : err);
  }
  return event;
}

/** Turn raw errors into short user-facing text. */
export function humanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = sanitizePeerBody(raw);
  // Only Quick Tunnel / peer tunnel failures — not random HTML (GitHub, Express 404, etc.)
  if (/error 1033|cloudflare tunnel error|trycloudflare\.com/i.test(msg + raw)) {
    return "Cloudflare tunnel URL is dead or changed. Prefer Tailscale (Add Mac → pick the other Mac or paste 100.x). Quick Tunnel is optional.";
  }
  if (msg.includes("Unauthorized") || msg.includes("pair token")) {
    return "Pair token mismatch — paste the same token on both Macs (Settings).";
  }
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return "Could not reach the other Mac (DNS/network). Use Tailscale on both Macs, then Add Mac with the 100.x IP or Tailscale peer list.";
  }
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    return "Could not reach that Mac — if Tailscale shows it online, Porter may not be running there. Revive with Tailscale SSH (`open -a Porter`) or open Porter on the home Mac.";
  }
  if (msg.includes("Timed out") || msg.includes("timeout") || msg.includes("AbortError")) {
    return "Timed out waiting for the other Mac. Prefer the Tailscale path under Devices (100.x), not a dead Cloudflare URL.";
  }
  if (msg.includes("outside approved") || msg.includes("Blocked dangerous")) {
    return "That folder is not shared (or is blocked for safety). Share it in Porter first.";
  }
  if (msg.includes("Missing permission")) {
    return "That folder needs write permission on the destination Mac.";
  }
  if (msg.includes("Chrome must be quit") || msg.includes("Chrome is running")) {
    return "Quit Google Chrome completely on both Macs, then try again.";
  }
  return msg;
}

/** Strip HTML / huge Cloudflare pages so the Finder UI never dumps source. */
export function sanitizePeerBody(text: string): string {
  const t = (text || "").trim();
  if (!t) return "Peer request failed";
  if (/Cannot GET \/api\//i.test(t)) {
    return "This Porter build is missing that feature — update Porter from GitHub Releases.";
  }
  if (/Error 1033|Cloudflare Tunnel error|trycloudflare\.com/i.test(t)) {
    return "Cloudflare tunnel error 1033 — URL expired or tunnel offline";
  }
  if (/<!DOCTYPE html|<html/i.test(t)) {
    return "Remote returned an HTML error page (network or outdated Porter).";
  }
  if (t.length > 280) return `${t.slice(0, 240)}…`;
  return t;
}

export function addSharedFolder(
  folderPath: string,
  label: string,
  permissions: PermissionMode[] = ["read", "copy"],
): SharedFolder {
  const config = loadConfig();
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Folder does not exist: ${resolved}`);
  }
  const existing = config.sharedFolders.find((f) => f.path === resolved);
  if (existing) return existing;
  const folder: SharedFolder = {
    id: randomBytes(6).toString("hex"),
    path: resolved,
    label: label || path.basename(resolved),
    permissions,
  };
  config.sharedFolders.push(folder);
  saveConfig(config);
  appendActivity("share_add", resolved, true);
  return folder;
}

export function removeSharedFolder(id: string): void {
  const config = loadConfig();
  config.sharedFolders = config.sharedFolders.filter((f) => f.id !== id);
  saveConfig(config);
  appendActivity("share_remove", id, true);
}
