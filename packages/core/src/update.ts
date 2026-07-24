/**
 * Check GitHub Releases and install Porter.app updates in place.
 * Designed for ad-hoc signed apps (no Sparkle / notarization required).
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendActivity } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GITHUB_REPO = process.env.PORTER_GITHUB_REPO || "Gtarafdar/porter";

export function currentVersion(): string {
  if (process.env.PORTER_VERSION?.trim()) return process.env.PORTER_VERSION.trim();
  if (process.env.PORTER_RESOURCES) {
    const bundled = path.join(process.env.PORTER_RESOURCES, "VERSION");
    if (fs.existsSync(bundled)) {
      return fs.readFileSync(bundled, "utf8").trim() || "0.0.0";
    }
  }
  try {
    const pkg = path.resolve(__dirname, "../../../package.json");
    if (fs.existsSync(pkg)) {
      const v = (JSON.parse(fs.readFileSync(pkg, "utf8")) as { version?: string }).version;
      if (v) return v;
    }
  } catch {
    // ignore
  }
  return "0.0.0";
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function hostArch(): "arm64" | "x64" {
  return process.arch === "arm64" ? "arm64" : "x64";
}

type GhAsset = { name: string; browser_download_url: string; size: number };
type GhRelease = {
  tag_name: string;
  name?: string;
  html_url: string;
  body?: string;
  assets: GhAsset[];
};

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Porter-Updater",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson<T>(res.headers.location).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`GitHub HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timed out contacting GitHub"));
    });
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => {
      https
        .get(
          u,
          {
            headers: { "User-Agent": "Porter-Updater", Accept: "application/octet-stream" },
            timeout: 120_000,
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              file.close();
              get(res.headers.location);
              return;
            }
            if ((res.statusCode ?? 500) >= 400) {
              file.close();
              reject(new Error(`Download failed HTTP ${res.statusCode}`));
              return;
            }
            res.pipe(file);
            file.on("finish", () => file.close(() => resolve()));
          },
        )
        .on("error", (e) => {
          file.close();
          reject(e);
        });
    };
    get(url);
  });
}

export type UpdateCheck = {
  ok: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  assetName: string | null;
  releaseUrl: string | null;
  notes: string | null;
  arch: "arm64" | "x64";
  canAutoInstall: boolean;
  appPath: string | null;
  message: string;
};

export function resolveAppBundlePath(): string | null {
  const res = process.env.PORTER_RESOURCES;
  if (res && res.includes(".app/Contents/Resources")) {
    const app = path.resolve(res, "../..");
    if (app.includes("AppTranslocation") || app.includes("/Downloads/")) {
      // Prefer stable Applications install for updates
      if (fs.existsSync("/Applications/Porter.app")) return "/Applications/Porter.app";
      return null;
    }
    return app;
  }
  const candidates = [
    "/Applications/Porter.app",
    path.join(os.homedir(), "Applications/Porter.app"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  const current = currentVersion();
  const arch = hostArch();
  const appPath = resolveAppBundlePath();
  try {
    const release = await fetchJson<GhRelease>(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    );
    const latest = release.tag_name.replace(/^v/i, "");
    const asset =
      release.assets.find(
        (a) =>
          a.name.includes(`mac-${arch}`) &&
          a.name.endsWith(".zip") &&
          a.name.toLowerCase().includes("porter"),
      ) ||
      release.assets.find(
        (a) => a.name.endsWith(".zip") && a.name.includes(`-${arch}`) && a.name.includes("Porter"),
      );
    const newer = compareSemver(latest, current) > 0;
    const underTranslocation =
      Boolean(process.env.PORTER_RESOURCES?.includes("AppTranslocation")) ||
      Boolean(process.env.PORTER_RESOURCES?.includes("/Downloads/"));
    const canAutoInstall = Boolean(newer && asset && appPath) && !underTranslocation;
    return {
      ok: true,
      currentVersion: current,
      latestVersion: latest,
      updateAvailable: newer,
      downloadUrl: asset?.browser_download_url ?? null,
      assetName: asset?.name ?? null,
      releaseUrl: release.html_url,
      notes: (release.body || "").slice(0, 2000) || null,
      arch,
      canAutoInstall,
      appPath,
      message: underTranslocation
        ? `Porter ${latest} is available, but this copy was opened from Downloads. Move Porter.app to Applications, open it from there, then Install.`
        : newer
          ? asset
            ? `Porter ${latest} is available (you have ${current}).`
            : `Porter ${latest} is out, but no ${arch} zip was found on the release.`
          : `You’re on the latest Porter (${current}).`,
    };
  } catch (e) {
    return {
      ok: false,
      currentVersion: current,
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      assetName: null,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases/latest`,
      notes: null,
      arch,
      canAutoInstall: false,
      appPath,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function applyUpdate(): Promise<{
  ok: boolean;
  message: string;
  willRelaunch: boolean;
}> {
  const check = await checkForUpdate();
  if (!check.updateAvailable || !check.downloadUrl) {
    return { ok: false, message: check.message, willRelaunch: false };
  }
  const appPath = check.appPath || resolveAppBundlePath();
  if (!appPath) {
    return {
      ok: false,
      message:
        "Could not find a stable Porter.app to replace. Drag Porter into /Applications, open it from there (not Downloads), then try again.",
      willRelaunch: false,
    };
  }
  if (appPath.includes("AppTranslocation") || appPath.includes("/Downloads/")) {
    return {
      ok: false,
      message:
        "This Porter was opened from Downloads (App Translocation). Quit Porter, move Porter.app to /Applications, open it from there, then Install.",
      willRelaunch: false,
    };
  }

  // Always install into /Applications when possible (stable LaunchAgent paths)
  const targetApp =
    appPath === "/Applications/Porter.app" || fs.existsSync("/Applications")
      ? "/Applications/Porter.app"
      : appPath;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porter-update-"));
  const zipPath = path.join(tmp, check.assetName || "Porter-update.zip");
  const extractDir = path.join(tmp, "extract");
  fs.mkdirSync(extractDir, { recursive: true });

  appendActivity("update_download", check.latestVersion || "", true, "ui", {
    humanMessage: `Downloading Porter ${check.latestVersion}…`,
  });

  await downloadFile(check.downloadUrl, zipPath);
  execFileSync("/usr/bin/unzip", ["-q", "-o", zipPath, "-d", extractDir], {
    timeout: 120_000,
  });

  // Find Porter.app inside the zip (may be nested)
  let newApp: string | null = null;
  const stack = [extractDir];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name === "Porter.app" && fs.statSync(full).isDirectory()) {
        newApp = full;
        break;
      }
      if (fs.statSync(full).isDirectory() && !name.startsWith(".")) stack.push(full);
    }
    if (newApp) break;
  }
  if (!newApp) {
    return {
      ok: false,
      message: "Downloaded zip did not contain Porter.app",
      willRelaunch: false,
    };
  }

  const installScript = path.join(tmp, "install-porter-update.sh");
  const parent = path.dirname(targetApp);
  const appName = path.basename(targetApp);
  const newVer = check.latestVersion || "unknown";
  const script = `#!/bin/bash
set -euo pipefail
LOG="${os.homedir()}/Library/Logs/Porter-update.log"
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
echo "[$(date)] installing update into ${targetApp}"

# Wait for current Porter core / window to exit
for i in $(seq 1 40); do
  if ! lsof -nP -iTCP:47831 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 0.4
done
pkill -f 'packages/core/dist/cli.js serve' 2>/dev/null || true
pkill -f 'Porter.app/Contents/MacOS/Porter' 2>/dev/null || true
sleep 0.8

# Replace app bundle
rm -rf "${targetApp}.old" 2>/dev/null || true
if [[ -d "${targetApp}" ]]; then
  mv "${targetApp}" "${targetApp}.old" || true
fi
mkdir -p "${parent}"
cp -R "${newApp}" "${parent}/${appName}"
xattr -cr "${targetApp}" 2>/dev/null || true
codesign --force --deep --sign - "${targetApp}" 2>/dev/null || true

# Fully rewrite LaunchAgent start script to the new Applications bundle
SUPPORT="${os.homedir()}/Library/Application Support/Porter"
START="$SUPPORT/start-porter.sh"
RES="${targetApp}/Contents/Resources"
NODE="$RES/node"
CLI="$RES/app/packages/core/dist/cli.js"
VER="${newVer}"
mkdir -p "$SUPPORT"
cat > "$START" <<'PORTER_START'
#!/bin/bash
set -euo pipefail
export HOME="__HOME__"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\${PATH}"
export PORTER_OPEN_BROWSER="0"
export PORTER_NO_BONJOUR="0"
export PORTER_VERSION="__VER__"
export PORTER_RESOURCES="__RES__"
export PORTER_UI_DIR="__RES__/ui"
LOG="__HOME__/Library/Logs/Porter.log"
mkdir -p "$(dirname "$LOG")" "__SUPPORT__"
PORT=47831
JSON="$(curl -sf -m 2 --connect-timeout 1 "http://127.0.0.1:\${PORT}/api/health" 2>/dev/null || true)"
if [[ -n "$JSON" ]]; then
  CUR="$(printf '%s' "$JSON" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1)"
  if [[ -n "$CUR" && "$CUR" != "$PORTER_VERSION" ]]; then
    pkill -f 'packages/core/dist/cli.js serve' 2>/dev/null || true
    pkill -f 'Porter.app/Contents/Resources/node' 2>/dev/null || true
    sleep 0.6
  else
    exit 0
  fi
fi
if lsof -nP -iTCP:\${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  pkill -f 'packages/core/dist/cli.js serve' 2>/dev/null || true
  pkill -f 'Porter.app/Contents/Resources/node' 2>/dev/null || true
  sleep 0.6
fi
exec "__NODE__" "__CLI__" serve >>"$LOG" 2>&1
PORTER_START
# Fill placeholders
/usr/bin/sed -i '' \\
  -e "s|__HOME__|${os.homedir()}|g" \\
  -e "s|__VER__|${newVer}|g" \\
  -e "s|__RES__|${targetApp}/Contents/Resources|g" \\
  -e "s|__SUPPORT__|${os.homedir()}/Library/Application Support/Porter|g" \\
  -e "s|__NODE__|${targetApp}/Contents/Resources/node|g" \\
  -e "s|__CLI__|${targetApp}/Contents/Resources/app/packages/core/dist/cli.js|g" \\
  "$START"
chmod 755 "$START"

# Refresh LaunchAgent env if present
PLIST="${os.homedir()}/Library/LaunchAgents/local.porter.plist"
if [[ -f "$PLIST" ]]; then
  launchctl bootout "gui/$(id -u)/local.porter" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || true
fi

rm -rf "${targetApp}.old" 2>/dev/null || true
rm -rf "${tmp}" 2>/dev/null || true

echo "[$(date)] opening ${targetApp}"
open -n "${targetApp}"
`;
  fs.writeFileSync(installScript, script, { mode: 0o755 });

  appendActivity("update_install", check.latestVersion || "", true, "ui", {
    humanMessage: `Installing Porter ${check.latestVersion} — app will relaunch`,
  });

  // Detach installer, then exit so the bundle can be replaced
  spawn("/bin/bash", [installScript], {
    detached: true,
    stdio: "ignore",
  }).unref();

  setTimeout(() => {
    process.exit(0);
  }, 600);

  return {
    ok: true,
    message: `Downloading done — Porter ${check.latestVersion} will install and reopen in a few seconds.`,
    willRelaunch: true,
  };
}
