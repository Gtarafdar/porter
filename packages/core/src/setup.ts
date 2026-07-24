import { loadConfig, saveConfig, WIZARD_SCHEMA_VERSION } from "./config.js";
import {
  buildClassicMcpSnippet,
  installMcpClient,
  listMcpClients,
  mcpEntryPath,
} from "./mcpClients.js";

export { mcpEntryPath } from "./mcpClients.js";

export function buildMcpSnippet(): {
  snippet: Record<string, unknown>;
  json: string;
  entryPath: string;
} {
  return buildClassicMcpSnippet();
}

/**
 * Merge Porter into ~/.cursor/mcp.json without removing other servers
 * (Slack Agent Bridge, AI Site Connector, etc.).
 * Thin wrapper — same behavior as installMcpClient("cursor").
 */
export function installCursorMcp(): {
  path: string;
  merged: boolean;
  alreadyPresent: boolean;
} {
  const result = installMcpClient("cursor");
  return {
    path: result.path,
    merged: result.merged,
    alreadyPresent: result.alreadyPresent,
  };
}

export function wizardSnapshot() {
  migrateWizardSchemaIfNeeded();
  const c = loadConfig();
  return {
    completed: c.wizard.completed,
    step: c.wizard.step,
    deviceName: c.deviceName,
    deviceId: c.deviceId,
    hasSharedFolder: c.sharedFolders.length > 0,
    hasWriteFolder: c.sharedFolders.some(
      (f) => f.permissions.includes("write") || f.permissions.includes("sync"),
    ),
    token: c.token,
    agentLinkAcknowledged: c.wizard.agentLinkAcknowledged,
    mcpInstalled: c.wizard.mcpInstalled,
    mcpClients: c.wizard.mcpClients ?? {},
    schemaVersion: c.wizard.schemaVersion ?? WIZARD_SCHEMA_VERSION,
    tailscaleSkipped: Boolean(c.wizard.tailscaleSkipped),
    sleeping: c.sleeping,
    mcpEntryPath: mcpEntryPath(),
    mcpSnippet: buildMcpSnippet().json,
    mcpClientStatus: listMcpClients(),
  };
}

function migrateWizardSchemaIfNeeded(): void {
  // loadConfig already migrates and may persist; this is a no-op hook for clarity
  loadConfig();
}

export function updateWizard(partial: {
  step?: number;
  completed?: boolean;
  agentLinkAcknowledged?: boolean;
  tailscaleSkipped?: boolean;
}): ReturnType<typeof wizardSnapshot> {
  const c = loadConfig();
  if (typeof partial.step === "number") c.wizard.step = partial.step;
  if (typeof partial.completed === "boolean") c.wizard.completed = partial.completed;
  if (typeof partial.agentLinkAcknowledged === "boolean") {
    c.wizard.agentLinkAcknowledged = partial.agentLinkAcknowledged;
  }
  if (typeof partial.tailscaleSkipped === "boolean") {
    c.wizard.tailscaleSkipped = partial.tailscaleSkipped;
  }
  saveConfig(c);
  return wizardSnapshot();
}
