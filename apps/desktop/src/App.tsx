import { useCallback, useEffect, useMemo, useState } from "react";
import {
  porter,
  canPickFolderNative,
  type ActivityEvent,
  type DeviceInfo,
  type DeviceSettings,
  type FileEntry,
  type SharedFolder,
} from "./api";
import {
  IconActivity,
  IconDevices,
  IconPorterMark,
  IconSettings,
  IconSleep,
  IconWake,
} from "./Icons";
import { PaneView, type PaneState } from "./PaneView";
import { SetupWizard } from "./SetupWizard";
import { TravelReadyPanel } from "./TravelReady";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function pathLabel(d: DeviceInfo): { badge: string; detail: string; kind: string } {
  if (d.isLocal) {
    return { badge: "This Mac", detail: "Local", kind: "local" };
  }
  if (d.host === "inbound" || (!d.online && d.host === "inbound")) {
    return {
      badge: "Seen",
      detail: "Connected once — Add Mac with its Tailscale IP to browse from Home",
      kind: "off",
    };
  }
  const active = d.activeVia || d.via;
  if (!d.online) {
    return {
      badge: "Offline",
      detail: `Last path: ${active}${d.fallbackHost ? " · has Tailscale fallback" : ""}`,
      kind: "off",
    };
  }
  if (active === "cloudflare") {
    return {
      badge: "Cloudflare",
      detail: d.fallbackHost
        ? `Working via Cloudflare · Tailscale backup ready`
        : `Working via Cloudflare`,
      kind: "cloudflare",
    };
  }
  if (active === "tailscale") {
    return {
      badge: "Tailscale",
      detail: d.via === "cloudflare"
        ? `Working via Tailscale (Cloudflare fallback)`
        : `Working via Tailscale ${d.host}`,
      kind: "tailscale",
    };
  }
  return { badge: "LAN", detail: `${d.host}:${d.port}`, kind: "lan" };
}

function friendlyError(msg: string): string {
  if (/<!DOCTYPE html|<html|Error 1033|Cloudflare Tunnel error|unable to resolve/i.test(msg)) {
    return "Cloudflare tunnel URL is dead or changed. On Home Mac: Add Mac → Copy Cloudflare URL + Tailscale fallback. On this Mac: paste the NEW URL (and Tailscale as Fallback).";
  }
  if (msg.includes("Unauthorized") || msg.includes("pair token")) {
    return "Pair token mismatch — paste the same token on both Macs (Settings → Save token).";
  }
  if (msg.includes("host required")) {
    return "Enter the other Mac’s LAN IP (or Cloudflare URL) before clicking Add Mac.";
  }
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("Failed to fetch")) {
    return "Could not reach that Mac — check Wi‑Fi, that Porter is open there, and you used its LAN IP (not localhost).";
  }
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return "Could not reach the other Mac. Check Cloudflare/Tailscale path under Devices.";
  }
  if (msg.includes("timeout") || msg.includes("Timed out") || msg.includes("AbortError")) {
    return "Timed out. Open Devices and see if Cloudflare or Tailscale is the active link.";
  }
  if (msg.length > 320) return `${msg.slice(0, 280)}…`;
  return msg;
}

export function App() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [remoteFolders, setRemoteFolders] = useState<SharedFolder[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [view, setView] = useState<"icons" | "list">("icons");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [sharePath, setSharePath] = useState("");
  const [shareWrite, setShareWrite] = useState(false);
  const [nativePicker, setNativePicker] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState<{
    sources: FileEntry[];
    sourceDeviceId: string;
    destDeviceId: string;
    destDir: string;
  } | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyProgress, setCopyProgress] = useState<string | null>(null);
  const [copyModalError, setCopyModalError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    message: string;
    canAutoInstall: boolean;
    releaseUrl: string | null;
    downloadUrl: string | null;
  } | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateNudgeHidden, setUpdateNudgeHidden] = useState(false);
  const [pairToken, setPairToken] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [wizardChecked, setWizardChecked] = useState(false);
  const [netHint, setNetHint] = useState<string>("");
  const [peerHost, setPeerHost] = useState("");
  const [peerPort, setPeerPort] = useState("47831");
  const [peerFallback, setPeerFallback] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"connect" | "more">("connect");
  const [shareLinks, setShareLinks] = useState<{
    lan: string | null;
    tailscale: string | null;
    cloudflare: string | null;
    port: number;
  } | null>(null);
  const [linksBusy, setLinksBusy] = useState(false);

  const [left, setLeft] = useState<PaneState | null>(null);
  const [right, setRight] = useState<PaneState | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const refreshMeta = useCallback(async () => {
    const [d, f, s, a] = await Promise.all([
      porter.devices(),
      porter.folders(),
      porter.device(),
      porter.activity(),
    ]);
    setDevices(d);
    setFolders(f);
    setSettings(s);
    setActivity(a);
    setPairToken(s.token);
    try {
      const n = await porter.network();
      const parts = [
        n.primaryLan ? `LAN ${n.primaryLan}` : null,
        n.tailscale.available ? `Tailscale ${n.tailscale.selfIp}` : "Tailscale off",
        n.bonjour.enabled ? "Bonjour on" : "Bonjour off",
      ].filter(Boolean);
      setNetHint(parts.join(" · "));
    } catch {
      // ignore
    }
    return { d, f, s };
  }, []);

  const openFolder = useCallback(
    async (deviceId: string, folderPath: string, side: "left" | "right") => {
      setError(null);
      try {
        const entries = await porter.list(deviceId, folderPath);
        const pane: PaneState = {
          deviceId,
          rootPath: folderPath,
          path: folderPath,
          entries,
          selected: [],
        };
        if (side === "left") setLeft(pane);
        else setRight(pane);
      } catch (e) {
        setError(friendlyError(e instanceof Error ? e.message : String(e)));
      }
    },
    [],
  );

  const navigate = useCallback(
    async (side: "left" | "right", nextPath: string) => {
      const pane = side === "left" ? left : right;
      if (!pane) return;
      try {
        const entries = await porter.list(pane.deviceId, nextPath);
        const next = { ...pane, path: nextPath, entries, selected: [] };
        if (side === "left") setLeft(next);
        else setRight(next);
      } catch (e) {
        setError(friendlyError(e instanceof Error ? e.message : String(e)));
      }
    },
    [left, right],
  );

  useEffect(() => {
    const onCheck = () => {
      setUpdateNudgeHidden(false);
      void runUpdateCheck(true);
    };
    window.addEventListener("porter-check-update", onCheck);
    // Soft check after load + periodic (like Cursor)
    const t = window.setTimeout(() => void runUpdateCheck(false), 2500);
    const interval = window.setInterval(() => void runUpdateCheck(false), 30 * 60 * 1000);
    const onFocus = () => void runUpdateCheck(false);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("porter-check-update", onCheck);
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(t);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runUpdateCheck(fromUser: boolean) {
    try {
      const u = await porter.checkUpdate();
      setUpdateInfo({
        currentVersion: u.currentVersion,
        latestVersion: u.latestVersion,
        updateAvailable: u.updateAvailable,
        message: u.message,
        canAutoInstall: u.canAutoInstall,
        releaseUrl: u.releaseUrl,
        downloadUrl: u.downloadUrl,
      });
      if (u.updateAvailable && u.latestVersion) {
        const dismissed = sessionStorage.getItem(`porter-update-later-${u.latestVersion}`);
        setUpdateNudgeHidden(Boolean(dismissed) && !fromUser);
      } else {
        setUpdateNudgeHidden(false);
      }
      if (fromUser) {
        setSettingsMsg(u.message);
        showToast(u.message);
        if (u.updateAvailable) setUpdateNudgeHidden(false);
      }
    } catch (e) {
      if (fromUser) {
        setSettingsMsg(friendlyError(e instanceof Error ? e.message : String(e)));
        showToast(friendlyError(e instanceof Error ? e.message : String(e)));
      }
    }
  }

  async function installUpdate() {
    if (updateBusy) return;
    setUpdateBusy(true);
    setSettingsMsg("Downloading update… Porter will quit and reopen.");
    try {
      // Prefer in-app install; if this Mac can’t replace the .app, open the zip download
      if (updateInfo && !updateInfo.canAutoInstall && updateInfo.downloadUrl) {
        window.open(updateInfo.downloadUrl, "_blank");
        setSettingsMsg(
          "Download opened — unzip, replace Porter.app in Applications, then reopen (right-click → Open).",
        );
        showToast("Download opened in browser");
        setUpdateBusy(false);
        return;
      }
      const r = await porter.applyUpdate();
      setSettingsMsg(r.message);
      showToast(r.message);
    } catch (e) {
      const msg = friendlyError(e instanceof Error ? e.message : String(e));
      setSettingsMsg(msg);
      // Fallback: open zip if auto-install fails
      if (updateInfo?.downloadUrl) {
        window.open(updateInfo.downloadUrl, "_blank");
        showToast("Auto-install failed — opened zip download instead");
      } else {
        showToast(msg);
      }
      setUpdateBusy(false);
    }
  }

  function dismissUpdateNudge() {
    if (updateInfo?.latestVersion) {
      sessionStorage.setItem(`porter-update-later-${updateInfo.latestVersion}`, "1");
    }
    setUpdateNudgeHidden(true);
  }

  useEffect(() => {
    setNativePicker(canPickFolderNative());
    const onPick = (e: Event) => {
      const path = (e as CustomEvent<string | null>).detail;
      if (typeof path === "string" && path.length > 0) {
        setSharePath(path);
        setShowShare(true);
      }
    };
    window.addEventListener("porter-folder-picked", onPick);
    return () => window.removeEventListener("porter-folder-picked", onPick);
  }, []);

  useEffect(() => {
    refreshMeta()
      .then(async ({ d, f, s }) => {
        setSelectedDeviceId(s.id);
        const local = d.find((x) => x.isLocal) ?? d[0];
        if (local && f[0]) {
          void openFolder(local.id, f[0].path, "left");
          void openFolder(local.id, f[0].path, "right");
        }
        try {
          const setup = await porter.setup();
          const params = new URLSearchParams(window.location.search);
          if (!setup.completed || params.get("wizard") === "1") setShowWizard(true);
          if (params.get("settings") === "1") setShowSettings(true);
          if (params.get("travel") === "1") setShowTravel(true);
        } catch {
          // ignore
        } finally {
          setWizardChecked(true);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const t = setInterval(() => {
      void refreshMeta().catch(() => undefined);
    }, 5000);
    return () => clearInterval(t);
  }, [refreshMeta, openFolder]);

  const localDevice = useMemo(
    () => devices.find((d) => d.isLocal) ?? null,
    [devices],
  );

  const refreshShareLinks = useCallback(async () => {
    try {
      const [n, tunnel, travel] = await Promise.all([
        porter.network(),
        porter.tunnelStatus(),
        porter.travelReady(),
      ]);
      setShareLinks({
        lan: travel.lanIp || n.primaryLan || null,
        tailscale: travel.tailscaleIp || n.tailscale.selfIp || null,
        cloudflare: travel.cloudflareUrl || tunnel.publicUrl || null,
        port: travel.port || 47831,
      });
    } catch {
      // ignore — LAN from settings still shown
    }
  }, []);

  useEffect(() => {
    if (showSettings && settingsTab === "connect") {
      void refreshShareLinks();
    }
  }, [showSettings, settingsTab, refreshShareLinks]);

  function copyShareValue(label: string, value: string) {
    void navigator.clipboard.writeText(value);
    setSettingsMsg(`Copied ${label} — paste it on the other Mac under “Paste from other Mac”.`);
    showToast(`${label} copied`);
  }

  async function onAddShare() {
    try {
      await porter.addFolder(sharePath.trim(), undefined, shareWrite);
      setShowShare(false);
      setSharePath("");
      const meta = await refreshMeta();
      if (localDevice && meta.f[0]) {
        await openFolder(localDevice.id, meta.f.at(-1)!.path, "left");
      }
      showToast("Folder approved for Porter");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onBrowseShareFolder() {
    const path = await porter.pickFolder();
    if (path) setSharePath(path);
  }

  async function requestCopyToRight() {
    if (!left?.selected.length || !right) {
      setError("Select files on the left and open a destination folder on the right.");
      return;
    }
    const destId = right.deviceId || localDevice?.id;
    if (!destId) {
      setError("Destination Mac not ready — wait a second and try again.");
      return;
    }
    setCopyModalError(null);
    setCopyProgress(null);
    setConfirmCopy({
      sources: [...left.selected],
      sourceDeviceId: left.deviceId,
      destDeviceId: destId,
      destDir: right.path.replace(/\/$/, ""),
    });
  }

  async function doCopy() {
    if (!confirmCopy) {
      setError("Nothing to copy.");
      return;
    }
    if (copyBusy) return;
    const batch = confirmCopy;
    setCopyBusy(true);
    setCopyModalError(null);
    setError(null);
    try {
      let files = 0;
      let lastMbps: number | undefined;
      let lastMs: number | undefined;
      const warnings: string[] = [];
      const total = batch.sources.length;
      for (let i = 0; i < total; i++) {
        const source = batch.sources[i]!;
        setCopyProgress(`Copying ${i + 1} of ${total}: ${source.name}…`);
        const destPath = `${batch.destDir}/${source.name}`;
        const res = await porter.copy({
          sourceDeviceId: batch.sourceDeviceId,
          sourcePath: source.path,
          destDeviceId: batch.destDeviceId,
          destPath,
          isDirectory: source.isDirectory,
        });
        files += res.result?.files ?? 1;
        if (res.result?.mbps != null) lastMbps = res.result.mbps;
        if (res.result?.ms != null) lastMs = res.result.ms;
        if (res.warning) warnings.push(res.warning);
      }
      setConfirmCopy(null);
      setCopyProgress(null);
      if (left) setLeft({ ...left, selected: [] });
      if (right) await navigate("right", right.path);
      await refreshMeta();
      const speed =
        lastMbps != null
          ? ` · ${lastMbps} Mbps` + (lastMs != null ? ` · ${lastMs} ms` : "")
          : "";
      showToast(
        `Copied ${batch.sources.length} item(s)${
          files > batch.sources.length ? ` (${files} files)` : ""
        }${speed}`,
      );
      if (warnings[0]) setError(friendlyError(warnings[0]));
    } catch (e) {
      const msg = friendlyError(e instanceof Error ? e.message : String(e));
      setCopyModalError(msg);
      setError(msg);
      setCopyProgress(null);
    } finally {
      setCopyBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-row">
            <IconPorterMark size={40} />
            <div>
              <strong>Porter</strong>
              <span>
                Private bridge · {settings?.name ?? "…"}
                {settings ? ` · ${settings.lan}` : ""}
                {settings?.sleeping ? " · sleeping" : ""}
                {netHint ? ` · ${netHint}` : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn primary" type="button" onClick={() => setShowTravel(true)}>
            Travel Ready
          </button>
          <button className="btn" type="button" onClick={() => setShowWizard(true)}>
            Setup
          </button>
          <button className="btn" type="button" onClick={() => setShowShare(true)}>
            Share folder
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setSettingsMsg(null);
              setSettingsTab("connect");
              setShowSettings(true);
            }}
          >
            <IconDevices size={16} /> Add Mac
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void (settings?.sleeping ? porter.wake() : porter.sleep()).then(() => {
                showToast(settings?.sleeping ? "Porter awake" : "Porter sleeping");
                void refreshMeta();
              });
            }}
          >
            {settings?.sleeping ? <IconWake size={16} /> : <IconSleep size={16} />}
            {settings?.sleeping ? " Wake" : " Sleep"}
          </button>
          <button className="btn" type="button" onClick={() => setShowActivity(true)}>
            <IconActivity size={16} /> Activity
          </button>
          <button
            className="btn"
            type="button"
            title="Check for Porter updates"
            onClick={() => void runUpdateCheck(true)}
          >
            {updateInfo?.updateAvailable ? `Update ${updateInfo.latestVersion}` : "Updates"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setSettingsMsg(null);
              setSettingsTab("more");
              setShowSettings(true);
            }}
          >
            <IconSettings size={16} /> Settings
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              if (confirm("Disconnect Porter now?")) void porter.kill();
            }}
          >
            Disconnect all
          </button>
        </div>
      </header>

      {error && (
        <div className="error-text" style={{ padding: "0 4px" }}>
          {error}
        </div>
      )}

      <div className="shell">
        <aside className="sidebar">
          <div className="side-section">
            <h3>
              <IconDevices size={12} /> Devices
            </h3>
            {devices.filter((d) => !d.isLocal).length === 0 && (
              <div className="side-hint">
                No other Mac listed yet. On <strong>both</strong> Macs: same pair token, then{" "}
                <strong>Add Mac</strong> and paste the other side’s Cloudflare URL + Tailscale
                fallback. After travel connects once, Home should show it here automatically.
              </div>
            )}
            {devices.some((d) => !d.isLocal && d.host === "inbound") && (
              <div className="side-hint">
                Travel Mac was seen, but Home has no return address yet. Click{" "}
                <strong>Add Mac</strong> and paste the travel Mac’s{" "}
                <strong>Tailscale IP</strong> (e.g. 100.x.x.x:47831) from its Add Mac panel.
              </div>
            )}
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`device ${selectedDeviceId === d.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedDeviceId(d.id);
                  if (d.isLocal) {
                    setRemoteFolders([]);
                    if (folders[0]) {
                      void openFolder(d.id, folders[0].path, "left");
                    }
                  } else {
                    void porter
                      .folders(d.id)
                      .then((rf) => {
                        setRemoteFolders(rf);
                        if (rf[0]) void openFolder(d.id, rf[0].path, "left");
                        else showToast("Remote Mac has no shared folders yet");
                      })
                      .catch((e) =>
                        setError(friendlyError(e instanceof Error ? e.message : String(e))),
                      );
                  }
                }}
              >
                <span className="name">
                  <span className={`dot ${d.online ? "" : "off"}`} />
                  {d.name}
                  {d.isLocal ? " (this Mac)" : ""}
                </span>
                {(() => {
                  const p = pathLabel(d);
                  return (
                    <span className="meta">
                      <span className={`path-badge path-${p.kind}`}>{p.badge}</span>
                      <span className="path-detail">{p.detail}</span>
                    </span>
                  );
                })()}
              </button>
            ))}
          </div>
          <div className="side-section" style={{ flex: 1, overflow: "auto" }}>
            <h3>
              {selectedDeviceId && !devices.find((d) => d.id === selectedDeviceId)?.isLocal
                ? "Remote folders"
                : "Approved folders"}
            </h3>
            {(() => {
              const viewingRemote =
                !!selectedDeviceId &&
                !devices.find((d) => d.id === selectedDeviceId)?.isLocal;
              const list = viewingRemote ? remoteFolders : folders;
              if (list.length === 0) {
                return (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    {viewingRemote
                      ? "No folders shared on that Mac yet."
                      : "Nothing shared yet. Click Share folder — Porter never sees the whole disk."}
                  </p>
                );
              }
              return list.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`share ${left?.rootPath === f.path ? "active" : ""}`}
                  onClick={() => {
                    const id = viewingRemote
                      ? selectedDeviceId!
                      : localDevice?.id;
                    if (!id) return;
                    void openFolder(id, f.path, "left");
                    if (!viewingRemote && localDevice) {
                      void openFolder(localDevice.id, f.path, "right");
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (viewingRemote) return;
                    if (confirm(`Stop sharing ${f.label}?`)) {
                      void porter.removeFolder(f.id).then(refreshMeta);
                    }
                  }}
                >
                  <span className="name">{f.label}</span>
                  <span className="meta">
                    {f.permissions.join(", ")} · {f.path}
                  </span>
                </button>
              ));
            })()}
          </div>
        </aside>

        <PaneView
          pane={left}
          side="left"
          devices={devices}
          fallbackDeviceName={localDevice?.name}
          otherPane={right}
          view={view}
          setView={setView}
          onNavigate={(s, p) => void navigate(s, p)}
          onSelect={(s, next) => {
            if (s === "left") setLeft(next);
            else setRight(next);
          }}
          onCopy={() => void requestCopyToRight()}
        />
        <PaneView
          pane={right}
          side="right"
          devices={devices}
          fallbackDeviceName={localDevice?.name}
          otherPane={left}
          view={view}
          setView={setView}
          onNavigate={(s, p) => void navigate(s, p)}
          onSelect={(s, next) => {
            if (s === "left") setLeft(next);
            else setRight(next);
          }}
        />
      </div>

      {showShare && (
        <div className="modal-backdrop" onClick={() => setShowShare(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Share a folder</h2>
            <p>
              Only folders you approve are visible to Cursor or the other Mac.
              {nativePicker
                ? " Use Choose folder… to pick from Finder."
                : " Paste an absolute path (example: /Users/you/Projects)."}
            </p>
            <div className="field">
              <label>Folder</label>
              <div className="path-row">
                <input
                  value={sharePath}
                  onChange={(e) => setSharePath(e.target.value)}
                  placeholder={nativePicker ? "Choose a folder…" : "/Users/you/Projects"}
                />
                {nativePicker ? (
                  <button className="btn primary" type="button" onClick={() => void onBrowseShareFolder()}>
                    Choose folder…
                  </button>
                ) : null}
              </div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={shareWrite}
                onChange={(e) => setShareWrite(e.target.checked)}
              />
              Allow writes into this folder (needed to receive copies)
            </label>
            <div className="row">
              <button className="btn" type="button" onClick={() => setShowShare(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={!sharePath.trim()}
                onClick={() => void onAddShare()}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && settings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet sheet-fit" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-top">
              <h2>{settingsTab === "connect" ? "Add another Mac" : "Settings"}</h2>
              <div className="sheet-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className={settingsTab === "connect" ? "active" : ""}
                  aria-selected={settingsTab === "connect"}
                  onClick={() => setSettingsTab("connect")}
                >
                  Connect
                </button>
                <button
                  type="button"
                  role="tab"
                  className={settingsTab === "more" ? "active" : ""}
                  aria-selected={settingsTab === "more"}
                  onClick={() => setSettingsTab("more")}
                >
                  This Mac
                </button>
              </div>
            </div>

            <div className="sheet-body">
              {settingsTab === "connect" && (
                <>
                  <div className="connect-block">
                    <h3>1. Give these to the other Mac</h3>
                    <p className="connect-hint">
                      On the other computer, open <strong>Add Mac</strong> and paste into{" "}
                      <em>Paste from other Mac</em> below (same screen there).
                    </p>
                    <div className="share-rows">
                      <div className="share-row">
                        <div>
                          <span className="share-label">
                            Other Mac address (LAN) — paste into “Other Mac address”
                          </span>
                          <code>{shareLinks?.lan || settings.lan || "—"}</code>
                        </div>
                        <button
                          className="btn"
                          type="button"
                          disabled={!(shareLinks?.lan || settings.lan)}
                          onClick={() =>
                            copyShareValue(
                              "Other Mac address (LAN)",
                              shareLinks?.lan || settings.lan || "",
                            )
                          }
                        >
                          Copy
                        </button>
                      </div>
                      <div className="share-row">
                        <div>
                          <span className="share-label">
                            Other Mac address (Cloudflare URL) — paste into “Other Mac address”
                          </span>
                          <code className="share-url">
                            {shareLinks?.cloudflare || "Not started yet — tap Start tunnel"}
                          </code>
                        </div>
                        {shareLinks?.cloudflare ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() =>
                              copyShareValue(
                                "Other Mac address (Cloudflare URL)",
                                shareLinks.cloudflare!,
                              )
                            }
                          >
                            Copy
                          </button>
                        ) : (
                          <button
                            className="btn primary"
                            type="button"
                            disabled={linksBusy}
                            onClick={() => {
                              setLinksBusy(true);
                              setSettingsMsg("Starting Cloudflare tunnel…");
                              void porter
                                .startTunnel()
                                .then(async (r) => {
                                  if (r.publicUrl) {
                                    setSettingsMsg(
                                      "Tunnel ready — Copy Cloudflare URL and send to the other Mac.",
                                    );
                                    showToast("Cloudflare URL ready");
                                  } else {
                                    setSettingsMsg(
                                      r.cloudflaredInstalled === false
                                        ? "cloudflared missing — use Travel Ready or reinstall Porter.app"
                                        : "Tunnel started but no URL yet — try again in a few seconds.",
                                    );
                                  }
                                  await refreshShareLinks();
                                })
                                .catch((e) =>
                                  setSettingsMsg(
                                    friendlyError(e instanceof Error ? e.message : String(e)),
                                  ),
                                )
                                .finally(() => setLinksBusy(false));
                            }}
                          >
                            Start tunnel
                          </button>
                        )}
                      </div>
                      <div className="share-row">
                        <div>
                          <span className="share-label">
                            Fallback (Tailscale) — paste into “Fallback”
                          </span>
                          <code>
                            {shareLinks?.tailscale
                              ? `${shareLinks.tailscale}:${shareLinks.port}`
                              : "Not connected"}
                          </code>
                        </div>
                        {shareLinks?.tailscale ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() =>
                              copyShareValue(
                                "Fallback (Tailscale)",
                                `${shareLinks.tailscale}:${shareLinks.port}`,
                              )
                            }
                          >
                            Copy
                          </button>
                        ) : (
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              void porter.openTailscaleDownload().then((r) => {
                                window.open(r.url, "_blank");
                                setSettingsMsg(r.note);
                              });
                            }}
                          >
                            Get Tailscale
                          </button>
                        )}
                      </div>
                      <div className="share-row">
                        <div>
                          <span className="share-label">
                            Pair token — paste into “Pair token on this Mac”
                          </span>
                          <code className="share-url">{pairToken || "—"}</code>
                        </div>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => copyShareValue("Pair token", pairToken)}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <button
                      className="btn linkish"
                      type="button"
                      onClick={() => {
                        setShowSettings(false);
                        setShowTravel(true);
                      }}
                    >
                      Need unattended travel? Open Travel Ready →
                    </button>
                  </div>

                  <div className="connect-block">
                    <h3>2. Paste from the other Mac</h3>
                    <p className="connect-hint">
                      Paste what you copied on the other Mac (its LAN IP, Cloudflare URL, or
                      Tailscale IP). Same Wi‑Fi → use LAN. Away → use Cloudflare, with Tailscale as
                      fallback.
                    </p>
                    <div className="field">
                      <label>Other Mac address</label>
                      <input
                        value={peerHost}
                        onChange={(e) => {
                          setPeerHost(e.target.value);
                          setSettingsMsg(null);
                        }}
                        placeholder="192.168.x.x or https://….trycloudflare.com"
                        autoFocus
                      />
                    </div>
                    <div className="field">
                      <label>Fallback (optional Tailscale from other Mac)</label>
                      <input
                        value={peerFallback}
                        onChange={(e) => setPeerFallback(e.target.value)}
                        placeholder="100.x.x.x:47831"
                      />
                    </div>
                    <div className="field">
                      <label>Pair token on this Mac</label>
                      <div className="path-row">
                        <input
                          value={pairToken}
                          onChange={(e) => setPairToken(e.target.value)}
                          spellCheck={false}
                        />
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            void porter.setToken(pairToken).then(() => {
                              setSettingsMsg("Token saved on this Mac.");
                              showToast("Token saved");
                              void refreshMeta();
                            });
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>

                  {settingsMsg && (
                    <p
                      className={
                        /enter|required|fail|mismatch|refused|don’t|could not|timed|missing|paste/i.test(
                          settingsMsg,
                        )
                          ? "error-text"
                          : "ok-text"
                      }
                    >
                      {settingsMsg}
                    </p>
                  )}
                </>
              )}

              {settingsTab === "more" && (
                <>
                  <div className="field">
                    <label>Device name</label>
                    <input
                      defaultValue={settings.name}
                      id="deviceName"
                      onBlur={(e) => {
                        void porter.updateDevice({ deviceName: e.target.value }).then(refreshMeta);
                      }}
                    />
                  </div>
                  <div className="field">
                    <label>Updates</label>
                    <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 13 }}>
                      Current: {updateInfo?.currentVersion ?? "…"}. Checks GitHub releases and can
                      install into this Porter.app automatically.
                    </p>
                    {updateInfo?.updateAvailable ? (
                      <div className="callout ok" style={{ marginTop: 0 }}>
                        {updateInfo.message}
                      </div>
                    ) : null}
                    <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={updateBusy}
                        onClick={() => void runUpdateCheck(true)}
                      >
                        Check for updates
                      </button>
                      {updateInfo?.updateAvailable ? (
                        <button
                          className="btn primary"
                          type="button"
                          disabled={updateBusy}
                          onClick={() => void installUpdate()}
                        >
                          {updateBusy
                            ? "Updating…"
                            : updateInfo.canAutoInstall
                              ? `Install ${updateInfo.latestVersion}`
                              : `Download ${updateInfo.latestVersion}`}
                        </button>
                      ) : null}
                      {updateInfo?.releaseUrl ? (
                        <button
                          className="btn linkish"
                          type="button"
                          onClick={() => window.open(updateInfo.releaseUrl!, "_blank")}
                        >
                          Release notes →
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="field">
                    <label>Chrome extensions (optional)</label>
                    <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 13 }}>
                      Everyday file copy never needs quitting Chrome. Only for syncing extension
                      folders: quit Chrome → share → copy to the other Mac’s same paths → reopen.
                    </p>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        void porter
                          .chromeStatus()
                          .then((st) => {
                            if (st.chromeRunning) {
                              setSettingsMsg(st.note);
                              showToast("Quit Google Chrome first");
                              return null;
                            }
                            return porter.shareChromeExtensions();
                          })
                          .then((r) => {
                            if (!r) return;
                            showToast(
                              r.added.length
                                ? `Shared: ${r.added.join(", ")}`
                                : "Chrome folders already shared",
                            );
                            setSettingsMsg(r.warning);
                            void refreshMeta();
                          })
                          .catch((e) =>
                            setSettingsMsg(
                              friendlyError(e instanceof Error ? e.message : String(e)),
                            ),
                          );
                      }}
                    >
                      Share Chrome extensions folders
                    </button>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.allowSecretFiles}
                      onChange={(e) => {
                        void porter
                          .updateDevice({ allowSecretFiles: e.target.checked })
                          .then(refreshMeta);
                      }}
                    />
                    Allow secret-like files (.env, keys)
                  </label>
                </>
              )}
            </div>

            <div className="sheet-foot">
              <button className="btn" type="button" onClick={() => setShowSettings(false)}>
                Close
              </button>
              {settingsTab === "connect" && (
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    const host = peerHost.trim();
                    if (!host) {
                      setSettingsMsg("Paste the other Mac’s IP first (step 3).");
                      return;
                    }
                    if (host === "127.0.0.1" || host === "localhost") {
                      setSettingsMsg("Use the other Mac’s LAN IP — not localhost.");
                      return;
                    }
                    setSettingsMsg("Connecting…");
                    void porter
                      .addPeer(
                        host,
                        Number(peerPort) || 47831,
                        undefined,
                        peerFallback.trim() || undefined,
                      )
                      .then((d) => {
                        setSettingsMsg(`Connected to ${d.name}`);
                        showToast(`Connected to ${d.name}`);
                        setPeerHost("");
                        setPeerFallback("");
                        void refreshMeta();
                        setShowSettings(false);
                      })
                      .catch((e) => {
                        const raw = e instanceof Error ? e.message : String(e);
                        setSettingsMsg(friendlyError(raw));
                      });
                  }}
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showActivity && (
        <div className="modal-backdrop" onClick={() => setShowActivity(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Activity & timing</h2>
            <p>
              Transfers, Cursor/MCP calls, and errors — with how long each took and which link was
              used when known.
            </p>
            <div className="activity">
              {activity.length === 0 && <div className="empty">No events yet</div>}
              {activity.map((a) => (
                <div key={a.id} className={`item ${a.ok ? "" : "fail"}`}>
                  <strong>{a.humanMessage || a.action}</strong>
                  <div className="fmeta">
                    {a.source || "local"}
                    {a.via ? ` · ${a.via}` : ""}
                    {a.ok ? " · ok" : " · failed"}
                    {typeof a.durationMs === "number" ? ` · ${a.durationMs} ms` : ""}
                    {typeof a.mbps === "number" ? ` · ${a.mbps} Mbps` : ""}
                    {typeof a.bytes === "number" ? ` · ${formatBytes(a.bytes)}` : ""}
                  </div>
                  {a.humanMessage && a.detail !== a.humanMessage ? (
                    <div className="fmeta">{a.detail}</div>
                  ) : !a.humanMessage ? (
                    <div>{a.detail}</div>
                  ) : null}
                  <div style={{ color: "var(--muted)" }}>{new Date(a.at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn" type="button" onClick={() => setShowActivity(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCopy && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!copyBusy) setConfirmCopy(null);
          }}
        >
          <div
            className="sheet"
            style={{ width: "min(420px, 100%)", maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Confirm copy</h2>
            {confirmCopy.sources.length === 1 ? (
              <p>
                Copy <strong>{confirmCopy.sources[0].name}</strong> to:
                <br />
                <code>
                  {confirmCopy.destDir}/{confirmCopy.sources[0].name}
                </code>
              </p>
            ) : (
              <>
                <p>
                  Copy <strong>{confirmCopy.sources.length} items</strong> into:
                  <br />
                  <code>{confirmCopy.destDir}</code>
                </p>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13 }}>
                  {confirmCopy.sources.slice(0, 12).map((s) => (
                    <li key={s.path}>
                      {s.name}
                      {s.isDirectory ? " (folder)" : ""}
                    </li>
                  ))}
                  {confirmCopy.sources.length > 12 ? (
                    <li>…and {confirmCopy.sources.length - 12} more</li>
                  ) : null}
                </ul>
              </>
            )}
            {copyProgress && <p className="ok-text">{copyProgress}</p>}
            {copyModalError && <p className="error-text">{copyModalError}</p>}
            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="btn"
                type="button"
                disabled={copyBusy}
                onClick={() => {
                  if (!copyBusy) setConfirmCopy(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={copyBusy}
                onClick={() => void doCopy()}
              >
                {copyBusy ? "Copying…" : copyModalError ? "Retry copy" : "Copy now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {updateInfo?.updateAvailable && !updateNudgeHidden && (
        <div className="update-nudge" role="status" aria-live="polite">
          <span className="update-nudge-icon" aria-hidden>
            ▤
          </span>
          <span className="update-nudge-text">
            New update available
            {updateInfo.latestVersion ? ` · v${updateInfo.latestVersion}` : ""}
          </span>
          <button className="update-nudge-later" type="button" onClick={dismissUpdateNudge}>
            Later
          </button>
          <button
            className="update-nudge-install"
            type="button"
            disabled={updateBusy}
            onClick={() => void installUpdate()}
          >
            {updateBusy ? "Installing…" : "Install Now"}
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {wizardChecked && showWizard && (
        <SetupWizard
          onDone={() => {
            setShowWizard(false);
            void refreshMeta();
            setShowTravel(true);
            showToast("Setup ready — check Travel Ready");
          }}
        />
      )}
      {showTravel && (
        <TravelReadyPanel
          onClose={() => {
            setShowTravel(false);
            void refreshMeta();
          }}
        />
      )}
    </div>
  );
}
