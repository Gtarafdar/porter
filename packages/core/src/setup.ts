import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveConfig, appendActivity } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the MCP entry used by Cursor on this machine. */
export function mcpEntryPath(): string {
  return path.resolve(__dirname, "mcp.js");
}

export function buildMcpSnippet(): {
  snippet: Record<string, unknown>;
  json: string;
  entryPath: string;
} {
  const entryPath = mcpEntryPath();
  const snippet = {
    mcpServers: {
      porter: {
        command: "node",
        args: [entryPath],
      },
    },
  };
  return { snippet, json: JSON.stringify(snippet, null, 2), entryPath };
}

/**
 * Merge Porter into ~/.cursor/mcp.json without removing other servers
 * (Slack Agent Bridge, AI Site Connector, etc.).
 */
export function installCursorMcp(): {
  path: string;
  merged: boolean;
  alreadyPresent: boolean;
} {
  const cursorDir = path.join(os.homedir(), ".cursor");
  const mcpPath = path.join(cursorDir, "mcp.json");
  fs.mkdirSync(cursorDir, { recursive: true });

  let existing: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(mcpPath)) {
    existing = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
  }
  const servers = { ...(existing.mcpServers ?? {}) };
  const alreadyPresent = Boolean(servers.porter);
  const { snippet } = buildMcpSnippet();
  servers.porter = (snippet.mcpServers as Record<string, unknown>).porter;
  const next = { ...existing, mcpServers: servers };
  fs.writeFileSync(mcpPath, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });

  const config = loadConfig();
  config.wizard.mcpInstalled = true;
  saveConfig(config);
  appendActivity("mcp_install_cursor", mcpPath, true, "wizard");
  return { path: mcpPath, merged: true, alreadyPresent };
}

export function wizardSnapshot() {
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
    sleeping: c.sleeping,
    mcpEntryPath: mcpEntryPath(),
    mcpSnippet: buildMcpSnippet().json,
  };
}

export function updateWizard(partial: {
  step?: number;
  completed?: boolean;
  agentLinkAcknowledged?: boolean;
}): ReturnType<typeof wizardSnapshot> {
  const c = loadConfig();
  if (typeof partial.step === "number") c.wizard.step = partial.step;
  if (typeof partial.completed === "boolean") c.wizard.completed = partial.completed;
  if (typeof partial.agentLinkAcknowledged === "boolean") {
    c.wizard.agentLinkAcknowledged = partial.agentLinkAcknowledged;
  }
  saveConfig(c);
  return wizardSnapshot();
}
