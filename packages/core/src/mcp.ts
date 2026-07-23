#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import {
  addSharedFolder,
  appendActivity,
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

server.tool(
  "list_devices",
  "List this Mac and other Porter devices discovered on LAN/Tailscale",
  {},
  async () => {
    const devices = listDevices();
    appendActivity("mcp_list_devices", `${devices.length} devices`, true, "mcp");
    return text(devices);
  },
);

server.tool(
  "list_shared_folders",
  "List approved folders on a device (default: local)",
  {
    deviceId: z.string().optional().describe("Device id, or omit for local"),
  },
  async ({ deviceId }) => {
    const c = loadConfig();
    if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
      return text(c.sharedFolders);
    }
    return text(await remoteListFolders(deviceId));
  },
);

server.tool(
  "list_directory",
  "List files in an approved directory (Finder-style listing)",
  {
    path: z.string().describe("Absolute directory path inside an approved folder"),
    deviceId: z.string().optional(),
  },
  async ({ path: dirPath, deviceId }) => {
    const c = loadConfig();
    if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
      const entries = listDirectory(dirPath);
      appendActivity("mcp_list_directory", dirPath, true, "mcp");
      return text(entries);
    }
    const entries = await remoteListDirectory(deviceId, dirPath);
    appendActivity("mcp_list_directory_remote", dirPath, true, "mcp");
    return text(entries);
  },
);

server.tool(
  "search_files",
  "Search file/folder names inside approved folders",
  {
    query: z.string(),
    deviceId: z.string().optional(),
  },
  async ({ query, deviceId }) => {
    const c = loadConfig();
    if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
      return text(searchFiles(query));
    }
    return text(await remoteSearch(deviceId, query));
  },
);

server.tool(
  "read_file",
  "Read a text file from an approved folder (size-limited)",
  {
    path: z.string(),
    deviceId: z.string().optional(),
  },
  async ({ path: filePath, deviceId }) => {
    const c = loadConfig();
    if (!deviceId || deviceId === "local" || deviceId === c.deviceId) {
      return text(readFileLimited(filePath));
    }
    return text(await remoteReadFile(deviceId, filePath));
  },
);

server.tool(
  "copy_file",
  "Copy a file onto this Mac (from local or a remote Porter device)",
  {
    sourcePath: z.string(),
    destPath: z.string(),
    sourceDeviceId: z.string().optional(),
  },
  async ({ sourcePath, destPath, sourceDeviceId }) => {
    const c = loadConfig();
    const local = !sourceDeviceId || sourceDeviceId === "local" || sourceDeviceId === c.deviceId;
    if (local) {
      const result = copyFileLocal(sourcePath, destPath);
      appendActivity("mcp_copy_file", `${sourcePath} → ${destPath}`, true, "mcp");
      return text({ ok: true, result });
    }
    const result = await remoteDownloadToLocal(sourceDeviceId!, sourcePath, destPath);
    appendActivity("mcp_copy_file_remote", `${sourcePath} → ${destPath}`, true, "mcp");
    return text({ ok: true, result });
  },
);

server.tool(
  "copy_folder",
  "Copy a folder onto this Mac (from local or remote Porter device)",
  {
    sourcePath: z.string(),
    destPath: z.string(),
    sourceDeviceId: z.string().optional(),
  },
  async ({ sourcePath, destPath, sourceDeviceId }) => {
    const c = loadConfig();
    const local = !sourceDeviceId || sourceDeviceId === "local" || sourceDeviceId === c.deviceId;
    if (local) {
      const result = copyFolderLocal(sourcePath, destPath);
      appendActivity("mcp_copy_folder", `${sourcePath} → ${destPath}`, true, "mcp");
      return text({ ok: true, result });
    }
    // Remote folder pull via recursive listing
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
    appendActivity("mcp_copy_folder_remote", `${sourcePath} → ${destPath}`, true, "mcp");
    return text({ ok: true, result: { files, bytes } });
  },
);

server.tool(
  "add_shared_folder",
  "Approve a local folder for Porter/AI access (read+copy by default)",
  {
    path: z.string(),
    label: z.string().optional(),
    write: z.boolean().optional().describe("Also allow writes into this folder"),
  },
  async ({ path: folderPath, label, write }) => {
    const permissions = write
      ? (["read", "copy", "write"] as const)
      : (["read", "copy"] as const);
    const folder = addSharedFolder(folderPath, label ?? "", [...permissions]);
    return text(folder);
  },
);

server.tool(
  "porter_status",
  "Show local Porter device identity and share count",
  {},
  async () => {
    const c = loadConfig();
    return text({
      device: localDevice(c),
      sharedFolders: c.sharedFolders.length,
      requireConfirmWrites: c.requireConfirmWrites,
      allowSecretFiles: c.allowSecretFiles,
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
