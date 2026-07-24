import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendActivity, loadConfig, saveConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the shared Porter MCP entry (same for every IDE). */
export function mcpEntryPath(): string {
  return path.resolve(__dirname, "mcp.js");
}

export type McpRootKey = "mcpServers" | "servers";

export type McpClientId = "cursor" | "claudeDesktop" | "claudeCode" | "vscode";

export interface McpClientDef {
  id: McpClientId;
  label: string;
  /** Short hint shown under the client name. */
  hint: string;
  /** What to do after connecting. */
  afterConnect: string;
  rootKey: McpRootKey;
  /** Absolute config path for a given home directory. */
  configPath: (home: string) => string;
  /** Whether the host app looks installed / in use. */
  detect: (home: string) => boolean;
  /** Porter server entry for this host's schema. */
  porterEntry: (entryPath: string) => Record<string, unknown>;
}

export interface McpClientStatus {
  id: McpClientId;
  label: string;
  hint: string;
  afterConnect: string;
  rootKey: McpRootKey;
  configPath: string;
  detected: boolean;
  installed: boolean;
  snippetJson: string;
}

export interface InstallMcpClientResult {
  clientId: McpClientId;
  path: string;
  merged: boolean;
  alreadyPresent: boolean;
  detected: boolean;
}

function appsExist(...names: string[]): boolean {
  return names.some((n) => fs.existsSync(path.join("/Applications", n)));
}

function cursorDetected(home: string): boolean {
  return (
    appsExist("Cursor.app") ||
    fs.existsSync(path.join(home, ".cursor")) ||
    fs.existsSync(path.join(home, "Library", "Application Support", "Cursor"))
  );
}

function claudeDesktopDetected(home: string): boolean {
  return (
    appsExist("Claude.app") ||
    fs.existsSync(path.join(home, "Library", "Application Support", "Claude"))
  );
}

function claudeCodeDetected(home: string): boolean {
  return (
    fs.existsSync(path.join(home, ".claude.json")) ||
    fs.existsSync(path.join(home, ".claude")) ||
    fs.existsSync(path.join(home, ".local", "bin", "claude"))
  );
}

function vscodeDetected(home: string): boolean {
  return (
    appsExist("Visual Studio Code.app", "Code.app") ||
    fs.existsSync(path.join(home, "Library", "Application Support", "Code"))
  );
}

/** Classic MCP hosts (Cursor, Claude Desktop, Claude Code). */
export function porterMcpStdioEntry(entryPath = mcpEntryPath()): Record<string, unknown> {
  return {
    command: "node",
    args: [entryPath],
  };
}

/** Default copy-paste snippet (mcpServers shape used by Cursor / Claude). */
export function buildClassicMcpSnippet(): {
  snippet: Record<string, unknown>;
  json: string;
  entryPath: string;
} {
  const entryPath = mcpEntryPath();
  const snippet = {
    mcpServers: {
      porter: porterMcpStdioEntry(entryPath),
    },
  };
  return { snippet, json: JSON.stringify(snippet, null, 2), entryPath };
}

/** VS Code / Copilot Agent user MCP schema. */
export function porterVscodeStdioEntry(entryPath = mcpEntryPath()): Record<string, unknown> {
  return {
    type: "stdio",
    command: "node",
    args: [entryPath],
  };
}

export const MCP_CLIENTS: McpClientDef[] = [
  {
    id: "cursor",
    label: "Cursor",
    hint: "~/.cursor/mcp.json",
    afterConnect: "Reload MCP in Cursor (Command Palette → MCP: Restart or reload window).",
    rootKey: "mcpServers",
    configPath: (home) => path.join(home, ".cursor", "mcp.json"),
    detect: cursorDetected,
    porterEntry: porterMcpStdioEntry,
  },
  {
    id: "claudeDesktop",
    label: "Claude Desktop",
    hint: "~/Library/Application Support/Claude/claude_desktop_config.json",
    afterConnect: "Fully quit Claude Desktop and reopen so MCP loads.",
    rootKey: "mcpServers",
    configPath: (home) =>
      path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    detect: claudeDesktopDetected,
    porterEntry: porterMcpStdioEntry,
  },
  {
    id: "claudeCode",
    label: "Claude Code",
    hint: "~/.claude.json",
    afterConnect: "Restart Claude Code / open a new session so MCP tools appear.",
    rootKey: "mcpServers",
    configPath: (home) => path.join(home, ".claude.json"),
    detect: claudeCodeDetected,
    porterEntry: porterMcpStdioEntry,
  },
  {
    id: "vscode",
    label: "VS Code / Copilot",
    hint: "~/Library/Application Support/Code/User/mcp.json",
    afterConnect: "Command Palette → MCP: List Servers → restart Porter; use Agent mode.",
    rootKey: "servers",
    configPath: (home) =>
      path.join(home, "Library", "Application Support", "Code", "User", "mcp.json"),
    detect: vscodeDetected,
    porterEntry: porterVscodeStdioEntry,
  },
];

export function getMcpClientDef(id: string): McpClientDef | undefined {
  return MCP_CLIENTS.find((c) => c.id === id);
}

/**
 * Merge Porter into an MCP host config without removing other servers.
 * Creates parent dirs and the file when missing.
 */
export function mergeMcpConfigFile(opts: {
  configPath: string;
  rootKey: McpRootKey;
  porterValue: Record<string, unknown>;
}): { alreadyPresent: boolean; path: string } {
  const { configPath, rootKey, porterValue } = opts;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8").trim();
    if (raw) {
      existing = JSON.parse(raw) as Record<string, unknown>;
    }
  }

  const prevRoot = (existing[rootKey] as Record<string, unknown> | undefined) ?? {};
  const servers = { ...prevRoot };
  const alreadyPresent = Boolean(servers.porter);
  servers.porter = porterValue;
  const next = { ...existing, [rootKey]: servers };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return { alreadyPresent, path: configPath };
}

function snippetForClient(def: McpClientDef, entryPath: string): string {
  const body = { [def.rootKey]: { porter: def.porterEntry(entryPath) } };
  return JSON.stringify(body, null, 2);
}

function isPorterInstalledInFile(configPath: string, rootKey: McpRootKey): boolean {
  if (!fs.existsSync(configPath)) return false;
  try {
    const raw = fs.readFileSync(configPath, "utf8").trim();
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const root = parsed[rootKey] as Record<string, unknown> | undefined;
    return Boolean(root?.porter);
  } catch {
    return false;
  }
}

export function listMcpClients(opts?: { home?: string }): McpClientStatus[] {
  const home = opts?.home ?? os.homedir();
  const entryPath = mcpEntryPath();

  return MCP_CLIENTS.map((def) => {
    const configPath = def.configPath(home);
    const inFile = isPorterInstalledInFile(configPath, def.rootKey);
    return {
      id: def.id,
      label: def.label,
      hint: def.hint,
      afterConnect: def.afterConnect,
      rootKey: def.rootKey,
      configPath,
      detected: def.detect(home),
      installed: inFile,
      snippetJson: snippetForClient(def, entryPath),
    };
  });
}

export function installMcpClient(
  clientId: string,
  opts?: { home?: string },
): InstallMcpClientResult {
  const def = getMcpClientDef(clientId);
  if (!def) {
    throw new Error(`Unknown MCP client: ${clientId}`);
  }
  const home = opts?.home ?? os.homedir();
  const entryPath = mcpEntryPath();
  const configPath = def.configPath(home);
  const { alreadyPresent, path: written } = mergeMcpConfigFile({
    configPath,
    rootKey: def.rootKey,
    porterValue: def.porterEntry(entryPath),
  });

  const config = loadConfig();
  const clients = { ...(config.wizard.mcpClients ?? {}) };
  clients[def.id] = true;
  config.wizard.mcpClients = clients;
  if (def.id === "cursor") {
    config.wizard.mcpInstalled = true;
  }
  saveConfig(config);

  const action =
    def.id === "cursor" ? "mcp_install_cursor" : (`mcp_install_${def.id}` as const);
  appendActivity(action, written, true, "wizard");

  return {
    clientId: def.id,
    path: written,
    merged: true,
    alreadyPresent,
    detected: def.detect(home),
  };
}
