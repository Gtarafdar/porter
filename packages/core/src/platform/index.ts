/**
 * OS adapters for Porter. Darwin behavior stays the Mac product path;
 * win32 is additive for the Windows peer / Setup EXE product.
 */
import os from "node:os";
import path from "node:path";

export type PorterPlatform = "darwin" | "win32" | "linux";

export function porterPlatform(
  platform: NodeJS.Platform = process.platform,
): PorterPlatform {
  if (platform === "win32") return "win32";
  if (platform === "darwin") return "darwin";
  return "linux";
}

/** Path helpers for a *target* OS (so tests on Windows can assert Mac paths). */
export function pathForPlatform(platform: PorterPlatform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}

export function isDarwin(platform: NodeJS.Platform = process.platform): boolean {
  return porterPlatform(platform) === "darwin";
}

export function isWin32(platform: NodeJS.Platform = process.platform): boolean {
  return porterPlatform(platform) === "win32";
}

/** Human label for UI copy (Mac stays Mac-flavored on darwin). */
export function computerNoun(platform: NodeJS.Platform = process.platform): string {
  const p = porterPlatform(platform);
  if (p === "darwin") return "Mac";
  if (p === "win32") return "PC";
  return "computer";
}

/**
 * Application Support analogue.
 * Darwin: ~/Library/Application Support/Porter (unchanged).
 * Windows: %LOCALAPPDATA%\\Porter
 */
export function porterSupportDir(
  home = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const p = porterPlatform(platform);
  const pathMod = pathForPlatform(p);
  if (p === "win32") {
    const base =
      process.env.LOCALAPPDATA?.trim() || pathMod.join(home, "AppData", "Local");
    return pathMod.join(base, "Porter");
  }
  if (p === "darwin") {
    return pathMod.join(home.replace(/\\/g, "/"), "Library", "Application Support", "Porter");
  }
  return pathMod.join(home.replace(/\\/g, "/"), ".local", "share", "porter");
}

export function porterLogsDir(
  home = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const p = porterPlatform(platform);
  const pathMod = pathForPlatform(p);
  if (p === "win32") {
    return pathMod.join(porterSupportDir(home, platform), "logs");
  }
  if (p === "darwin") {
    return pathMod.join(home.replace(/\\/g, "/"), "Library", "Logs");
  }
  return pathMod.join(home.replace(/\\/g, "/"), ".local", "state", "porter", "logs");
}

/** True if p looks absolute for the given peer OS (remote paths stay opaque). */
export function isAbsoluteForPlatform(p: string, platform: PorterPlatform): boolean {
  if (platform === "win32") return path.win32.isAbsolute(p);
  return path.posix.isAbsolute(p);
}

/**
 * Join path segments on the *local* OS only.
 * Never use this to rewrite a remote peer's path string.
 */
export function joinLocal(...parts: string[]): string {
  return path.join(...parts);
}

const WIN_RESERVED = new Set(
  [
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ].map((s) => s.toUpperCase()),
);

/** Windows-illegal characters and trailing dots/spaces. */
export function windowsFileNameIssues(name: string): string | null {
  if (!name || name === "." || name === "..") return "empty or relative name";
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name)) {
    return "contains characters not allowed on Windows (<>:\"/\\|?* or control chars)";
  }
  if (/[. ]$/.test(name)) return "cannot end with a space or period on Windows";
  const base = name.split(".")[0] ?? name;
  if (WIN_RESERVED.has(base.toUpperCase())) {
    return `reserved Windows device name (${base})`;
  }
  return null;
}

/**
 * Fail loud when writing a name onto a Windows destination.
 * Darwin destinations are unrestricted by this helper (Mac product unchanged).
 */
export function assertDestFileNameAllowed(
  name: string,
  destPlatform: PorterPlatform,
): void {
  if (destPlatform !== "win32") return;
  const issue = windowsFileNameIssues(name);
  if (issue) {
    throw new Error(`Filename not allowed on Windows (${issue}): ${name}`);
  }
}

/** Optional sanitize — replaces illegal chars; still validates reserved names. */
export function sanitizeWindowsFileName(name: string): string {
  let n = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "");
  if (!n || n === "." || n === "..") n = "_file";
  const base = n.split(".")[0] ?? n;
  if (WIN_RESERVED.has(base.toUpperCase())) {
    n = `_${n}`;
  }
  return n;
}

/** Quote a path for cmd.exe / PowerShell-safe env assignment. */
export function quoteWindowsPath(p: string): string {
  if (!/[ \t"]/u.test(p)) return p;
  return `"${p.replace(/"/g, '\\"')}"`;
}

/** Normalize to forward slashes for embedding in Mac bash keep-alive scripts. */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}
