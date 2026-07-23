// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PorterWindow",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "PorterWindow",
            path: "Sources/PorterWindow"
        )
    ]
)
