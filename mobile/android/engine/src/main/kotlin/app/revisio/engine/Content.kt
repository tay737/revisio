package app.revisio.engine

import kotlinx.serialization.Serializable

// ── the catalogue ───────────────────────────────────────────────────────────
//
// These mirror the `/api/v1` payloads the web client already consumes, field for
// field. Everything is defaulted so a server that grows a field — or omits one
// this build has not learned about yet — still decodes: `EngineJson` ignores
// unknown keys, and a missing key must not be a crash on a phone in a corridor.

@Serializable
data class Subject(
    val id: String,
    val name: String,
    val slug: String? = null,
    val description: String? = null,
    val enrolled: Boolean = false,
    val mathsEnabled: Boolean = false,
    val topicCount: Int = 0,
)

@Serializable
data class SubjectList(val subjects: List<Subject> = emptyList())

@Serializable
data class Topic(
    val id: String,
    val name: String,
    val description: String? = null,
    val subjectId: String? = null,
    val visibility: String? = null,
    // The two routes that list topics spell the same two numbers differently:
    // `/content` sends `cards`/`lessons`, `/cram` sends `cardCount`/`lessonCount`.
    // Both are carried so neither route has to be the one that is wrong, and the
    // screen reads one derived value rather than picking a spelling.
    val cards: Int? = null,
    val lessons: Int? = null,
    val cardCount: Int? = null,
    val lessonCount: Int? = null,
) {
    /** Questions in this topic, whichever route sent it. */
    val questions: Int get() = cardCount ?: cards ?: 0

    /** Notes written for this topic, whichever route sent it. */
    val notes: Int get() = lessonCount ?: lessons ?: 0
}

@Serializable
data class TopicList(val topics: List<Topic> = emptyList())

@Serializable
data class Lesson(
    val id: String,
    val title: String,
    val detailedMd: String? = null,
    val summaryMd: String? = null,
    val specRefs: String? = null,
)

@Serializable
data class LessonList(val lessons: List<Lesson> = emptyList())

/**
 * A patch of notes, from any of the three routes that carry them.
 *
 * `/lessons` and `/learn` name the two densities `detailedMd`/`summaryMd`; cram
 * hands back whichever one was asked for as `contentMd`. One shape for three
 * sources, so the reading surface never has to know which door it came through.
 */
@Serializable
data class Note(
    val id: String? = null,
    val topicId: String? = null,
    val title: String,
    val detailedMd: String? = null,
    val summaryMd: String? = null,
    val contentMd: String? = null,
    val specRefs: String? = null,
) {
    /** The prose to show at the chosen density, falling back to what exists. */
    fun body(summary: Boolean): String {
        val preferred = if (summary) summaryMd else detailedMd
        if (!preferred.isNullOrBlank()) return preferred
        if (!detailedMd.isNullOrBlank()) return detailedMd
        if (!contentMd.isNullOrBlank()) return contentMd
        return summaryMd.orEmpty()
    }

    fun hasAnyBody(): Boolean =
        !(detailedMd.isNullOrBlank() && summaryMd.isNullOrBlank() && contentMd.isNullOrBlank())
}

// ── a card you can answer ───────────────────────────────────────────────────

/** A queue card as `/queue/today`, `/learn` and `/cram` send it — no answer key. */
@Serializable
data class QueueCard(
    val id: String,
    val kind: String,
    val topicId: String = "",
    val topicName: String = "",
    val subjectId: String = "",
    val subjectName: String = "",
    val textWithBlank: String? = null,
    val prompt: String? = null,
    val question: String? = null,
    val options: List<CardOption>? = null,
    val stage: String = "new",
)

/**
 * The one card the review surface renders, wherever it came from.
 *
 * The daily queue, first exposure and cram all send the same queue shape, and
 * none of them carries an answer key — only `/offline/pack` does, deliberately,
 * so a key cannot leak on a route the client calls constantly. Hence an optional
 * key: with it the app can mark an answer with no server at all; without it, the
 * card has to be asked about.
 */
data class QuizCard(
    val id: String,
    val kind: String,
    val topicId: String,
    val topicName: String,
    val subjectId: String,
    val subjectName: String,
    val textWithBlank: String?,
    val prompt: String?,
    val question: String?,
    val options: List<CardOption>?,
    val stage: String,
    val key: OfflineKey?,
) {
    val canMarkLocally: Boolean get() = key != null

    /** The text the learner is answering, or a nothing-left-to-say fallback. */
    val promptText: String
        get() = when (kind) {
            "cloze" -> textWithBlank ?: "Fill in the blank"
            "flashcard" -> prompt ?: "Recall the answer"
            else -> question ?: "Choose the best answer"
        }
}

fun OfflineCard.toQuizCard(): QuizCard = QuizCard(
    id = id, kind = kind, topicId = topicId, topicName = topicName,
    subjectId = subjectId, subjectName = subjectName,
    textWithBlank = textWithBlank, prompt = prompt, question = question,
    options = options, stage = stage, key = key,
)

fun QueueCard.toQuizCard(): QuizCard = QuizCard(
    id = id, kind = kind, topicId = topicId, topicName = topicName,
    subjectId = subjectId, subjectName = subjectName,
    textWithBlank = textWithBlank, prompt = prompt, question = question,
    options = options, stage = stage, key = null,
)

/** What a session is for. Sent as `mode` on every review it produces. */
enum class StudyMode(val wire: String, val label: String) {
    DAILY("daily", "Today"),
    LEARN("learn", "Learning"),
    CRAM("cram", "Cramming"),
}

// ── sessions ────────────────────────────────────────────────────────────────

@Serializable
data class ExposureTopic(
    val id: String,
    val name: String,
    val description: String? = null,
    val subjectId: String? = null,
    val subjectName: String? = null,
)

@Serializable
data class ExposureProgress(val met: Int = 0, val total: Int = 0, val remaining: Int = 0)

/** `GET /learn` — a topic's unseen cards, with the notes that explain them. */
@Serializable
data class FirstExposure(
    val topic: ExposureTopic,
    val notes: List<Note> = emptyList(),
    val batch: List<QueueCard> = emptyList(),
    val progress: ExposureProgress = ExposureProgress(),
)

@Serializable
data class CramRequest(
    val topicIds: List<String>,
    val maxPerTopic: Int = 20,
    val noteDensity: String = "detailed",
)

/** `POST /cram` — the queue, plus the notes at the density that was asked for. */
@Serializable
data class CramSession(
    val sessionId: String,
    val noteDensity: String = "detailed",
    val notes: List<Note> = emptyList(),
    val queue: List<QueueCard> = emptyList(),
)

@Serializable
data class QueueList(val queue: List<QueueCard> = emptyList())

@Serializable
data class EnrollRequest(val subjectId: String)

@Serializable
data class EnrollResult(val enrolled: Boolean = false)

// ── rank, lobby and achievements ────────────────────────────────────────────

/**
 * The ladder's answer for a quantity of XP, from `domain/ranked.ts`.
 *
 * Fifteen rungs (Bronze III → Legend I). `percent` is already clamped by the
 * server-side engine, so the client never re-derives what "nearly promoted"
 * means — it draws what it was handed.
 */
@Serializable
data class Rank(
    val tier: String = "bronze",
    val division: Int = 3,
    val index: Int = 0,
    val label: String = "Bronze III",
    val short: String = "BRO III",
    val points: Int = 0,
    val intoDivision: Int = 0,
    val forDivision: Int = 0,
    val percent: Int = 0,
    val remaining: Int = 0,
    val isApex: Boolean = false,
)

@Serializable
data class Placement(
    val placing: Boolean = true,
    val done: Int = 0,
    val target: Int = 10,
    val percent: Int = 0,
)

/** The lobby's week, as `weekBounds()` describes it. */
@Serializable
data class WeekBounds(
    val weekStart: String = "",
    val daysLeft: Int = 0,
    val percentElapsed: Int = 0,
    val rangeLabel: String = "",
)

@Serializable
data class BoardRow(
    val rank: Int = 0,
    val userId: String? = null,
    val name: String = "",
    val xp: Int = 0,
    val isMe: Boolean = false,
)

@Serializable
data class LobbySeat(
    val position: Int = 0,
    val name: String = "",
    val xp: Int = 0,
    val isMe: Boolean = false,
    val rank: Rank? = null,
)

/** `promotion` | `safe` | `demotion` | `pending` — decided server-side. */
@Serializable
data class Lobby(
    val position: Int = 0,
    val size: Int = 0,
    val filled: Int = 0,
    val zone: String = "pending",
    val band: Int = 0,
    val rows: List<LobbySeat> = emptyList(),
) {
    val zoneLabel: String
        get() = when (zone) {
            "promotion" -> "Promotion zone"
            "demotion" -> "Demotion zone"
            "pending" -> "Placements"
            else -> "Safe"
        }
}

@Serializable
data class Ranked(
    val rank: Rank = Rank(),
    val placement: Placement = Placement(),
    val week: WeekBounds = WeekBounds(),
    val lobby: Lobby = Lobby(),
    val xpThisWeek: Int = 0,
)

/** The learner's own line in the ranked payload. */
@Serializable
data class RankedMe(
    val rank: Int = 0,
    val xpThisWeek: Int = 0,
    val totalXp: Int = 0,
    val level: Int = 0,
    val seatedThisWeek: Boolean = false,
)

@Serializable
data class Achievement(
    val id: String,
    val name: String,
    val description: String? = null,
    val icon: String? = null,
    val unlocked: Boolean = false,
    val unlockedAt: String? = null,
)

/** An achievement as `/me` and `/profile` list them: presence means unlocked. */
@Serializable
data class AchievementRef(
    val id: String,
    val name: String,
    val description: String? = null,
    val icon: String? = null,
    val unlockedAt: String? = null,
)

/** `GET /gamification` — the board, the lobby and the achievements behind both. */
@Serializable
data class GamificationPayload(
    val scope: String = "weekly",
    val board: List<BoardRow> = emptyList(),
    val ranked: Ranked = Ranked(),
    val me: RankedMe = RankedMe(),
    val achievements: List<Achievement> = emptyList(),
)

// ── the account ─────────────────────────────────────────────────────────────

/** The six per-field switches from `services/profile.ts`. */
@Serializable
data class Visibility(
    val name: Boolean = true,
    val nickname: Boolean = true,
    val bio: Boolean = true,
    val subjects: Boolean = true,
    val stats: Boolean = true,
    val achievements: Boolean = true,
)

@Serializable
data class Prefs(
    val noteDensity: String = "detailed",
    val reducedMotion: Boolean = false,
)

@Serializable
data class SubjectRef(val id: String, val name: String)

/**
 * `GET /me` — the whole account, including the parts only the owner ever sees.
 *
 * Distinct from `MeResponse` (the thin slice the home screen needs) on purpose:
 * a screen that shows a switch has to know the switch's stored value, and the
 * home screen has no business decoding a privacy policy.
 */
@Serializable
data class MeDetail(
    val id: String = "",
    val email: String = "",
    val name: String = "",
    val username: String? = null,
    val nickname: String? = null,
    val bio: String? = null,
    val avatarEmoji: String? = null,
    val avatarColor: String = "ink",
    val profileVisibility: Visibility = Visibility(),
    val role: String = "student",
    val status: String? = null,
    val totpEnabled: Boolean = false,
    val leaderboardOptOut: Boolean = false,
    val prefs: Prefs = Prefs(),
    val subjects: List<SubjectRef> = emptyList(),
    val gamification: Gamification = Gamification(),
    val today: TodaySummary = TodaySummary(),
    val achievements: List<AchievementRef> = emptyList(),
)

/** `PATCH /me` — identity, profile and preferences through one door. */
@Serializable
data class MePatch(
    val name: String? = null,
    val nickname: String? = null,
    val username: String? = null,
    val bio: String? = null,
    val avatarEmoji: String? = null,
    val avatarColor: String? = null,
    val profileVisibility: Visibility? = null,
    val leaderboardOptOut: Boolean? = null,
    val prefs: Prefs? = null,
)

@Serializable
data class ProfileGamification(
    val totalXp: Int = 0,
    val level: Int = 0,
    val rankLabel: String = "",
    val rankTier: String = "",
    val rankDivision: Int = 3,
    val streak: Int = 0,
)

/**
 * `GET /profile/:handle`, visibility already applied server-side.
 *
 * A field the owner keeps private arrives as `null` rather than being stripped,
 * so the client always knows the shape and never the value. `gamification` is
 * null as a whole when stats are private — which is why it is nullable here and
 * not defaulted to zeroes, where "private" and "no XP yet" would look alike.
 */
@Serializable
data class PublicProfile(
    val id: String = "",
    val username: String? = null,
    val email: String? = null,
    val name: String? = null,
    val nickname: String? = null,
    val bio: String? = null,
    val avatarEmoji: String? = null,
    val avatarColor: String = "ink",
    val role: String = "student",
    val createdAt: String = "",
    val visibility: Visibility = Visibility(),
    val gamification: ProfileGamification? = null,
    val subjects: List<SubjectRef> = emptyList(),
    val achievements: List<AchievementRef> = emptyList(),
    val reviewCount: Int = 0,
)
