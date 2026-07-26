/**
 * OPEN_LAN must stay dual-gated — never enable with a single env var.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { openLanAuthBypassEnabled } from "../peer.js";

test("OPEN_LAN bypass requires both env flags (no single-flag regression)", () => {
  const prevOpen = process.env.PORTER_OPEN_LAN;
  const prevUnderstand = process.env.PORTER_I_UNDERSTAND_OPEN_LAN;
  try {
    delete process.env.PORTER_OPEN_LAN;
    delete process.env.PORTER_I_UNDERSTAND_OPEN_LAN;
    assert.equal(openLanAuthBypassEnabled(), false);

    process.env.PORTER_OPEN_LAN = "1";
    delete process.env.PORTER_I_UNDERSTAND_OPEN_LAN;
    assert.equal(openLanAuthBypassEnabled(), false, "OPEN_LAN alone must not bypass auth");

    delete process.env.PORTER_OPEN_LAN;
    process.env.PORTER_I_UNDERSTAND_OPEN_LAN = "1";
    assert.equal(
      openLanAuthBypassEnabled(),
      false,
      "I_UNDERSTAND alone must not bypass auth",
    );

    process.env.PORTER_OPEN_LAN = "1";
    process.env.PORTER_I_UNDERSTAND_OPEN_LAN = "1";
    assert.equal(openLanAuthBypassEnabled(), true);

    process.env.PORTER_OPEN_LAN = "true";
    process.env.PORTER_I_UNDERSTAND_OPEN_LAN = "1";
    assert.equal(openLanAuthBypassEnabled(), false, "only exact '1' counts");
  } finally {
    if (prevOpen === undefined) delete process.env.PORTER_OPEN_LAN;
    else process.env.PORTER_OPEN_LAN = prevOpen;
    if (prevUnderstand === undefined) delete process.env.PORTER_I_UNDERSTAND_OPEN_LAN;
    else process.env.PORTER_I_UNDERSTAND_OPEN_LAN = prevUnderstand;
  }
});
