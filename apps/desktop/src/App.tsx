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
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    return "Connection refused — is Porter running on the other Mac?";
  }
  if (msg.includes("timeout") || msg.includes("Timed out") || msg.includes("AbortError")) {
    return "Timed out. Open Devices and see if Cloudflare or Tailscale is the active link.";
  }
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
    source: FileEntry;
    sourceDeviceId: string;
    destPath: string;
  } | null>(null);
  const [pairToken, setPairToken] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [wizardChecked, setWizardChecked] = useState(false);
  const [netHint, setNetHint] = useState<string>("");
  const [peerHost, setPeerHost] = useState("");
  const [peerPort, setPeerPort] = useState("47831");
  const [peerFallback, setPeerFallback] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

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
          selected: null,
        };
        if (side === "left") setLeft(pane);
        else setRight(pane);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
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
        const next = { ...pane, path: nextPath, entries, selected: null };
        if (side === "left") setLeft(next);
        else setRight(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [left, right],
  );

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
    if (!left?.selected || !right || !localDevice) return;
    const destPath = `${right.path.replace(/\/$/, "")}/${left.selected.name}`;
    setConfirmCopy({
      source: left.selected,
      sourceDeviceId: left.deviceId,
      destPath,
    });
  }

  async function doCopy() {
    if (!confirmCopy || !localDevice) return;
    try {
      const res = await porter.copy({
        sourceDeviceId: confirmCopy.sourceDeviceId,
        sourcePath: confirmCopy.source.path,
        destDeviceId: localDevice.id,
        destPath: confirmCopy.destPath,
        isDirectory: confirmCopy.source.isDirectory,
      });
      setConfirmCopy(null);
      if (right) await navigate("right", right.path);
      await refreshMeta();
      const r = res.result;
      const speed =
        r?.mbps != null
          ? ` · ${r.mbps} Mbps` + (r.ms != null ? ` · ${r.ms} ms` : "")
          : "";
      showToast(`Copy complete${speed}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
            onClick={() => {
              setSettingsMsg(null);
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
                No other Mac yet. Same Wi‑Fi: click <strong>Add Mac</strong>, paste the other
                Mac’s LAN IP (shown in its Settings). Same pair token required first.
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
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Settings / Add Mac</h2>
            <p>
              Same pair token on both Macs, then each Mac adds the <em>other</em> Mac’s address.
              Same Wi‑Fi: use the LAN IP below (not “localhost”).
            </p>

            <div className="callout ok">
              <div>
                <strong>This Mac’s LAN IP (tell the other Mac to add this):</strong>
                <div className="path-row" style={{ marginTop: 8 }}>
                  <input readOnly value={settings.lan || "—"} />
                  <button
                    className="btn"
                    type="button"
                    disabled={!settings.lan}
                    onClick={() => {
                      if (!settings.lan) return;
                      void navigator.clipboard.writeText(settings.lan);
                      setSettingsMsg("LAN IP copied — paste it in Add Mac on the other computer.");
                      showToast("LAN IP copied");
                    }}
                  >
                    Copy IP
                  </button>
                </div>
              </div>
            </div>

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
              <label>1. Pair token (must match on both Macs)</label>
              <textarea
                rows={3}
                value={pairToken}
                onChange={(e) => setPairToken(e.target.value)}
              />
              <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(pairToken);
                    setSettingsMsg("Token copied — paste & Save token on the other Mac.");
                    showToast("Token copied");
                  }}
                >
                  Copy token
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    void porter.setToken(pairToken).then(() => {
                      setSettingsMsg("Pair token saved on this Mac.");
                      showToast("Pair token saved");
                      void refreshMeta();
                    });
                  }}
                >
                  Save token
                </button>
              </div>
            </div>
            <div className="field">
              <label>2. Other Mac’s address (required to Add Mac)</label>
              <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 13 }}>
                Paste the <strong>other</strong> computer’s LAN IP from its Settings (example{" "}
                {settings.lan ? settings.lan.replace(/\d+$/, "42") : "192.168.0.42"}
                ). Leave empty and click Add → you’ll get an error — fill this first.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={peerHost}
                  onChange={(e) => {
                    setPeerHost(e.target.value);
                    setSettingsMsg(null);
                  }}
                  placeholder={`e.g. ${settings.lan || "192.168.0.42"} or https://….trycloudflare.com`}
                  style={{ flex: 1 }}
                />
                <input
                  value={peerPort}
                  onChange={(e) => setPeerPort(e.target.value)}
                  style={{ width: 80 }}
                  placeholder="47831"
                  title="Ignored when pasting a full https:// URL"
                />
              </div>
            </div>
            <div className="field">
              <label>Fallback (optional — Tailscale IP if primary is Cloudflare)</label>
              <input
                value={peerFallback}
                onChange={(e) => setPeerFallback(e.target.value)}
                placeholder="100.x.x.x:47831"
              />
            </div>
            {settingsMsg && (
              <p className={settingsMsg.toLowerCase().includes("enter") || settingsMsg.toLowerCase().includes("required") || settingsMsg.toLowerCase().includes("fail") || settingsMsg.toLowerCase().includes("mismatch") || settingsMsg.toLowerCase().includes("refused") ? "error-text" : "ok-text"}>
                {settingsMsg}
              </p>
            )}
            <div className="field">
              <label>Chrome extensions (optional sync)</label>
              <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 13 }}>
                Everyday file sharing never needs quitting Chrome. Only this optional step does:
                quit Chrome on both Macs → share Extensions + Local Extension Settings → copy to the
                other Mac → reopen Chrome. Passwords/cookies stay blocked.
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void porter
                    .shareChromeExtensions()
                    .then((r) => {
                      showToast(
                        r.added.length
                          ? `Shared ${r.added.length} Chrome folder(s)`
                          : "Nothing new to share",
                      );
                      setError(r.warning ?? null);
                      void refreshMeta();
                    })
                    .catch((e) =>
                      setError(friendlyError(e instanceof Error ? e.message : String(e))),
                    );
                }}
              >
                Share Chrome extensions folders
              </button>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={settings.allowSecretFiles}
                onChange={(e) => {
                  void porter
                    .updateDevice({ allowSecretFiles: e.target.checked })
                    .then(refreshMeta);
                }}
              />
              Allow secret-like files (.env, keys) — off by default
            </label>
            <div className="row">
              <button className="btn" type="button" onClick={() => setShowSettings(false)}>
                Close
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  const host = peerHost.trim();
                  if (!host) {
                    setSettingsMsg(
                      "Enter the other Mac’s LAN IP (or Cloudflare URL) above, then click Add Mac.",
                    );
                    return;
                  }
                  if (host === "127.0.0.1" || host === "localhost") {
                    setSettingsMsg(
                      "Don’t use localhost — paste the other Mac’s LAN IP from its Settings.",
                    );
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
                    })
                    .catch((e) => {
                      const raw = e instanceof Error ? e.message : String(e);
                      setSettingsMsg(friendlyError(raw));
                    });
                }}
              >
                Add Mac
              </button>
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
        <div className="modal-backdrop" onClick={() => setConfirmCopy(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm copy</h2>
            <p>
              Copy <strong>{confirmCopy.source.name}</strong> to:
              <br />
              <code>{confirmCopy.destPath}</code>
            </p>
            <div className="row">
              <button className="btn" type="button" onClick={() => setConfirmCopy(null)}>
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={() => void doCopy()}>
                Copy now
              </button>
            </div>
          </div>
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
