#!/usr/bin/env node
import { loadConfig, addSharedFolder, PORTER_DIR } from "./config.js";
import { startServer } from "./server.js";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const config = loadConfig();

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`Porter — private AI + Finder file bridge (no cloud)

Usage:
  porter serve              Start agent + Finder UI (http://127.0.0.1:${config.port})
  porter share <path>       Approve a folder (read+copy)
  porter share-write <path> Approve a folder with write
  porter mcp                Run MCP stdio server for Cursor
  porter status             Print device info

Config: ${PORTER_DIR}
`);
    return;
  }

  if (cmd === "status") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  if (cmd === "share" || cmd === "share-write") {
    const folderPath = rest[0];
    if (!folderPath) {
      console.error("Need a folder path");
      process.exit(1);
    }
    const perms =
      cmd === "share-write"
        ? (["read", "copy", "write"] as const)
        : (["read", "copy"] as const);
    const folder = addSharedFolder(folderPath, "", [...perms]);
    console.log("Shared:", folder);
    return;
  }

  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }

  if (cmd === "serve") {
    const { port } = await startServer();
    const url = `http://127.0.0.1:${port}`;
    console.log(`Porter is awake on ${url}`);
    console.log(`Device: ${config.deviceName} (${config.deviceId})`);
    console.log(`Pair token (copy to other Mac Settings): ${config.token}`);
    console.log("Add folders in the UI, or: npm run start -w @porter/core -- share ~/Projects");
    if (process.env.PORTER_OPEN_BROWSER !== "0") {
      exec(`open "${url}"`);
    }
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
