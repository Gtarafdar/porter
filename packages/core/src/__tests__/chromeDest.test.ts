import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chromeShareKind,
  findChromeShare,
  matchingChromeDestDir,
  relativeUnderShare,
} from "../chromeDest.js";
import type { SharedFolder } from "@porter/protocol";

describe("chromeDest helpers", () => {
  it("detects chrome share kinds by label", () => {
    assert.equal(chromeShareKind("Chrome Extensions", "/x"), "extensions");
    assert.equal(chromeShareKind("Chrome Extension Data", "/x"), "data");
    assert.equal(
      chromeShareKind("Chrome Extension Data (Local Extension Settings)", "/x"),
      "data",
    );
    assert.equal(chromeShareKind("Downloads", "/Users/a/Downloads"), null);
  });

  it("finds matching dest share", () => {
    const shares: SharedFolder[] = [
      {
        id: "1",
        path: "/Users/b/Library/Application Support/Google/Chrome/Default/Extensions",
        label: "Chrome Extensions",
        permissions: ["read", "copy", "write"],
      },
      {
        id: "2",
        path: "/Users/b/Library/Application Support/Google/Chrome/Default/Local Extension Settings",
        label: "Chrome Extension Data",
        permissions: ["read", "copy", "write"],
      },
    ];
    assert.equal(findChromeShare(shares, "data")?.id, "2");
  });

  it("builds dest parent under matching share", () => {
    const src: SharedFolder = {
      id: "1",
      path: "/Users/a/Library/Application Support/Google/Chrome/Default/Local Extension Settings",
      label: "Chrome Extension Data",
      permissions: ["read", "copy"],
    };
    const dest: SharedFolder = {
      id: "2",
      path: "/Users/b/Library/Application Support/Google/Chrome/Default/Local Extension Settings",
      label: "Chrome Extension Data",
      permissions: ["read", "copy", "write"],
    };
    assert.equal(relativeUnderShare(`${src.path}/abcd`, src.path), "abcd");
    assert.equal(matchingChromeDestDir(`${src.path}/abcd`, src, dest), dest.path);
  });
});
