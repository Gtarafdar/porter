/**
 * Isolated HOME so discovery/config persist under a temp dir.
 * Run alone: npx tsx --test packages/core/src/__tests__/peers-remove.test.ts
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "porter-peers-"));
process.env.HOME = home;
process.env.PORTER_NO_BONJOUR = "1";

const {
  loadConfig,
  saveConfig,
  isDeviceForgotten,
  queryActivity,
  appendActivity,
} = await import("../config.js");
const {
  registerManualPeer,
  removeManualPeer,
  noteSeenPeer,
  listDevices,
  hydrateManualPeers,
} = await import("../discovery.js");

describe("removeManualPeer + forgottenDeviceIds", () => {
  before(() => {
    const cfg = loadConfig();
    cfg.deviceName = "Peers-Test";
    saveConfig(cfg);
  });

  it("removeManualPeer persists deletion and forgets id", () => {
    const peer = registerManualPeer({
      id: "peer-aaa",
      name: "Travel",
      host: "100.64.0.2",
      port: 47831,
      via: "tailscale",
    });
    assert.equal(peer.id, "peer-aaa");
    assert.ok(listDevices().some((d) => d.id === "peer-aaa"));

    const removed = removeManualPeer("peer-aaa");
    assert.ok(removed);
    assert.equal(removed?.name, "Travel");
    assert.ok(!listDevices().some((d) => d.id === "peer-aaa"));
    assert.equal(isDeviceForgotten("peer-aaa"), true);

    const peersPath = path.join(home, ".porter", "manual-peers.json");
    const saved = JSON.parse(fs.readFileSync(peersPath, "utf8")) as { id: string }[];
    assert.ok(!saved.some((p) => p.id === "peer-aaa"));
    assert.ok(!loadConfig().pairedDeviceIds.includes("peer-aaa"));
  });

  it("noteSeenPeer does not re-add forgotten devices", () => {
    assert.equal(isDeviceForgotten("peer-aaa"), true);
    noteSeenPeer({
      id: "peer-aaa",
      name: "Travel",
      replyTailscale: "100.64.0.2",
    });
    assert.ok(!listDevices().some((d) => d.id === "peer-aaa"));
  });

  it("intentional register clears forgotten and re-adds", () => {
    registerManualPeer({
      id: "peer-aaa",
      name: "Travel Again",
      host: "100.64.0.2",
      port: 47831,
      via: "tailscale",
    });
    assert.equal(isDeviceForgotten("peer-aaa"), false);
    assert.ok(listDevices().some((d) => d.id === "peer-aaa" && d.name === "Travel Again"));
  });

  it("hydrateManualPeers skips forgotten ids", () => {
    removeManualPeer("peer-bbb");
    registerManualPeer({
      id: "peer-bbb",
      name: "Other",
      host: "100.64.0.3",
      port: 47831,
    });
    removeManualPeer("peer-bbb");
    // Force a stale file entry as if hydrate ran before forget filter existed
    const peersPath = path.join(home, ".porter", "manual-peers.json");
    fs.writeFileSync(
      peersPath,
      JSON.stringify(
        [
          {
            id: "peer-bbb",
            name: "Stale",
            host: "100.64.0.3",
            port: 47831,
            online: false,
            isLocal: false,
            via: "tailscale",
          },
        ],
        null,
        2,
      ),
    );
    hydrateManualPeers();
    assert.ok(!listDevices().some((d) => d.id === "peer-bbb"));
  });

  it("queryActivity pages and filters", () => {
    appendActivity("peer_remove", "Removed Travel", true, "ui", {
      durationMs: 12,
      humanMessage: "Removed Travel here",
      via: "tailscale",
    });
    appendActivity("copy", "fail detail", false, "ui", { durationMs: 5 });
    const all = queryActivity({ limit: 50, offset: 0 });
    assert.ok(all.total >= 2);
    assert.equal(all.events.length, Math.min(50, all.total));

    const failed = queryActivity({ ok: false, limit: 10, offset: 0 });
    assert.ok(failed.events.every((e) => e.ok === false));

    const q = queryActivity({ q: "peer_remove", limit: 10, offset: 0 });
    assert.ok(q.events.some((e) => e.action === "peer_remove"));
    assert.ok(q.events.some((e) => typeof e.durationMs === "number"));

    const page = queryActivity({ limit: 1, offset: 0 });
    assert.equal(page.limit, 1);
    assert.equal(page.events.length, 1);
    const page2 = queryActivity({ limit: 1, offset: 1 });
    assert.equal(page2.offset, 1);
    if (page2.total > 1) {
      assert.notEqual(page.events[0]?.id, page2.events[0]?.id);
    }
  });
});
