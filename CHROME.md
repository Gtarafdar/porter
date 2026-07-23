# Chrome extensions with Porter

Porter does **not** install or “load” Chrome extensions for you. It only lets you **copy two folders** between Macs. Chrome only uses those files if they sit in the **exact Chrome profile paths** — not in Downloads.

---

## Why nothing showed up

You copied folders into **Downloads**, then loaded an extension in Chrome. That will not restore settings.

| What you did | What Chrome needs |
| --- | --- |
| Files in `~/Downloads/…` | Files inside Chrome’s own folders under `Library/Application Support/…` |
| “Load unpacked” from Downloads | Packaged extension IDs already under `…/Chrome/Default/Extensions` |
| Extension installed fresh from Web Store | Matching **Extension Data** folders (same extension IDs) |

**Downloads = temporary holding area.** After copy, you must **move/replace into Chrome’s paths** with Chrome fully quit.

---

## What Porter syncs (and what it never syncs)

| Folder (label in Porter) | Real path on Mac | Contains |
| --- | --- | --- |
| **Chrome Extensions** | `~/Library/Application Support/Google/Chrome/Default/Extensions` | Installed extension code (by extension ID) |
| **Chrome Extension Data** | `~/Library/Application Support/Google/Chrome/Default/Local Extension Settings` | Per-extension settings / local storage (by extension ID) |

**Never synced (blocked on purpose):** passwords, cookies, full Chrome profile, sync login, payment data.

This is a **manual copy**, not live sync. Changes on one Mac do not appear on the other until you copy again.

---

## Correct workflow (home → travel)

### A. On Home Mac (once)

1. Quit **Google Chrome** completely (Chrome menu → Quit, or Activity Monitor → quit “Google Chrome”).
2. Open Porter → **Settings → This Mac** → **Share Chrome extensions folders**.
3. You should see **Chrome Extensions** and **Chrome Extension Data** under Approved folders.

### B. Copy with Porter

1. On **travel Mac**, open Porter, connect to Home (Tailscale recommended).
2. Quit Chrome on **both** Macs before copying these folders.
3. Left pane: Home → open **Chrome Extensions** (or the parent if listed).
4. Right pane: travel Mac — open the **same Chrome path** (see below), **not Downloads**.
5. Copy the folder(s).
6. Repeat for **Chrome Extension Data**.

**Tip:** If the travel Mac does not yet show those Chrome paths as shared folders:

1. Quit Chrome on travel.
2. Travel Porter → Settings → **Share Chrome extensions folders** (creates/approves the destinations with write access).
3. Then copy **into** those folders from Home.

### C. After copy — open Chrome

1. Open Google Chrome on travel.
2. Go to `chrome://extensions`.
3. Extensions that were on Home should appear (same IDs).
4. Open each extension and confirm settings.

If an extension is missing, install it once from the Web Store on travel, quit Chrome, copy **only Extension Data** again (IDs must match).

---

## Exact paths (copy these into Finder if needed)

**Extensions (code):**

```text
/Users/YOUR_USERNAME/Library/Application Support/Google/Chrome/Default/Extensions
```

**Extension Data (settings):**

```text
/Users/YOUR_USERNAME/Library/Application Support/Google/Chrome/Default/Local Extension Settings
```

Replace `YOUR_USERNAME` with your Mac username (e.g. `gtarafdar`).

In Finder: **Go → Go to Folder…** (⇧⌘G) → paste the path.

---

## If you already copied into Downloads

1. Quit Chrome on the travel Mac.
2. In Porter (or Finder), move/copy from Downloads into the two paths above.
   - Prefer **replacing** the matching extension-ID subfolders, not dumping a random zip into Downloads.
3. Example: if you have  
   `Downloads/Local Extension Settings/abcdefghijklmnopqrstuvwxyz`  
   it must become  
   `…/Chrome/Default/Local Extension Settings/abcdefghijklmnopqrstuvwxyz`
4. Reopen Chrome.

Do **not** leave the only copy in Downloads and expect Chrome to find it.

---

## “Load unpacked” vs Porter copy

| Method | When to use |
| --- | --- |
| **Porter folder copy** | Same extensions you already use on Home (Web Store / normal installs) |
| **Load unpacked** | You are a developer loading a folder of source code (e.g. `case-tools-extension`) |

These are different:

- **Unpacked** = Chrome points at a project folder you choose.
- **Porter Chrome sync** = replaces files inside Chrome’s `Extensions` + `Local Extension Settings`.

An unpacked extension loaded from Downloads will **not** automatically use Home’s Extension Data unless the extension ID matches and data is in `Local Extension Settings/<id>`.

---

## Checklist when something’s wrong

1. Chrome fully quit on **both** Macs during copy?
2. Destination is `…/Chrome/Default/Extensions` (and Data), **not** Downloads?
3. Travel Mac shared those Chrome folders with **write** enabled?
4. Extension IDs under `Local Extension Settings` match IDs under `Extensions`?
5. Same Chrome profile (“Default”)? (Porter only targets **Default**, not “Profile 1”.)
6. Re-open Chrome only **after** the copy finishes?

---

## Quick summary

```text
Home: Quit Chrome → Share Chrome folders in Porter
        ↓
Travel: Quit Chrome → Share Chrome folders (destination)
        ↓
Porter: Copy Extensions + Extension Data into Chrome paths (not Downloads)
        ↓
Travel: Open Chrome → chrome://extensions → check settings
```

Everyday Projects/Downloads sharing does **not** need quitting Chrome. Only this optional Chrome-folder sync does.
