/**
 * End-to-end tests against an isolated Porter core instance.
 * Run: npm run test:e2e
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// packages/core/src/__tests__ OR packages/core/dist/__tests__ → repo root
const ROOT = path.resolve(__dirname, "../../../..");
const PORT = Number(process.env.PORTER_TEST_PORT || 0) || 47000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

let child: ChildProcess | null = null;
let tmpShare = "";
let tmpInbox = "";
let home = "";
const childLog: string[] = [];

async function waitHealthy(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    if (child?.exitCode != null) {
      throw new Error(`Porter exited early (${child.exitCode}): ${childLog.join("")}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Porter did not become healthy in time on ${PORT}: ${childLog.join("")}`);
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  assert.ok(res.ok, `HTTP ${res.status} ${url}: ${JSON.stringify(body)}`);
  return body as T;
}

describe("Porter e2e", { timeout: 60_000 }, () => {
  before(async () => {
    tmpShare = fs.mkdtempSync(path.join(os.tmpdir(), "porter-share-"));
    tmpInbox = fs.mkdtempSync(path.join(os.tmpdir(), "porter-inbox-"));
    home = fs.mkdtempSync(path.join(os.tmpdir(), "porter-home-"));
    fs.writeFileSync(path.join(tmpShare, "hello.txt"), "porter-e2e-hello\n");
    fs.mkdirSync(path.join(tmpShare, "nested"));
    fs.writeFileSync(path.join(tmpShare, "nested", "a.md"), "# a\n");

    const porterDir = path.join(home, ".porter");
    fs.mkdirSync(porterDir, { mode: 0o700 });
    fs.writeFileSync(
      path.join(porterDir, "config.json"),
      JSON.stringify(
        {
          deviceId: createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 16),
          deviceName: "Porter-E2E",
          port: PORT,
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
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );

    const cli = path.join(ROOT, "packages/core/dist/cli.js");
    child = spawn(process.execPath, [cli, "serve"], {
      env: {
        ...process.env,
        HOME: home,
        PORTER_OPEN_BROWSER: "0",
        PORTER_NO_BONJOUR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) => childLog.push(d.toString()));
    child.stderr?.on("data", (d: Buffer) => childLog.push(d.toString()));
    await waitHealthy();

    await json(`${BASE}/api/folders`, {
      method: "POST",
      body: JSON.stringify({ path: tmpShare, label: "share", permissions: ["read", "copy"] }),
    });
    await json(`${BASE}/api/folders`, {
      method: "POST",
      body: JSON.stringify({
        path: tmpInbox,
        label: "inbox",
        permissions: ["read", "copy", "write"],
      }),
    });
  });

  after(() => {
    child?.kill("SIGTERM");
    for (const p of [tmpShare, tmpInbox, home]) {
      try {
        if (p) fs.rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("health reports version and awake", async () => {
    const h = await json<{ ok: boolean; sleeping: boolean; version: string }>(`${BASE}/api/health`);
    assert.equal(h.ok, true);
    assert.equal(h.sleeping, false);
    assert.ok(h.version);
  });

  it("lists devices including local", async () => {
    const devices = await json<Array<{ isLocal: boolean }>>(`${BASE}/api/devices`);
    assert.ok(devices.some((d) => d.isLocal));
  });

  it("lists and searches shared files", async () => {
    const entries = await json<Array<{ name: string }>>(
      `${BASE}/api/files/list?path=${encodeURIComponent(tmpShare)}`,
    );
    assert.ok(entries.some((e) => e.name === "hello.txt"));
    const hits = await json<Array<{ name: string }>>(
      `${BASE}/api/files/search?q=${encodeURIComponent("hello")}`,
    );
    assert.ok(hits.some((h) => h.name === "hello.txt"));
  });

  it("reads file content", async () => {
    const file = await json<{ content: string }>(
      `${BASE}/api/files/read?path=${encodeURIComponent(path.join(tmpShare, "hello.txt"))}`,
    );
    assert.match(file.content, /porter-e2e-hello/);
  });

  it("copies file into write inbox with checksum", async () => {
    const dest = path.join(tmpInbox, "hello-copy.txt");
    const device = await json<{ id: string }>(`${BASE}/api/device`);
    const result = await json<{
      ok: boolean;
      result: { sha256?: string; bytes?: number; mbps?: number; ms?: number };
    }>(
      `${BASE}/api/files/copy`,
      {
        method: "POST",
        body: JSON.stringify({
          sourceDeviceId: device.id,
          sourcePath: path.join(tmpShare, "hello.txt"),
          destDeviceId: device.id,
          destPath: dest,
          isDirectory: false,
        }),
      },
    );
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(dest));
    assert.equal(fs.readFileSync(dest, "utf8"), "porter-e2e-hello\n");
    assert.ok(result.result.sha256);
    assert.equal(typeof result.result.mbps, "number");
    assert.ok((result.result.mbps ?? 0) >= 0);
  });

  it("copies folder", async () => {
    const dest = path.join(tmpInbox, "nested-copy");
    const device = await json<{ id: string }>(`${BASE}/api/device`);
    await json(`${BASE}/api/files/copy`, {
      method: "POST",
      body: JSON.stringify({
        sourceDeviceId: device.id,
        sourcePath: path.join(tmpShare, "nested"),
        destDeviceId: device.id,
        destPath: dest,
        isDirectory: true,
      }),
    });
    assert.ok(fs.existsSync(path.join(dest, "a.md")));
  });

  it("setup wizard snapshot and step update", async () => {
    const snap = await json<{ step: number; hasSharedFolder: boolean }>(`${BASE}/api/setup`);
    assert.equal(snap.hasSharedFolder, true);
    const next = await json<{ step: number }>(`${BASE}/api/setup`, {
      method: "PATCH",
      body: JSON.stringify({ step: 2 }),
    });
    assert.equal(next.step, 2);
  });

  it("mcp snippet points at mcp.js", async () => {
    const snip = await json<{ entryPath: string; json: string }>(`${BASE}/api/mcp/snippet`);
    assert.match(snip.entryPath, /mcp\.js$/);
    assert.match(snip.json, /porter/);
  });

  it("sleep and wake", async () => {
    await json(`${BASE}/api/sleep`, { method: "POST", body: "{}" });
    let h = await json<{ sleeping: boolean }>(`${BASE}/api/health`);
    assert.equal(h.sleeping, true);
    await json(`${BASE}/api/wake`, { method: "POST", body: "{}" });
    h = await json<{ sleeping: boolean }>(`${BASE}/api/health`);
    assert.equal(h.sleeping, false);
  });

  it("blocks paths outside allowlist", async () => {
    const res = await fetch(
      `${BASE}/api/files/list?path=${encodeURIComponent(os.homedir())}`,
    );
    assert.equal(res.status, 400);
  });

  it("activity API returns paged object with search", async () => {
    const page = await json<{
      events: Array<{ action: string; durationMs?: number }>;
      total: number;
      limit: number;
      offset: number;
    }>(`${BASE}/api/activity?limit=5&offset=0`);
    assert.ok(typeof page.total === "number");
    assert.equal(page.limit, 5);
    assert.equal(page.offset, 0);
    assert.ok(Array.isArray(page.events));
    assert.ok(page.events.length <= 5);

    const filtered = await json<{ events: Array<{ ok: boolean }>; total: number }>(
      `${BASE}/api/activity?ok=true&limit=20&offset=0`,
    );
    assert.ok(filtered.events.every((e) => e.ok === true));
  });

  it("removes a peer locally and logs peer_remove", async () => {
    const peer = await json<{ id: string; name: string }>(`${BASE}/api/peers`, {
      method: "POST",
      body: JSON.stringify({
        host: "127.0.0.1",
        port: 1,
        name: "E2E-Remove-Me",
      }),
    });
    assert.ok(peer.id);

    const removed = await json<{ ok: boolean; notified: boolean; detail: string }>(
      `${BASE}/api/peers/${encodeURIComponent(peer.id)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ notifyRemote: false }),
      },
    );
    assert.equal(removed.ok, true);
    assert.equal(removed.notified, false);

    const devices = await json<Array<{ id: string }>>(`${BASE}/api/devices`);
    assert.ok(!devices.some((d) => d.id === peer.id));

    const activity = await json<{
      events: Array<{ action: string; humanMessage?: string; durationMs?: number }>;
    }>(`${BASE}/api/activity?q=peer_remove&limit=10&offset=0`);
    assert.ok(activity.events.some((e) => e.action === "peer_remove"));
    assert.ok(
      activity.events.some(
        (e) => e.action === "peer_remove" && typeof e.durationMs === "number",
      ),
    );
  });

  it("forget-remote requires auth and drops caller", async () => {
    const device = await json<{ id: string; token: string }>(`${BASE}/api/device`);
    const foreignId = "foreign-device-e2e";

    const denied = await fetch(`${BASE}/api/peers/forget-remote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    // Local without auth headers → 401
    assert.equal(denied.status, 401);

    const ok = await fetch(`${BASE}/api/peers/forget-remote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${device.token}`,
        "X-Porter-Pair": device.token,
        "X-Porter-Device": foreignId,
      },
      body: "{}",
    });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { ok: boolean };
    assert.equal(body.ok, true);

    const cfg = JSON.parse(
      fs.readFileSync(path.join(home, ".porter", "config.json"), "utf8"),
    ) as { forgottenDeviceIds: string[] };
    assert.ok(cfg.forgottenDeviceIds.includes(foreignId));
  });
});
