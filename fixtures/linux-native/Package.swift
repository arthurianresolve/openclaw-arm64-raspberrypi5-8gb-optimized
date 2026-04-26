// swift-tools-version: 6.0
import PackageDescription

// Linux CI pins Swift 6.2.x and uses toolchain-integrated Testing.
// Keep Swift 6.0/6.1 local environments operational by adding swift-testing
// only when the toolchain does not provide Testing internals.
#if swift(>=6.2)
let testingDependencies: [Package.Dependency] = []
let testingTargetDependencies: [Target.Dependency] = []
#else
let testingDependencies: [Package.Dependency] = [
    .package(url: "https://github.com/swiftlang/swift-testing.git", from: "0.99.0"),
]
let testingTargetDependencies: [Target.Dependency] = [
    .product(name: "Testing", package: "swift-testing"),
]
#endif

let package = Package(
    name: "OpenClawLinuxFixture",
    products: [
        .library(name: "OpenClawLinuxFixture", targets: ["OpenClawLinuxFixture"]),
        .executable(name: "openclaw-linux-fixture", targets: ["OpenClawLinuxFixtureCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-log.git", from: "1.5.0"),
        .package(url: "https://github.com/apple/swift-system.git", from: "1.2.0"),
    ] + testingDependencies,
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
            ] + testingTargetDependencies
        ),
    ]
)
