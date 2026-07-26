import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  assertDestFileNameAllowed,
  computerNoun,
  isAbsoluteForPlatform,
  joinLocal,
  porterPlatform,
  porterSupportDir,
  sanitizeWindowsFileName,
  windowsFileNameIssues,
} from "../platform/index.js";
import {
  mcpClaudeDesktopConfigPath,
  mcpCursorConfigPath,
  mcpVscodeConfigPath,
} from "../platform/mcpPaths.js";
import { PORTER_KEEPALIVE_REV, writeStartPorterScript } from "../keepalive.js";
import fs from "node:fs";
import os from "node:os";
import { DANGEROUS_PATH_FRAGMENTS } from "@porter/protocol";

test("porterPlatform maps node platforms", () => {
  assert.equal(porterPlatform("darwin"), "darwin");
  assert.equal(porterPlatform("win32"), "win32");
  assert.equal(porterPlatform("linux"), "linux");
});

test("computerNoun keeps Mac label on darwin", () => {
  assert.equal(computerNoun("darwin"), "Mac");
  assert.equal(computerNoun("win32"), "PC");
});

test("darwin support dir stays Library Application Support", () => {
  const d = porterSupportDir("/Users/demo", "darwin");
  assert.equal(d, "/Users/demo/Library/Application Support/Porter");
});

test("win32 support dir uses Local AppData", () => {
  const prev = process.env.LOCALAPPDATA;
  delete process.env.LOCALAPPDATA;
  try {
    const d = porterSupportDir("C:\\Users\\demo", "win32");
    assert.match(d.replaceAll("/", "\\"), /AppData\\Local\\Porter$/i);
  } finally {
    if (prev !== undefined) process.env.LOCALAPPDATA = prev;
  }
});

test("path opacity: remote Windows path stays absolute for win32 helper", () => {
  assert.equal(isAbsoluteForPlatform("C:\\Users\\a\\proj\\file.txt", "win32"), true);
  assert.equal(isAbsoluteForPlatform("/Users/a/proj/file.txt", "darwin"), true);
  // Local join must not be applied to remote strings — only local segments
  const local = joinLocal("/tmp/inbox", "hello.txt");
  assert.ok(local.includes("hello.txt"));
  assert.equal(path.posix.isAbsolute("/Users/remote/a"), true);
  assert.equal(path.win32.isAbsolute("D:\\data\\b"), true);
});

test("Windows illegal filenames fail loud for win32 dest", () => {
  assert.ok(windowsFileNameIssues("foo:bar.txt"));
  assert.ok(windowsFileNameIssues("trailing."));
  assert.throws(() => assertDestFileNameAllowed("bad|name.txt", "win32"));
  assert.doesNotThrow(() => assertDestFileNameAllowed("bad|name.txt", "darwin"));
  assert.equal(sanitizeWindowsFileName("a:b*.txt"), "a_b_.txt");
});

test("MCP paths: darwin Claude stays Library; win32 uses AppData", () => {
  const home = "/Users/x";
  assert.equal(
    mcpClaudeDesktopConfigPath(home, "darwin"),
    "/Users/x/Library/Application Support/Claude/claude_desktop_config.json",
  );
  const winHome = "C:\\Users\\x";
  const prev = process.env.APPDATA;
  process.env.APPDATA = "C:\\Users\\x\\AppData\\Roaming";
  try {
    assert.equal(
      mcpClaudeDesktopConfigPath(winHome, "win32").replaceAll("/", "\\"),
      "C:\\Users\\x\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
    );
    assert.equal(
      mcpVscodeConfigPath(winHome, "win32").replaceAll("/", "\\"),
      "C:\\Users\\x\\AppData\\Roaming\\Code\\User\\mcp.json",
    );
    assert.ok(mcpCursorConfigPath(winHome).includes(".cursor"));
  } finally {
    if (prev === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = prev;
  }
});

test("dangerous path fragments still include Mac blocks and add Windows", () => {
  assert.ok(DANGEROUS_PATH_FRAGMENTS.includes("Library/Keychains"));
  assert.ok(DANGEROUS_PATH_FRAGMENTS.includes("AppData/Microsoft/Credentials"));
});

test("Travel Ready keep-alive script generation stays Mac LaunchAgent semantics", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porter-travel-lock-"));
  try {
    const scriptPath = writeStartPorterScript({
      homeDir: tmp,
      resources: "/Applications/Porter.app/Contents/Resources",
      port: 47831,
      version: "0.2.34",
    });
    const body = fs.readFileSync(scriptPath, "utf8");
    assert.match(body, new RegExp(`PORTER_KEEPALIVE_REV=${PORTER_KEEPALIVE_REV}`));
    assert.match(body, /Library\/Application Support\/Porter/);
    assert.match(body, /\/Applications\/Porter\.app\/Contents\/Resources/);
    assert.match(body, /packages\/core\/dist\/cli\.js/);
    assert.doesNotMatch(body, /Program Files/i);
    assert.doesNotMatch(body, /Task Scheduler/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
