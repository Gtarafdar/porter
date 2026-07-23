import { useEffect, useState } from "react";
import { porter, canPickFolderNative, type SetupSnapshot } from "./api";
import { IconCheck, IconPorterMark, IconShield } from "./Icons";

const STEPS = [
  { id: 0, title: "Welcome", blurb: "Porter keeps AI and file sharing private on your Macs — no cloud bill." },
  { id: 1, title: "Name this Mac", blurb: "Pick a clear name so Cursor and your other Macs recognize it." },
  { id: 2, title: "Share folders", blurb: "Only approved folders are visible. Start with Projects; enable write on an inbox to receive copies." },
  { id: 3, title: "Pair token", blurb: "Use the same secret on every Mac. Same pattern as linking Slack Agent Bridge securely on one machine." },
  { id: 4, title: "Link Cursor", blurb: "One click merges Porter into ~/.cursor/mcp.json without removing Slack Agent Bridge or other MCP servers." },
  { id: 5, title: "You're set", blurb: "Open the Finder view, or ask Cursor to list Porter devices." },
];

export function SetupWizard({
  onDone,
}: {
  onDone: () => void;
}) {
  const [snap, setSnap] = useState<SetupSnapshot | null>(null);
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [write, setWrite] = useState(true);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nativePicker, setNativePicker] = useState(false);

  async function refresh() {
    const s = await porter.setup();
    setSnap(s);
    setName(s.deviceName);
    setToken(s.token);
    return s;
  }

  useEffect(() => {
    setNativePicker(canPickFolderNative());
    void refresh().catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, []);

  if (!snap) {
    return (
      <div className="modal-backdrop">
        <div className="sheet wizard">
          <p>Loading setup…</p>
        </div>
      </div>
    );
  }

  const step = STEPS[snap.step] ?? STEPS[0];

  async function setStep(n: number) {
    const s = await porter.updateSetup({ step: n });
    setSnap(s);
  }

  async function next() {
    setMsg(null);
    setBusy(true);
    try {
      if (snap!.step === 1) {
        await porter.updateDevice({ deviceName: name.trim() || snap!.deviceName });
      }
      if (snap!.step === 2) {
        if (!snap!.hasSharedFolder) {
          if (!folderPath.trim()) {
            setMsg("Add at least one folder path to continue.");
            setBusy(false);
            return;
          }
          await porter.addFolder(folderPath.trim(), undefined, write);
        }
      }
      if (snap!.step === 3) {
        if (token.trim().length < 16) {
          setMsg("Token must be at least 16 characters.");
          setBusy(false);
          return;
        }
        await porter.setToken(token.trim());
      }
      if (snap!.step === 4) {
        // allow continue after install or acknowledge
      }
      if (snap!.step >= STEPS.length - 1) {
        await porter.updateSetup({ completed: true, agentLinkAcknowledged: true });
        onDone();
        return;
      }
      await setStep(snap!.step + 1);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    if (snap!.step > 0) await setStep(snap!.step - 1);
  }

  async function installMcp() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await porter.installCursorMcp();
      setMsg(
        r.alreadyPresent
          ? `Porter MCP updated in ${r.path}`
          : `Porter MCP added to ${r.path} (other servers kept)`,
      );
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop wizard-backdrop">
      <div className="sheet wizard" role="dialog" aria-labelledby="wizard-title">
        <div className="wizard-brand">
          <IconPorterMark size={52} />
          <div>
            <h2 id="wizard-title">Porter setup</h2>
            <p className="wizard-sub">Private bridge · same ease as Slack Agent Bridge</p>
          </div>
        </div>

        <ol className="wizard-steps">
          {STEPS.map((s) => {
            const done = s.id < snap.step || (s.id === snap.step && snap.completed);
            const active = s.id === snap.step;
            return (
              <li key={s.id} className={`${active ? "active" : ""} ${done && !active ? "done" : ""}`}>
                <span className="wiz-dot">{done && !active ? <IconCheck size={12} /> : s.id + 1}</span>
                <span className="wiz-label">{s.title}</span>
              </li>
            );
          })}
        </ol>

        <div className="wizard-body">
          <h3>{step.title}</h3>
          <p>{step.blurb}</p>

          {snap.step === 0 && (
            <div className="callout">
              <IconShield size={18} />
              <div>
                <strong>Security default:</strong> whole-disk access is off. Secrets and browser
                profiles stay blocked unless you turn them on later.
              </div>
            </div>
          )}

          {snap.step === 1 && (
            <div className="field">
              <label>Device name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}

          {snap.step === 2 && (
            <>
              {snap.hasSharedFolder ? (
                <div className="callout ok">Folders already approved on this Mac.</div>
              ) : (
                <>
                  <div className="field">
                    <label>Folder to share</label>
                    <div className="path-row">
                      <input
                        value={folderPath}
                        onChange={(e) => setFolderPath(e.target.value)}
                        placeholder={nativePicker ? "Choose a folder…" : "/Users/you/Projects"}
                      />
                      {nativePicker ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            void porter.pickFolder().then((p) => {
                              if (p) setFolderPath(p);
                            });
                          }}
                        >
                          Choose folder…
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
                    Allow writes (needed to receive copies)
                  </label>
                </>
              )}
            </>
          )}

          {snap.step === 3 && (
            <div className="field">
              <label>Pair token (same on every Mac)</label>
              <textarea rows={3} value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
          )}

          {snap.step === 4 && (
            <>
              <pre className="code-block">{snap.mcpSnippet}</pre>
              <div className="row" style={{ justifyContent: "flex-start" }}>
                <button className="btn primary" type="button" disabled={busy} onClick={() => void installMcp()}>
                  Install into Cursor mcp.json
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(snap.mcpSnippet);
                    setMsg("Snippet copied — paste into Cursor MCP settings if you prefer manual.");
                  }}
                >
                  Copy snippet
                </button>
              </div>
              {snap.mcpInstalled && (
                <div className="callout ok">Porter is in Cursor config. Reload MCP in Cursor to finish.</div>
              )}
            </>
          )}

          {snap.step === 5 && (
            <div className="callout ok">
              Menu bar app (optional): build with <code>apps/mac-menubar</code> for one-click Open /
              Sleep / Setup — same tray pattern as Slack Agent Bridge.
            </div>
          )}

          {msg && <p className="error-text">{msg}</p>}
        </div>

        <div className="row wizard-actions">
          <button className="btn" type="button" disabled={snap.step === 0 || busy} onClick={() => void back()}>
            Back
          </button>
          <button className="btn" type="button" onClick={() => onDone()}>
            Skip for now
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => void next()}>
            {snap.step >= STEPS.length - 1 ? "Open Porter" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
