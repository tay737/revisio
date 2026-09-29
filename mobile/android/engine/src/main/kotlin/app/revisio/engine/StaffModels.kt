package app.revisio.engine

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── exam fidelity: stored papers and assessment objectives ──────────────────
//
// The web's exam simulator grew a second half: real board documents served
// beside the generated papers, and marking that reports *what kind* of mark was
// lost, not just how many. These models mirror `exam/route.ts` and
// `services/study.ts` field for field, defaulted as everywhere else so an older
// server (or a newer one with more fields) still decodes.

/** One assessment objective line — `{ao:'AO1', marks:2}` on the wire. */
@Serializable
data class AoSplit(val ao: String = "", val marks: Int = 0)

/** One assessment objective in the marked result's profile. */
@Serializable
data class AoRow(val ao: String = "", val awarded: Int = 0, val available: Int = 0, val percentage: Int = 0)

/** 'question_paper' | 'mark_scheme' | 'formulae_sheet' | 'other'. */
@Serializable
data class StoredPaper(
    val id: String = "",
    val title: String = "",
    val kind: String = "question_paper",
    val board: String = "",
    val series: String = "",
    val paperCode: String = "",
    val totalMarks: Int? = null,
    val durationMinutes: Int? = null,
)

/** One stored paper fetched verbatim — `GET /exam?paperId=`. */
@Serializable
data class PaperDoc(
    val id: String = "",
    val title: String = "",
    val kind: String = "question_paper",
    val contentMd: String = "",
    val board: String = "",
    val series: String = "",
    val paperCode: String = "",
    val totalMarks: Int? = null,
    val durationMinutes: Int? = null,
)

@Serializable
data class PaperEnvelope(val paper: PaperDoc = PaperDoc())

// ── the update check ────────────────────────────────────────────────────────

// The exam fidelity fields themselves ride on `ExamQuestion`, `ExamMark`,
// `ExamResult` and `ExamPool` in `Content.kt` — one type per wire shape, the
// same as everywhere else in the engine.

/** `GET /api/v1/version` — the server's idea of the newest client. */
@Serializable
data class VersionInfo(val latest: String = "", val build: Int = 0, val minBuild: Int = 0)

/**
 * The comparison an update prompt is made of.
 *
 * The apps compare *build numbers* (the same monotonic integer the release
 * stamps), so `1.0.0-alpha.10` cannot sort below `1.0.0-alpha.9` the way a
 * string compare would. A build at or below `minBuild` is *required* — the
 * server is telling it that continuing is not safe — while anything newer than
 * the running build but above the floor is merely available.
 */
enum class UpdateKind { None, Available, Required }

data class UpdateStatus(val kind: UpdateKind, val latest: String)

fun checkForUpdate(mine: Int, latestBuild: Int, minBuild: Int): UpdateStatus = when {
    mine >= latestBuild -> UpdateStatus(UpdateKind.None, "")
    mine < minBuild -> UpdateStatus(UpdateKind.Required, "")
    else -> UpdateStatus(UpdateKind.Available, "")
}

// ── teaching: classes and rosters ───────────────────────────────────────────

/** One student on a class roster, with the week's activity as `/teacher` sends it. */
@Serializable
data class RosterEntry(
    val classId: String = "",
    val userId: String = "",
    val name: String = "",
    val email: String = "",
    val reviews7d: Int = 0,
    val xp7d: Int = 0,
    val streak: Int = 0,
    val masteryPct: Int = 0,
)

@Serializable
data class TeacherClass(
    val id: String = "",
    val name: String = "",
    val joinCode: String = "",
    val subjectId: String = "",
    val roster: List<RosterEntry> = emptyList(),
)

@Serializable
data class TeacherPayload(
    val classes: List<TeacherClass> = emptyList(),
    val subjects: List<SubjectRef> = emptyList(),
)

/** A topic this account may edit, as `/content?mine=1` sends it. */
@Serializable
data class MyTopic(
    val id: String = "",
    val name: String = "",
    val visibility: String = "private",
    val cardCount: Int? = null,
    val lessonCount: Int? = null,
)

@Serializable
data class MyTopicsPayload(val topics: List<MyTopic> = emptyList())

// ── admin: users, approvals, flags, badges, classes ─────────────────────────

@Serializable
data class AdminUser(
    val id: String = "",
    val email: String = "",
    val name: String = "",
    val role: String = "student",
    val status: String = "active",
    val emailVerifiedAt: String? = null,
    val totpEnabled: Boolean = false,
    val createdAt: String? = null,
)

@Serializable
data class ApprovalRequest(
    val id: String = "",
    val userId: String = "",
    val email: String = "",
    val name: String = "",
    val roleRequested: String = "teacher",
    val note: String = "",
    val status: String = "pending",
    val createdAt: String? = null,
)

@Serializable
data class FeatureFlag(val key: String = "", val description: String = "", val enabled: Boolean = false)

@Serializable
data class PendingTopic(
    val id: String = "",
    val name: String = "",
    val subjectId: String = "",
    val createdAt: String? = null,
)

@Serializable
data class AuditRow(
    val id: String = "",
    val action: String = "",
    val target: String = "",
    val createdAt: String? = null,
)

@Serializable
data class AdminBadge(
    val id: String = "",
    val slug: String = "",
    val label: String = "",
    val icon: String = "",
    val color: String = "gold",
)

@Serializable
data class AdminAchievement(val id: String = "", val name: String = "", val description: String? = null)

@Serializable
data class AdminClassMember(val classId: String = "", val userId: String = "", val name: String = "", val email: String = "")

@Serializable
data class AdminClass(
    val id: String = "",
    val name: String = "",
    val joinCode: String = "",
    val teacherId: String = "",
    val teacherName: String = "",
    val subjectId: String = "",
    val members: List<AdminClassMember> = emptyList(),
)

@Serializable
data class ContentStats(
    val topics: Int = 0,
    val publicTopics: Int = 0,
    val lessons: Int = 0,
    val cards: Int = 0,
    val publicCards: Int = 0,
    val emptyTopics: Int = 0,
)

/** `GET /admin` — the whole console in one payload, developers only. */
@Serializable
data class AdminPayload(
    val approvals: List<ApprovalRequest> = emptyList(),
    val flags: List<FeatureFlag> = emptyList(),
    val users: List<AdminUser> = emptyList(),
    val pendingTopics: List<PendingTopic> = emptyList(),
    val audit: List<AuditRow> = emptyList(),
    val contentStats: ContentStats = ContentStats(),
    val subjects: List<SubjectRef> = emptyList(),
    val badges: List<AdminBadge> = emptyList(),
    val manualAchievements: List<AdminAchievement> = emptyList(),
    val classes: List<AdminClass> = emptyList(),
)

// ── media: avatar and banner uploads ────────────────────────────────────────

/** `POST /media {action:'presign'}` — where to PUT the bytes. */
@Serializable
data class MediaPresign(val url: String = "", val key: String = "", val publicUrl: String = "")

/** `POST /media {action:'confirm'}` — the pointer now reads the new object. */
@Serializable
data class MediaConfirm(val url: String = "")

/**
 * A badge chip on a profile — granted by staff, shown beside the role.
 *
 * The web resolves a badge's glyph by icon name; the phone maps the same names
 * through the same generated registry, so a missing icon degrades to no glyph,
 * never to a different one.
 */
@Serializable
data class ProfileBadgeChip(val id: String = "", val label: String = "", val icon: String = "", val color: String = "gold")

// ── profile fidelity ────────────────────────────────────────────────────────
//
// `PublicProfile` gains the media fields the identity block renders. They live
// here as extensions of the same wire shape; `PublicProfile` itself is defaulted
// so old servers decode — the new fields are nullable and absent by default.

/** The banner's token wash names, as `BANNER_WASH` in `avatar.tsx` owns them. */
val BANNER_COLORS: List<String> = listOf("dusk", "rose", "sea", "moss", "bee", "ember")
