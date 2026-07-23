import AppKit
import Foundation
import WebKit

/// Native Mac window shell for Porter.
/// Loads the existing Finder UI at http://127.0.0.1:47831 — does not replace the Node core.
@main
enum PorterWindowMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusStack: NSStackView!
    private var statusLabel: NSTextField!
    private var detailScroll: NSScrollView!
    private var detailText: NSTextView!
    private var actionRow: NSStackView!
    private let port = 47831
    private var healthTimer: Timer?
    private var loadAttempts = 0
    private var lastFailureText = ""

    private var baseURL: URL { URL(string: "http://127.0.0.1:\(port)/")! }
    private var healthURL: URL { URL(string: "http://127.0.0.1:\(port)/api/health")! }
    private var logPath: String { NSHomeDirectory() + "/Library/Logs/Porter/porter.log" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        clearQuarantineOnSelf()
        buildMenu()
        buildWindow()
        ensureCoreThenLoad()
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Free/local apps are not Apple-notarized; Downloads often quarantine the whole .app.
    private func clearQuarantineOnSelf() {
        let appPath = Bundle.main.bundlePath
        _ = shell("xattr -dr com.apple.quarantine \(shellQuote(appPath)) 2>/dev/null || true")
    }

    private func shellQuote(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    // MARK: - UI

    private func buildWindow() {
        let rect = NSRect(x: 0, y: 0, width: 1100, height: 720)
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Porter"
        window.minSize = NSSize(width: 800, height: 520)
        window.center()
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("PorterMainWindow")

        let container = NSView(frame: rect)
        container.wantsLayer = true

        statusLabel = NSTextField(labelWithString: "Starting Porter…")
        statusLabel.alignment = .center
        statusLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        statusLabel.textColor = .labelColor
        statusLabel.maximumNumberOfLines = 3
        statusLabel.lineBreakMode = .byWordWrapping

        detailText = NSTextView(frame: .zero)
        detailText.isEditable = false
        detailText.isSelectable = true
        detailText.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        detailText.textColor = .secondaryLabelColor
        detailText.backgroundColor = NSColor.textBackgroundColor.withAlphaComponent(0.6)
        detailText.drawsBackground = true
        detailText.textContainerInset = NSSize(width: 8, height: 8)

        detailScroll = NSScrollView(frame: .zero)
        detailScroll.documentView = detailText
        detailScroll.hasVerticalScroller = true
        detailScroll.borderType = .bezelBorder
        detailScroll.translatesAutoresizingMaskIntoConstraints = false
        detailScroll.heightAnchor.constraint(equalToConstant: 220).isActive = true
        detailScroll.isHidden = true

        let retry = NSButton(title: "Try again", target: self, action: #selector(reloadUI))
        let copy = NSButton(title: "Copy error", target: self, action: #selector(copyFailure))
        let showLog = NSButton(title: "Show log folder", target: self, action: #selector(revealLog))
        actionRow = NSStackView(views: [retry, copy, showLog])
        actionRow.orientation = .horizontal
        actionRow.spacing = 10
        actionRow.alignment = .centerY
        actionRow.isHidden = true

        statusStack = NSStackView(views: [statusLabel, detailScroll, actionRow])
        statusStack.orientation = .vertical
        statusStack.spacing = 14
        statusStack.alignment = .centerX
        statusStack.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(statusStack)

        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        config.userContentController.add(self, name: "porter")
        // Mark native shell so the UI can show “Choose folder…” (Finder picker).
        let bridgeJS = """
        window.__porterNative = true;
        window.__porterPickFolder = function () {
          return new Promise(function (resolve) {
            window.__porterPickFolderResolve = resolve;
            try {
              window.webkit.messageHandlers.porter.postMessage({ type: 'pickFolder' });
            } catch (e) {
              resolve(null);
            }
          });
        };
        """
        config.userContentController.addUserScript(
            WKUserScript(source: bridgeJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        container.addSubview(webView)

        NSLayoutConstraint.activate([
            statusStack.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            statusStack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            statusStack.widthAnchor.constraint(lessThanOrEqualToConstant: 640),
            statusStack.leadingAnchor.constraint(greaterThanOrEqualTo: container.leadingAnchor, constant: 40),
            statusStack.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -40),
            detailScroll.widthAnchor.constraint(equalTo: statusStack.widthAnchor),

            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])

        webView.isHidden = true
        window.contentView = container
        window.makeKeyAndOrderFront(nil)
    }

    private func buildMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu(title: "Porter")
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Porter", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide Porter", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Porter Window", action: #selector(quitWindow), keyEquivalent: "q")

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "File")
        fileMenuItem.submenu = fileMenu
        fileMenu.addItem(withTitle: "Show Window", action: #selector(showWindow), keyEquivalent: "0")
        fileMenu.addItem(withTitle: "Reload", action: #selector(reloadUI), keyEquivalent: "r")
        fileMenu.addItem(withTitle: "Choose Folder to Share…", action: #selector(menuPickFolder), keyEquivalent: "o")
        fileMenu.addItem(withTitle: "Show Log Folder", action: #selector(revealLog), keyEquivalent: "l")
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(withTitle: "Open in Browser…", action: #selector(openInBrowser), keyEquivalent: "")

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(NSMenuItem.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windowMenu

        let helpMenuItem = NSMenuItem()
        mainMenu.addItem(helpMenuItem)
        let helpMenu = NSMenu(title: "Help")
        helpMenuItem.submenu = helpMenu
        helpMenu.addItem(withTitle: "If Mac says “malware”…", action: #selector(showMalwareHelp), keyEquivalent: "")
        helpMenu.addItem(withTitle: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "")

        NSApp.mainMenu = mainMenu
    }

    // MARK: - Core lifecycle

    private func ensureCoreThenLoad() {
        if Bundle.main.bundlePath.contains("AppTranslocation") {
            statusLabel.stringValue = "Move Porter.app to Applications first (don’t open from Downloads)…"
            detailScroll.isHidden = false
            detailText.string = """
macOS is running Porter from a temporary folder (App Translocation).

1. Quit Porter
2. Drag Porter.app into /Applications
3. Open it from Applications (right‑click → Open the first time)

Then the engine can start reliably.
"""
            actionRow.isHidden = false
            // Still attempt start — some Macs work — but keep the warning visible until healthy.
        } else {
            statusLabel.stringValue = "Starting Porter…"
            detailScroll.isHidden = true
            actionRow.isHidden = true
        }
        webView.isHidden = true
        loadAttempts = 0

        checkHealth { [weak self] ok in
            guard let self else { return }
            if ok {
                self.loadWebUI()
            } else {
                self.launchCore()
                self.pollUntilHealthy()
            }
        }
    }

    private func pollUntilHealthy() {
        healthTimer?.invalidate()
        healthTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.loadAttempts += 1
                if self.loadAttempts > 75 {
                    self.healthTimer?.invalidate()
                    self.showStartupFailure()
                    return
                }
                self.checkHealth { ok in
                    if ok {
                        self.healthTimer?.invalidate()
                        self.loadWebUI()
                    }
                }
            }
        }
    }

    private func showStartupFailure() {
        let logTail = readRecentLog()
        let hint = diagnoseFailure(logTail: logTail)
        statusLabel.stringValue = hint
        let body = """
\(hint)

—— Recent porter.log (this launch) ——
\(logTail.isEmpty ? "(no new log lines — core likely never launched, or was blocked by Gatekeeper)" : logTail)

Log file: \(logPath)
"""
        lastFailureText = body
        detailText.string = body
        detailScroll.isHidden = false
        actionRow.isHidden = false
        webView.isHidden = true
    }

    private func diagnoseFailure(logTail: String) -> String {
        let lower = logTail.lowercased()
        let arch = shell("uname -m").trimmingCharacters(in: .whitespacesAndNewlines)
        let bundlePath = Bundle.main.bundlePath

        if bundlePath.contains("AppTranslocation") || lower.contains("apptranslocation") {
            return "Don’t run Porter from Downloads. Drag Porter.app into Applications, then open it from there (right‑click → Open)."
        }
        if lower.contains("libuv") || lower.contains("/opt/homebrew/") || lower.contains("library not loaded") {
            return "This Porter.app has a broken Node binary (needs Homebrew). Delete it, download Porter 0.2.7+, put it in Applications, then right‑click → Open."
        }
        if lower.contains("node-ok") && !lower.contains("awake") && !lower.contains("starting serve") {
            return "Node works, but Porter got stuck before starting the server (often a stuck process on port 47831). Quit Porter fully, download 0.2.7+, replace the app, then reopen."
        }
        if lower.contains("bad cpu type") || (lower.contains("mach-o") && lower.contains("architecture")) {
            return "Wrong Mac chip for this zip (this Mac is \(arch)). Download the arm64 (Apple Silicon) or x64 (Intel) build."
        }
        if lower.contains("killed") || lower.contains("cannot be opened") || lower.contains("quarantine") {
            return "macOS blocked Porter’s engine. Right‑click Porter.app → Open, then try again."
        }
        if lower.contains("eaddrinuse") || lower.contains("address already in use") {
            return "Port 47831 is already in use. Quit any other Porter (Activity Monitor → node), then Try again."
        }
        if lower.contains("cannot find module") || lower.contains("err_module_not_found") {
            return "Porter app package is incomplete. Re-download the zip and replace Porter.app."
        }
        if logTail.isEmpty {
            return "Porter engine did not start. Drag the app to Applications, then right‑click → Open."
        }
        return "Porter engine failed to start. See details below (you can Copy error)."
    }

    /// Only the current launch — avoid showing stale Homebrew/libuv errors from older apps.
    private func readRecentLog() -> String {
        guard let data = try? String(contentsOfFile: logPath, encoding: .utf8), !data.isEmpty else {
            return ""
        }
        let all = data.split(separator: "\n", omittingEmptySubsequences: false)
        if let lastStart = all.lastIndex(where: { $0.contains("porter-core start") }) {
            return all[lastStart...].joined(separator: "\n")
        }
        return all.suffix(30).joined(separator: "\n")
    }

    private func readLogTail(lines: Int) -> String {
        readRecentLog()
    }

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        var req = URLRequest(url: healthURL)
        req.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: req) { data, _, _ in
            var ok = false
            if let data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               (json["ok"] as? Bool) == true {
                ok = true
            }
            DispatchQueue.main.async { completion(ok) }
        }.resume()
    }

    private func resolveBundledNode(in resources: URL) -> String? {
        let arch = shell("uname -m").trimmingCharacters(in: .whitespacesAndNewlines)
        let candidates: [String]
        if arch == "x86_64" {
            candidates = ["node-x64", "node"]
        } else {
            candidates = ["node-arm64", "node"]
        }
        for name in candidates {
            let path = resources.appendingPathComponent(name).path
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        return nil
    }

    private func launchCore() {
        let resources = Bundle.main.resourceURL
        let bundledCli = resources?
            .appendingPathComponent("app/packages/core/dist/cli.js").path
        let porterCoreScript = Bundle.main.bundleURL
            .appendingPathComponent("Contents/MacOS/porter-core").path

        let nodePath: String
        let cliPath: String
        let uiDir: String
        let porterResources: String
        let appDir: String

        if let resources, let bundledCli,
           FileManager.default.fileExists(atPath: bundledCli),
           let bundledNode = resolveBundledNode(in: resources) {
            nodePath = bundledNode
            cliPath = bundledCli
            uiDir = resources.appendingPathComponent("ui").path
            porterResources = resources.path
            appDir = resources.appendingPathComponent("app").path
            clearQuarantineOnSelf()
        } else {
            let home = ProcessInfo.processInfo.environment["PORTER_HOME"]
                ?? (NSHomeDirectory() + "/Downloads/porter")
            let which = shell("command -v node").trimmingCharacters(in: .whitespacesAndNewlines)
            nodePath = which.isEmpty ? "/usr/local/bin/node" : which
            cliPath = home + "/packages/core/dist/cli.js"
            uiDir = home + "/apps/desktop/dist"
            porterResources = ""
            appDir = home
        }

        guard FileManager.default.fileExists(atPath: cliPath) else {
            statusLabel.stringValue = "Porter core not found. Use the packaged Porter.app from the release zip."
            actionRow.isHidden = false
            return
        }

        let logDir = NSHomeDirectory() + "/Library/Logs/Porter"
        try? FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)
        let logFile = logPath

        // Detach via nohup so Node outlives this window process.
        let cfPath = (resources?.appendingPathComponent("cloudflared").path) ?? ""
        let pathPrefix: String
        if !cfPath.isEmpty, FileManager.default.isExecutableFile(atPath: cfPath) {
            pathPrefix = "export PATH=\"\(resources!.path):$PATH\"; "
        } else {
            pathPrefix = ""
        }

        let script: String
        if FileManager.default.isExecutableFile(atPath: porterCoreScript) {
            script = """
            \(pathPrefix)nohup "\(porterCoreScript)" >>"\(logFile)" 2>&1 &
            """
        } else {
            let resExport = porterResources.isEmpty ? "" : "export PORTER_RESOURCES=\"\(porterResources)\"; "
            script = """
            \(pathPrefix)\
            export PORTER_OPEN_BROWSER=0; \
            export PORTER_NO_BONJOUR=0; \
            export PORTER_UI_DIR="\(uiDir)"; \
            \(resExport)\
            cd "\(appDir)"; \
            nohup "\(nodePath)" "\(cliPath)" serve >>"\(logFile)" 2>&1 &
            """
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = ["-lc", script]
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            statusLabel.stringValue = "Failed to start Porter core: \(error.localizedDescription)"
            actionRow.isHidden = false
        }
    }

    private func loadWebUI() {
        statusLabel.isHidden = true
        detailScroll.isHidden = true
        actionRow.isHidden = true
        statusStack.isHidden = true
        webView.isHidden = false
        webView.load(URLRequest(url: baseURL))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func shell(_ command: String) -> String {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-lc", command]
        let pipe = Pipe()
        task.standardOutput = pipe
        try? task.run()
        task.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8) ?? ""
    }

    // MARK: - Actions

    @objc private func showWindow() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if webView.isHidden {
            ensureCoreThenLoad()
        }
    }

    @objc private func reloadUI() {
        statusStack.isHidden = false
        statusLabel.isHidden = false
        ensureCoreThenLoad()
    }

    @objc private func copyFailure() {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(lastFailureText.isEmpty ? readLogTail(lines: 80) : lastFailureText, forType: .string)
        statusLabel.stringValue = "Error copied — paste it into chat or Notes."
    }

    @objc private func revealLog() {
        let dir = (logPath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: logPath) {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: logPath)])
        } else {
            NSWorkspace.shared.open(URL(fileURLWithPath: dir))
        }
    }

    @objc private func openInBrowser() {
        NSWorkspace.shared.open(baseURL)
    }

    @objc private func quitWindow() {
        // Do not kill Node core — same as closing a browser tab.
        NSApp.terminate(nil)
    }

    @objc private func showAbout() {
        let alert = NSAlert()
        alert.messageText = "Porter"
        alert.informativeText = "Private file bridge for your Macs.\nUI loads from the local Porter agent (port \(port)).\nClosing this window does not stop the agent."
        alert.alertStyle = .informational
        alert.runModal()
    }

    @objc private func showMalwareHelp() {
        let alert = NSAlert()
        alert.messageText = "Mac “malware” warning"
        alert.informativeText = """
Porter is a free local app and is not paid Apple notarized, so macOS often warns on first open.

What to do:
1. Right-click Porter.app → Open → Open
2. Or: System Settings → Privacy & Security → Open Anyway
3. Porter also clears quarantine on launch when it can

This is Gatekeeper — not a virus scan finding malware inside Porter.
"""
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Clear quarantine now")
        if alert.runModal() == .alertSecondButtonReturn {
            clearQuarantineOnSelf()
            statusLabel.isHidden = false
            statusStack.isHidden = false
            statusLabel.stringValue = "Quarantine cleared. Try opening again if it was blocked."
        }
    }

    @objc private func checkForUpdates() {
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('porter-check-update'))",
            completionHandler: nil
        )
    }

    @objc private func menuPickFolder() {
        presentFolderPicker { path in
            guard let path else { return }
            // Fill the web UI if a callback is waiting; otherwise POST to the API.
            self.deliverPickedPath(path)
        }
    }

    // MARK: - Native bridge (Finder folder picker)

    nonisolated func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        Task { @MainActor in
            guard message.name == "porter" else { return }
            let type: String?
            if let dict = message.body as? [String: Any] {
                type = dict["type"] as? String
            } else if let s = message.body as? String {
                type = s
            } else {
                type = nil
            }
            if type == "pickFolder" {
                self.presentFolderPicker { path in
                    self.deliverPickedPath(path)
                }
            }
        }
    }

    private func presentFolderPicker(completion: @escaping (String?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser
        panel.prompt = "Choose"
        panel.message = "Choose a folder Porter can share with Cursor and your other Macs"
        panel.beginSheetModal(for: window) { response in
            if response == .OK, let url = panel.url {
                completion(url.path)
            } else {
                completion(nil)
            }
        }
    }

    private func deliverPickedPath(_ path: String?) {
        let obj: [String: Any] = ["path": path ?? NSNull()]
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let json = String(data: data, encoding: .utf8) else {
            webView.evaluateJavaScript("window.__porterPickFolderResolve && window.__porterPickFolderResolve(null)")
            return
        }
        let js = """
        (function () {
          var data = \(json);
          var p = data.path;
          if (typeof window.__porterPickFolderResolve === 'function') {
            window.__porterPickFolderResolve(p);
            window.__porterPickFolderResolve = null;
          }
          window.dispatchEvent(new CustomEvent('porter-folder-picked', { detail: p }));
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - Window delegate

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Hide instead of destroy — keep Dock icon / reopen working; leave Node running.
        window.orderOut(nil)
        return false
    }

    // MARK: - Navigation

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        statusStack.isHidden = false
        statusLabel.isHidden = false
        webView.isHidden = true
        statusLabel.stringValue = "Waiting for Porter… (\(error.localizedDescription))"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.ensureCoreThenLoad()
        }
    }
}
