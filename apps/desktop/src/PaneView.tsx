import { useEffect, useState } from "react";
import { porter, type DeviceInfo, type FileEntry } from "./api";
import { IconCopy, IconFile, IconFolder } from "./Icons";

export type PaneState = {
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

export function PaneView({
  pane,
  side,
  devices,
  fallbackDeviceName,
  otherPane,
  view,
  setView,
  onNavigate,
  onSelect,
  onCopy,
}: {
  pane: PaneState | null;
  side: "left" | "right";
  devices: DeviceInfo[];
  fallbackDeviceName?: string | null;
  otherPane: PaneState | null;
  view: "icons" | "list";
  setView: (v: "icons" | "list") => void;
  onNavigate: (side: "left" | "right", path: string) => void;
  onSelect: (side: "left" | "right", pane: PaneState) => void;
  onCopy?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<FileEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  const deviceName =
    (pane && devices.find((d) => d.id === pane.deviceId)?.name) ||
    fallbackDeviceName ||
    "Mac";
  const title = side === "left" ? `From · ${deviceName}` : `To · ${deviceName}`;
  const subtitle =
    side === "left" ? "Pick files to copy" : "Copies land in the folder open here";

  const crumbs = pane
    ? pane.path.replace(pane.rootPath, "").split("/").filter(Boolean)
    : [];

  useEffect(() => {
    const q = query.trim();
    if (!pane || q.length < 2) {
      setSearchHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void porter
        .search(pane.deviceId, q)
        .then((hits) => {
          setSearchHits(
            hits.map((h) => ({
              name: h.name,
              path: h.path,
              relativePath: h.relativePath,
              isDirectory: h.isDirectory,
              size: 0,
              modifiedAt: "",
            })),
          );
        })
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, pane]);

  const filteredLocal =
    pane && query.trim() && !searchHits
      ? pane.entries.filter((e) =>
          e.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : (pane?.entries ?? []);

  const displayEntries = searchHits ?? filteredLocal;
  const showingSearch = Boolean(searchHits);
  const otherName =
    (otherPane && devices.find((d) => d.id === otherPane.deviceId)?.name) || "destination";

  return (
    <section className={`pane ${side === "right" ? "dest" : "source"}`}>
      <div className="pane-head">
        <div className="pane-title">
          <h2>{title}</h2>
          <span className="pane-sub">{subtitle}</span>
        </div>
        <div className="top-actions">
          <button
            className="btn"
            type="button"
            onClick={() => setView(view === "icons" ? "list" : "icons")}
          >
            {view === "icons" ? "List" : "Icons"}
          </button>
          {pane && (
            <button className="btn" type="button" onClick={() => onNavigate(side, pane.rootPath)}>
              Root
            </button>
          )}
        </div>
      </div>
      <div className="pane-search">
        <input
          type="search"
          value={query}
          disabled={!pane}
          placeholder={pane ? `Search on ${deviceName}…` : "Open a folder to search"}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${side} pane`}
        />
        {query ? (
          <button
            className="btn"
            type="button"
            onClick={() => {
              setQuery("");
              setSearchHits(null);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="crumbs">
        {showingSearch ? (
          <span>
            {searching
              ? "Searching…"
              : `${displayEntries.length} result${displayEntries.length === 1 ? "" : "s"} in shared folders`}
          </span>
        ) : pane ? (
          <>
            <button type="button" onClick={() => onNavigate(side, pane.rootPath)}>
              {pane.rootPath.split("/").pop()}
            </button>
            {crumbs.map((c, i) => {
              const partial = pane.rootPath + "/" + crumbs.slice(0, i + 1).join("/");
              return (
                <span key={partial}>
                  /{" "}
                  <button type="button" onClick={() => onNavigate(side, partial)}>
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
        {pane && displayEntries.length === 0 && (
          <div className="empty">{query.trim() ? "No matches" : "This folder is empty"}</div>
        )}
        {displayEntries.map((entry) => (
          <button
            key={entry.path}
            type="button"
            className={`file ${pane?.selected?.path === entry.path ? "selected" : ""}`}
            onClick={() => {
              if (!pane) return;
              onSelect(side, { ...pane, selected: entry });
            }}
            onDoubleClick={() => {
              if (entry.isDirectory) {
                setQuery("");
                setSearchHits(null);
                onNavigate(side, entry.path);
              }
            }}
            title={showingSearch ? entry.path : entry.name}
          >
            <div className="icon">
              <FileGlyph entry={entry} />
            </div>
            <div className="fname">{entry.name}</div>
            <div className="fmeta">
              {showingSearch
                ? entry.relativePath || entry.path
                : entry.isDirectory
                  ? "Folder"
                  : formatBytes(entry.size)}
            </div>
          </button>
        ))}
      </div>
      <div className="pane-foot">
        <span>{pane ? `${displayEntries.length} items · ${deviceName}` : "—"}</span>
        {side === "left" && onCopy && (
          <button
            className="btn primary"
            type="button"
            disabled={!pane?.selected || !otherPane}
            onClick={() => onCopy()}
          >
            <IconCopy size={14} /> Copy to {otherName}
          </button>
        )}
      </div>
    </section>
  );
}
