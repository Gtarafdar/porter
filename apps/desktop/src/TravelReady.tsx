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

  const refresh = useCallback(async () => {
    const s = await porter.travelReady();
    setStatus(s);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
    const t = setInterval(() => void refresh().catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!status) {
    return (
      <div className="modal-backdrop">
        <div className="sheet wizard">
          <p>Checking travel readiness…</p>
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

  return (
    <div className="modal-backdrop wizard-backdrop">
      <div className="sheet wizard" style={{ width: "min(720px, 100%)" }}>
        <div className="wizard-brand">
          <IconPorterMark size={52} />
          <div>
            <h2>Travel Ready</h2>
            <p className="wizard-sub">
              {status.unattendedReady
                ? "Safe to leave — Porter will keep itself online"
                : status.ready
                  ? "Reachable today — finish Set & forget before you leave"
                  : "Finish the checklist before you leave"}
            </p>
          </div>
        </div>

        <div className={`callout ${status.unattendedReady ? "ok" : ""}`}>
          <IconShield size={18} />
          <div>{status.safetyNote}</div>
        </div>

        <div className="travel-checks">
          {status.checks.map((c) => (
            <div key={c.id} className={`travel-check ${c.ok ? "ok" : "bad"}`}>
              <span className="wiz-dot">{c.ok ? <IconCheck size={12} /> : "!"}</span>
              <div>
                <strong>{c.label}</strong>
                <div className="fmeta">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="field">
          <label>Pair token (copy to travel Mac)</label>
          <textarea rows={2} readOnly value={status.pairToken} />
        </div>
        <div className="field">
          <label>PRIMARY peer address (Cloudflare or LAN)</label>
          <input readOnly value={peerAddr} />
        </div>
        <div className="field">
          <label>FALLBACK peer (Tailscale — paste in Settings “Fallback”)</label>
          <input readOnly value={status.fallbackAddress || "Tailscale not online yet"} />
        </div>

        <ol className="travel-steps">
          {status.travelSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        {msg && <p className="error-text">{msg}</p>}

        <div className="row wizard-actions" style={{ flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => {
              void navigator.clipboard.writeText(status.pairToken);
              setMsg("Pair token copied");
            }}
          >
            Copy token
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => {
              const text = [
                `token: (paste from Copy token)`,
                `primary: ${peerAddr}`,
                status.fallbackAddress ? `fallback: ${status.fallbackAddress}` : "",
              ]
                .filter(Boolean)
                .join("\n");
              void navigator.clipboard.writeText(text);
              setMsg("Addresses copied — paste primary + fallback on travel Mac");
            }}
          >
            Copy addresses
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMsg("Enabling set-and-forget (LaunchAgent + tunnel + stay awake)…");
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
            Set & forget for travel
          </button>
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
            Install Tailscale (official)
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
              Start Cloudflare only
            </button>
          ) : (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void porter
                  .stopTunnel()
                  .then(() => {
                    setMsg("Tunnel stopped");
                    return refresh();
                  })
                  .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Stop tunnel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
