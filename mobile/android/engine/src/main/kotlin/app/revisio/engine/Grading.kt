package app.revisio.engine

import java.text.Normalizer

/**
 * A native port of `src/domain/grading.ts`.
 *
 * This is the *only* grading code in the native client, and it exists so that a
 * review can be marked with no server. It is a copy of the canonical TypeScript
 * engine, proven equal by `GradingConformanceTest` against vectors emitted from
 * that source — so grading still has one owner, and these two can never quietly
 * drift into rival authorities.
 *
 * Contract (unchanged from the web): the client may preview but never decide.
 * A verdict reached here is provisional; the queued review is re-graded by
 * `submitReview` when the network returns, and the server's verdict is what
 * earns XP and moves the schedule.
 */
object Grading {

    private val whitespace = Regex("\\s+")
    private val punctuation = Regex("[\\p{P}\\p{S}]+")
    private val combiningMarks = Regex("[\\u0300-\\u036f]")

    // ── normalization ───────────────────────────────────────────────────────

    fun normalize(input: String): String =
        Normalizer.normalize(input, Normalizer.Form.NFKC).trim().replace(whitespace, " ")

    fun lowercase(input: String): String = normalize(input).lowercase()

    fun stripPunctuation(input: String): String =
        normalize(input).replace(punctuation, " ").replace(whitespace, " ").trim()

    fun stripAccents(input: String): String =
        Normalizer.normalize(input, Normalizer.Form.NFD).replace(combiningMarks, "")

    fun fullyNormalized(input: String): String = stripPunctuation(stripAccents(lowercase(input)))

    // ── cloze ───────────────────────────────────────────────────────────────

    fun gradeCloze(userAnswer: String, accepted: List<AcceptedAnswer>): Verdict {
        val user = normalize(userAnswer)
        if (user.isEmpty()) return Verdict(false, FeedbackKind.WRONG, note = "No answer given.")

        accepted.firstOrNull { normalize(it.text) == user }?.let {
            return Verdict(true, FeedbackKind.CORRECT, matchedAnswerId = it.id)
        }
        accepted.firstOrNull { lowercase(it.text) == lowercase(user) }?.let {
            return Verdict(
                true,
                FeedbackKind.CASE_ONLY,
                matchedAnswerId = it.id,
                note = "Correct — mind your capitalisation.",
            )
        }
        accepted.firstOrNull { stripPunctuation(lowercase(it.text)) == stripPunctuation(lowercase(user)) }?.let {
            return Verdict(
                true,
                FeedbackKind.PUNCTUATION_ONLY,
                matchedAnswerId = it.id,
                note = "Correct — check your punctuation.",
            )
        }
        accepted.firstOrNull {
            stripPunctuation(stripAccents(lowercase(it.text))) == stripPunctuation(stripAccents(lowercase(user)))
        }?.let {
            return Verdict(
                true,
                FeedbackKind.CASE_AND_PUNCTUATION,
                matchedAnswerId = it.id,
                note = "Correct — check capitalisation and punctuation.",
            )
        }
        return Verdict(false, FeedbackKind.WRONG)
    }

    // ── flashcards (keyword marking) ────────────────────────────────────────

    private fun includesPhrase(haystack: String, needle: String, synonyms: List<String>): Boolean {
        val candidates = (listOf(needle) + synonyms).map(::fullyNormalized)
        return candidates.any { haystack.contains(it) }
    }

    fun gradeFlashcard(
        userAnswer: String,
        accepted: List<AcceptedAnswer>,
        minPointsOverride: Int? = null,
    ): Verdict {
        val user = fullyNormalized(userAnswer)
        if (user.isEmpty()) return Verdict(false, FeedbackKind.WRONG, note = "No answer given.")

        val rules = accepted.firstOrNull { !it.keywords.isNullOrEmpty() }
        val keywords = rules?.keywords
        if (rules == null || keywords.isNullOrEmpty()) {
            // No keyword rules — fall back to the cloze comparison.
            return gradeCloze(userAnswer, accepted)
        }

        val minPoints = minPointsOverride ?: rules.minPoints ?: 2
        val required = keywords.filter { it.required }
        val optional = keywords.filter { !it.required }

        val matchedRequired = required.filter { includesPhrase(user, it.phrase, it.synonyms ?: emptyList()) }
        val matchedOptional = optional.filter { includesPhrase(user, it.phrase, it.synonyms ?: emptyList()) }

        val matchedPhrases = (matchedRequired + matchedOptional).map { it.phrase }
        val missedRequired = required.filterNot { matchedRequired.contains(it) }
        val missedOptional = optional.filterNot { matchedOptional.contains(it) }
        val missedPhrases = (missedRequired + missedOptional).map { it.phrase }

        val requiredOk = matchedRequired.size == required.size
        val pointsOk = matchedRequired.size + matchedOptional.size >= minPoints

        if (requiredOk && pointsOk) {
            return Verdict(
                true,
                FeedbackKind.CORRECT,
                matchedAnswerId = rules.id,
                matchedPhrases = matchedPhrases,
                missedPhrases = missedPhrases,
                note = if (matchedOptional.isNotEmpty() || missedOptional.isNotEmpty()) {
                    "Covered: ${matchedPhrases.joinToString(", ")}."
                } else {
                    null
                },
            )
        }

        if (requiredOk) {
            return Verdict(
                false,
                FeedbackKind.NEAR_MISS,
                matchedAnswerId = rules.id,
                matchedPhrases = matchedPhrases,
                missedPhrases = missedPhrases,
                note = "Good start — also include: ${missedOptional.take(3).joinToString(", ") { it.phrase }}.",
            )
        }

        return Verdict(
            false,
            FeedbackKind.WRONG,
            matchedAnswerId = rules.id,
            matchedPhrases = matchedPhrases,
            missedPhrases = missedPhrases,
            note = "Some required points were missing.",
        )
    }

    // ── multiple choice ─────────────────────────────────────────────────────

    fun gradeMcq(selectedOptionId: String?, correctOptionId: String): Verdict {
        if (selectedOptionId.isNullOrEmpty()) return Verdict(false, FeedbackKind.WRONG, note = "No selection made.")
        if (selectedOptionId == correctOptionId) return Verdict(true, FeedbackKind.CORRECT)
        return Verdict(false, FeedbackKind.WRONG, note = "Incorrect — one attempt only.")
    }

    // ── offline preview ─────────────────────────────────────────────────────

    /**
     * Grade a card with no server, using the pack's answer key.
     *
     * Deliberately returns a plain [Verdict]: this is the preview the scoreboard
     * does not trust, rendered exactly as a server verdict is so offline
     * feedback feels identical.
     */
    fun previewVerdict(card: OfflineCard, answer: String?, selectedOptionId: String?): Verdict =
        if (card.key.kind == "mcq") {
            gradeMcq(selectedOptionId, card.key.correctOptionId ?: "")
        } else if (card.kind == "flashcard") {
            gradeFlashcard(answer ?: "", card.key.accepted ?: emptyList())
        } else {
            gradeCloze(answer ?: "", card.key.accepted ?: emptyList())
        }

    /** The answer shown once a card is graded — the primary accepted answer. */
    fun primaryAnswer(card: OfflineCard): String? =
        if (card.key.kind == "mcq") {
            card.options?.firstOrNull { it.id == card.key.correctOptionId }?.text
        } else {
            val accepted = card.key.accepted ?: emptyList()
            (accepted.firstOrNull { it.isPrimary } ?: accepted.firstOrNull())?.text
        }
}
