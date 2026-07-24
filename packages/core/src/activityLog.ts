import fs from "node:fs";
import type { ActivityEvent } from "@porter/protocol";
import {
  ACTIVITY_PATH,
  ensurePorterDir,
  loadActivity,
  loadConfig,
  normalizeActivityLog,
  type ActivityLogSettings,
  type PorterConfig,
} from "./config.js";

export type ActivityCategory =
  | "transfers"
  | "devices"
  | "shares"
  | "travel"
  | "mcp"
  | "system";

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "transfers",
  "devices",
  "shares",
  "travel",
  "mcp",
  "system",
];

export const RETAIN_DAY_OPTIONS = [0, 7, 30, 90, 365] as const;

const TRANSFER_ACTIONS = new Set([
  "copy",
  "copy_remote",
  "copy_push",
  "sync_one_way",
  "download",
  "upload",
]);

const DEVICE_ACTIONS = new Set(["peer_add", "peer_remove", "pair_token"]);

const SHARE_ACTIONS = new Set(["share_add", "share_remove", "travel_presets"]);

const TRAVEL_ACTIONS = new Set([
  "set_and_forget",
  "travel_repair",
  "keepalive",
  "prevent_sleep",
  "open_tailscale_download",
  "open_tailscale_app",
  "open_tailscale_ssh",
  "open_tailscale_signup",
  "tailscale_serve",
]);

const SYSTEM_ACTIONS = new Set([
  "sleep",
  "wake",
  "server_start",
  "device_update",
  "kill_switch",
  "mcp_install_cursor",
]);

export function getActivityLogSettings(config?: PorterConfig): ActivityLogSettings {
  return normalizeActivityLog((config ?? loadConfig()).activityLog);
}

/** Map an activity action (+ optional source) to a retention category. */
export function categoryForAction(action: string, source?: string): ActivityCategory {
  const a = (action || "").trim();
  const src = (source || "").trim().toLowerCase();

  if (src === "mcp" || a.startsWith("mcp_")) return "mcp";
  if (TRANSFER_ACTIONS.has(a)) return "transfers";
  if (DEVICE_ACTIONS.has(a)) return "devices";
  if (SHARE_ACTIONS.has(a) || a.startsWith("chrome_")) return "shares";
  if (
    TRAVEL_ACTIONS.has(a) ||
    a.startsWith("cloudflare_") ||
    a.startsWith("tailscale_") ||
    a.startsWith("open_tailscale_")
  ) {
    return "travel";
  }
  if (SYSTEM_ACTIONS.has(a) || a.startsWith("update_")) return "system";
  return "system";
}

export function shouldRecordActivity(
  settings: ActivityLogSettings,
  action: string,
  ok: boolean,
  source?: string,
): boolean {
  if (!ok && settings.keepFailures) return true;
  const cat = categoryForAction(action, source);
  return settings.categories[cat] !== false;
}

export function pruneActivityEvents(
  events: ActivityEvent[],
  settings: ActivityLogSettings,
  nowMs = Date.now(),
): ActivityEvent[] {
  let next = events;
  if (settings.retainDays > 0) {
    const cutoff = nowMs - settings.retainDays * 24 * 60 * 60 * 1000;
    next = next.filter((e) => {
      const t = Date.parse(e.at);
      if (!Number.isFinite(t)) return true;
      return t >= cutoff;
    });
  }
  if (next.length > settings.maxEvents) {
    next = next.slice(0, settings.maxEvents);
  }
  return next;
}

export function saveActivity(events: ActivityEvent[]): void {
  ensurePorterDir();
  try {
    fs.writeFileSync(ACTIVITY_PATH, JSON.stringify(events, null, 2), { mode: 0o600 });
  } catch (err) {
    console.warn("[porter] could not write activity log:", err instanceof Error ? err.message : err);
  }
}

/** Load, prune by settings, rewrite if anything was dropped. */
export function loadAndPruneActivity(settings?: ActivityLogSettings): ActivityEvent[] {
  const cfg = settings ?? getActivityLogSettings();
  const events = loadActivity();
  const pruned = pruneActivityEvents(events, cfg);
  if (pruned.length !== events.length) {
    saveActivity(pruned);
  }
  return pruned;
}

export function deleteActivityByIds(ids: string[]): { deleted: number } {
  const idSet = new Set(ids.filter(Boolean));
  if (idSet.size === 0) return { deleted: 0 };
  const events = loadActivity();
  const next = events.filter((e) => !idSet.has(e.id));
  const deleted = events.length - next.length;
  if (deleted > 0) saveActivity(next);
  return { deleted };
}

export function clearActivity(): { deleted: number } {
  const events = loadActivity();
  const deleted = events.length;
  saveActivity([]);
  return { deleted };
}

export function filterActivityEvents(
  events: ActivityEvent[],
  opts?: { q?: string; ok?: boolean | null; ids?: string[] },
): ActivityEvent[] {
  let next = events;
  if (opts?.ids?.length) {
    const idSet = new Set(opts.ids);
    next = next.filter((e) => idSet.has(e.id));
  }
  const q = opts?.q?.trim().toLowerCase();
  if (q) {
    next = next.filter((e) => {
      const hay = [e.action, e.detail, e.humanMessage, e.source, e.via]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (opts?.ok === true || opts?.ok === false) {
    next = next.filter((e) => e.ok === opts.ok);
  }
  return next;
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function activityEventsToCsv(events: ActivityEvent[]): string {
  const header = [
    "at",
    "action",
    "ok",
    "source",
    "via",
    "durationMs",
    "bytes",
    "mbps",
    "detail",
    "humanMessage",
    "id",
  ];
  const lines = [header.join(",")];
  for (const e of events) {
    lines.push(
      [
        csvEscape(e.at),
        csvEscape(e.action),
        csvEscape(e.ok),
        csvEscape(e.source),
        csvEscape(e.via),
        csvEscape(e.durationMs),
        csvEscape(e.bytes),
        csvEscape(e.mbps),
        csvEscape(e.detail),
        csvEscape(e.humanMessage),
        csvEscape(e.id),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function exportActivityEvents(opts?: {
  q?: string;
  ok?: boolean | null;
  ids?: string[];
  format?: "json" | "csv";
}): { body: string; contentType: string; filename: string; count: number } {
  const settings = getActivityLogSettings();
  let events = filterActivityEvents(loadAndPruneActivity(settings), opts);
  if (events.length > settings.maxEvents) {
    events = events.slice(0, settings.maxEvents);
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const format = opts?.format === "csv" ? "csv" : "json";
  if (format === "csv") {
    return {
      body: activityEventsToCsv(events),
      contentType: "text/csv; charset=utf-8",
      filename: `porter-activity-${stamp}.csv`,
      count: events.length,
    };
  }
  return {
    body: JSON.stringify(events, null, 2),
    contentType: "application/json; charset=utf-8",
    filename: `porter-activity-${stamp}.json`,
    count: events.length,
  };
}
