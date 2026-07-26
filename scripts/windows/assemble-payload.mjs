#!/usr/bin/env node
/**
 * Assemble Windows Porter payload (node.exe + core + UI).
 * Safe to run on macOS or Windows. Does not touch Mac DMG scripts.
 *
 * Output: dist/windows/Porter/
 */
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  writeFileSync,
  createWriteStream,
  renameSync,
  readFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const VERSION =
  process.env.PORTER_VERSION ||
  JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const NODE_VER = process.env.PORTER_NODE_VERSION || "20.18.2";
const CF_VER = process.env.PORTER_CLOUDFLARED_VERSION || "2026.7.3";
const OUT = path.join(ROOT, "dist", "windows", "Porter");
const CACHE = path.join(ROOT, "dist", "cache");

function httpGet(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          rmSync(dest, { force: true });
          return resolve(httpGet(res.headers.location, dest));
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", reject);
  });
}

async function ensureNodeWin() {
  mkdirSync(CACHE, { recursive: true });
  const zipName = `node-v${NODE_VER}-win-x64.zip`;
  const cached = path.join(CACHE, zipName);
  if (!existsSync(cached)) {
    const url = `https://nodejs.org/dist/v${NODE_VER}/${zipName}`;
    console.log(`==> Downloading ${url}`);
    await httpGet(url, cached + ".partial");
    renameSync(cached + ".partial", cached);
  } else {
    console.log(`==> Using cached ${zipName}`);
  }
  return cached;
}

/** Optional Cloudflare Quick Tunnel binary (same role as Mac DMG bundle). Best-effort. */
async function ensureCloudflaredWin() {
  mkdirSync(CACHE, { recursive: true });
  const exeName = "cloudflared-windows-amd64.exe";
  const cached = path.join(CACHE, `${CF_VER}-${exeName}`);
  if (!existsSync(cached)) {
    const url = `https://github.com/cloudflare/cloudflared/releases/download/${CF_VER}/${exeName}`;
    console.log(`==> Downloading cloudflared ${CF_VER} (windows amd64)`);
    try {
      await httpGet(url, cached + ".partial");
      renameSync(cached + ".partial", cached);
    } catch (err) {
      console.warn(`==> cloudflared download failed — optional CF tunnel may need a separate install: ${err}`);
      return null;
    }
  } else {
    console.log(`==> Using cached cloudflared ${CF_VER}`);
  }
  return cached;
}

async function extractNode(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`unzip -qo "${zipPath}" -d "${destDir}"`, { stdio: "inherit" });
  }
}

function copyDep(name) {
  const src = path.join(ROOT, "node_modules", name);
  if (existsSync(src)) {
    cpSync(src, path.join(OUT, "app", "node_modules", name), { recursive: true });
  }
}

async function main() {
  console.log(`==> Building Porter packages for Windows payload v${VERSION}`);
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const zip = await ensureNodeWin();
  const extractTmp = path.join(CACHE, `node-extract-win-${NODE_VER}`);
  rmSync(extractTmp, { recursive: true, force: true });
  await extractNode(zip, extractTmp);
  const nodeDir = path.join(extractTmp, `node-v${NODE_VER}-win-x64`);
  const nodeExe = path.join(nodeDir, "node.exe");
  if (!existsSync(nodeExe)) {
    throw new Error(`node.exe missing after extract: ${nodeExe}`);
  }
  cpSync(nodeExe, path.join(OUT, "node.exe"));

  const cfCached = await ensureCloudflaredWin();
  if (cfCached) {
    cpSync(cfCached, path.join(OUT, "cloudflared.exe"));
    console.log(`==> Bundled cloudflared.exe ${CF_VER}`);
  }

  const appOut = path.join(OUT, "app");
  mkdirSync(path.join(appOut, "packages", "core", "dist"), { recursive: true });
  mkdirSync(path.join(appOut, "packages", "protocol", "dist"), { recursive: true });
  mkdirSync(path.join(appOut, "node_modules"), { recursive: true });

  cpSync(path.join(ROOT, "packages", "core", "dist"), path.join(appOut, "packages", "core", "dist"), {
    recursive: true,
  });
  cpSync(
    path.join(ROOT, "packages", "protocol", "dist"),
    path.join(appOut, "packages", "protocol", "dist"),
    { recursive: true },
  );
  cpSync(path.join(ROOT, "packages", "core", "package.json"), path.join(appOut, "packages", "core", "package.json"));
  cpSync(
    path.join(ROOT, "packages", "protocol", "package.json"),
    path.join(appOut, "packages", "protocol", "package.json"),
  );

  // Hoisted workspace deps needed at runtime
  for (const name of [
    "express",
    "cors",
    "uuid",
    "zod",
    "bonjour-service",
    "@modelcontextprotocol",
    "mime-types",
    "qs",
    "body-parser",
    "content-disposition",
    "content-type",
    "cookie",
    "cookie-signature",
    "debug",
    "depd",
    "encodeurl",
    "escape-html",
    "etag",
    "finalhandler",
    "fresh",
    "http-errors",
    "merge-descriptors",
    "on-finished",
    "parseurl",
    "path-to-regexp",
    "proxy-addr",
    "range-parser",
    "send",
    "serve-static",
    "statuses",
    "type-is",
    "vary",
    "router",
    "iconv-lite",
    "raw-body",
    "bytes",
    "inherits",
    "safer-buffer",
    "ms",
    "multicast-dns",
    "dns-equal",
    "dns-txt",
    "thunky",
    "multicast-dns-service-types",
    "accepts",
    "negotiator",
    "mime-db",
    "side-channel",
    "object-inspect",
    "ipaddr.js",
    "toidentifier",
    "setprototypeof",
    "ee-first",
    "unpipe",
    "destroy",
    "media-typer",
  ]) {
    copyDep(name);
  }

  const uiSrc = path.join(ROOT, "apps", "desktop", "dist");
  if (!existsSync(uiSrc)) {
    throw new Error("desktop dist missing — build failed?");
  }
  cpSync(uiSrc, path.join(OUT, "ui"), { recursive: true });

  writeFileSync(path.join(OUT, "VERSION"), `${VERSION}\n`);

  const bat = `@echo off
setlocal
set "PORTER_RESOURCES=%~dp0"
set "PORTER_UI_DIR=%~dp0ui"
set "PORTER_VERSION=${VERSION}"
set "PORTER_OPEN_BROWSER=1"
"%~dp0node.exe" "%~dp0app\\packages\\core\\dist\\cli.js" serve
`;
  writeFileSync(path.join(OUT, "Porter.bat"), bat.replace(/\n/g, "\r\n"));

  writeFileSync(
    path.join(OUT, "README-WINDOWS.txt"),
    `Porter ${VERSION} (Windows payload)

Install via Porter-Setup-*-windows-x64.exe when available (recommended):
  → C:\\Program Files\\Porter

Dev / portable:
  1. Run Porter.bat (or Porter.exe when built)
  2. Open http://127.0.0.1:47831/
  3. Same pair token as your other computers
  4. Add peer via Tailscale 100.x or LAN IP

Config: %USERPROFILE%\\.porter
Mac Travel Ready / LaunchAgent is unchanged and macOS-only.
`,
  );

  console.log(`==> Windows payload ready: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
