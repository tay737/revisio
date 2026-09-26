package app.revisio.engine

import java.time.Instant
import java.util.UUID

/**
 * The single owner of everything offline.
 *
 * Two facts live here and nowhere else: the session we cached (the pack), and
 * the reviews we owe the server (the outbox). Nothing else in the app reads or
 * writes those keys, and nothing else decides what "offline" means.
 *
 * This is the native counterpart of `src/lib/offline.ts`, with the same keys and
 * the same JSON shapes, so the two clients cache the same thing and a queued
 * review means the same on phone as on web.
 */
class OfflineStore(
    private val kv: KeyValueStore,
    private val json: kotlinx.serialization.json.Json = EngineJson,
) {
    private val packKey = "revisio.offline.pack.v1"
    private val outboxKey = "revisio.offline.outbox.v1"

    // ── the cached session ──────────────────────────────────────────────────

    fun savePack(pack: OfflinePack) {
        runCatching { kv.write(packKey, json.encodeToString(OfflinePack.serializer(), pack)) }
    }

    fun cachedPack(): OfflinePack? {
        val raw = kv.read(packKey) ?: return null
        val pack = runCatching { json.decodeFromString(OfflinePack.serializer(), raw) }.getOrNull() ?: return null
        return pack.takeIf { it.cards.isNotEmpty() }
    }

    fun clearPack() {
        kv.remove(packKey)
    }

    /**
     * Take a card out of the cached pack once the server has accepted a review
     * of it, so coming back offline cannot deal a card that was already answered.
     */
    fun dropCardFromPack(cardId: String) {
        val pack = cachedPack() ?: return
        val remaining = pack.cards.filterNot { it.id == cardId }
        if (remaining.size == pack.cards.size) return
        savePack(pack.copy(cards = remaining))
    }

    // ── the outbox ──────────────────────────────────────────────────────────

    fun pendingReviews(): List<PendingReview> {
        val raw = kv.read(outboxKey) ?: return emptyList()
        return runCatching {
            json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(PendingReview.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    fun pendingCount(): Int = pendingReviews().size

    /**
     * Record a review the server has not accepted. The caller removes the card
     * from the cached pack once the learner moves on; this only holds the debt.
     */
    fun enqueueReview(
        cardId: String,
        answer: String?,
        selectedOptionId: String?,
        durationMs: Long,
        mode: String = "daily",
    ): PendingReview {
        val entry = PendingReview(
            id = "$cardId:${System.currentTimeMillis()}:${UUID.randomUUID().toString().take(6)}",
            cardId = cardId,
            answer = answer,
            selectedOptionId = selectedOptionId,
            durationMs = durationMs,
            mode = mode,
            queuedAt = Instant.now().toString(),
        )
        val next = pendingReviews() + entry
        runCatching {
            kv.write(outboxKey, json.encodeToString(kotlinx.serialization.builtins.ListSerializer(PendingReview.serializer()), next))
        }
        return entry
    }

    fun dropReview(id: String) {
        val next = pendingReviews().filterNot { it.id == id }
        runCatching {
            kv.write(outboxKey, json.encodeToString(kotlinx.serialization.builtins.ListSerializer(PendingReview.serializer()), next))
        }
    }
}

/** How a sync went: what the server took, and what is still owed. */
data class SyncOutcome(val sent: Int, val remaining: Int)
