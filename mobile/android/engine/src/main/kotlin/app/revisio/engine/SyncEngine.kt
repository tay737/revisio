package app.revisio.engine

/**
 * The one thing sync needs from the network.
 *
 * Extracted as an interface rather than reaching for the concrete client so the
 * outbox's hardest behaviour — stopping at the first failure and keeping the
 * rest — is provable in a unit test instead of only against a live server.
 */
interface ReviewApi {
    suspend fun submitReview(token: String, review: PendingReview): ReviewResult
}

/**
 * Hand the outbox back to the server, oldest first.
 *
 * Stops at the first failure rather than skipping ahead: order matters (XP and
 * streaks are computed per review as it lands), and a review that was accepted
 * but whose response was lost must be retried from a known point, not overtaken.
 * `submitReview` is idempotent per card per session on the server, so a replay
 * cannot award XP twice.
 */
class SyncEngine(
    private val store: OfflineStore,
    private val api: ReviewApi,
) {
    suspend fun syncOutbox(token: String): SyncOutcome {
        var sent = 0
        for (review in store.pendingReviews()) {
            val accepted = runCatching { api.submitReview(token, review) }.isSuccess
            if (!accepted) break
            store.dropReview(review.id)
            sent += 1
        }
        return SyncOutcome(sent, store.pendingCount())
    }
}
