/**
 * MCP host config paths — darwin unchanged; win32 uses AppData / profile norms.
 */
import fs from "node:fs";
import path from "node:path";
import { porterPlatform, type PorterPlatform } from "./index.js";

export function windowsAppData(home: string): string {
  return process.env.APPDATA?.trim() || path.join(home, "AppData", "Roaming");
}

export function mcpCursorConfigPath(home: string): string {
  return path.join(home, ".cursor", "mcp.json");
}

export function mcpClaudeDesktopConfigPath(
  home: string,
  platform: PorterPlatform = porterPlatform(),
): string {
  if (platform === "win32") {
    return path.join(windowsAppData(home), "Claude", "claude_desktop_config.json");
  }
  return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
}

export function mcpClaudeCodeConfigPath(home: string): string {
  return path.join(home, ".claude.json");
}

export function mcpVscodeConfigPath(
  home: string,
  platform: PorterPlatform = porterPlatform(),
): string {
  if (platform === "win32") {
    return path.join(windowsAppData(home), "Code", "User", "mcp.json");
  }
  return path.join(home, "Library", "Application Support", "Code", "User", "mcp.json");
}

export function mcpCursorHint(platform: PorterPlatform = porterPlatform()): string {
  return platform === "win32" ? "%USERPROFILE%\\.cursor\\mcp.json" : "~/.cursor/mcp.json";
}

export function mcpClaudeDesktopHint(platform: PorterPlatform = porterPlatform()): string {
  return platform === "win32"
    ? "%APPDATA%\\Claude\\claude_desktop_config.json"
    : "~/Library/Application Support/Claude/claude_desktop_config.json";
}

export function mcpVscodeHint(platform: PorterPlatform = porterPlatform()): string {
  return platform === "win32"
    ? "%APPDATA%\\Code\\User\\mcp.json"
    : "~/Library/Application Support/Code/User/mcp.json";
}

export function detectCursor(home: string, platform: PorterPlatform = porterPlatform()): boolean {
  if (fs.existsSync(path.join(home, ".cursor"))) return true;
  if (platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim() || path.join(home, "AppData", "Local");
    return (
      fs.existsSync(path.join(local, "Programs", "cursor")) ||
      fs.existsSync(path.join(windowsAppData(home), "Cursor"))
    );
  }
  return (
    fs.existsSync("/Applications/Cursor.app") ||
    fs.existsSync(path.join(home, "Library", "Application Support", "Cursor"))
  );
}

export function detectClaudeDesktop(
  home: string,
  platform: PorterPlatform = porterPlatform(),
): boolean {
  if (platform === "win32") {
    return fs.existsSync(path.join(windowsAppData(home), "Claude"));
  }
  return (
    fs.existsSync("/Applications/Claude.app") ||
    fs.existsSync(path.join(home, "Library", "Application Support", "Claude"))
  );
}

export function detectClaudeCode(home: string): boolean {
  return (
    fs.existsSync(path.join(home, ".claude.json")) ||
    fs.existsSync(path.join(home, ".claude")) ||
    fs.existsSync(path.join(home, ".local", "bin", "claude"))
  );
}

export function detectVscode(home: string, platform: PorterPlatform = porterPlatform()): boolean {
  if (platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim() || path.join(home, "AppData", "Local");
    return (
      fs.existsSync(path.join(windowsAppData(home), "Code")) ||
      fs.existsSync(path.join(local, "Programs", "Microsoft VS Code"))
    );
  }
  return (
    fs.existsSync("/Applications/Visual Studio Code.app") ||
    fs.existsSync("/Applications/Code.app") ||
    fs.existsSync(path.join(home, "Library", "Application Support", "Code"))
  );
}
