import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
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
  listDirectory,
  readFileLimited,
  searchFiles,
} from "./files.js";
import { listDevices, localLanHint, networkInfo, startDiscovery, hydrateManualPeers, refreshPeerHealth } from "./discovery.js";
import {
  addPeerByAddress,
  authorizePeer,
  remoteDownloadToLocal,
  remoteListDirectory,
  remoteListFolders,
  remoteReadFile,
  remoteSearch,
  remoteUploadFromLocal,
  setSharedToken,
} from "./peer.js";
import {
  buildMcpSnippet,
  installCursorMcp,
  updateWizard,
  wizardSnapshot,
} from "./setup.js";
import { copyFileResumable, copyFolderResumable, mapPool } from "./transfer.js";
import { shareTravelPresets, travelReady, enableSetAndForget } from "./travel.js";
import {
  getTunnelStatus,
  startCloudflareTunnel,
  stopCloudflareTunnel,
  maybeAutoStartTunnel,
} from "./tunnel.js";
import { installKeepAlive, maybeStartPreventSleep } from "./keepalive.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * True only for the real local UI on this Mac.
 * Cloudflare Quick Tunnel proxies via 127.0.0.1 — those MUST NOT count as local
 * (otherwise the pair token / admin APIs would be open to the internet).
 */
function isLocalRequest(req: express.Request): boolean {
  if (
    req.header("cf-ray") ||
    req.header("cf-connecting-ip") ||
    req.header("cf-visitor") ||
    req.header("x-forwarded-for") ||
    req.header("x-real-ip") ||
    req.header("forwarded")
  ) {
    return false;
  }
  const ip = req.ip || req.socket.remoteAddress || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  );
}

function requireLocal(req: express.Request, res: express.Response): boolean {
  if (isLocalRequest(req)) return true;
  res.status(403).json({ error: "This action is only allowed on this Mac (localhost)." });
  return false;
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

  // Peer auth for non-localhost; refuse work while sleeping (except health/wake)
  app.use((req, res, next) => {
    if (isLocalRequest(req)) return next();
    if (req.path === "/api/health") return next();
    if (!req.path.startsWith("/api/")) return next();
    if (loadConfig().sleeping) {
      res.status(503).json({ error: "Porter is sleeping on this Mac. Wake it from the menu bar." });
      return;
    }
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

  app.get("/api/health", (req, res) => {
    const c = loadConfig();
    const local = isLocalRequest(req);
    res.json({
      ok: true,
      name: "porter",
      deviceId: c.deviceId,
      deviceName: c.deviceName,
      sleeping: c.sleeping,
      version: "0.2.0",
      // Do not leak LAN details to remote/tunnel clients
      ...(local ? { lan: localLanHint() } : {}),
    });
  });

  app.get("/api/travel-ready", async (req, res) => {
    if (!requireLocal(req, res)) return;
    const travel = travelReady() as ReturnType<typeof travelReady> & {
      tunnelReachable?: boolean | null;
      tunnelReachNote?: string;
    };
    travel.tunnelReachable = null;
    if (travel.cloudflareUrl) {
      try {
        const r = await fetch(`${travel.cloudflareUrl}/api/health`, {
          signal: AbortSignal.timeout(6000),
        });
        travel.tunnelReachable = r.ok;
      } catch (e) {
        travel.tunnelReachable = false;
        const msg = e instanceof Error ? e.message : String(e);
        travel.tunnelReachNote = msg.includes("getaddrinfo") || msg.includes("ENOTFOUND")
          ? "Tunnel process is up, but this Mac’s DNS cannot resolve trycloudflare.com. Travel Wi‑Fi usually works. Tailscale fallback is required for reliability."
          : `Tunnel probe failed (${msg}). Tailscale fallback still works.`;
      }
    }
    res.json(travel);
  });

  app.get("/api/tunnel", (req, res) => {
    if (!requireLocal(req, res)) return;
    res.json(getTunnelStatus());
  });

  app.post("/api/tunnel/start", async (req, res) => {
    if (!requireLocal(req, res)) return;
    try {
      const c = loadConfig();
      const result = await startCloudflareTunnel(c.port);
      res.json({ ok: true, ...result, ...getTunnelStatus(), travel: travelReady() });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/tunnel/stop", (req, res) => {
    if (!requireLocal(req, res)) return;
    stopCloudflareTunnel();
    const c = loadConfig();
    c.tunnelUrl = null;
    if (c.awayMode) c.awayMode.autoStartTunnel = false;
    saveConfig(c);
    res.json({ ok: true, ...getTunnelStatus(), travel: travelReady() });
  });

  app.post("/api/away/set-and-forget", async (req, res) => {
    if (!requireLocal(req, res)) return;
    try {
      const result = await enableSetAndForget();
      appendActivity("set_and_forget", result.warnings.join("; ") || "enabled", result.ok, "ui");
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/away/keepalive", (req, res) => {
    if (!requireLocal(req, res)) return;
    try {
      const result = installKeepAlive();
      res.json({ ...result, travel: travelReady() });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/away/open-tailscale", (req, res) => {
    if (!requireLocal(req, res)) return;
    // Official installer only — we do not bundle Tailscale (VPN system extension + login required).
    exec('open "https://tailscale.com/download/mac"', () => undefined);
    appendActivity("open_tailscale_download", "opened official Tailscale download", true, "ui");
    res.json({
      ok: true,
      url: "https://tailscale.com/download/mac",
      note: "Install Tailscale from the official site, sign in with the same account on both Macs. Porter cannot embed Tailscale’s VPN app.",
    });
  });

  app.post("/api/travel-presets", (req, res) => {
    if (!requireLocal(req, res)) return;
    try {
      const result = shareTravelPresets();
      appendActivity("travel_presets", JSON.stringify(result.added), true, "ui");
      res.json({ ok: true, ...result, travel: travelReady() });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/setup", (req, res) => {
    if (!requireLocal(req, res)) return;
    res.json(wizardSnapshot());
  });

  app.patch("/api/setup", (req, res) => {
    if (!requireLocal(req, res)) return;
    res.json(
      updateWizard({
        step: typeof req.body.step === "number" ? req.body.step : undefined,
        completed:
          typeof req.body.completed === "boolean" ? req.body.completed : undefined,
        agentLinkAcknowledged:
          typeof req.body.agentLinkAcknowledged === "boolean"
            ? req.body.agentLinkAcknowledged
            : undefined,
      }),
    );
  });

  app.get("/api/mcp/snippet", (req, res) => {
    if (!requireLocal(req, res)) return;
    res.json(buildMcpSnippet());
  });

  app.post("/api/mcp/install-cursor", (req, res) => {
    if (!requireLocal(req, res)) return;
    try {
      const result = installCursorMcp();
      res.json({ ok: true, ...result, snapshot: wizardSnapshot() });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/sleep", (req, res) => {
    if (!requireLocal(req, res)) return;
    const c = loadConfig();
    c.sleeping = true;
    saveConfig(c);
    appendActivity("sleep", "agent sleeping — peers paused", true, "ui");
    res.json({ ok: true, sleeping: true });
  });

  app.post("/api/wake", (req, res) => {
    // Wake may be needed when UI is local; keep local-only for safety
    if (!requireLocal(req, res)) return;
    const c = loadConfig();
    c.sleeping = false;
    saveConfig(c);
    appendActivity("wake", "agent awake", true, "ui");
    res.json({ ok: true, sleeping: false });
  });

  app.get("/api/device", (req, res) => {
    if (!requireLocal(req, res)) return;
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
      sleeping: c.sleeping,
      wizardCompleted: c.wizard.completed,
    });
  });

  app.patch("/api/device", (req, res) => {
    if (!requireLocal(req, res)) return;
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
    if (!requireLocal(req, res)) return;
    const token = String(req.body.token ?? "");
    if (token.length < 16) {
      res.status(400).json({ error: "Token must be at least 16 characters" });
      return;
    }
    setSharedToken(token);
    appendActivity("pair_token", "updated", true, "ui");
    res.json({ ok: true });
  });

  app.get("/api/devices", (req, res) => {
    // Peers may list devices only after auth (middleware). Hide pair tokens / tunnel admin.
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

  app.post("/api/files/upload", express.raw({ type: "*/*", limit: "512mb" }), (req, res) => {
    try {
      const destPath = String(req.query.path ?? "");
      if (!destPath) {
        res.status(400).json({ error: "Missing path" });
        return;
      }
      assertAllowed(path.dirname(path.resolve(destPath)), "write");
      const resolved = path.resolve(destPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
      fs.writeFileSync(resolved, body);
      appendActivity("upload", resolved, true, isLocalRequest(req) ? "ui" : "peer");
      res.json({ ok: true, bytes: body.length, path: resolved });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/peers", async (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "Adding peers is local only" });
      return;
    }
    try {
      const host = String(req.body.host ?? "").trim();
      const port = Number(req.body.port ?? 47831);
      const name = req.body.name ? String(req.body.name) : undefined;
      const fallback = req.body.fallback ? String(req.body.fallback).trim() : undefined;
      if (!host) {
        res.status(400).json({ error: "host required" });
        return;
      }
      const device = await addPeerByAddress(host, port, name, fallback);
      res.json(device);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** One-way sync: mirror a local approved folder onto a remote write-enabled path. */
  app.post("/api/sync/one-way", async (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "Sync is local only" });
      return;
    }
    try {
      const sourcePath = String(req.body.sourcePath ?? "");
      const destDeviceId = String(req.body.destDeviceId ?? "");
      const destPath = String(req.body.destPath ?? "");
      if (!sourcePath || !destDeviceId || !destPath) {
        res.status(400).json({ error: "sourcePath, destDeviceId, destPath required" });
        return;
      }
      assertAllowed(sourcePath, "copy");
      const started = performance.now();
      type Job = { local: string; remote: string };
      const jobs: Job[] = [];
      function walk(localDir: string, remoteDir: string): void {
        for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          const lp = path.join(localDir, entry.name);
          const rp = path.join(remoteDir, entry.name);
          if (entry.isDirectory()) walk(lp, rp);
          else jobs.push({ local: lp, remote: rp });
        }
      }
      walk(sourcePath, destPath);
      let bytes = 0;
      await mapPool(jobs, 4, async (job) => {
        const r = await remoteUploadFromLocal(destDeviceId, job.local, job.remote);
        bytes += r.bytes;
      });
      const ms = Math.max(1, Math.round(performance.now() - started));
      const mbps = Number(((bytes * 8) / (ms / 1000) / 1_000_000).toFixed(2));
      const result = { files: jobs.length, bytes, ms, mbps };
      appendActivity("sync_one_way", `${sourcePath} → ${destDeviceId}:${destPath}`, true, "ui");
      res.json({ ok: true, result });
    } catch (e) {
      appendActivity("sync_one_way", e instanceof Error ? e.message : String(e), false, "ui");
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/network", (req, res) => {
    if (!requireLocal(req, res)) return;
    res.json(networkInfo());
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
          ? copyFolderResumable(sourcePath, destPath)
          : copyFileResumable(sourcePath, destPath);
        appendActivity(
          "copy",
          `${sourcePath} → ${destPath} (${result.mbps} Mbps, ${result.ms}ms)`,
          true,
          "ui",
        );
        res.json({ ok: true, result });
        return;
      }

      if (!srcLocal && destLocal) {
        const started = performance.now();
        if (isDirectory) {
          type Job = { remote: string; local: string };
          const jobs: Job[] = [];
          async function collect(remoteDir: string, localDir: string): Promise<void> {
            const items = await remoteListDirectory(sourceDeviceId, remoteDir);
            fs.mkdirSync(localDir, { recursive: true });
            for (const item of items) {
              if (item.isDirectory) {
                await collect(item.path, path.join(localDir, item.name));
              } else {
                jobs.push({ remote: item.path, local: path.join(localDir, item.name) });
              }
            }
          }
          await collect(sourcePath, destPath);
          let bytes = 0;
          await mapPool(jobs, 4, async (job) => {
            const r = await remoteDownloadToLocal(sourceDeviceId, job.remote, job.local);
            bytes += r.bytes;
          });
          const ms = Math.max(1, Math.round(performance.now() - started));
          const mbps = Number(((bytes * 8) / (ms / 1000) / 1_000_000).toFixed(2));
          const result = { files: jobs.length, bytes, ms, mbps, parallel: 4 };
          appendActivity(
            "copy_remote",
            `${sourcePath} → ${destPath} (${mbps} Mbps, ${jobs.length} files)`,
            true,
            "ui",
          );
          res.json({ ok: true, result });
          return;
        }
        const r = await remoteDownloadToLocal(sourceDeviceId, sourcePath, destPath);
        const ms = Math.max(1, Math.round(performance.now() - started));
        const mbps = Number(((r.bytes * 8) / (ms / 1000) / 1_000_000).toFixed(2));
        const result = { ...r, ms, mbps };
        appendActivity("copy_remote", `${sourcePath} → ${destPath} (${mbps} Mbps)`, true, "ui");
        res.json({ ok: true, result });
        return;
      }

      // Push from this Mac onto a remote device
      if (srcLocal && !destLocal) {
        const started = performance.now();
        if (isDirectory) {
          type Job = { local: string; remote: string };
          const jobs: Job[] = [];
          function walk(localDir: string, remoteDir: string): void {
            for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
              if (entry.name === "node_modules" || entry.name === ".git") continue;
              const lp = path.join(localDir, entry.name);
              const rp = path.join(remoteDir, entry.name);
              if (entry.isDirectory()) walk(lp, rp);
              else jobs.push({ local: lp, remote: rp });
            }
          }
          walk(sourcePath, destPath);
          let bytes = 0;
          await mapPool(jobs, 4, async (job) => {
            const r = await remoteUploadFromLocal(destDeviceId, job.local, job.remote);
            bytes += r.bytes;
          });
          const ms = Math.max(1, Math.round(performance.now() - started));
          const mbps = Number(((bytes * 8) / (ms / 1000) / 1_000_000).toFixed(2));
          const result = { files: jobs.length, bytes, ms, mbps, parallel: 4, direction: "push" };
          appendActivity(
            "copy_push",
            `${sourcePath} → ${destDeviceId}:${destPath} (${mbps} Mbps)`,
            true,
            "ui",
          );
          res.json({ ok: true, result });
          return;
        }
        const r = await remoteUploadFromLocal(destDeviceId, sourcePath, destPath);
        const ms = Math.max(1, Math.round(performance.now() - started));
        const mbps = Number(((r.bytes * 8) / (ms / 1000) / 1_000_000).toFixed(2));
        const result = { ...r, ms, mbps, direction: "push" };
        appendActivity("copy_push", `${sourcePath} → ${destPath} (${mbps} Mbps)`, true, "ui");
        res.json({ ok: true, result });
        return;
      }

      res.status(400).json({
        error: "Unsupported copy direction for these device ids.",
      });
    } catch (e) {
      appendActivity("copy", e instanceof Error ? e.message : String(e), false, "ui");
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/activity", (req, res) => {
    if (!requireLocal(req, res)) return;
    res.json(loadActivity());
  });

  app.post("/api/kill", (req, res) => {
    if (!requireLocal(req, res)) return;
    appendActivity("kill_switch", "disconnect requested", true, "ui");
    res.json({ ok: true, message: "Porter will stop accepting work. Process exit shortly." });
    setTimeout(() => process.exit(0), 300);
  });

  // Static Finder UI — localhost only (never expose the admin UI via Cloudflare URL)
  const staticDir =
    opts?.staticDir ||
    path.resolve(__dirname, "../../../apps/desktop/dist");
  if (fs.existsSync(staticDir)) {
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (!isLocalRequest(req)) {
        res
          .status(404)
          .type("text/plain")
          .send("Porter UI is only available on this Mac (http://127.0.0.1:47831).");
        return;
      }
      next();
    });
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (req, res) => {
      if (!isLocalRequest(req)) {
        res.status(404).end();
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  hydrateManualPeers();
  startDiscovery();
  // Reconnect saved peers automatically (same token + Tailscale/LAN IP from first Add peer)
  void refreshPeerHealth();
  setInterval(() => {
    void refreshPeerHealth();
  }, 15_000);

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, "0.0.0.0", () => resolve());
    server.on("error", reject);
  });

  appendActivity("server_start", `port ${config.port}`, true);
  maybeStartPreventSleep();
  // Fire-and-forget: away-mode auto tunnel (does not block listen)
  void maybeAutoStartTunnel(config.port);
  return { port: config.port };
}
