import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  DANGEROUS_PATH_FRAGMENTS,
  DEFAULT_SECRET_GLOBS,
  type FileEntry,
  type SearchHit,
  type SharedFolder,
} from "@porter/protocol";
import { loadConfig, type PorterConfig } from "./config.js";
import { isChromeExtensionsPath } from "./chrome.js";

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  ".cache",
  "DerivedData",
]);

export function isDangerousPath(target: string): boolean {
  const normalized = path.resolve(target);
  // Opt-in carve-out: Chrome Extensions + Local Extension Settings only
  if (isChromeExtensionsPath(normalized)) return false;
  return DANGEROUS_PATH_FRAGMENTS.some((frag) =>
    normalized.includes(frag.replaceAll("/", path.sep)),
  );
}

function matchSecretName(name: string): boolean {
  return DEFAULT_SECRET_GLOBS.some((glob) => {
    if (glob.startsWith("*.")) {
      return name.endsWith(glob.slice(1));
    }
    if (glob.endsWith(".*")) {
      return name.startsWith(glob.slice(0, -1));
    }
    return name === glob;
  });
}

export function findContainingFolder(
  config: PorterConfig,
  targetPath: string,
): SharedFolder | null {
  const resolved = path.resolve(targetPath);
  const matches = config.sharedFolders
    .filter((f) => resolved === f.path || resolved.startsWith(f.path + path.sep))
    .sort((a, b) => b.path.length - a.path.length);
  return matches[0] ?? null;
}

function hasPerm(folder: SharedFolder, need: "read" | "copy" | "write"): boolean {
  const p = folder.permissions;
  if (need === "read") {
    return p.includes("read") || p.includes("copy") || p.includes("write") || p.includes("sync");
  }
  if (need === "copy") {
    return p.includes("copy") || p.includes("write") || p.includes("sync");
  }
  return p.includes("write") || p.includes("sync");
}

export function assertAllowed(
  targetPath: string,
  need: "read" | "copy" | "write" = "read",
): SharedFolder {
  const config = loadConfig();
  const resolved = path.resolve(targetPath);
  if (isDangerousPath(resolved) && !config.allowSecretFiles) {
    throw new Error(`Blocked dangerous path: ${resolved}`);
  }
  const folder = findContainingFolder(config, resolved);
  if (!folder) {
    throw new Error(`Path is outside approved folders: ${resolved}`);
  }
  if (!hasPerm(folder, need)) {
    throw new Error(`Missing permission '${need}' for ${folder.label}`);
  }
  const base = path.basename(resolved);
  if (!config.allowSecretFiles && matchSecretName(base)) {
    throw new Error(`Secret-like file blocked (enable allowSecretFiles to override): ${base}`);
  }
  return folder;
}

export function listDirectory(dirPath: string): FileEntry[] {
  const folder = assertAllowed(dirPath, "read");
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const config = loadConfig();
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env") {
      // show dotfiles but still filter secrets below
    }
    if (!config.allowSecretFiles && matchSecretName(entry.name)) continue;
    const full = path.join(resolved, entry.name);
    try {
      if (isDangerousPath(full) && !config.allowSecretFiles) continue;
      const stat = fs.statSync(full);
      result.push({
        name: entry.name,
        path: full,
        relativePath: path.relative(folder.path, full),
        isDirectory: entry.isDirectory(),
        size: entry.isDirectory() ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString(),
        extension: entry.isDirectory() ? undefined : path.extname(entry.name).slice(1),
      });
    } catch {
      // skip unreadable
    }
  }
  return result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function readFileLimited(filePath: string, maxBytes = 512_000): {
  path: string;
  content: string;
  truncated: boolean;
  size: number;
} {
  assertAllowed(filePath, "read");
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) throw new Error("Cannot read a directory as a file");
  const buf = fs.readFileSync(resolved);
  const truncated = buf.length > maxBytes;
  const slice = truncated ? buf.subarray(0, maxBytes) : buf;
  return {
    path: resolved,
    content: slice.toString("utf8"),
    truncated,
    size: stat.size,
  };
}

export function searchFiles(query: string, limit = 50): SearchHit[] {
  const config = loadConfig();
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const hits: SearchHit[] = [];

  function walk(dir: string, folder: SharedFolder): void {
    if (hits.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= limit) return;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      if (!config.allowSecretFiles && matchSecretName(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (isDangerousPath(full) && !config.allowSecretFiles) continue;
      if (entry.name.toLowerCase().includes(q)) {
        hits.push({
          path: full,
          relativePath: path.relative(folder.path, full),
          name: entry.name,
          isDirectory: entry.isDirectory(),
          folderId: folder.id,
        });
      }
      if (entry.isDirectory()) walk(full, folder);
    }
  }

  for (const folder of config.sharedFolders) {
    if (!folder.permissions.includes("read") && !folder.permissions.includes("copy")) continue;
    walk(folder.path, folder);
  }
  return hits;
}

export function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function copyFileLocal(source: string, dest: string): { bytes: number; sha256: string } {
  assertAllowed(source, "copy");
  const destDir = path.dirname(path.resolve(dest));
  assertAllowed(destDir, "write");
  const src = path.resolve(source);
  const dst = path.resolve(dest);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  const digest = sha256File(dst);
  return { bytes: fs.statSync(dst).size, sha256: digest };
}

export function copyFolderLocal(source: string, dest: string): { files: number; bytes: number } {
  assertAllowed(source, "copy");
  const destResolved = path.resolve(dest);
  assertAllowed(path.dirname(destResolved), "write");
  const src = path.resolve(source);
  let files = 0;
  let bytes = 0;
  const config = loadConfig();

  function walk(from: string, to: string): void {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      if (!config.allowSecretFiles && matchSecretName(entry.name)) continue;
      const fromPath = path.join(from, entry.name);
      const toPath = path.join(to, entry.name);
      if (isDangerousPath(fromPath) && !config.allowSecretFiles) continue;
      if (entry.isDirectory()) {
        walk(fromPath, toPath);
      } else {
        fs.copyFileSync(fromPath, toPath);
        files += 1;
        bytes += fs.statSync(toPath).size;
      }
    }
  }

  walk(src, destResolved);
  return { files, bytes };
}
