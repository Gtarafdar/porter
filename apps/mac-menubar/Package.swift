// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PorterMenu",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "PorterMenu",
            path: "Sources/PorterMenu"
        )
    ]
)
