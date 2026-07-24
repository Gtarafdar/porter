import { useEffect, useState } from "react";
import { porter, canPickFolderNative, type SetupSnapshot } from "./api";
import { IconCheck, IconPorterMark, IconShield } from "./Icons";

const STEPS = [
  { id: 0, title: "Welcome", blurb: "Porter keeps AI and file sharing private on your Macs — no cloud bill." },
  { id: 1, title: "Name this Mac", blurb: "Pick a clear name so Cursor and your other Macs recognize it." },
  { id: 2, title: "Share folders", blurb: "Only approved folders are visible. Start with Projects; enable write on an inbox to receive copies." },
  {
    id: 3,
    title: "Tailscale",
    blurb: "Tailscale privately connects your Macs for travel. Install, sign in, then continue.",
  },
  {
    id: 4,
    title: "Link Macs",
    blurb: "There is no Porter account. One shared secret (pair token) + the other Mac’s address links them.",
  },
  { id: 5, title: "Link Cursor", blurb: "One click merges Porter into ~/.cursor/mcp.json without removing Slack Agent Bridge or other MCP servers." },
  { id: 6, title: "You're set", blurb: "Open the Finder view, or ask Cursor to list Porter devices." },
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
  const [peerFallback, setPeerFallback] = useState("");
  const [homeTokenSnapshot, setHomeTokenSnapshot] = useState("");
  const [shareLinks, setShareLinks] = useState<{
    lan: string | null;
    tailscale: string | null;
    cloudflare: string | null;
    port: number;
  } | null>(null);
  const [linksBusy, setLinksBusy] = useState(false);
  const [tsStatus, setTsStatus] = useState<{
    installed: boolean;
    connected: boolean;
    selfIp: string | null;
    sshLikelyEnabled: boolean | null;
    detail: string;
  } | null>(null);

  async function refreshShareLinks() {
    try {
      const [n, t] = await Promise.all([porter.network(), porter.tunnelStatus()]);
      setShareLinks({
        lan: n.primaryLan,
        tailscale: n.tailscale.selfIp,
        cloudflare: t.publicUrl,
        port: 47831,
      });
    } catch {
      // ignore
    }
  }

  async function refreshTailscaleStatus() {
    try {
      const st = await porter.tailscaleSetupStatus();
      setTsStatus(st);
    } catch {
      setTsStatus(null);
    }
  }

  async function refresh() {
    const s = await porter.setup();
    setSnap(s);
    setName(s.deviceName);
    setToken(s.token);
    if (!homeTokenSnapshot) setHomeTokenSnapshot(s.token);
    if (s.step === 3) void refreshTailscaleStatus();
    if (s.step === 4) void refreshShareLinks();
    return s;
  }

  useEffect(() => {
    setNativePicker(canPickFolderNative());
    void refresh().catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (snap?.step !== 3) return;
    void refreshTailscaleStatus();
    const t = setInterval(() => void refreshTailscaleStatus(), 2000);
    return () => clearInterval(t);
  }, [snap?.step]);

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
        const st = tsStatus || (await porter.tailscaleSetupStatus());
        setTsStatus(st);
        if (!st.connected && !snap!.tailscaleSkipped) {
          setMsg("Connect Tailscale first (or choose same Wi‑Fi only below).");
          setBusy(false);
          return;
        }
      }
      if (snap!.step === 4) {
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
            "Paste Home’s pair token (Copy token on Home), and optionally Home’s Tailscale IP or address.",
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
            const d = await porter.addPeer(
              addr,
              47831,
              undefined,
              peerFallback.trim() || undefined,
            );
            joinNote = `Linked to ${d.name}.`;
          } catch (e) {
            const raw = e instanceof Error ? e.message : String(e);
            // Still continue — token is saved; user can retry in Add Mac
            if (/pair token rejected|Unauthorized/i.test(raw)) {
              joinNote =
                "Token may not match Home yet. Continue, then fix token in Add Mac.";
            } else if (/1033|Cloudflare tunnel|HTML error|trycloudflare/i.test(raw)) {
              joinNote =
                "Cloudflare URL looks dead. Prefer Tailscale IP from Home, then retry Connect.";
            } else {
              joinNote =
                "Home not reachable right now (check Tailscale). Token saved — retry in Add Mac.";
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
      if (snap!.step === 5) {
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
              <p>
                Porter uses <strong>Tailscale</strong> so your Macs stay private and reachable when
                you travel. Same Tailscale account on every Mac.
              </p>
              {tsStatus?.connected && tsStatus.selfIp ? (
                <div className="callout ok" style={{ marginTop: 12 }}>
                  <IconShield size={18} />
                  <div>
                    <strong>Tailscale is on</strong> — {tsStatus.selfIp}. Use this on both Macs. On
                    the <em>Home</em> Mac, finish setup then open <strong>Travel Ready → Set &amp;
                    forget</strong> before you leave.
                  </div>
                </div>
              ) : null}
              <div className="travel-checks" style={{ marginTop: 12 }}>
                <div className={`travel-check ${tsStatus?.installed ? "ok" : "bad"}`}>
                  <span className="wiz-dot">{tsStatus?.installed ? <IconCheck size={12} /> : "!"}</span>
                  <div>
                    <strong>Tailscale installed</strong>
                    <div className="fmeta">
                      {tsStatus?.installed ? "Found on this Mac" : "Not found yet"}
                    </div>
                  </div>
                </div>
                <div className={`travel-check ${tsStatus?.connected ? "ok" : "bad"}`}>
                  <span className="wiz-dot">{tsStatus?.connected ? <IconCheck size={12} /> : "!"}</span>
                  <div>
                    <strong>Signed in &amp; connected</strong>
                    <div className="fmeta">
                      {tsStatus?.selfIp
                        ? `IP ${tsStatus.selfIp}`
                        : tsStatus?.detail || "Waiting for connection…"}
                    </div>
                  </div>
                </div>
                <div
                  className={`travel-check ${
                    tsStatus?.sshLikelyEnabled === true ? "ok" : ""
                  }`}
                >
                  <span className="wiz-dot">
                    {tsStatus?.sshLikelyEnabled === true ? <IconCheck size={12} /> : "·"}
                  </span>
                  <div>
                    <strong>Tailscale SSH (recommended)</strong>
                    <div className="fmeta">
                      Enable in Tailscale → Settings so you can revive Porter while away. Optional
                      for now.
                    </div>
                  </div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                {!tsStatus?.installed && (
                  <button
                    className="btn primary"
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
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshTailscaleStatus()}
                >
                  Refresh
                </button>
              </div>
              {!tsStatus?.connected && (
                <button
                  className="btn linkish"
                  type="button"
                  style={{ marginTop: 8 }}
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void porter
                      .updateSetup({ tailscaleSkipped: true })
                      .then(() => setStep(snap.step + 1))
                      .then(() => refresh())
                      .then(() =>
                        setMsg("Continuing with same Wi‑Fi only — enable Tailscale later for travel."),
                      )
                      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Same Wi‑Fi only — skip Tailscale for now →
                </button>
              )}
            </div>
          )}

          {snap.step === 4 && (
            <div className="pair-role">
              <div className="role-cards">
                <button
                  type="button"
                  className={`role-card ${pairRole === "home" ? "selected" : ""}`}
                  onClick={() => {
                    setPairRole("home");
                    setToken(homeTokenSnapshot || token);
                    setMsg(null);
                    void refreshShareLinks();
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
                  <div className="connect-block" style={{ borderBottom: 0, marginBottom: 0, paddingBottom: 0 }}>
                    <h3>Copy these for the travel Mac</h3>
                    <p className="connect-hint">
                      Labels match the paste fields on the other Mac (Add Mac / Join).
                    </p>
                    <div className="share-rows">
                      <div className="share-row">
                        <div>
                          <span className="share-label">
                            Pair token — paste into “Pair token on this Mac”
                          </span>
                          <code className="share-url">{token}</code>
                        </div>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(token);
                            setMsg("Pair token copied");
                          }}
                        >
                          Copy
                        </button>
                      </div>
                      <div className="share-row">
                        <div>
                          <span className="share-label">
                            Other Mac address (LAN) — paste into “Other Mac address”
                          </span>
                          <code>{shareLinks?.lan || "—"}</code>
                        </div>
                        <button
                          className="btn"
                          type="button"
                          disabled={!shareLinks?.lan}
                          onClick={() => {
                            if (!shareLinks?.lan) return;
                            void navigator.clipboard.writeText(shareLinks.lan);
                            setMsg("LAN address copied");
                          }}
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
                            {shareLinks?.cloudflare || "Not started — tap Start tunnel"}
                          </code>
                        </div>
                        {shareLinks?.cloudflare ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(shareLinks.cloudflare!);
                              setMsg("Cloudflare URL copied");
                            }}
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
                              void porter
                                .startTunnel()
                                .then(async (r) => {
                                  setMsg(
                                    r.publicUrl
                                      ? "Tunnel ready — Copy Cloudflare URL"
                                      : "Tunnel started — wait a moment then Copy",
                                  );
                                  await refreshShareLinks();
                                })
                                .catch((e) =>
                                  setMsg(e instanceof Error ? e.message : String(e)),
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
                              : "Install Tailscale for travel backup"}
                          </code>
                        </div>
                        {shareLinks?.tailscale ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              const v = `${shareLinks.tailscale}:${shareLinks.port}`;
                              void navigator.clipboard.writeText(v);
                              setMsg("Tailscale fallback copied");
                            }}
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
                                setMsg(r.note);
                              });
                            }}
                          >
                            Get Tailscale
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="callout">
                    On travel: choose <strong>Join Home Mac</strong>, paste token + Cloudflare URL,
                    and Tailscale as Fallback (required if the Cloudflare link changes after reboot).
                  </div>
                </>
              )}

              {pairRole === "join" && (
                <>
                  <div className="field">
                    <label>Pair token on this Mac (paste from Home)</label>
                    <textarea
                      rows={3}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Paste the token you copied from Home…"
                    />
                  </div>
                  <div className="field">
                    <label>Other Mac address (LAN or Cloudflare URL from Home)</label>
                    <input
                      value={peerAddress}
                      onChange={(e) => setPeerAddress(e.target.value)}
                      placeholder="https://….trycloudflare.com or 192.168.x.x"
                    />
                  </div>
                  <div className="field">
                    <label>Fallback (optional Tailscale from Home)</label>
                    <input
                      value={peerFallback}
                      onChange={(e) => setPeerFallback(e.target.value)}
                      placeholder="100.x.x.x:47831"
                    />
                  </div>
                  <div className="callout">
                    Copy each value from Home’s matching labeled Copy buttons. If Cloudflare fails
                    later, Tailscale fallback keeps you connected.
                  </div>
                </>
              )}
            </div>
          )}

          {snap.step === 5 && (
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

          {snap.step === 6 && (
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
          <button
            className="btn primary"
            type="button"
            disabled={
              busy ||
              (snap.step === 3 && !tsStatus?.connected && !snap.tailscaleSkipped)
            }
            onClick={() => void next()}
          >
            {busy ? "Working…" : snap.step >= STEPS.length - 1 ? "Open Porter" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
