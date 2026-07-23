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
}

export interface PorterConfig {
  deviceId: string;
  deviceName: string;
  port: number;
  sharedFolders: SharedFolder[];
  sleepAfterMinutes: number;
  allowSecretFiles: boolean;
  requireConfirmWrites: boolean;
  pairedDeviceIds: string[];
  token: string;
  wizard: WizardState;
  sleeping: boolean;
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
      token: randomBytes(24).toString("hex"),
      wizard: {
        completed: false,
        step: 0,
        agentLinkAcknowledged: false,
        mcpInstalled: false,
      },
      sleeping: false,
    };
    saveConfig(config);
    return config;
  }
  const loaded = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<PorterConfig>;
  // Migrate older configs without breaking existing installs
  const config: PorterConfig = {
    deviceId: loaded.deviceId ?? createHash("sha256").update(randomBytes(32)).digest("hex").slice(0, 16),
    deviceName: loaded.deviceName ?? defaultName(),
    port: loaded.port ?? 47831,
    sharedFolders: loaded.sharedFolders ?? [],
    sleepAfterMinutes: loaded.sleepAfterMinutes ?? 5,
    allowSecretFiles: loaded.allowSecretFiles ?? false,
    requireConfirmWrites: loaded.requireConfirmWrites ?? true,
    pairedDeviceIds: loaded.pairedDeviceIds ?? [],
    token: loaded.token ?? randomBytes(24).toString("hex"),
    wizard: {
      completed: loaded.wizard?.completed ?? false,
      step: loaded.wizard?.step ?? 0,
      agentLinkAcknowledged: loaded.wizard?.agentLinkAcknowledged ?? false,
      mcpInstalled: loaded.wizard?.mcpInstalled ?? false,
    },
    sleeping: loaded.sleeping ?? false,
  };
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

export function appendActivity(
  action: string,
  detail: string,
  ok: boolean,
  source = "local",
): ActivityEvent {
  const events = loadActivity();
  const event: ActivityEvent = {
    id: randomBytes(8).toString("hex"),
    at: new Date().toISOString(),
    action,
    detail,
    source,
    ok,
  };
  events.unshift(event);
  fs.writeFileSync(ACTIVITY_PATH, JSON.stringify(events.slice(0, 500), null, 2), {
    mode: 0o600,
  });
  return event;
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
