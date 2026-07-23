import { useEffect, useState } from "react";
import { porter, canPickFolderNative, type SetupSnapshot } from "./api";
import { IconCheck, IconPorterMark, IconShield } from "./Icons";

const STEPS = [
  { id: 0, title: "Welcome", blurb: "Porter keeps AI and file sharing private on your Macs — no cloud bill." },
  { id: 1, title: "Name this Mac", blurb: "Pick a clear name so Cursor and your other Macs recognize it." },
  { id: 2, title: "Share folders", blurb: "Only approved folders are visible. Start with Projects; enable write on an inbox to receive copies." },
  {
    id: 3,
    title: "Link Macs",
    blurb: "There is no Porter account. One shared secret (pair token) + the other Mac’s address links them.",
  },
  { id: 4, title: "Link Cursor", blurb: "One click merges Porter into ~/.cursor/mcp.json without removing Slack Agent Bridge or other MCP servers." },
  { id: 5, title: "You're set", blurb: "Open the Finder view, or ask Cursor to list Porter devices." },
];

type PairRole = "home" | "join" | null;

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
  const [pairRole, setPairRole] = useState<PairRole>(null);
  const [peerAddress, setPeerAddress] = useState("");
  const [homeTokenSnapshot, setHomeTokenSnapshot] = useState("");

  async function refresh() {
    const s = await porter.setup();
    setSnap(s);
    setName(s.deviceName);
    setToken(s.token);
    if (!homeTokenSnapshot) setHomeTokenSnapshot(s.token);
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
        if (!pairRole) {
          setMsg("Choose whether this Mac is Home or joining another Mac.");
          setBusy(false);
          return;
        }
        const t = token.trim();
        if (t.length < 16) {
          setMsg("Token must be at least 16 characters.");
          setBusy(false);
          return;
        }
        if (pairRole === "join" && !t) {
          setMsg("Paste the pair token from your Home Mac.");
          setBusy(false);
          return;
        }
        // Soft warn only — don't block if tokens already match from a prior save
        if (
          pairRole === "join" &&
          t === homeTokenSnapshot &&
          !peerAddress.trim()
        ) {
          setMsg(
            "Paste Home’s pair token (Copy token on Home), and optionally Home’s Cloudflare URL or LAN IP.",
          );
          setBusy(false);
          return;
        }
        await porter.setToken(t);

        let joinNote: string | null = null;
        if (pairRole === "join" && peerAddress.trim()) {
          const addr = peerAddress
            .trim()
            .replace(/^primary:\s*/i, "")
            .replace(/^fallback:\s*/i, "")
            .replace(/^["']|["']$/g, "");
          try {
            const d = await porter.addPeer(addr);
            joinNote = `Linked to ${d.name}.`;
          } catch (e) {
            const raw = e instanceof Error ? e.message : String(e);
            // Still continue — token is saved; user can retry in Add Mac
            if (/pair token rejected|Unauthorized/i.test(raw)) {
              joinNote =
                "Token may not match Home yet. Continue, then fix token in Add Mac.";
            } else {
              joinNote =
                "Home not reachable right now (check Cloudflare URL). Token saved — retry Connect in Add Mac.";
            }
          }
        } else if (pairRole === "join") {
          joinNote = "Token saved. Add Home’s address later via Add Mac.";
        }

        if (snap!.step >= STEPS.length - 1) {
          await porter.updateSetup({ completed: true, agentLinkAcknowledged: true });
          onDone();
          return;
        }
        await setStep(snap!.step + 1);
        await refresh();
        if (joinNote) setMsg(joinNote);
        return;
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
      <div className="sheet wizard sheet-fit" role="dialog" aria-labelledby="wizard-title">
        <div className="sheet-top">
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
        </div>

        <div className="sheet-body wizard-body">
          <h3>{step.title}</h3>
          <p>{step.blurb}</p>

          {snap.step === 0 && (
            <div className="callout">
              <IconShield size={18} />
              <div>
                <strong>How linking works:</strong> pick one Mac as <em>Home</em> (usually stays on).
                Other Macs <em>join</em> by pasting Home’s pair token, then adding Home’s address.
                Same Apple ID is not enough — Porter does not use iCloud.
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
            <div className="pair-role">
              <div className="role-cards">
                <button
                  type="button"
                  className={`role-card ${pairRole === "home" ? "selected" : ""}`}
                  onClick={() => {
                    setPairRole("home");
                    setToken(homeTokenSnapshot || token);
                    setMsg(null);
                  }}
                >
                  <strong>This is Home</strong>
                  <span>First Mac / stays on. Keep this token and copy it to travel Macs.</span>
                </button>
                <button
                  type="button"
                  className={`role-card ${pairRole === "join" ? "selected" : ""}`}
                  onClick={() => {
                    setPairRole("join");
                    setToken("");
                    setMsg(null);
                  }}
                >
                  <strong>Join Home Mac</strong>
                  <span>Paste the token from Home, then add Home’s IP or Cloudflare URL.</span>
                </button>
              </div>

              {pairRole === "home" && (
                <>
                  <div className="field">
                    <label>Your pair token (copy this to the other Mac)</label>
                    <textarea rows={3} value={token} readOnly />
                  </div>
                  <div className="row" style={{ justifyContent: "flex-start", marginTop: 0 }}>
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(token);
                        setMsg("Token copied — paste it on the other Mac under “Join Home Mac”.");
                      }}
                    >
                      Copy token
                    </button>
                  </div>
                  <div className="callout">
                    On the other Mac: choose <strong>Join Home Mac</strong>, paste this token, then
                    add this Mac’s LAN IP, Tailscale IP, or Cloudflare HTTPS URL (Travel Ready).
                  </div>
                </>
              )}

              {pairRole === "join" && (
                <>
                  <div className="field">
                    <label>Paste pair token from Home Mac</label>
                    <textarea
                      rows={3}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Paste the token you copied from Home…"
                    />
                  </div>
                  <div className="field">
                    <label>Home Mac address (LAN IP or Cloudflare https://… URL)</label>
                    <input
                      value={peerAddress}
                      onChange={(e) => setPeerAddress(e.target.value)}
                      placeholder="https://….trycloudflare.com or 192.168.x.x"
                    />
                  </div>
                  <div className="callout">
                    Copy these from Home’s <strong>Add Mac</strong> panel (Copy buttons). If Home
                    isn’t online yet, Continue still works — you can Connect later.
                  </div>
                </>
              )}
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

          {msg && (
            <p className={/could not|must|paste|fail|reject|not match|reachable/i.test(msg) && !/saved|linked|token saved/i.test(msg) ? "error-text" : "ok-text"}>
              {msg}
            </p>
          )}
        </div>

        <div className="sheet-foot wizard-actions">
          <button className="btn" type="button" disabled={snap.step === 0 || busy} onClick={() => void back()}>
            Back
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => onDone()}>
            Skip for now
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => void next()}>
            {busy ? "Working…" : snap.step >= STEPS.length - 1 ? "Open Porter" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
