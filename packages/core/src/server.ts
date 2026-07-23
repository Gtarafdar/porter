import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addSharedFolder,
  appendActivity,
  loadActivity,
  loadConfig,
  removeSharedFolder,
  saveConfig,
} from "./config.js";
import {
  assertAllowed,
  copyFileLocal,
  copyFolderLocal,
  listDirectory,
  readFileLimited,
  searchFiles,
} from "./files.js";
import { listDevices, localLanHint, startDiscovery } from "./discovery.js";
import {
  authorizePeer,
  remoteDownloadToLocal,
  remoteListDirectory,
  remoteListFolders,
  remoteReadFile,
  remoteSearch,
  setSharedToken,
} from "./peer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isLocalRequest(req: express.Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  );
}

export async function startServer(opts?: {
  openUi?: boolean;
  staticDir?: string;
}): Promise<{ port: number }> {
  const config = loadConfig();
  const app = express();
  app.set("trust proxy", false);
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "2mb" }));

  // Peer auth for non-localhost
  app.use((req, res, next) => {
    if (isLocalRequest(req)) return next();
    if (req.path === "/api/health") return next();
    if (!req.path.startsWith("/api/")) return next();
    const ok = authorizePeer(
      req.header("authorization") ?? undefined,
      req.header("x-porter-device") ?? undefined,
      req.header("x-porter-pair") ?? undefined,
    );
    if (!ok) {
      res.status(401).json({ error: "Unauthorized peer. Pair devices with the same secret token." });
      return;
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      name: "porter",
      deviceId: config.deviceId,
      deviceName: loadConfig().deviceName,
      lan: localLanHint(),
    });
  });

  app.get("/api/device", (_req, res) => {
    const c = loadConfig();
    res.json({
      id: c.deviceId,
      name: c.deviceName,
      port: c.port,
      sleepAfterMinutes: c.sleepAfterMinutes,
      allowSecretFiles: c.allowSecretFiles,
      requireConfirmWrites: c.requireConfirmWrites,
      token: c.token,
      lan: localLanHint(),
    });
  });

  app.patch("/api/device", (req, res) => {
    const c = loadConfig();
    if (typeof req.body.deviceName === "string") c.deviceName = req.body.deviceName;
    if (typeof req.body.sleepAfterMinutes === "number") {
      c.sleepAfterMinutes = req.body.sleepAfterMinutes;
    }
    if (typeof req.body.allowSecretFiles === "boolean") {
      c.allowSecretFiles = req.body.allowSecretFiles;
    }
    if (typeof req.body.requireConfirmWrites === "boolean") {
      c.requireConfirmWrites = req.body.requireConfirmWrites;
    }
    if (typeof req.body.token === "string" && req.body.token.length >= 16) {
      c.token = req.body.token;
    }
    saveConfig(c);
    appendActivity("device_update", c.deviceName, true, "ui");
    res.json({ ok: true });
  });

  app.post("/api/pair/token", (req, res) => {
    const token = String(req.body.token ?? "");
    if (token.length < 16) {
      res.status(400).json({ error: "Token must be at least 16 characters" });
      return;
    }
    setSharedToken(token);
    appendActivity("pair_token", "updated", true, "ui");
    res.json({ ok: true });
  });

  app.get("/api/devices", (_req, res) => {
    res.json(listDevices());
  });

  app.get("/api/folders", async (req, res) => {
    try {
      const deviceId = String(req.query.deviceId ?? "local");
      const c = loadConfig();
      if (deviceId !== "local" && deviceId !== c.deviceId) {
        res.json(await remoteListFolders(deviceId));
        return;
      }
      res.json(c.sharedFolders);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/folders", (req, res) => {
    try {
      if (!isLocalRequest(req)) {
        res.status(403).json({ error: "Adding shares only allowed on this Mac" });
        return;
      }
      const folderPath = String(req.body.path ?? "");
      const label = String(req.body.label ?? "");
      const permissions = (req.body.permissions as string[]) ?? ["read", "copy"];
      const folder = addSharedFolder(
        folderPath,
        label,
        permissions as ("read" | "copy" | "write" | "sync")[],
      );
      // Also grant write on a designated inbox if user asked
      res.json(folder);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.delete("/api/folders/:id", (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "Removing shares only allowed on this Mac" });
      return;
    }
    removeSharedFolder(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/files/list", async (req, res) => {
    try {
      const dirPath = String(req.query.path ?? "");
      const deviceId = String(req.query.deviceId ?? "local");
      const c = loadConfig();
      if (deviceId !== "local" && deviceId !== c.deviceId) {
        res.json(await remoteListDirectory(deviceId, dirPath));
        return;
      }
      res.json(listDirectory(dirPath));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/files/search", async (req, res) => {
    try {
      const q = String(req.query.q ?? "");
      const deviceId = String(req.query.deviceId ?? "local");
      const c = loadConfig();
      if (deviceId !== "local" && deviceId !== c.deviceId) {
        res.json(await remoteSearch(deviceId, q));
        return;
      }
      res.json(searchFiles(q));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/files/read", async (req, res) => {
    try {
      const filePath = String(req.query.path ?? "");
      const deviceId = String(req.query.deviceId ?? "local");
      const c = loadConfig();
      if (deviceId !== "local" && deviceId !== c.deviceId) {
        res.json(await remoteReadFile(deviceId, filePath));
        return;
      }
      res.json(readFileLimited(filePath));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/files/download", (req, res) => {
    try {
      const filePath = String(req.query.path ?? "");
      assertAllowed(filePath, "copy");
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        res.status(400).json({ error: "Not a file" });
        return;
      }
      appendActivity("download", resolved, true, "peer");
      res.download(resolved);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/files/copy", async (req, res) => {
    try {
      if (!isLocalRequest(req)) {
        res.status(403).json({ error: "Copy orchestration only from local UI/MCP" });
        return;
      }
      const {
        sourceDeviceId,
        sourcePath,
        destDeviceId,
        destPath,
        isDirectory,
      } = req.body as {
        sourceDeviceId: string;
        sourcePath: string;
        destDeviceId: string;
        destPath: string;
        isDirectory?: boolean;
      };
      const c = loadConfig();
      const srcLocal = sourceDeviceId === "local" || sourceDeviceId === c.deviceId;
      const destLocal = destDeviceId === "local" || destDeviceId === c.deviceId;

      if (srcLocal && destLocal) {
        const result = isDirectory
          ? copyFolderLocal(sourcePath, destPath)
          : copyFileLocal(sourcePath, destPath);
        appendActivity("copy", `${sourcePath} → ${destPath}`, true, "ui");
        res.json({ ok: true, result });
        return;
      }

      if (!srcLocal && destLocal) {
        if (isDirectory) {
          // Expand remote listing and download files one by one (simple V1)
          const entries = await remoteListDirectory(sourceDeviceId, sourcePath);
          fs.mkdirSync(destPath, { recursive: true });
          let files = 0;
          let bytes = 0;
          async function pullDir(remoteDir: string, localDir: string): Promise<void> {
            const items = await remoteListDirectory(sourceDeviceId, remoteDir);
            fs.mkdirSync(localDir, { recursive: true });
            for (const item of items) {
              if (item.isDirectory) {
                await pullDir(item.path, path.join(localDir, item.name));
              } else {
                const destFile = path.join(localDir, item.name);
                const r = await remoteDownloadToLocal(sourceDeviceId, item.path, destFile);
                files += 1;
                bytes += r.bytes;
              }
            }
          }
          await pullDir(sourcePath, destPath);
          appendActivity("copy_remote", `${sourcePath} → ${destPath}`, true, "ui");
          res.json({ ok: true, result: { files, bytes } });
          return;
        }
        const r = await remoteDownloadToLocal(sourceDeviceId, sourcePath, destPath);
        appendActivity("copy_remote", `${sourcePath} → ${destPath}`, true, "ui");
        res.json({ ok: true, result: r });
        return;
      }

      res.status(400).json({
        error:
          "V1 supports copy onto this Mac (from local or remote). Push-to-remote comes next.",
      });
    } catch (e) {
      appendActivity("copy", e instanceof Error ? e.message : String(e), false, "ui");
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/activity", (_req, res) => {
    res.json(loadActivity());
  });

  app.post("/api/kill", (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "Kill switch is local only" });
      return;
    }
    appendActivity("kill_switch", "disconnect requested", true, "ui");
    res.json({ ok: true, message: "Porter will stop accepting work. Process exit shortly." });
    setTimeout(() => process.exit(0), 300);
  });

  // Static Finder UI
  const staticDir =
    opts?.staticDir ||
    path.resolve(__dirname, "../../../apps/desktop/dist");
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  startDiscovery();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, "0.0.0.0", () => resolve());
    server.on("error", reject);
  });

  appendActivity("server_start", `port ${config.port}`, true);
  return { port: config.port };
}
