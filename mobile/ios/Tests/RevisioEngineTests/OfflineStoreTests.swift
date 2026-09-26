import XCTest
@testable import RevisioEngine

private func json<T: Decodable>(_ text: String, as type: T.Type) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(text.utf8))
}

private func samplePack(_ ids: [String]) throws -> OfflinePack {
    let cards = ids.map { id in
        """
        {"id":"\(id)","kind":"cloze","topicId":"t","topicName":"Topic","subjectId":"s","subjectName":"Subject",
         "textWithBlank":"The blank is ____.","stage":"new",
         "key":{"kind":"cloze","accepted":[{"id":"a","text":"answer","isPrimary":true}]}}
        """
    }
    return try json(
        "{\"builtAt\":\"2026-01-01T00:00:00Z\",\"cards\":[\(cards.joined(separator: ","))]}",
        as: OfflinePack.self
    )
}

private final class FakeApi: ReviewApi {
    var calls = 0
    var failAfter = 1
    func submitReview(token: String, review: PendingReview) async throws -> ReviewResult {
        calls += 1
        if calls > failAfter { throw ApiError(status: 503, code: "capacity", message: "busy") }
        return try json("{\"verdict\":{\"correct\":true,\"feedbackKind\":\"correct\"}}", as: ReviewResult.self)
    }
}

final class OfflineStoreTests: XCTestCase {

    func testSavedPackSurvivesANewStoreOverTheSameStorage() throws {
        let kv = MemoryKeyValueStore()
        OfflineStore(kv).savePack(try samplePack(["c1", "c2"]))
        XCTAssertEqual(OfflineStore(kv).cachedPack()?.cards.map(\.id), ["c1", "c2"])
    }

    func testEmptyPackIsNotTreatedAsACachedSession() throws {
        let store = OfflineStore(MemoryKeyValueStore())
        store.savePack(try samplePack([]))
        XCTAssertNil(store.cachedPack())
    }

    func testDroppingAnAnsweredCardRemovesOnlyThatCard() throws {
        let store = OfflineStore(MemoryKeyValueStore())
        store.savePack(try samplePack(["c1", "c2", "c3"]))
        store.dropCardFromPack("c2")
        XCTAssertEqual(store.cachedPack()?.cards.map(\.id), ["c1", "c3"])
    }

    func testQueuedReviewsAreAppendOnlyAndSurviveARestart() {
        let kv = MemoryKeyValueStore()
        OfflineStore(kv).enqueueReview(cardId: "c1", answer: "answer", selectedOptionId: nil, durationMs: 1200)
        let reopened = OfflineStore(kv)
        XCTAssertEqual(reopened.pendingCount(), 1)
        XCTAssertEqual(reopened.pendingReviews().first?.cardId, "c1")
    }

    func testSyncStopsAtTheFirstFailureAndKeepsTheRest() async throws {
        let store = OfflineStore(MemoryKeyValueStore())
        store.enqueueReview(cardId: "c1", answer: "a", selectedOptionId: nil, durationMs: 1)
        store.enqueueReview(cardId: "c2", answer: "b", selectedOptionId: nil, durationMs: 1)
        store.enqueueReview(cardId: "c3", answer: "c", selectedOptionId: nil, durationMs: 1)

        let api = FakeApi()
        let outcome = await SyncEngine(store: store, api: api).syncOutbox(token: "token")

        XCTAssertEqual(outcome.sent, 1)
        XCTAssertEqual(outcome.remaining, 2)
        XCTAssertEqual(store.pendingReviews().map(\.cardId), ["c2", "c3"])
    }

    func testOptionalFieldsAreOmittedJustLikeTheWireShape() throws {
        let card = try samplePack(["c1"]).cards[0]
        let text = String(data: try JSONEncoder().encode(card), encoding: .utf8)!
        XCTAssertFalse(text.contains("null"), "null fields must be omitted to match the wire shape")
        XCTAssertTrue(text.contains("\"kind\":\"cloze\""))
    }
}
