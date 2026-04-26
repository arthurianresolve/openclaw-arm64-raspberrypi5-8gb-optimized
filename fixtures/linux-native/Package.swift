// swift-tools-version: 6.0
import PackageDescription

// Keep this fixture aligned with Swift 6.0-compatible dependencies.
// On Linux Swift 6.0.3, explicitly depending on swift-testing remains the most reliable path.
let package = Package(
    name: "OpenClawLinuxFixture",
    products: [
        .library(name: "OpenClawLinuxFixture", targets: ["OpenClawLinuxFixture"]),
        .executable(name: "openclaw-linux-fixture", targets: ["OpenClawLinuxFixtureCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-log.git", from: "1.5.0"),
        .package(url: "https://github.com/apple/swift-system.git", from: "1.2.0"),
        .package(url: "https://github.com/swiftlang/swift-testing", from: "0.99.0"),
    ],
    targets: [
        .target(
            name: "OpenClawLinuxFixture",
            dependencies: [
                .product(name: "Logging", package: "swift-log"),
                .product(name: "SystemPackage", package: "swift-system"),
            ]
        ),
        .executableTarget(
            name: "OpenClawLinuxFixtureCLI",
            dependencies: ["OpenClawLinuxFixture"]
        ),
        .testTarget(
            name: "OpenClawLinuxFixtureTests",
            dependencies: [
                "OpenClawLinuxFixture",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
    ]
)
