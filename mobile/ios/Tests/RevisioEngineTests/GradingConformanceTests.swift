import XCTest
@testable import RevisioEngine

/// The native port is only allowed to exist if it agrees with the original.
///
/// The vectors are emitted from `src/domain/grading.ts` (the canonical engine).
/// If a rule changes on the web, this test fails until the Swift port changes
/// too — the same guarantee the Kotlin port carries, against the same file.
final class GradingConformanceTests: XCTestCase {

    /// `mobile/shared/grading-vectors.json`, reached from this source file so the
    /// vectors stay a single artifact shared by every native port.
    private func vectorsURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // RevisioEngineTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // mobile
            .appendingPathComponent("shared/grading-vectors.json")
    }

    private func canonical(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }

    func testSwiftPortReproducesEveryVector() throws {
        let data = try Data(contentsOf: vectorsURL())
        let root = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let cases = root["cases"] as! [[String: Any]]
        XCTAssertFalse(cases.isEmpty, "expected a non-empty vector set")

        for vector in cases {
            let fn = vector["fn"] as! String
            let name = vector["name"] as! String
            let input = vector["input"] as! [String: Any]
            let expected = vector["expected"] as! [String: Any]

            let actual: Verdict
            switch fn {
            case "gradeCloze":
                actual = Grading.gradeCloze(input["answer"] as! String, try accepted(input))
            case "gradeFlashcard":
                actual = Grading.gradeFlashcard(input["answer"] as! String, try accepted(input))
            case "gradeMcq":
                actual = Grading.gradeMcq(input["selectedOptionId"] as? String, input["correctOptionId"] as! String)
            default:
                return XCTFail("unknown grading function in vectors: \(fn)")
            }

            let actualJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(actual))
            XCTAssertEqual(
                try canonical(actualJSON),
                try canonical(expected),
                "\(fn) — \(name)"
            )
        }
    }

    private func accepted(_ input: [String: Any]) throws -> [AcceptedAnswer] {
        let data = try JSONSerialization.data(withJSONObject: input["accepted"]!)
        return try JSONDecoder().decode([AcceptedAnswer].self, from: data)
    }
}
