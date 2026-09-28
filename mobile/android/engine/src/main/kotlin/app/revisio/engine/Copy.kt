package app.revisio.engine

import kotlin.math.roundToInt

/**
 * The words the app says — a port of the web's `src/lib/profile.ts`.
 *
 * The website keeps every sentence it speaks in one pure module so that "how
 * Revisio talks to someone" has a single owner. The phones need the same
 * sentences, and the only way to have them is to carry them: a server that sent
 * the copy would need a round trip to say "Good morning", and a phone that
 * invented its own would drift.
 *
 * The rules from that module are kept as written here:
 *
 *   • second person, quiet confidence, no exclamation marks, no emoji;
 *   • every line must be true of the numbers it was handed;
 *   • the order of the cases in [companionFor] *is* the policy, and it is not
 *     arbitrary — a returning learner is not told they are new, and a finished
 *     queue is named before a nudge is ever considered.
 *
 * Anything the screens add on top (button labels, section headings) stays in the
 * screens, next to the layout it belongs to.
 */
object Copy {

    /** Time-of-day greeting. Late night gets acknowledged rather than scolded. */
    fun greeting(hour: Int): String = when {
        hour < 5 -> "Still up"
        hour < 12 -> "Good morning"
        hour < 18 -> "Good afternoon"
        hour < 23 -> "Good evening"
        else -> "Late session"
    }

    fun firstName(name: String?): String {
        val trimmed = (name ?: "").trim()
        if (trimmed.isEmpty()) return "there"
        return trimmed.split(Regex("\\s+")).first()
    }

    fun initials(name: String?): String {
        val parts = (name ?: "").trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (parts.isEmpty()) return "R"
        if (parts.size == 1) return parts[0].take(2).uppercase()
        return (parts.first()[0].toString() + parts.last()[0].toString()).uppercase()
    }

    fun greetingFor(name: String?, hour: Int): String = "${greeting(hour)}, ${firstName(name)}"

    /**
     * Conversation starters for the rotating headline.
     *
     * All are answers to "what is this session actually about", so the rotation
     * never feels random — and the order is fixed, because the first line is the
     * one a learner is most likely to read.
     */
    fun openers(due: Int, streak: Int, level: Int, subject: String?): List<String> {
        val lines = mutableListOf<String>()
        if (due > 0) {
            lines += "$due ${if (due == 1) "card is" else "cards are"} waiting"
            lines += "Let's clear today's queue"
        } else {
            lines += "Nothing is due — you're ahead"
            lines += "Want to get ahead instead?"
        }
        if (streak >= 2) lines += "Day $streak of your streak"
        if (level > 1) lines += "Level $level — keep it moving"
        if (subject != null) lines += "Back to $subject?"
        return lines.distinct().ifEmpty { listOf("Let's get started") }
    }

    /** Post-session copy. Score first, then one sentence that explains it. */
    fun sessionSummary(correct: Int, total: Int): String {
        if (total == 0) return "No cards answered yet."
        val pct = ((correct.toDouble() / total) * 100).roundToInt()
        return when {
            pct == 100 -> "$correct for $total. Every one of them."
            pct >= 80 -> "$correct for $total — that's the recall we want."
            pct >= 50 -> "$correct for $total. The misses are the useful part."
            else -> "$correct for $total. Worth a pass over the notes before the next run."
        }
    }

    /** Empty-state copy that hands the learner a next action rather than a shrug. */
    fun emptyQueueLine(due: Int, streak: Int): String {
        if (due == 0 && streak > 0) {
            return "Your schedule is clear and your $streak-day streak is safe. Anything you do now is a head start."
        }
        return "Your schedule is clear. Cram a topic, read ahead, or come back tomorrow."
    }

    /**
     * A learner's recent form, from today's numbers.
     *
     * Four reviews is the floor because three correct answers is not a pattern.
     */
    fun formFor(reviewed: Int, correct: Int): FormRead {
        if (reviewed < 4) {
            return FormRead("unknown", "No read yet", "Four reviews is enough to call your form.")
        }
        val accuracy = correct.toDouble() / reviewed
        val pct = (accuracy * 100).roundToInt()
        return when {
            accuracy >= 0.9 -> FormRead("sharp", "Sharp", "$pct% today — this is your best gear.")
            accuracy >= 0.7 -> FormRead("steady", "Steady", "$pct% today. Solid, unspectacular, fine.")
            else -> FormRead("shaky", "Shaky", "$pct% today. Slow down and read the whole clue.")
        }
    }

    /**
     * The lobby's line for the current week.
     *
     * Competitive framing without aggression: the zone is a fact, and the
     * sentence explains what it means.
     */
    fun lobbyLine(zone: String, position: Int, size: Int, daysLeft: Int, rankLabel: String): String {
        val days = if (daysLeft == 1) "Today is the last day" else "$daysLeft days left"
        return when (zone) {
            "pending" ->
                "We are still placing you. A few more reviews and we will seat you in a $rankLabel lobby."
            "promotion" ->
                "$position of $size — you are inside the promotion zone. $days; holding this seat moves you up a rung."
            "demotion" ->
                "$position of $size — that is the demotion band. One session pulls you clear of it."
            else ->
                "$position of $size — safe, and close enough to the promotion band to take it. $days."
        }
    }

    /**
     * The companion's read of where the learner is.
     *
     * The cases below are ordered, and the order is the policy (see the class
     * comment). `hour` is passed rather than read so the night-time branch is
     * testable, and `rankLabel` is the learner's current rank if they hold one —
     * the only fact that makes the praise case personal.
     */
    fun companionFor(
        name: String?,
        due: Int,
        reviewed: Int,
        correct: Int,
        streak: Int,
        bestStreak: Int,
        totalXp: Int,
        rankLabel: String?,
        hour: Int,
    ): CompanionRead {
        val rank = if (rankLabel.isNullOrEmpty()) "" else " $rankLabel"

        // 1 — a brand new account. The one moment the app must not be coy.
        if (totalXp <= 0 && reviewed == 0) {
            return CompanionRead(
                "welcome",
                "Nothing here yet, ${firstName(name)} — which is the good part. Ten minutes on the first topic and the scheduler starts working for you tonight.",
                "Pick a topic",
            )
        }

        // 2 — a gap worth acknowledging. Best-streak is the proof they were serious.
        if (streak == 0 && bestStreak >= 3 && reviewed == 0) {
            return CompanionRead(
                "returning",
                "You had $bestStreak days going. Nothing is lost — the queue has held your place, and it only takes today to start the next run.",
                "Resume where you left off",
            )
        }

        // 3 — the work is done. Name it in their own numbers.
        if (due == 0 && reviewed > 0) {
            val clean = correct == reviewed
            return CompanionRead(
                if (clean) "praise" else "open",
                if (clean) {
                    "$reviewed for $reviewed. That is a clean sheet, and it${if (rank.isNotEmpty()) " is why you are holding$rank" else ""}."
                } else {
                    "$reviewed answered and the queue is clear${if (rank.isNotEmpty()) " — still$rank" else ""}. Days like this are what hold a rank together."
                },
                "See the ladder",
            )
        }

        // 4 — mid-session. Short, because they are in the middle of something.
        if (reviewed > 0 && due > 0) {
            return CompanionRead(
                "momentum",
                "$reviewed down, $due to go. You are faster on these than you were at the start.",
                "Carry on",
            )
        }

        // 5 — the nudge. Late at night it is an offer, not an order.
        if (due > 0) {
            val late = hour >= 23 || hour < 5
            return CompanionRead(
                "nudge",
                if (late) {
                    "$due cards are due. Five of them would keep ${if (streak > 0) "day $streak" else "the streak algorithm"} happy — the rest can wait for tomorrow."
                } else {
                    "$due cards due, and nothing in there you have not seen before. Worth doing while they are still easy."
                },
                "Start the queue",
            )
        }

        // 6 — nothing due and nothing done: an invitation, not a reprimand.
        return CompanionRead(
            "open",
            "Nothing is due, which means today is optional — the best kind. Get ahead on a topic, or protect the rank with a quick cram.",
            "Get ahead",
        )
    }
}

/** `formFor`'s answer: which gear the learner is in, and the sentence for it. */
data class FormRead(val form: String, val label: String, val detail: String)

/**
 * `companionFor`'s answer.
 *
 * `actionLabel` is the offer; the destination is the screen's business, because
 * the phone routes it natively rather than by path.
 */
data class CompanionRead(val tone: String, val line: String, val actionLabel: String)
