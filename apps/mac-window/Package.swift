// swift-tools-version:5.8
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
