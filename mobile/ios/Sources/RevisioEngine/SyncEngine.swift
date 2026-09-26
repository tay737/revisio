import Foundation

/// The one thing sync needs from the network, so the outbox's hardest behaviour
/// — stopping at the first failure and keeping the rest — is provable in a test.
public protocol ReviewApi {
    func submitReview(token: String, review: PendingReview) async throws -> ReviewResult
}

/// Hand the outbox back to the server, oldest first.
///
/// Stops at the first failure rather than skipping ahead: order matters, and a
/// review that was accepted but whose response was lost must be retried from a
/// known point. `submitReview` is idempotent per card per session on the server,
/// so a replay cannot award XP twice.
public final class SyncEngine {
    private let store: OfflineStore
    private let api: ReviewApi

    public init(store: OfflineStore, api: ReviewApi) {
        self.store = store
        self.api = api
    }

    public func syncOutbox(token: String) async -> SyncOutcome {
        var sent = 0
        for review in store.pendingReviews() {
            do {
                _ = try await api.submitReview(token: token, review: review)
            } catch {
                break
            }
            store.dropReview(review.id)
            sent += 1
        }
        return SyncOutcome(sent: sent, remaining: store.pendingCount())
    }
}
