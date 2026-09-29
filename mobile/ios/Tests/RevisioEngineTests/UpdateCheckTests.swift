import XCTest

@testable import RevisioEngine

/// The comparison an update prompt is made of.
///
/// The server publishes the latest build number and a floor; the client decides
/// between "current", "available" and "required". These are the vectors both
/// engines agree on — a wrong "required" would alarm a current install, and a
/// missed "required" would leave an old build that cannot work still running.
final class UpdateCheckTests: XCTestCase {
    func testCurrentBuildIsSilent() {
        XCTAssertEqual(checkForUpdate(mine: 10000, latestBuild: 10000, minBuild: 0).kind, .none)
        XCTAssertEqual(checkForUpdate(mine: 10001, latestBuild: 10000, minBuild: 0).kind, .none)
    }

    func testNewerServerBuildIsAvailable() {
        XCTAssertEqual(checkForUpdate(mine: 10000, latestBuild: 10001, minBuild: 0).kind, .available)
        XCTAssertEqual(checkForUpdate(mine: 10005, latestBuild: 10006, minBuild: 0).kind, .available)
    }

    func testBelowTheFloorIsRequired() {
        XCTAssertEqual(checkForUpdate(mine: 9999, latestBuild: 10002, minBuild: 10000).kind, .required)
        XCTAssertEqual(checkForUpdate(mine: 0, latestBuild: 10002, minBuild: 1).kind, .required)
    }

    func testAtTheFloorIsOnlyAvailableNotRequired() {
        XCTAssertEqual(checkForUpdate(mine: 10000, latestBuild: 10002, minBuild: 10000).kind, .available)
    }

    func testPrereleaseOrderingGoesByTheBuildNumberNotTheString() {
        // `1.0.0-alpha.10` sorts below `1.0.0-alpha.9` as a string but is a
        // strictly newer build — which is why the comparison is numeric.
        XCTAssertEqual(checkForUpdate(mine: 10009, latestBuild: 10010, minBuild: 0).kind, .available)
    }
}
