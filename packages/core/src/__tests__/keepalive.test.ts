import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PORTER_KEEPALIVE_REV, writeStartPorterScript } from "../keepalive.js";

test("writeStartPorterScript embeds patient health + keepalive rev", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porter-ka-"));
  try {
    const scriptPath = writeStartPorterScript({
      homeDir: tmp,
      resources: "/Applications/Porter.app/Contents/Resources",
      port: 47831,
      version: "0.2.26",
    });
    const body = fs.readFileSync(scriptPath, "utf8");
    assert.match(body, new RegExp(`PORTER_KEEPALIVE_REV=${PORTER_KEEPALIVE_REV}`));
    assert.match(body, /curl -sf -m 12 --connect-timeout 2/);
    assert.match(body, /sleep 2/);
    assert.match(body, /PORTER_VERSION="0\.2\.26"/);
    assert.match(body, /\/Applications\/Porter\.app\/Contents\/Resources/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
