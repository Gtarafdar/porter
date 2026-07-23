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
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusLabel: NSTextField!
    private let port = 47831
    private var healthTimer: Timer?
    private var loadAttempts = 0

    private var baseURL: URL { URL(string: "http://127.0.0.1:\(port)/")! }
    private var healthURL: URL { URL(string: "http://127.0.0.1:\(port)/api/health")! }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        ensureCoreThenLoad()
        NSApp.activate(ignoringOtherApps: true)
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
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.alignment = .center
        statusLabel.font = .systemFont(ofSize: 14, weight: .medium)
        statusLabel.textColor = .secondaryLabelColor
        container.addSubview(statusLabel)

        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        container.addSubview(webView)

        NSLayoutConstraint.activate([
            statusLabel.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: container.centerYAnchor),

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

        NSApp.mainMenu = mainMenu
    }

    // MARK: - Core lifecycle

    private func ensureCoreThenLoad() {
        statusLabel.stringValue = "Starting Porter…"
        statusLabel.isHidden = false
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
                if self.loadAttempts > 40 {
                    self.healthTimer?.invalidate()
                    self.statusLabel.stringValue = "Porter core did not start. Check ~/Library/Logs/Porter/porter.log"
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

    private func launchCore() {
        // Prefer bundled Resources inside .app; fall back to repo for `swift build` / window:build.
        let resources = Bundle.main.resourceURL
        let bundledNode = resources?.appendingPathComponent("node").path
        let bundledCli = resources?
            .appendingPathComponent("app/packages/core/dist/cli.js").path
        let porterCoreScript = Bundle.main.bundleURL
            .appendingPathComponent("Contents/MacOS/porter-core").path

        let nodePath: String
        let cliPath: String
        let uiDir: String
        let porterResources: String
        let appDir: String

        if let bundledNode, let bundledCli, let resources,
           FileManager.default.isExecutableFile(atPath: bundledNode),
           FileManager.default.fileExists(atPath: bundledCli) {
            nodePath = bundledNode
            cliPath = bundledCli
            uiDir = resources.appendingPathComponent("ui").path
            porterResources = resources.path
            appDir = resources.appendingPathComponent("app").path
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
            return
        }

        let logDir = NSHomeDirectory() + "/Library/Logs/Porter"
        try? FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)
        let logPath = logDir + "/porter.log"

        // Detach via nohup so Node outlives this window process and is not killed
        // when Swift FileHandles / Process teardown (that was causing "site can't be reached").
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
            \(pathPrefix)nohup "\(porterCoreScript)" >>"\(logPath)" 2>&1 &
            """
        } else {
            let resExport = porterResources.isEmpty ? "" : "export PORTER_RESOURCES=\"\(porterResources)\"; "
            script = """
            \(pathPrefix)\
            export PORTER_OPEN_BROWSER=0; \
            export PORTER_NO_BONJOUR=1; \
            export PORTER_UI_DIR="\(uiDir)"; \
            \(resExport)\
            cd "\(appDir)"; \
            nohup "\(nodePath)" "\(cliPath)" serve >>"\(logPath)" 2>&1 &
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
        }
    }

    private func loadWebUI() {
        statusLabel.isHidden = true
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
        ensureCoreThenLoad()
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

    // MARK: - Window delegate

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Hide instead of destroy — keep Dock icon / reopen working; leave Node running.
        window.orderOut(nil)
        return false
    }

    // MARK: - Navigation

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        statusLabel.isHidden = false
        webView.isHidden = true
        statusLabel.stringValue = "Waiting for Porter… (\(error.localizedDescription))"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.ensureCoreThenLoad()
        }
    }
}
