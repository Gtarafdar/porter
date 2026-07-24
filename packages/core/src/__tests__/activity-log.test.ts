/**
 * Isolated HOME for activity log helpers.
 * Run: npx tsx --test packages/core/src/__tests__/activity-log.test.ts
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "porter-activity-"));
process.env.HOME = home;
process.env.PORTER_NO_BONJOUR = "1";

const {
  loadConfig,
  saveConfig,
  appendActivity,
  loadActivity,
  normalizeActivityLog,
} = await import("../config.js");
const {
  categoryForAction,
  shouldRecordActivity,
  pruneActivityEvents,
  deleteActivityByIds,
  clearActivity,
  activityEventsToCsv,
  exportActivityEvents,
  getActivityLogSettings,
} = await import("../activityLog.js");

describe("activity log management", () => {
  before(() => {
    const cfg = loadConfig();
    cfg.deviceName = "Activity-Test";
    cfg.activityLog = normalizeActivityLog({
      retainDays: 30,
      maxEvents: 100,
      keepFailures: true,
      categories: {
        transfers: true,
        devices: true,
        shares: true,
        travel: true,
        mcp: true,
        system: true,
      },
    });
    saveConfig(cfg);
  });

  it("maps actions to categories", () => {
    assert.equal(categoryForAction("copy"), "transfers");
    assert.equal(categoryForAction("peer_remove"), "devices");
    assert.equal(categoryForAction("share_add"), "shares");
    assert.equal(categoryForAction("cloudflare_tunnel"), "travel");
    assert.equal(categoryForAction("list_files", "mcp"), "mcp");
    assert.equal(categoryForAction("mcp_install_cursor"), "mcp");
    assert.equal(categoryForAction("sleep"), "system");
    assert.equal(categoryForAction("brand_new_thing"), "system");
  });

  it("gates recording by category but keeps failures", () => {
    const settings = normalizeActivityLog({
      categories: {
        transfers: false,
        devices: true,
        shares: true,
        travel: true,
        mcp: true,
        system: true,
      },
      keepFailures: true,
    });
    assert.equal(shouldRecordActivity(settings, "copy", true, "ui"), false);
    assert.equal(shouldRecordActivity(settings, "copy", false, "ui"), true);
    assert.equal(shouldRecordActivity(settings, "peer_add", true, "ui"), true);
  });

  it("prunes by age and maxEvents", () => {
    const settings = normalizeActivityLog({ retainDays: 7, maxEvents: 2 });
    const now = Date.parse("2026-07-24T12:00:00.000Z");
    const events = [
      { id: "1", at: "2026-07-24T11:00:00.000Z", action: "a", detail: "d", ok: true },
      { id: "2", at: "2026-07-20T11:00:00.000Z", action: "b", detail: "d", ok: true },
      { id: "3", at: "2026-06-01T11:00:00.000Z", action: "c", detail: "d", ok: true },
    ];
    const pruned = pruneActivityEvents(events, settings, now);
    assert.equal(pruned.length, 2);
    assert.ok(pruned.every((e) => e.id !== "3"));
    assert.deepEqual(
      pruned.map((e) => e.id),
      ["1", "2"],
    );
  });

  it("skips disabled category on appendActivity", () => {
    const cfg = loadConfig();
    cfg.activityLog = normalizeActivityLog({
      ...cfg.activityLog,
      categories: { ...cfg.activityLog.categories, system: false },
      keepFailures: true,
    });
    saveConfig(cfg);
    clearActivity();
    appendActivity("sleep", "skip me", true, "ui");
    assert.equal(loadActivity().length, 0);
    appendActivity("sleep", "fail keep", false, "ui");
    assert.equal(loadActivity().length, 1);
  });

  it("deletes by ids and clears all", () => {
    clearActivity();
    const cfg = loadConfig();
    cfg.activityLog = normalizeActivityLog({
      ...cfg.activityLog,
      categories: {
        transfers: true,
        devices: true,
        shares: true,
        travel: true,
        mcp: true,
        system: true,
      },
    });
    saveConfig(cfg);
    const a = appendActivity("copy", "one", true, "ui");
    const b = appendActivity("copy", "two", true, "ui");
    appendActivity("copy", "three", true, "ui");
    assert.equal(loadActivity().length, 3);
    const del = deleteActivityByIds([a.id, b.id]);
    assert.equal(del.deleted, 2);
    assert.equal(loadActivity().length, 1);
    const cleared = clearActivity();
    assert.equal(cleared.deleted, 1);
    assert.equal(loadActivity().length, 0);
  });

  it("exports csv with escaping", () => {
    const csv = activityEventsToCsv([
      {
        id: "abc",
        at: "2026-07-24T00:00:00.000Z",
        action: "copy",
        detail: 'say "hi", please',
        ok: true,
        source: "ui",
      },
    ]);
    assert.match(csv, /^at,action,ok,/);
    assert.match(csv, /"say ""hi"", please"/);
    assert.match(csv, /,abc\n$/);
  });

  it("exportActivityEvents returns json body", () => {
    clearActivity();
    appendActivity("peer_remove", "x", true, "ui", { durationMs: 3 });
    const exported = exportActivityEvents({ format: "json" });
    assert.equal(exported.contentType.includes("json"), true);
    assert.ok(exported.count >= 1);
    const parsed = JSON.parse(exported.body) as { action: string }[];
    assert.ok(parsed.some((e) => e.action === "peer_remove"));
    assert.equal(getActivityLogSettings().maxEvents >= 50, true);
  });
});
