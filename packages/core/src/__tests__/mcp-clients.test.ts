import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  installMcpClient,
  listMcpClients,
  mergeMcpConfigFile,
  porterMcpStdioEntry,
  porterVscodeStdioEntry,
} from "../mcpClients.js";

describe("mcpClients merge", () => {
  let tmp: string;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porter-mcp-"));
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("preserves foreign mcpServers when merging", () => {
    const configPath = path.join(tmp, "cursor", "mcp.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            slack: { command: "npx", args: ["slack-mcp"] },
          },
        },
        null,
        2,
      ),
    );
    const entry = porterMcpStdioEntry("/fake/porter/mcp.js");
    const r = mergeMcpConfigFile({
      configPath,
      rootKey: "mcpServers",
      porterValue: entry,
    });
    assert.equal(r.alreadyPresent, false);
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    assert.ok(parsed.mcpServers.slack);
    assert.deepEqual(parsed.mcpServers.porter, entry);
  });

  it("creates missing VS Code servers file with stdio shape", () => {
    const configPath = path.join(tmp, "Code", "User", "mcp.json");
    const entry = porterVscodeStdioEntry("/fake/porter/mcp.js");
    const r = mergeMcpConfigFile({
      configPath,
      rootKey: "servers",
      porterValue: entry,
    });
    assert.equal(r.alreadyPresent, false);
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      servers: { porter: Record<string, unknown> };
    };
    assert.equal(parsed.servers.porter.type, "stdio");
    assert.equal(parsed.servers.porter.command, "node");
  });

  it("installMcpClient writes Claude Desktop config under custom home", () => {
    const home = path.join(tmp, "home-claude");
    fs.mkdirSync(home, { recursive: true });
    const result = installMcpClient("claudeDesktop", { home });
    assert.equal(result.clientId, "claudeDesktop");
    assert.ok(fs.existsSync(result.path));
    const parsed = JSON.parse(fs.readFileSync(result.path, "utf8")) as {
      mcpServers: { porter: { command: string; args: string[] } };
    };
    assert.equal(parsed.mcpServers.porter.command, "node");
    assert.ok(parsed.mcpServers.porter.args[0]?.endsWith("mcp.js"));

    const listed = listMcpClients({ home });
    const claude = listed.find((c) => c.id === "claudeDesktop");
    assert.ok(claude?.installed);
  });

  it("rejects unknown client id", () => {
    assert.throws(() => installMcpClient("notARealIde", { home: tmp }), /Unknown MCP client/);
  });
});
