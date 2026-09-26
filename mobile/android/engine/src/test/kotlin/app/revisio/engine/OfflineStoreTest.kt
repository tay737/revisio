package app.revisio.engine

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineStoreTest {

    private fun store() = OfflineStore(MemoryKeyValueStore())

    private fun pack(vararg ids: String) = OfflinePack(
        cards = ids.map { id ->
            OfflineCard(
                id = id,
                kind = "cloze",
                topicId = "t",
                topicName = "Topic",
                subjectId = "s",
                subjectName = "Subject",
                textWithBlank = "The blank is ____.",
                stage = "new",
                key = OfflineKey(kind = "cloze", accepted = listOf(AcceptedAnswer("a", "answer", isPrimary = true))),
            )
        },
        builtAt = "2026-01-01T00:00:00Z",
    )

    @Test
    fun `a saved pack survives a new store over the same storage`() {
        val kv = MemoryKeyValueStore()
        OfflineStore(kv).savePack(pack("c1", "c2"))
        val reloaded = OfflineStore(kv).cachedPack()
        assertEquals(listOf("c1", "c2"), reloaded?.cards?.map { it.id })
    }

    @Test
    fun `an empty pack is not treated as a cached session`() {
        val store = store()
        store.savePack(OfflinePack(cards = emptyList(), builtAt = "now"))
        assertNull(store.cachedPack())
    }

    @Test
    fun `dropping an answered card removes only that card`() {
        val store = store()
        store.savePack(pack("c1", "c2", "c3"))
        store.dropCardFromPack("c2")
        assertEquals(listOf("c1", "c3"), store.cachedPack()?.cards?.map { it.id })
    }

    @Test
    fun `queued reviews are append-only and survive a restart`() {
        val kv = MemoryKeyValueStore()
        OfflineStore(kv).enqueueReview("c1", "answer", null, 1200)
        val reopened = OfflineStore(kv)
        assertEquals(1, reopened.pendingCount())
        assertEquals("c1", reopened.pendingReviews().first().cardId)
    }

    @Test
    fun `sync stops at the first failure and keeps the rest`() = runBlocking {
        val store = store()
        store.enqueueReview("c1", "a", null, 1)
        store.enqueueReview("c2", "b", null, 1)
        store.enqueueReview("c3", "c", null, 1)

        // Accept the first, then the network dies — the remaining two are owed.
        val api = object : ReviewApi {
            var calls = 0
            override suspend fun submitReview(token: String, review: PendingReview): ReviewResult {
                calls += 1
                if (calls > 1) throw ApiException(503, "capacity", "busy")
                return ReviewResult(verdict = Verdict(true, FeedbackKind.CORRECT))
            }
        }

        val outcome = SyncEngine(store, api).syncOutbox("token")
        assertEquals(1, outcome.sent)
        assertEquals(2, outcome.remaining)
        assertTrue(store.pendingReviews().none { it.cardId == "c1" })
        assertEquals(listOf("c2", "c3"), store.pendingReviews().map { it.cardId })
    }

    @Test
    fun `an empty pack model serialises without null noise`() {
        val card = pack("c1").cards.first()
        val text = EngineJson.encodeToString(OfflineCard.serializer(), card)
        assertTrue("null fields must be omitted to match the wire shape", !text.contains("null"))
        assertTrue(text.contains("\"kind\":\"cloze\""))
    }
}
