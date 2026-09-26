package app.revisio.engine

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The engine's one JSON policy.
 *
 * `explicitNulls = false` is load-bearing: a null optional field must serialise
 * exactly as the TypeScript engine omits an `undefined` one, or the conformance
 * test would compare shapes that never occur in the wild and could pass while
 * the two engines disagree. `ignoreUnknownKeys` lets the client read a server
 * payload that grew a field this build has not heard of yet.
 */
val EngineJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = false
}

// ── grading ─────────────────────────────────────────────────────────────────

/** Mirrors `FeedbackKind` in `src/domain/grading.ts`, string-for-string. */
@Serializable
enum class FeedbackKind {
    @SerialName("correct") CORRECT,
    @SerialName("case_only") CASE_ONLY,
    @SerialName("punctuation_only") PUNCTUATION_ONLY,
    @SerialName("case_and_punctuation") CASE_AND_PUNCTUATION,
    @SerialName("near_miss") NEAR_MISS,
    @SerialName("wrong") WRONG,
}

/**
 * A grading result. Optional fields default to null so that a null is *omitted*
 * from JSON, matching the TypeScript engine's `undefined`.
 */
@Serializable
data class Verdict(
    val correct: Boolean,
    val feedbackKind: FeedbackKind,
    val matchedAnswerId: String? = null,
    val note: String? = null,
    val matchedPhrases: List<String>? = null,
    val missedPhrases: List<String>? = null,
)

@Serializable
data class Keyword(
    val required: Boolean = false,
    val phrase: String,
    val synonyms: List<String>? = null,
)

@Serializable
data class AcceptedAnswer(
    val id: String,
    val text: String,
    val isPrimary: Boolean = false,
    val keywords: List<Keyword>? = null,
    val minPoints: Int? = null,
)

// ── the offline pack ────────────────────────────────────────────────────────

@Serializable
data class CardOption(val id: String, val text: String)

/**
 * The answer key that travels separately from the queue.
 *
 * Matches `OfflineKey` in `src/services/offline.ts`: cloze/flashcard carry the
 * accepted answers, mcq carries the correct option id. Modelled as one bag of
 * nullable fields rather than a sealed hierarchy so the wire shape is obvious
 * from the type.
 */
@Serializable
data class OfflineKey(
    val kind: String,
    val accepted: List<AcceptedAnswer>? = null,
    val correctOptionId: String? = null,
)

@Serializable
data class OfflineCard(
    val id: String,
    val kind: String,
    val topicId: String,
    val topicName: String,
    val subjectId: String,
    val subjectName: String,
    val textWithBlank: String? = null,
    val prompt: String? = null,
    val question: String? = null,
    val options: List<CardOption>? = null,
    val stage: String,
    val key: OfflineKey,
)

@Serializable
data class OfflinePack(
    val cards: List<OfflineCard>,
    val builtAt: String,
)

/** A review the server has not seen yet. Append-only, so replaying it is safe. */
@Serializable
data class PendingReview(
    val id: String,
    val cardId: String,
    val answer: String? = null,
    val selectedOptionId: String? = null,
    val durationMs: Long = 0,
    val mode: String = "daily",
    val queuedAt: String,
)

// ── API DTOs ────────────────────────────────────────────────────────────────

@Serializable
data class ApiUser(
    val id: String,
    val email: String,
    val name: String,
    val role: String,
    val status: String? = null,
)

@Serializable
data class LoginResponse(
    val accessToken: String? = null,
    val user: ApiUser? = null,
    val mfaRequired: Boolean = false,
)

@Serializable
data class RefreshResponse(
    val accessToken: String,
    val user: ApiUser? = null,
)

@Serializable
data class Gamification(
    val totalXp: Int = 0,
    val level: Int = 0,
    val intoLevel: Int = 0,
    val forNext: Int = 0,
    val streak: Int = 0,
    val bestStreak: Int = 0,
)

@Serializable
data class TodaySummary(
    val due: Int = 0,
    val reviewed: Int = 0,
    val correct: Int = 0,
)

/** A deliberately partial view of `/api/v1/me` — only what this surface shows. */
@Serializable
data class MeResponse(
    val id: String = "",
    val email: String = "",
    val name: String = "",
    val role: String = "",
    val gamification: Gamification? = null,
    val today: TodaySummary? = null,
)

@Serializable
data class ReviewResult(
    val verdict: Verdict,
    val primaryAnswer: String? = null,
    val modelAnswer: String? = null,
    val explanation: String? = null,
    val xpAwarded: Int = 0,
    val totalXp: Int = 0,
    val level: Int = 0,
    val streak: Int = 0,
    val nextDueAt: String? = null,
)
