#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import {
  addSharedFolder,
  appendActivity,
  humanError,
  loadConfig,
  localDevice,
} from "./config.js";
import {
  copyFileLocal,
  copyFolderLocal,
  listDirectory,
  readFileLimited,
  searchFiles,
} from "./files.js";
import { listDevices, startDiscovery } from "./discovery.js";
import {
  remoteDownloadToLocal,
  remoteListDirectory,
  remoteListFolders,
  remoteReadFile,
  remoteSearch,
} from "./peer.js";

startDiscovery();

const server = new McpServer({
  name: "porter",
  version: "0.1.0",
});

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

async function timed<T>(
  action: string,
  detail: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - started);
    appendActivity(action, detail, true, "mcp", {
      durationMs,
      humanMessage: `Cursor/MCP ${action.replace(/^mcp_/, "").replaceAll("_", " ")} · ${durationMs} ms`,
      via: "mcp",
    });
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    appendActivity(action, humanError(err), false, "mcp", {
      durationMs,
      humanMessage: `Cursor/MCP failed: ${humanError(err)} (${durationMs} ms)`,
      via: "mcp",
    });
    throw err;
  }
}

server.tool(
  "list_devices",
  "List this Mac and other Porter devices discovered on LAN/Tailscale",
  {},
  async () =>
    timed("mcp_list_devices", "list devices", async () => {
      const devices = listDevices();
      return text(devices);
    }),
);

server.tool(
  "list_shared_folders",
  "List approved folders on a device (default: local)",
  {
    deviceId: z.string().optional().describe("Device id, or omit for local"),
  },
  async ({ deviceId }) =>
    timed("mcp_list_shared_folders", deviceId || "local", async () => {
      const c = loadConfig();
      if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
        return text(c.sharedFolders);
      }
      return text(await remoteListFolders(deviceId));
    }),
);

server.tool(
  "list_directory",
  "List files in an approved directory (Finder-style listing)",
  {
    path: z.string().describe("Absolute directory path inside an approved folder"),
    deviceId: z.string().optional(),
  },
  async ({ path: dirPath, deviceId }) =>
    timed("mcp_list_directory", dirPath, async () => {
      const c = loadConfig();
      if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
        return text(listDirectory(dirPath));
      }
      return text(await remoteListDirectory(deviceId, dirPath));
    }),
);

server.tool(
  "search_files",
  "Search file/folder names inside approved folders",
  {
    query: z.string(),
    deviceId: z.string().optional(),
  },
  async ({ query, deviceId }) =>
    timed("mcp_search_files", query, async () => {
      const c = loadConfig();
      if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
        return text(searchFiles(query));
      }
      return text(await remoteSearch(deviceId, query));
    }),
);

server.tool(
  "read_file",
  "Read a text file from an approved folder (size-limited)",
  {
    path: z.string(),
    deviceId: z.string().optional(),
  },
  async ({ path: filePath, deviceId }) =>
    timed("mcp_read_file", filePath, async () => {
      const c = loadConfig();
      if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
        return text(readFileLimited(filePath));
      }
      return text(await remoteReadFile(deviceId, filePath));
    }),
);

server.tool(
  "copy_file",
  "Copy a file onto this Mac (from local or a remote Porter device)",
  {
    sourcePath: z.string(),
    destPath: z.string(),
    sourceDeviceId: z.string().optional(),
  },
  async ({ sourcePath, destPath, sourceDeviceId }) =>
    timed("mcp_copy_file", `${sourcePath} → ${destPath}`, async () => {
      const c = loadConfig();
      const local =
        !sourceDeviceId || sourceDeviceId === "local" || sourceDeviceId === c.deviceId;
      if (local) {
        const result = copyFileLocal(sourcePath, destPath);
        return text({ ok: true, result });
      }
      const result = await remoteDownloadToLocal(sourceDeviceId!, sourcePath, destPath);
      return text({ ok: true, result });
    }),
);

server.tool(
  "copy_folder",
  "Copy a folder onto this Mac (from local or remote Porter device)",
  {
    sourcePath: z.string(),
    destPath: z.string(),
    sourceDeviceId: z.string().optional(),
  },
  async ({ sourcePath, destPath, sourceDeviceId }) =>
    timed("mcp_copy_folder", `${sourcePath} → ${destPath}`, async () => {
      const c = loadConfig();
      const local =
        !sourceDeviceId || sourceDeviceId === "local" || sourceDeviceId === c.deviceId;
      if (local) {
        const result = copyFolderLocal(sourcePath, destPath);
        return text({ ok: true, result });
      }
      const fs = await import("node:fs");
      let files = 0;
      let bytes = 0;
      async function pull(remoteDir: string, localDir: string): Promise<void> {
        const items = await remoteListDirectory(sourceDeviceId!, remoteDir);
        fs.mkdirSync(localDir, { recursive: true });
        for (const item of items) {
          if (item.isDirectory) {
            await pull(item.path, path.join(localDir, item.name));
          } else {
            const dest = path.join(localDir, item.name);
            const r = await remoteDownloadToLocal(sourceDeviceId!, item.path, dest);
            files += 1;
            bytes += r.bytes;
          }
        }
      }
      await pull(sourcePath, destPath);
      return text({ ok: true, result: { files, bytes } });
    }),
);

server.tool(
  "add_shared_folder",
  "Approve a local folder for Porter/AI access (read+copy by default)",
  {
    path: z.string(),
    label: z.string().optional(),
    write: z.boolean().optional().describe("Also allow writes into this folder"),
  },
  async ({ path: folderPath, label, write }) =>
    timed("mcp_add_shared_folder", folderPath, async () => {
      const permissions = write
        ? (["read", "copy", "write"] as const)
        : (["read", "copy"] as const);
      const folder = addSharedFolder(folderPath, label ?? "", [...permissions]);
      return text(folder);
    }),
);

server.tool(
  "porter_status",
  "Show local Porter device identity and share count",
  {},
  async () =>
    timed("mcp_porter_status", "status", async () => {
      const c = loadConfig();
      return text({
        device: localDevice(c),
        sharedFolders: c.sharedFolders.length,
        sleeping: c.sleeping,
      });
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
