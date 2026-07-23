/**
 * Security regression tests — Cloudflare-as-localhost must not bypass auth.
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
const ROOT = path.resolve(__dirname, "../../../..");
const PORT = 48000 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

let child: ChildProcess | null = null;
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
      throw new Error(`Porter exited early: ${childLog.join("")}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`not healthy: ${childLog.join("")}`);
}

before(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "porter-sec-"));
  const porterDir = path.join(home, ".porter");
  fs.mkdirSync(porterDir, { mode: 0o700 });
  const token = randomBytes(24).toString("hex");
  fs.writeFileSync(
    path.join(porterDir, "config.json"),
    JSON.stringify({
      deviceId: createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 16),
      deviceName: "Sec-Test",
      port: PORT,
      sharedFolders: [],
      sleepAfterMinutes: 5,
      allowSecretFiles: false,
      requireConfirmWrites: true,
      pairedDeviceIds: [],
      token,
      wizard: { completed: true, step: 3, agentLinkAcknowledged: true, mcpInstalled: false },
      sleeping: false,
    }),
  );
  (globalThis as { __porterSecToken?: string }).__porterSecToken = token;

  child = spawn(
    process.execPath,
    [path.join(ROOT, "packages/core/dist/cli.js"), "serve"],
    {
      env: {
        ...process.env,
        HOME: home,
        PORTER_NO_BONJOUR: "1",
        PORTER_OPEN_BROWSER: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (b) => childLog.push(String(b)));
  child.stderr?.on("data", (b) => childLog.push(String(b)));
  await waitHealthy();
});

after(() => {
  child?.kill("SIGTERM");
});

describe("security bridges", () => {
  it("rejects device/token APIs when Cloudflare headers are present (tunnel spoof)", async () => {
    const res = await fetch(`${BASE}/api/device`, {
      headers: { "cf-ray": "test", "cf-connecting-ip": "1.2.3.4" },
    });
    assert.equal(res.status, 401);
  });

  it("rejects travel-ready without auth even with CF headers", async () => {
    const res = await fetch(`${BASE}/api/travel-ready`, {
      headers: { "cf-ray": "test" },
    });
    assert.equal(res.status, 401);
  });

  it("allows health without auth but strips lan over CF headers", async () => {
    const res = await fetch(`${BASE}/api/health`, {
      headers: { "cf-ray": "test", "cf-connecting-ip": "1.2.3.4" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { lan?: string };
    assert.equal(body.lan, undefined);
  });

  it("rejects folders without pair token when CF headers present", async () => {
    const res = await fetch(`${BASE}/api/folders`, {
      headers: { "cf-ray": "test" },
    });
    assert.equal(res.status, 401);
  });

  it("allows folders with pair token even via CF headers", async () => {
    const token = (globalThis as { __porterSecToken?: string }).__porterSecToken!;
    const res = await fetch(`${BASE}/api/folders`, {
      headers: {
        "cf-ray": "test",
        Authorization: `Bearer ${token}`,
        "X-Porter-Pair": token,
        "X-Porter-Device": "remote-peer",
      },
    });
    assert.equal(res.status, 200);
  });

  it("still allows local device API without CF headers", async () => {
    const res = await fetch(`${BASE}/api/device`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { token: string };
    assert.ok(body.token.length >= 16);
  });
});
