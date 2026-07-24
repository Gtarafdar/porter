#!/usr/bin/env swift
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("usage: GenerateBackground.swift <out.png> [w] [h]\n", stderr)
    exit(1)
}
let out = URL(fileURLWithPath: args[1])
let width = Int(args.count > 2 ? args[2] : "660") ?? 660
let height = Int(args.count > 3 ? args[3] : "420") ?? 420

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .calibratedRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fputs("failed to create bitmap\n", stderr)
    exit(2)
}
rep.size = NSSize(width: width, height: height)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

let size = NSSize(width: width, height: height)
let paperTop = NSColor(calibratedRed: 245 / 255, green: 240 / 255, blue: 230 / 255, alpha: 1)
let paperBot = NSColor(calibratedRed: 232 / 255, green: 224 / 255, blue: 210 / 255, alpha: 1)
let teal = NSColor(calibratedRed: 24 / 255, green: 120 / 255, blue: 104 / 255, alpha: 1)
let ink = NSColor(calibratedRed: 0.18, green: 0.16, blue: 0.13, alpha: 1)

let grad = NSGradient(starting: paperTop, ending: paperBot)!
grad.draw(in: NSRect(origin: .zero, size: size), angle: 270)

teal.withAlphaComponent(0.10).setFill()
NSBezierPath(ovalIn: NSRect(x: size.width * 0.55, y: -size.height * 0.15, width: size.width * 0.55, height: size.height * 0.7)).fill()

teal.setStroke()
let midY = size.height * 0.52
let midX = size.width * 0.50
let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: midX - 28, y: midY))
arrow.line(to: NSPoint(x: midX + 22, y: midY))
arrow.lineWidth = 3
arrow.lineCapStyle = .round
arrow.stroke()
let head = NSBezierPath()
head.move(to: NSPoint(x: midX + 8, y: midY + 12))
head.line(to: NSPoint(x: midX + 24, y: midY))
head.line(to: NSPoint(x: midX + 8, y: midY - 12))
head.lineWidth = 3
head.lineCapStyle = .round
head.lineJoinStyle = .round
head.stroke()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 15, weight: .medium),
    .foregroundColor: ink.withAlphaComponent(0.78),
    .paragraphStyle: paragraph,
]
("Drag Porter to Applications" as NSString).draw(
    in: NSRect(x: 40, y: 36, width: size.width - 80, height: 28),
    withAttributes: attrs
)

teal.withAlphaComponent(0.85).setFill()
NSBezierPath(roundedRect: NSRect(x: size.width * 0.5 - 36, y: 28, width: 72, height: 3), xRadius: 1.5, yRadius: 1.5).fill()

NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else {
    fputs("failed to encode png\n", stderr)
    exit(3)
}
try png.write(to: out)
print("Wrote \(out.path) (\(width)x\(height))")
