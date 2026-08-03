// swift-tools-version: 5.9
import PackageDescription

// Local SPM wrapper for Brother's own BRLMPrinterKit.xcframework (proprietary
// binary, not redistributable — must be downloaded separately from Brother's
// developer portal and placed at Sources/BRLMPrinterKit.xcframework; see
// docs/adr/0019-native-app-capacitor-shell.md and node_modules/@rdlabo/
// capacitor-brotherprint/README.md for the exact download/setup steps).
// Content matches that README's Package.swift verbatim — this file itself
// contains no Brother IP, only the plugin's documented wiring.
let package = Package(
    name: "BRLMPrinterKit",
    platforms: [
        .iOS(.v13)
    ],
    products: [
        .library(name: "BRLMPrinterKit", targets: ["BRLMPrinterKit"])
    ],
    targets: [
        .binaryTarget(
            name: "BRLMPrinterKit",
            path: "Sources/BRLMPrinterKit.xcframework"
        )
    ]
)
