import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePeerAddress, peerBases, deviceBaseUrl } from "../peer.js";
import type { DeviceInfo } from "@porter/protocol";

describe("peer address + failover", () => {
  it("parses cloudflare https URL", () => {
    const p = parsePeerAddress("https://abc.trycloudflare.com");
    assert.equal(p.via, "cloudflare");
    assert.equal(p.port, 443);
    assert.equal(p.baseUrl, "https://abc.trycloudflare.com");
  });

  it("parses Tailscale MagicDNS https as tailscale", () => {
    const p = parsePeerAddress("https://gobindas-mac-mini.tailc397c7.ts.net");
    assert.equal(p.via, "tailscale");
    assert.ok(p.baseUrl?.includes(".ts.net"));
  });

  it("parses tailscale IP", () => {
    const p = parsePeerAddress("100.100.1.2", 47831);
    assert.equal(p.via, "tailscale");
    assert.equal(p.port, 47831);
  });

  it("prefers Tailscale over Cloudflare by default", () => {
    const device: DeviceInfo = {
      id: "x",
      name: "Home",
      host: "abc.trycloudflare.com",
      port: 443,
      online: true,
      isLocal: false,
      via: "cloudflare",
      baseUrl: "https://abc.trycloudflare.com",
      fallbackHost: "100.100.1.2",
      fallbackPort: 47831,
    };
    const bases = peerBases(device);
    assert.equal(bases[0], "http://100.100.1.2:47831");
    assert.equal(bases[1], "https://abc.trycloudflare.com");
    assert.equal(deviceBaseUrl(device), "https://abc.trycloudflare.com");
  });

  it("prefers last-known Tailscale path when activeVia is tailscale", () => {
    const device: DeviceInfo = {
      id: "x",
      name: "Home",
      host: "abc.trycloudflare.com",
      port: 443,
      online: true,
      isLocal: false,
      via: "cloudflare",
      baseUrl: "https://abc.trycloudflare.com",
      fallbackHost: "100.100.1.2",
      fallbackPort: 47831,
      activeVia: "tailscale",
    };
    const bases = peerBases(device);
    assert.equal(bases[0], "http://100.100.1.2:47831");
    assert.equal(bases[1], "https://abc.trycloudflare.com");
  });
});
