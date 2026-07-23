import { useCallback, useEffect, useMemo, useState } from "react";
import {
  porter,
  type ActivityEvent,
  type DeviceInfo,
  type DeviceSettings,
  type FileEntry,
  type SharedFolder,
} from "./api";
import {
  IconActivity,
  IconCopy,
  IconDevices,
  IconFile,
  IconFolder,
  IconPorterMark,
  IconSettings,
  IconSleep,
  IconWake,
} from "./Icons";
import { SetupWizard } from "./SetupWizard";

type PaneState = {
  deviceId: string;
  rootPath: string;
  path: string;
  entries: FileEntry[];
  selected: FileEntry | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileGlyph({ entry }: { entry: FileEntry }) {
  return entry.isDirectory ? <IconFolder size={28} /> : <IconFile size={28} />;
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
  const [confirmCopy, setConfirmCopy] = useState<{
    source: FileEntry;
    sourceDeviceId: string;
    destPath: string;
  } | null>(null);
  const [pairToken, setPairToken] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [wizardChecked, setWizardChecked] = useState(false);

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
      await porter.copy({
        sourceDeviceId: confirmCopy.sourceDeviceId,
        sourcePath: confirmCopy.source.path,
        destDeviceId: localDevice.id,
        destPath: confirmCopy.destPath,
        isDirectory: confirmCopy.source.isDirectory,
      });
      setConfirmCopy(null);
      if (right) await navigate("right", right.path);
      await refreshMeta();
      showToast("Copy complete");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function PaneView({
    title,
    pane,
    side,
  }: {
    title: string;
    pane: PaneState | null;
    side: "left" | "right";
  }) {
    const crumbs = pane
      ? pane.path
          .replace(pane.rootPath, "")
          .split("/")
          .filter(Boolean)
      : [];

    return (
      <section className={`pane ${side === "right" ? "dest" : "source"}`}>
        <div className="pane-head">
          <h2>{title}</h2>
          <div className="top-actions">
            <button className="btn" type="button" onClick={() => setView(view === "icons" ? "list" : "icons")}>
              {view === "icons" ? "List" : "Icons"}
            </button>
            {pane && (
              <button
                className="btn"
                type="button"
                onClick={() => navigate(side, pane.rootPath)}
              >
                Root
              </button>
            )}
          </div>
        </div>
        <div className="crumbs">
          {pane ? (
            <>
              <button type="button" onClick={() => navigate(side, pane.rootPath)}>
                {pane.rootPath.split("/").pop()}
              </button>
              {crumbs.map((c, i) => {
                const partial =
                  pane.rootPath + "/" + crumbs.slice(0, i + 1).join("/");
                return (
                  <span key={partial}>
                    /{" "}
                    <button type="button" onClick={() => navigate(side, partial)}>
                      {c}
                    </button>
                  </span>
                );
              })}
            </>
          ) : (
            <span>Select a device folder</span>
          )}
        </div>
        <div className={`files ${view}`}>
          {!pane && (
            <div className="empty">
              Approve a folder, then click it in the sidebar — like Finder on the other Mac.
            </div>
          )}
          {pane?.entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={`file ${pane.selected?.path === entry.path ? "selected" : ""}`}
              onClick={() => {
                const next = { ...pane, selected: entry };
                if (side === "left") setLeft(next);
                else setRight(next);
              }}
              onDoubleClick={() => {
                if (entry.isDirectory) void navigate(side, entry.path);
              }}
            >
              <div className="icon">
                <FileGlyph entry={entry} />
              </div>
              <div className="fname">{entry.name}</div>
              <div className="fmeta">
                {entry.isDirectory ? "Folder" : formatBytes(entry.size)}
              </div>
            </button>
          ))}
        </div>
        <div className="pane-foot">
          <span>
            {pane
              ? `${pane.entries.length} items · ${devices.find((d) => d.id === pane.deviceId)?.name ?? ""}`
              : "—"}
          </span>
          {side === "left" && (
            <button
              className="btn primary"
              type="button"
              disabled={!left?.selected || !right}
              onClick={() => void requestCopyToRight()}
            >
              <IconCopy size={14} /> Copy to other pane
            </button>
          )}
        </div>
      </section>
    );
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
              </span>
            </div>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn" type="button" onClick={() => setShowWizard(true)}>
            Setup
          </button>
          <button className="btn" type="button" onClick={() => setShowShare(true)}>
            Share folder
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
          <button className="btn" type="button" onClick={() => setShowSettings(true)}>
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
                        setError(e instanceof Error ? e.message : String(e)),
                      );
                  }
                }}
              >
                <span className="name">
                  <span className={`dot ${d.online ? "" : "off"}`} />
                  {d.name}
                  {d.isLocal ? " (this Mac)" : ""}
                </span>
                <span className="meta">
                  {d.via} · {d.host}
                </span>
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

        <PaneView title="Browse" pane={left} side="left" />
        <PaneView title="Drop here (this Mac)" pane={right} side="right" />
      </div>

      {showShare && (
        <div className="modal-backdrop" onClick={() => setShowShare(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Share a folder</h2>
            <p>
              Only paths you approve are visible to Cursor or the other Mac. Paste an absolute
              path (example: /Users/you/Projects).
            </p>
            <div className="field">
              <label>Folder path</label>
              <input
                value={sharePath}
                onChange={(e) => setSharePath(e.target.value)}
                placeholder="/Users/you/Projects"
              />
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
              <button className="btn primary" type="button" onClick={() => void onAddShare()}>
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && settings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <p>
              No Apple Developer account needed. Run Porter with Node on each Mac. Put the{" "}
              <strong>same pair token</strong> on both machines so they trust each other.
            </p>
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
              <label>Pair token (must match on both Macs)</label>
              <textarea
                rows={3}
                value={pairToken}
                onChange={(e) => setPairToken(e.target.value)}
              />
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
                  void porter.setToken(pairToken).then(() => {
                    showToast("Pair token saved");
                    void refreshMeta();
                  });
                }}
              >
                Save token
              </button>
            </div>
          </div>
        </div>
      )}

      {showActivity && (
        <div className="modal-backdrop" onClick={() => setShowActivity(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Activity</h2>
            <p>What Porter and Cursor accessed on this Mac.</p>
            <div className="activity">
              {activity.length === 0 && <div className="empty">No events yet</div>}
              {activity.map((a) => (
                <div key={a.id} className="item">
                  <strong>{a.action}</strong> · {a.source} · {a.ok ? "ok" : "fail"}
                  <div>{a.detail}</div>
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
            showToast("Setup ready");
          }}
        />
      )}
    </div>
  );
}
