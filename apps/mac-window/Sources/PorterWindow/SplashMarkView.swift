import AppKit
import QuartzCore

/// Animated Porter brand mark used as the native startup splash.
/// Geometry mirrors the React `IconPorterMark` (two panes + bridge).
@MainActor
final class SplashMarkView: NSView {
    private let markLayer = CALayer()
    private let bridgeGlow = CAShapeLayer()
    private let nodeLayer = CAShapeLayer()
    private var animating = false

    override var wantsUpdateLayer: Bool { true }
    override var isFlipped: Bool { false }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layerContentsRedrawPolicy = .onSetNeedsDisplay
        setupLayers()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
        setupLayers()
    }

    override var intrinsicContentSize: NSSize { NSSize(width: 88, height: 88) }

    private func setupLayers() {
        guard let root = layer else { return }
        root.backgroundColor = NSColor.clear.cgColor

        markLayer.frame = bounds
        markLayer.contentsGravity = .resizeAspect
        let img = Self.renderMarkImage(size: 176)
        var proposed = NSRect(origin: .zero, size: img.size)
        markLayer.contents = img.cgImage(forProposedRect: &proposed, context: nil, hints: nil)
        markLayer.cornerRadius = 20
        markLayer.masksToBounds = true
        root.addSublayer(markLayer)

        // Soft bridge highlight (overlaid on the vector mark)
        bridgeGlow.fillColor = NSColor.clear.cgColor
        bridgeGlow.strokeColor = NSColor(calibratedWhite: 1, alpha: 0.85).cgColor
        bridgeGlow.lineWidth = 2.5
        bridgeGlow.lineCap = .round
        bridgeGlow.opacity = 0.25
        root.addSublayer(bridgeGlow)

        nodeLayer.fillColor = NSColor(calibratedWhite: 1, alpha: 0.95).cgColor
        nodeLayer.opacity = 0.55
        root.addSublayer(nodeLayer)
    }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        markLayer.frame = bounds
        let path = CGMutablePath()
        let midY = bounds.midY
        let left = bounds.width * 0.40
        let right = bounds.width * 0.60
        path.move(to: CGPoint(x: left, y: midY))
        path.addLine(to: CGPoint(x: right, y: midY))
        bridgeGlow.path = path
        bridgeGlow.frame = bounds
        let r: CGFloat = max(3, bounds.width * 0.05)
        nodeLayer.path = CGPath(ellipseIn: CGRect(x: bounds.midX - r, y: bounds.midY - r, width: r * 2, height: r * 2), transform: nil)
        nodeLayer.frame = bounds
        CATransaction.commit()
    }

    func startAnimating() {
        stopAnimating()
        animating = true
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            return
        }

        let breathe = CABasicAnimation(keyPath: "transform.scale")
        breathe.fromValue = 1.0
        breathe.toValue = 1.045
        breathe.duration = 2.2
        breathe.autoreverses = true
        breathe.repeatCount = .infinity
        breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        markLayer.add(breathe, forKey: "breathe")

        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 0.2
        pulse.toValue = 0.95
        pulse.duration = 1.4
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        bridgeGlow.add(pulse, forKey: "bridgePulse")

        let nodePulse = CABasicAnimation(keyPath: "opacity")
        nodePulse.fromValue = 0.4
        nodePulse.toValue = 1.0
        nodePulse.duration = 1.4
        nodePulse.autoreverses = true
        nodePulse.repeatCount = .infinity
        nodePulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        nodeLayer.add(nodePulse, forKey: "nodePulse")
    }

    func stopAnimating() {
        animating = false
        markLayer.removeAllAnimations()
        bridgeGlow.removeAllAnimations()
        nodeLayer.removeAllAnimations()
        markLayer.transform = CATransform3DIdentity
        bridgeGlow.opacity = 0.35
        nodeLayer.opacity = 0.7
    }

    /// Draw the same mark as the web SVG into an NSImage.
    static func renderMarkImage(size: CGFloat) -> NSImage {
        let img = NSImage(size: NSSize(width: size, height: size))
        img.lockFocus()
        defer { img.unlockFocus() }

        let s = size / 64.0
        let ctx = NSGraphicsContext.current!.cgContext

        // Gradient background
        let colors = [
            NSColor(calibratedRed: 24 / 255, green: 120 / 255, blue: 104 / 255, alpha: 1).cgColor,
            NSColor(calibratedRed: 8 / 255, green: 72 / 255, blue: 64 / 255, alpha: 1).cgColor,
        ] as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
            let path = CGPath(roundedRect: CGRect(x: 0, y: 0, width: size, height: size), cornerWidth: 14 * s, cornerHeight: 14 * s, transform: nil)
            ctx.addPath(path)
            ctx.clip()
            ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size), options: [])
            ctx.resetClip()
        }

        let cream = NSColor(calibratedRed: 1, green: 252 / 255, blue: 247 / 255, alpha: 1)
        cream.setStroke()
        cream.setFill()

        let stroke = NSBezierPath(roundedRect: NSRect(x: 12 * s, y: 18 * s, width: 14 * s, height: 28 * s), xRadius: 3 * s, yRadius: 3 * s)
        stroke.lineWidth = 2.5 * s
        stroke.stroke()

        let stroke2 = NSBezierPath(roundedRect: NSRect(x: 38 * s, y: 18 * s, width: 14 * s, height: 28 * s), xRadius: 3 * s, yRadius: 3 * s)
        stroke2.lineWidth = 2.5 * s
        stroke2.stroke()

        NSColor(calibratedRed: 1, green: 252 / 255, blue: 247 / 255, alpha: 0.35).setFill()
        NSBezierPath(roundedRect: NSRect(x: 14.5 * s, y: (64 - 21 - 5) * s, width: 9 * s, height: 5 * s), xRadius: 1.2 * s, yRadius: 1.2 * s).fill()
        NSBezierPath(roundedRect: NSRect(x: 40.5 * s, y: (64 - 21 - 5) * s, width: 9 * s, height: 5 * s), xRadius: 1.2 * s, yRadius: 1.2 * s).fill()

        cream.setStroke()
        let line = NSBezierPath()
        // SVG y grows down; AppKit y grows up — mirror vertical for the bridge at cy=32
        let yBridge = (64 - 32) * s
        line.move(to: NSPoint(x: 26 * s, y: yBridge))
        line.line(to: NSPoint(x: 38 * s, y: yBridge))
        line.lineWidth = 2.5 * s
        line.lineCapStyle = .round
        line.stroke()

        cream.setFill()
        let r: CGFloat = 3.2 * s
        NSBezierPath(ovalIn: NSRect(x: 32 * s - r, y: yBridge - r, width: r * 2, height: r * 2)).fill()

        return img
    }
}
