import { useCallback, useEffect, useState } from "react";
import { porter } from "./api";
import { IconCheck, IconPorterMark, IconShield } from "./Icons";

type TravelCheck = { id: string; label: string; ok: boolean; detail: string };

type TravelStatus = {
  ready: boolean;
  deviceName: string;
  pairToken: string;
  tailscaleIp: string | null;
  lanIp: string | null;
  port: number;
  checks: TravelCheck[];
  travelSteps: string[];
  safetyNote: string;
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

  return (
    <div className="modal-backdrop wizard-backdrop">
      <div className="sheet wizard" style={{ width: "min(680px, 100%)" }}>
        <div className="wizard-brand">
          <IconPorterMark size={52} />
          <div>
            <h2>Travel Ready</h2>
            <p className="wizard-sub">
              {status.ready
                ? "This Mac can be reached from the road"
                : "Finish the checklist before you leave"}
            </p>
          </div>
        </div>

        <div className={`callout ${status.ready ? "ok" : ""}`}>
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
          <label>Add peer on travel Mac using this address</label>
          <input
            readOnly
            value={`${status.tailscaleIp || status.lanIp || "…"}:${status.port}`}
          />
        </div>

        <ol className="travel-steps">
          {status.travelSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        {msg && <p className="error-text">{msg}</p>}

        <div className="row wizard-actions">
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
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMsg(null);
              void porter
                .shareTravelPresets()
                .then((r) => {
                  setMsg(
                    r.added.length
                      ? `Shared ${r.added.length} work folder(s)`
                      : "Work folders already shared",
                  );
                  return refresh();
                })
                .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                .finally(() => setBusy(false));
            }}
          >
            Share work folders (safe)
          </button>
        </div>
      </div>
    </div>
  );
}
