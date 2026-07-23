import { useCallback, useEffect, useState } from "react";
import { porter } from "./api";
import { IconCheck, IconPorterMark, IconShield } from "./Icons";

type TravelCheck = { id: string; label: string; ok: boolean; detail: string };

type TravelStatus = {
  ready: boolean;
  unattendedReady?: boolean;
  deviceName: string;
  pairToken: string;
  tailscaleIp: string | null;
  cloudflareUrl: string | null;
  peerAddress: string | null;
  fallbackAddress: string | null;
  lanIp: string | null;
  port: number;
  checks: TravelCheck[];
  travelSteps: string[];
  safetyNote: string;
  keepAliveInstalled?: boolean;
  tunnel: {
    running: boolean;
    publicUrl: string | null;
    cloudflaredInstalled: boolean;
    wantRunning?: boolean;
    restartAttempts?: number;
  };
};

export function TravelReadyPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<TravelStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showChecks, setShowChecks] = useState(false);

  const refresh = useCallback(async () => {
    const s = await porter.travelReady();
    setStatus(s);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
    const t = setInterval(() => void refresh().catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  function copy(label: string, value: string) {
    void navigator.clipboard.writeText(value);
    setMsg(`${label} copied — paste on the travel Mac in Add Mac`);
  }

  if (!status) {
    return (
      <div className="modal-backdrop wizard-backdrop">
        <div className="sheet sheet-fit travel-sheet">
          <div className="sheet-body">
            <p>Checking travel readiness…</p>
          </div>
          <div className="sheet-foot">
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const peerAddr =
    status.peerAddress ||
    status.cloudflareUrl ||
    (status.tailscaleIp
      ? `${status.tailscaleIp}:${status.port}`
      : `${status.lanIp || "…"}:${status.port}`);
  const fallback =
    status.fallbackAddress ||
    (status.tailscaleIp ? `${status.tailscaleIp}:${status.port}` : "");
  const okCount = status.checks.filter((c) => c.ok).length;
  const badChecks = status.checks.filter((c) => !c.ok);

  return (
    <div className="modal-backdrop wizard-backdrop">
      <div className="sheet sheet-fit travel-sheet" role="dialog" aria-labelledby="travel-title">
        <div className="sheet-top">
          <div className="wizard-brand">
            <IconPorterMark size={36} />
            <div>
              <h2 id="travel-title">Travel Ready</h2>
              <p className="wizard-sub">
                {status.unattendedReady
                  ? "Safe to leave — Porter stays online"
                  : status.ready
                    ? "Almost — tap Set & forget before you leave"
                    : "Finish what’s left, then Set & forget"}
              </p>
            </div>
          </div>
        </div>

        <div className="sheet-body">
          <div className={`callout ${status.unattendedReady ? "ok" : ""}`}>
            <IconShield size={16} />
            <div>{status.safetyNote}</div>
          </div>

          <div className="travel-summary">
            <span className={badChecks.length ? "bad" : "ok"}>
              {okCount}/{status.checks.length} ready
            </span>
            <button
              className="btn linkish"
              type="button"
              onClick={() => setShowChecks((v) => !v)}
            >
              {showChecks || badChecks.length > 0 ? "Hide details" : "Show checklist"}
            </button>
          </div>

          {(showChecks || badChecks.length > 0) && (
            <div className="travel-checks">
              {(showChecks ? status.checks : badChecks).map((c) => (
                <div key={c.id} className={`travel-check ${c.ok ? "ok" : "bad"}`}>
                  <span className="wiz-dot">{c.ok ? <IconCheck size={12} /> : "!"}</span>
                  <div>
                    <strong>{c.label}</strong>
                    <div className="fmeta">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="connect-block">
            <h3>Copy for travel Mac</h3>
            <p className="connect-hint">Add Mac on the other Mac → paste these.</p>
            <div className="share-rows">
              <div className="share-row">
                <div>
                  <span className="share-label">Pair token</span>
                  <code className="share-url">{status.pairToken}</code>
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={() => copy("Token", status.pairToken)}
                >
                  Copy
                </button>
              </div>
              <div className="share-row">
                <div>
                  <span className="share-label">Primary (Cloudflare / LAN)</span>
                  <code className="share-url">{peerAddr}</code>
                </div>
                <button className="btn" type="button" onClick={() => copy("Primary", peerAddr)}>
                  Copy
                </button>
              </div>
              <div className="share-row">
                <div>
                  <span className="share-label">Fallback (Tailscale)</span>
                  <code className="share-url">{fallback || "Tailscale not online yet"}</code>
                </div>
                {fallback ? (
                  <button className="btn" type="button" onClick={() => copy("Fallback", fallback)}>
                    Copy
                  </button>
                ) : (
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void porter
                        .openTailscaleDownload()
                        .then((r) => setMsg(r.note))
                        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
                    }}
                  >
                    Get Tailscale
                  </button>
                )}
              </div>
            </div>
            <button
              className="btn linkish"
              type="button"
              onClick={() => {
                const text = [
                  `token: ${status.pairToken}`,
                  `primary: ${peerAddr}`,
                  fallback ? `fallback: ${fallback}` : "",
                ]
                  .filter(Boolean)
                  .join("\n");
                void navigator.clipboard.writeText(text);
                setMsg("All travel lines copied");
              }}
            >
              Copy all three lines →
            </button>
          </div>

          {msg && (
            <p className={/fail|error|could not|missing/i.test(msg) ? "error-text" : "ok-text"}>
              {msg}
            </p>
          )}
        </div>

        <div className="sheet-foot travel-foot">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          {!status.tunnel.running ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void porter
                  .startTunnel()
                  .then((r) => {
                    setMsg(r.publicUrl ? `Tunnel: ${r.publicUrl}` : "Tunnel started");
                    return refresh();
                  })
                  .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Start tunnel
            </button>
          ) : null}
          <button
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMsg("Enabling set-and-forget…");
              void porter
                .setAndForget()
                .then((r) => {
                  const bits = [
                    r.tunnelUrl ? "Tunnel live" : null,
                    r.keepalive.ok ? "Auto-start installed" : r.keepalive.detail,
                    r.folders.added.length
                      ? `Shared ${r.folders.added.length} folders`
                      : null,
                    ...(r.warnings || []),
                  ].filter(Boolean);
                  setMsg(bits.join(" · ") || "Done");
                  return refresh();
                })
                .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Working…" : "Set & forget"}
          </button>
        </div>
      </div>
    </div>
  );
}
