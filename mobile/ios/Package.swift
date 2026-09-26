// swift-tools-version:5.9
import PackageDescription

// The iOS side mirrors the Android one: an engine that holds all behaviour and
// can be tested on its own, and a surface that only draws. The engine is a plain
// Swift library with no UIKit/SwiftUI, so `swift test` runs the whole client's
// logic — including the grading conformance vectors — without a simulator.
let package = Package(
    name: "Revisio",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "RevisioEngine", targets: ["RevisioEngine"]),
        .executable(name: "Revisio", targets: ["Revisio"]),
    ],
    targets: [
        .target(name: "RevisioEngine"),
        .executableTarget(name: "Revisio", dependencies: ["RevisioEngine"]),
        .testTarget(name: "RevisioEngineTests", dependencies: ["RevisioEngine"]),
    ]
)
