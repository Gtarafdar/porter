import assert from "node:assert/strict";
import test from "node:test";
import {
  WINDOWS_KEEPALIVE_TASK,
  windowsKeepAliveCreateArgs,
} from "../platform/windowsKeepAlive.js";

test("windowsKeepAliveCreateArgs builds ONLOGON Task Scheduler command", () => {
  const exe = "C:\\Program Files\\Porter\\Porter.exe";
  const args = windowsKeepAliveCreateArgs(exe);
  assert.equal(args[0], "/Create");
  assert.ok(args.includes("/TN"));
  assert.ok(args.includes(WINDOWS_KEEPALIVE_TASK));
  assert.ok(args.includes("/SC"));
  assert.ok(args.includes("ONLOGON"));
  assert.ok(args.includes("/RL"));
  assert.ok(args.includes("LIMITED"));
  const tr = args[args.indexOf("/TR") + 1];
  assert.match(tr, /Porter\.exe/);
  assert.doesNotMatch(tr, /LaunchAgent|caffeinate|start-porter\.sh/);
});
