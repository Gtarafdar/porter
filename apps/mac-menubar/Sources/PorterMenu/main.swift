import AppKit
import Foundation

/// Menu-bar companion for Porter (same tray pattern as Slack Agent Bridge).
/// Talks to the local Node agent at http://127.0.0.1:47831 — does not replace the core.
@main
enum PorterMenuMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var pollTimer: Timer?
    private var sleeping = false
    private var online = false
    private let port = 47831
    private var baseURL: URL { URL(string: "http://127.0.0.1:\(port)")! }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            applyIcon(to: button)
            button.toolTip = "Porter"
            button.action = #selector(statusClicked(_:))
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        refreshHealth()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refreshHealth() }
        }
    }

    private func applyIcon(to button: NSStatusBarButton) {
        if let url = Bundle.main.url(forResource: "MenuBarIcon", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            image.isTemplate = true
            image.size = NSSize(width: 18, height: 18)
            button.image = image
        } else if let path = Bundle.main.path(forResource: "MenuBarIcon", ofType: "png"),
                  let image = NSImage(contentsOfFile: path) {
            image.isTemplate = true
            image.size = NSSize(width: 18, height: 18)
            button.image = image
        } else {
            button.title = "P"
        }
        button.alphaValue = online ? (sleeping ? 0.55 : 1.0) : 0.4
    }

    @objc private func statusClicked(_ sender: Any?) {
        guard let event = NSApp.currentEvent else {
            openUI()
            return
        }
        if event.type == .rightMouseUp {
            showMenu()
        } else {
            openUI()
        }
    }

    private func showMenu() {
        let menu = NSMenu()
        let title = NSMenuItem(title: "Porter", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)

        let status = NSMenuItem(
            title: online ? (sleeping ? "Status: Sleeping" : "Status: Awake") : "Status: Core offline",
            action: nil,
            keyEquivalent: ""
        )
        status.isEnabled = false
        menu.addItem(status)
        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "Open Porter", action: #selector(openUI), keyEquivalent: "o"))
        menu.addItem(NSMenuItem(title: "Setup wizard…", action: #selector(openSetup), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings…", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(.separator())

        if sleeping {
            menu.addItem(NSMenuItem(title: "Wake", action: #selector(wake), keyEquivalent: ""))
        } else {
            menu.addItem(NSMenuItem(title: "Sleep", action: #selector(sleep), keyEquivalent: ""))
        }
        menu.addItem(NSMenuItem(title: "Start core (if offline)", action: #selector(startCore), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Disconnect all", action: #selector(killCore), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Quit menu bar", action: #selector(quit), keyEquivalent: "q"))

        for item in menu.items { item.target = self }
        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    @objc private func openUI() {
        ensureCoreThenOpen("http://127.0.0.1:\(port)/")
    }

    @objc private func openSetup() {
        ensureCoreThenOpen("http://127.0.0.1:\(port)/?wizard=1")
    }

    @objc private func openSettings() {
        ensureCoreThenOpen("http://127.0.0.1:\(port)/?settings=1")
    }

    @objc private func sleep() {
        post("/api/sleep")
    }

    @objc private func wake() {
        post("/api/wake")
    }

    @objc private func killCore() {
        post("/api/kill")
    }

    @objc private func startCore() {
        launchCore()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private func ensureCoreThenOpen(_ url: String) {
        if !online { launchCore() }
        DispatchQueue.main.asyncAfter(deadline: .now() + (online ? 0.1 : 1.5)) {
            // Prefer native Porter window over opening Safari/Chrome
            let candidates = [
                "/Applications/Porter.app",
                NSHomeDirectory() + "/Downloads/porter/dist/release/Porter.app",
                NSHomeDirectory() + "/Downloads/Porter.app",
            ]
            for path in candidates {
                if FileManager.default.fileExists(atPath: path) {
                    NSWorkspace.shared.open(URL(fileURLWithPath: path))
                    return
                }
            }
            if let u = URL(string: url) {
                NSWorkspace.shared.open(u)
            }
        }
    }

    private func launchCore() {
        // Prefer repo-relative start if PORTER_HOME is set; else try common clone path.
        let home = ProcessInfo.processInfo.environment["PORTER_HOME"]
            ?? (NSHomeDirectory() + "/Downloads/porter")
        let script = """
        cd "\(home)" && npm start
        """
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-lc", script]
        task.environment = ProcessInfo.processInfo.environment.merging([
            "PORTER_OPEN_BROWSER": "0",
        ]) { _, new in new }
        do {
            try task.run()
        } catch {
            NSSound.beep()
        }
    }

    private func refreshHealth() {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/health"))
        req.timeoutInterval = 2
        URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
            Task { @MainActor in
                guard let self else { return }
                if let data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    self.online = (json["ok"] as? Bool) == true
                    self.sleeping = (json["sleeping"] as? Bool) == true
                } else {
                    self.online = false
                }
                if let button = self.statusItem.button {
                    self.applyIcon(to: button)
                    button.toolTip = self.online
                        ? (self.sleeping ? "Porter · sleeping" : "Porter · awake")
                        : "Porter · core offline (click to start)"
                }
            }
        }.resume()
    }

    private func post(_ path: String) {
        guard let url = URL(string: "http://127.0.0.1:\(port)\(path)") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data("{}".utf8)
        URLSession.shared.dataTask(with: req) { [weak self] _, _, _ in
            Task { @MainActor in self?.refreshHealth() }
        }.resume()
    }
}
