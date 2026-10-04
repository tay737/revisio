import XCTest
@testable import RevisioEngine

/// The phone's rank and copy are only allowed to exist if they agree with the web.
///
/// Two things on this client are not decided by a payload and so had to be carried:
/// the **ladder** (the screen draws every rung, and the ones nobody has reached
/// are not facts about anybody) and the **sentences** (a phone that
/// invented its own words for "Good morning" would drift the moment the copy
/// changed). They are ports of `src/domain/ranked.ts` and `src/lib/profile.ts`.
///
/// A port is only honest if it agrees with the original, so the vectors are
/// emitted from those files by `scripts/native/copy-vectors.ts`. Change a nuance on
/// the web and this test fails until the Swift follows.
final class CopyConformanceTests: XCTestCase {

    /// `mobile/shared/copy-vectors.json`, reached from this source file so the
    /// vectors stay a single artifact shared by every native port.
    private func vectorsURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // RevisioEngineTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // mobile
            .appendingPathComponent("shared/copy-vectors.json")
    }

    private func root() throws -> [String: Any] {
        let data = try Data(contentsOf: vectorsURL())
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func cases(_ name: String) throws -> [[String: Any]] {
        try XCTUnwrap(try root()[name] as? [[String: Any]], "no vectors named \(name)")
    }

    private func object(_ value: Any?) throws -> [String: Any] {
        try XCTUnwrap(value as? [String: Any])
    }

    private func str(_ value: Any?) -> String {
        value as? String ?? ""
    }

    private func int(_ value: Any?) -> Int {
        (value as? NSNumber)?.intValue ?? 0
    }

    /// An optional field: absent is the same as null, which is what the web means.
    private func optional(_ value: Any?) -> String? {
        value is NSNull ? nil : value as? String
    }

    func testTheLadderIsTheWebsLadder() throws {
        let ladder = try object(try root()["ladder"])
        let rungs = try XCTUnwrap(ladder["rungs"] as? [[String: Any]])
        // The rung count comes from the vectors rather than a literal here: the
        // web ladder grew from fifteen rungs to thirty when the tiers were
        // widened, and a hardcoded count would only ever report that as a
        // failure instead of following the ladder this test exists to police.
        XCTAssertEqual(rungs.count, int(ladder["rungCount"]))
        XCTAssertEqual(RankLadder.rungs.count, rungs.count)
        XCTAssertEqual(RankLadder.topOfLadder, int(ladder["topOfLadder"]))
        XCTAssertEqual(RankLadder.tierOrder.count, (ladder["tiers"] as? [String])?.count ?? 0)

        for (index, rung) in rungs.enumerated() {
            let mine = RankLadder.rungs[index]
            XCTAssertEqual(mine.tier, str(rung["tier"]), "rung \(index) tier")
            XCTAssertEqual(mine.division, int(rung["division"]), "rung \(index) division")
            XCTAssertEqual(mine.index, int(rung["index"]), "rung \(index) index")
            XCTAssertEqual(mine.base, int(rung["base"]), "rung \(index) base")
            XCTAssertEqual(mine.span, int(rung["span"]), "rung \(index) span")
        }

        let tierNames = try XCTUnwrap(ladder["tierNames"] as? [[String: Any]])
        for entry in tierNames {
            let tier = str(entry["tier"])
            XCTAssertEqual(RankLadder.tierName(tier), str(entry["expected"]), "tierName(\(tier))")
        }
    }

    func testSwiftRankForReproducesEveryVector() throws {
        let vectors = try cases("rankFor")
        XCTAssertFalse(vectors.isEmpty)

        for vector in vectors {
            let expected = try object(vector["expected"])
            let xp = int(vector["xp"])
            let mine = RankLadder.rankFor(xp)
            XCTAssertEqual(mine.tier, str(expected["tier"]), "rankFor(\(xp)) tier")
            XCTAssertEqual(mine.division, int(expected["division"]), "rankFor(\(xp)) division")
            XCTAssertEqual(mine.index, int(expected["index"]), "rankFor(\(xp)) index")
            XCTAssertEqual(mine.label, str(expected["label"]), "rankFor(\(xp)) label")
            XCTAssertEqual(mine.short, str(expected["short"]), "rankFor(\(xp)) short")
            XCTAssertEqual(mine.points, int(expected["points"]), "rankFor(\(xp)) points")
            XCTAssertEqual(mine.intoDivision, int(expected["intoDivision"]), "rankFor(\(xp)) intoDivision")
            XCTAssertEqual(mine.forDivision, int(expected["forDivision"]), "rankFor(\(xp)) forDivision")
            XCTAssertEqual(mine.percent, int(expected["percent"]), "rankFor(\(xp)) percent")
            XCTAssertEqual(mine.remaining, int(expected["remaining"]), "rankFor(\(xp)) remaining")
            XCTAssertEqual(mine.isApex, expected["isApex"] as? Bool ?? false, "rankFor(\(xp)) isApex")
        }
    }

    func testSwiftCopyReproducesEveryPhrase() throws {
        for vector in try cases("formFor") {
            let expected = try object(vector["expected"])
            let reviewed = int(vector["reviewed"])
            let correct = int(vector["correct"])
            let mine = Copy.formFor(reviewed: reviewed, correct: correct)
            XCTAssertEqual(mine.form, str(expected["form"]), "formFor(\(reviewed), \(correct)) form")
            XCTAssertEqual(mine.label, str(expected["label"]), "formFor(\(reviewed), \(correct)) label")
            XCTAssertEqual(mine.detail, str(expected["detail"]), "formFor(\(reviewed), \(correct)) detail")
        }

        for vector in try cases("zoneBand") {
            let size = int(vector["size"])
            XCTAssertEqual(RankLadder.zoneBand(size), int(vector["expected"]), "zoneBand(\(size))")
        }

        for vector in try cases("reviewsForRp") {
            let rp = int(vector["rp"])
            XCTAssertEqual(RankLadder.reviewsForRp(rp), int(vector["expected"]), "reviewsForRp(\(rp))")
        }

        for vector in try cases("greeting") {
            let hour = int(vector["hour"])
            XCTAssertEqual(Copy.greeting(hour: hour), str(vector["expected"]), "greeting(\(hour))")
        }

        for vector in try cases("names") {
            let name = str(vector["name"])
            XCTAssertEqual(Copy.firstName(name), str(vector["first"]), "firstName(\(name))")
            XCTAssertEqual(Copy.initials(name), str(vector["initials"]), "initials(\(name))")
        }

        for vector in try cases("sessionSummary") {
            let correct = int(vector["correct"])
            let total = int(vector["total"])
            XCTAssertEqual(
                Copy.sessionSummary(correct: correct, total: total),
                str(vector["expected"]),
                "sessionSummary(\(correct), \(total))"
            )
        }

        for vector in try cases("emptyQueueLine") {
            let due = int(vector["due"])
            let streak = int(vector["streak"])
            XCTAssertEqual(
                Copy.emptyQueueLine(due: due, streak: streak),
                str(vector["expected"]),
                "emptyQueueLine(\(due), \(streak))"
            )
        }

        for vector in try cases("openers") {
            let due = int(vector["due"])
            let streak = int(vector["streak"])
            let level = int(vector["level"])
            let subject = optional(vector["subject"])
            let expected = try XCTUnwrap(vector["expected"] as? [String])
            XCTAssertEqual(
                Copy.openers(due: due, streak: streak, level: level, subject: subject),
                expected,
                "openers(due: \(due), streak: \(streak), level: \(level), subject: \(subject ?? "nil"))"
            )
        }

        for vector in try cases("lobbyLine") {
            let zone = str(vector["zone"])
            let position = int(vector["position"])
            let size = int(vector["size"])
            let daysLeft = int(vector["daysLeft"])
            let rankLabel = str(vector["rankLabel"])
            XCTAssertEqual(
                Copy.lobbyLine(
                    zone: zone,
                    position: position,
                    size: size,
                    daysLeft: daysLeft,
                    rankLabel: rankLabel
                ),
                str(vector["expected"]),
                "lobbyLine(\(zone), \(position), \(size), \(daysLeft), \(rankLabel))"
            )
        }

        for vector in try cases("companionFor") {
            let input = try object(vector["input"])
            let expected = try object(vector["expected"])
            let read = Copy.companionFor(
                name: str(input["name"]),
                due: int(input["due"]),
                reviewed: int(input["reviewed"]),
                correct: int(input["correct"]),
                streak: int(input["streak"]),
                bestStreak: int(input["bestStreak"]),
                totalXp: int(input["totalXp"]),
                rankLabel: optional(input["rankLabel"]),
                hour: int(input["hour"])
            )
            let label = "companionFor(due: \(int(input["due"])), reviewed: \(int(input["reviewed"])), streak: \(int(input["streak"])), hour: \(int(input["hour"])))"
            XCTAssertEqual(read.tone, str(expected["tone"]), "\(label) tone")
            XCTAssertEqual(read.line, str(expected["line"]), "\(label) line")
            XCTAssertEqual(read.actionLabel, str(expected["actionLabel"]), "\(label) action")
        }
    }
}
