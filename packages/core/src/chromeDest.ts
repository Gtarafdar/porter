import type { SharedFolder } from "@porter/protocol";

export type ChromeShareKind = "extensions" | "data";

export function chromeShareKind(
  label: string | undefined,
  folderPath: string | undefined,
): ChromeShareKind | null {
  const l = (label || "").trim();
  const p = folderPath || "";
  if (l === "Chrome Extensions" || /\/Google\/Chrome\/Default\/Extensions$/i.test(p)) {
    return "extensions";
  }
  if (
    l === "Chrome Extension Data" ||
    l.startsWith("Chrome Extension Data") ||
    /\/Local Extension Settings$/i.test(p)
  ) {
    return "data";
  }
  return null;
}

export function findChromeShare(
  shares: SharedFolder[],
  kind: ChromeShareKind,
): SharedFolder | undefined {
  return shares.find((f) => chromeShareKind(f.label, f.path) === kind);
}

export function relativeUnderShare(absolutePath: string, shareRoot: string): string {
  const root = shareRoot.replace(/\/$/, "");
  const full = absolutePath.replace(/\/$/, "");
  if (full === root) return "";
  if (full.startsWith(root + "/")) return full.slice(root.length + 1);
  return "";
}

export function matchingChromeDestDir(
  sourcePath: string,
  sourceShare: SharedFolder,
  destShare: SharedFolder,
): string {
  const rel = relativeUnderShare(sourcePath, sourceShare.path);
  const destRoot = destShare.path.replace(/\/$/, "");
  if (!rel) return destRoot;
  const parts = rel.split("/");
  if (parts.length <= 1) return destRoot;
  return `${destRoot}/${parts.slice(0, -1).join("/")}`;
}
