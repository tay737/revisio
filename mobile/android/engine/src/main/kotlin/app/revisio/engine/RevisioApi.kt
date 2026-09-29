package app.revisio.engine

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** A signed-in session, with the refresh token the server handed us at login. */
data class AuthSession(val accessToken: String, val refreshToken: String?, val user: ApiUser)

/**
 * What a refresh attempt actually told us.
 *
 * A `null` used to stand for two opposite things — "the server rejected this
 * token" and "we never reached the server" — and the app treated both as "could
 * not load". That is how a learner who was in fact signed out ended up looking
 * at an account screen claiming to load: nothing was ever going to answer.
 *
 * This is the distinction `RefreshOutcome` makes in `src/lib/api.ts`, where the
 * comment records what conflating them cost: people signed out mid-session
 * whenever the database was merely busy.
 */
sealed interface RefreshOutcome {
    data class Renewed(val session: AuthSession) : RefreshOutcome

    /** The server said no. The session is over and only signing in can fix it. */
    data object Rejected : RefreshOutcome

    /** We could not find out: offline, a 5xx, a capacity refusal. Keep the session. */
    data object Unavailable : RefreshOutcome
}

class ApiException(val status: Int, val code: String, override val message: String) : Exception(message)

@kotlinx.serialization.Serializable
private data class LoginRequest(val email: String, val password: String)

@kotlinx.serialization.Serializable
private data class RefreshRequest(val refreshToken: String)

@kotlinx.serialization.Serializable
private data class SubmitReviewRequest(
    val cardId: String,
    val answer: String? = null,
    val selectedOptionId: String? = null,
    val durationMs: Long = 0,
    val mode: String = "daily",
)

@kotlinx.serialization.Serializable
private data class SubmitRequest(
    val cardId: String,
    val answer: String? = null,
    val selectedOptionId: String? = null,
    val durationMs: Long = 0,
    val mode: String = "daily",
    val sessionId: String? = null,
)

@kotlinx.serialization.Serializable
data class ExamAnswer(val questionId: String, val answer: String? = null, val selectedOptionId: String? = null)

@kotlinx.serialization.Serializable
private data class MediaPresignRequest(
    val action: String,
    val kind: String,
    val contentType: String,
    val sizeBytes: Long,
)

@kotlinx.serialization.Serializable
private data class MediaConfirmRequest(
    val action: String,
    val kind: String,
    val key: String,
    val contentType: String,
    val sizeBytes: Long,
)

@kotlinx.serialization.Serializable
private data class MediaRemoveRequest(val action: String, val kind: String)

/** One door for the exam route: the presence of `answers` is what decides its job. */
@kotlinx.serialization.Serializable
private data class ExamRequest(
    val topicIds: List<String>,
    val questionCount: Int? = null,
    val answers: List<ExamAnswer>? = null,
)

@kotlinx.serialization.Serializable
data class MathsAnswer(val questionId: String, val answer: String? = null)

/** The maths route's actions share one body shape, as the server's switch expects. */
@kotlinx.serialization.Serializable
private data class MathsRequest(
    val action: String,
    val topicIds: List<String>? = null,
    val conceptIds: List<String>? = null,
    val difficulty: String? = null,
    val count: Int? = null,
    val answers: List<MathsAnswer>? = null,
    val marks: Int? = null,
    val maxMarks: Int? = null,
    val correct: Int? = null,
    val total: Int? = null,
)

@kotlinx.serialization.Serializable
private data class EmailChangeRequest(val password: String, val newEmail: String)

@kotlinx.serialization.Serializable
private data class PasswordChangeRequest(val currentPassword: String, val newPassword: String)

@kotlinx.serialization.Serializable
private data class ApiErrorEnvelope(val error: ApiErrorBody? = null)

@kotlinx.serialization.Serializable
private data class ApiErrorBody(val code: String = "error", val message: String = "Request failed.")

/**
 * The native client's one door to the backend.
 *
 * It speaks the same `/api/v1` contract the web app does — same routes, same
 * JSON — so the two clients cannot diverge in what they mean by a review. What
 * differs is only how it is driven: a native app owns the equivalent of a cookie
 * jar by keeping the refresh token the login response sets and replaying it on
 * `/auth/refresh`.
 */
class RevisioApi(
    baseUrl: String,
    private val client: OkHttpClient = OkHttpClient(),
    private val json: Json = EngineJson,
) : ReviewApi {
    private val base = baseUrl.trimEnd('/')
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private fun request(path: String, token: String? = null, body: String? = null, method: String = "GET"): Request {
        val builder = Request.Builder().url("$base$path")
        if (token != null) builder.header("Authorization", "Bearer $token")
        if (body != null) builder.method(method, body.toRequestBody(jsonType))
        else if (method != "GET") builder.method(method, ByteArray(0).toRequestBody(null))
        return builder.build()
    }

    private fun <T> send(request: Request, parse: (String) -> T): T {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val body = runCatching { json.decodeFromString(ApiErrorEnvelope.serializer(), text) }.getOrNull()
                throw ApiException(
                    response.code,
                    body?.error?.code ?: "error",
                    body?.error?.message ?: "Request failed (${response.code}).",
                )
            }
            return parse(text)
        }
    }

    suspend fun login(email: String, password: String): AuthSession = withContext(Dispatchers.IO) {
        val body = json.encodeToString(LoginRequest.serializer(), LoginRequest(email, password))
        client.newCall(request("/api/v1/auth/login", body = body, method = "POST")).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val err = runCatching { json.decodeFromString(ApiErrorEnvelope.serializer(), text) }.getOrNull()
                throw ApiException(
                    response.code,
                    err?.error?.code ?: "error",
                    err?.error?.message ?: "Sign in failed (${response.code}).",
                )
            }
            val parsed = json.decodeFromString(LoginResponse.serializer(), text)
            if (parsed.mfaRequired) throw ApiException(409, "mfa_required", "This account needs a 2FA code, which this build cannot yet enter.")
            val token = parsed.accessToken ?: throw ApiException(500, "no_token", "The server did not return a session.")
            val user = parsed.user ?: throw ApiException(500, "no_user", "The server did not return your account.")
            AuthSession(token, refreshTokenFrom(response.headers("Set-Cookie")), user)
        }
    }

    suspend fun refresh(refreshToken: String): RefreshOutcome = withContext(Dispatchers.IO) {
        val body = json.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken))
        try {
            client.newCall(request("/api/v1/auth/refresh", body = body, method = "POST")).execute().use { response ->
                // 401/403 is the server answering. Anything else that is not a
                // success is us failing to hear the answer, and the two must not
                // be confused: one ends the session, the other must not.
                if (response.code == 401 || response.code == 403) return@withContext RefreshOutcome.Rejected
                if (!response.isSuccessful) return@withContext RefreshOutcome.Unavailable
                val text = response.body?.string().orEmpty()
                val parsed = runCatching { json.decodeFromString(RefreshResponse.serializer(), text) }.getOrNull()
                    ?: return@withContext RefreshOutcome.Unavailable
                RefreshOutcome.Renewed(
                    AuthSession(
                        parsed.accessToken,
                        refreshTokenFrom(response.headers("Set-Cookie")) ?: refreshToken,
                        parsed.user ?: ApiUser("", "", "", "student"),
                    ),
                )
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // A dropped socket, a DNS failure or a timeout is not a rejection.
            RefreshOutcome.Unavailable
        }
    }

    suspend fun me(token: String): MeResponse = withContext(Dispatchers.IO) {
        send(request("/api/v1/me", token = token)) { json.decodeFromString(MeResponse.serializer(), it) }
    }

    /**
     * The session the app takes with it when it loses the network. Fetched
     * deliberately, and the only route that hands back an answer key — which is
     * why it is separate from the daily queue on the server.
     */
    suspend fun fetchPack(token: String, limit: Int = 20): OfflinePack = withContext(Dispatchers.IO) {
        send(request("/api/v1/offline/pack?limit=$limit", token = token)) {
            json.decodeFromString(OfflinePack.serializer(), it)
        }
    }

    override suspend fun submitReview(token: String, review: PendingReview): ReviewResult = withContext(Dispatchers.IO) {
        val body = json.encodeToString(
            SubmitReviewRequest.serializer(),
            SubmitReviewRequest(review.cardId, review.answer, review.selectedOptionId, review.durationMs, review.mode),
        )
        send(request("/api/v1/reviews", token = token, body = body, method = "POST")) {
            json.decodeFromString(ReviewResult.serializer(), it)
        }
    }

    /**
     * One review, in any mode.
     *
     * `mode` is how the same grading path serves today's queue (`daily`), first
     * exposure (`learn`), cram (`cram`) and the exam simulator. A card met in
     * one of them is graded, scheduled and rewarded exactly like any other —
     * which is the point of it being a mode rather than a second loop.
     */
    suspend fun submit(
        token: String,
        cardId: String,
        answer: String? = null,
        selectedOptionId: String? = null,
        durationMs: Long = 0,
        mode: String = "daily",
        sessionId: String? = null,
    ): ReviewResult = withContext(Dispatchers.IO) {
        val body = json.encodeToString(
            SubmitRequest.serializer(),
            SubmitRequest(cardId, answer, selectedOptionId, durationMs, mode, sessionId),
        )
        send(request("/api/v1/reviews", token = token, body = body, method = "POST")) {
            json.decodeFromString(ReviewResult.serializer(), it)
        }
    }

    // ── the catalogue ───────────────────────────────────────────────────────

    /** Every public subject, flagged with whether this learner follows it. */
    suspend fun subjects(token: String): List<Subject> = withContext(Dispatchers.IO) {
        send(request("/api/v1/subjects", token = token)) { json.decodeFromString(SubjectList.serializer(), it) }.subjects
    }

    suspend fun enroll(token: String, subjectId: String): Boolean = withContext(Dispatchers.IO) {
        val body = json.encodeToString(EnrollRequest.serializer(), EnrollRequest(subjectId))
        send(request("/api/v1/subjects", token = token, body = body, method = "POST")) {
            json.decodeFromString(EnrollResult.serializer(), it)
        }.enrolled
    }

    /** The topics under a subject that this learner may actually study. */
    suspend fun topics(token: String, subjectId: String): List<Topic> = withContext(Dispatchers.IO) {
        send(request("/api/v1/content?subjectId=$subjectId", token = token)) {
            json.decodeFromString(TopicList.serializer(), it)
        }.topics
    }

    /** A topic's notes, in both densities. */
    suspend fun lessons(token: String, topicId: String): List<Lesson> = withContext(Dispatchers.IO) {
        send(request("/api/v1/lessons?topicId=$topicId", token = token)) {
            json.decodeFromString(LessonList.serializer(), it)
        }.lessons
    }

    /** A topic's unseen cards, with the notes that explain them. */
    suspend fun firstExposure(token: String, topicId: String, batch: Int = 4): FirstExposure = withContext(Dispatchers.IO) {
        send(request("/api/v1/learn?topicId=$topicId&batch=$batch", token = token)) {
            json.decodeFromString(FirstExposure.serializer(), it)
        }
    }

    /** Today's queue, without answer keys — the client asks the server to mark. */
    suspend fun todayQueue(token: String, limit: Int = 20): List<QueueCard> = withContext(Dispatchers.IO) {
        send(request("/api/v1/queue/today?limit=$limit", token = token)) {
            json.decodeFromString(QueueList.serializer(), it)
        }.queue
    }

    /** Topics available to cram, with counts that match the queue it will deal. */
    suspend fun cramTopics(token: String): List<Topic> = withContext(Dispatchers.IO) {
        send(request("/api/v1/cram", token = token)) { json.decodeFromString(TopicList.serializer(), it) }.topics
    }

    /** Start a cram session: the notes at the chosen density, plus the queue. */
    suspend fun cram(
        token: String,
        topicIds: List<String>,
        maxPerTopic: Int = 20,
        noteDensity: String = "detailed",
    ): CramSession = withContext(Dispatchers.IO) {
        val body = json.encodeToString(CramRequest.serializer(), CramRequest(topicIds, maxPerTopic, noteDensity))
        send(request("/api/v1/cram", token = token, body = body, method = "POST")) {
            json.decodeFromString(CramSession.serializer(), it)
        }
    }

    // ── the library's own write ─────────────────────────────────────────────

    /** Who may see a public topic this learner owns. Learners only ever see their own. */
    suspend fun setTopicVisibility(token: String, topicId: String, visibility: String): TopicVisibilityResult =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(
                TopicVisibilityPatch.serializer(),
                TopicVisibilityPatch(topicId, visibility),
            )
            send(request("/api/v1/content", token = token, body = body, method = "PATCH")) {
                json.decodeFromString(TopicVisibilityResult.serializer(), it)
            }
        }

    /** Join a class by its code. The teacher's own door, entered from the library. */
    suspend fun joinClass(token: String, code: String): ClassJoinResult = withContext(Dispatchers.IO) {
        val body = json.encodeToString(ClassJoinRequest.serializer(), ClassJoinRequest(code))
        send(request("/api/v1/classes/join", token = token, body = body, method = "POST")) {
            json.decodeFromString(ClassJoinResult.serializer(), it)
        }
    }

    // ── the exam simulator ──────────────────────────────────────────────────

    /** What the question pool holds for this learner, and how they have done. */
    suspend fun examPool(token: String, subjectId: String? = null): ExamPool = withContext(Dispatchers.IO) {
        val query = subjectId?.let { "?subjectId=$it" } ?: ""
        send(request("/api/v1/exam$query", token = token)) { json.decodeFromString(ExamPool.serializer(), it) }
    }

    /**
     * Deal a paper.
     *
     * There is no matching `submit` here in the sense of a separate endpoint: the
     * same route either builds a paper or marks one, and which it does is decided
     * by whether answers came with the request. That is deliberate on the server
     * — the paper and the marking have to agree about which questions were dealt,
     * and one route is the only way to guarantee it.
     */
    suspend fun examPaper(token: String, topicIds: List<String>, questionCount: Int = 5): ExamPaper =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(
                ExamRequest.serializer(),
                ExamRequest(topicIds = topicIds, questionCount = questionCount),
            )
            send(request("/api/v1/exam", token = token, body = body, method = "POST")) {
                json.decodeFromString(ExamPaper.serializer(), it)
            }
        }

    suspend fun markExam(
        token: String,
        topicIds: List<String>,
        answers: List<ExamAnswer>,
    ): ExamResult = withContext(Dispatchers.IO) {
        val body = json.encodeToString(
            ExamRequest.serializer(),
            ExamRequest(topicIds = topicIds, answers = answers),
        )
        send(request("/api/v1/exam", token = token, body = body, method = "POST")) {
            json.decodeFromString(ExamResult.serializer(), it)
        }
    }

    /** `GET /exam?paperId=` — one stored paper, verbatim. */
    suspend fun examPaperDoc(token: String, paperId: String): PaperDoc = withContext(Dispatchers.IO) {
        send(request("/api/v1/exam?paperId=$paperId", token = token)) {
            json.decodeFromString(PaperEnvelope.serializer(), it).paper
        }
    }

    // ── maths practice ──────────────────────────────────────────────────────

    /**
     * What may be drilled in a subject.
     *
     * The concept catalogue and the topics arrive together because a practice
     * session picks from both, and two round trips would let a learner choose a
     * concept from a catalogue the chosen subject no longer offers.
     */
    suspend fun mathsCatalogue(token: String, subjectId: String): MathsCatalogue = withContext(Dispatchers.IO) {
        send(request("/api/v1/maths?subjectId=$subjectId", token = token)) {
            json.decodeFromString(MathsCatalogue.serializer(), it)
        }
    }

    suspend fun startPractice(
        token: String,
        topicIds: List<String>,
        conceptIds: List<String> = emptyList(),
        difficulty: String = "mixed",
        count: Int = 10,
    ): MathsSession = withContext(Dispatchers.IO) {
        val body = json.encodeToString(
            MathsRequest.serializer(),
            MathsRequest(
                action = "start",
                topicIds = topicIds,
                conceptIds = conceptIds.ifEmpty { null },
                difficulty = difficulty,
                count = count,
            ),
        )
        send(request("/api/v1/maths", token = token, body = body, method = "POST")) {
            json.decodeFromString(MathsSession.serializer(), it)
        }
    }

    suspend fun markPractice(token: String, answers: List<MathsAnswer>): List<MathsMark> =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(
                MathsRequest.serializer(),
                MathsRequest(action = "mark", answers = answers),
            )
            send(request("/api/v1/maths", token = token, body = body, method = "POST")) {
                json.decodeFromString(MathsMarked.serializer(), it)
            }
        }.results

    /**
     * Claim the session's XP, once, at the end.
     *
     * Practice deliberately writes no review log and moves no schedule, so this
     * is the only thing a finished drill changes — which is why it is a separate
     * call rather than part of marking each question.
     */
    suspend fun awardPracticeXp(token: String, marks: Int, maxMarks: Int, correct: Int, total: Int): MathsXp =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(
                MathsRequest.serializer(),
                MathsRequest(action = "award_xp", marks = marks, maxMarks = maxMarks, correct = correct, total = total),
            )
            send(request("/api/v1/maths", token = token, body = body, method = "POST")) {
                json.decodeFromString(MathsXp.serializer(), it)
            }
        }

    // ── rank, lobby, achievements ───────────────────────────────────────────

    suspend fun gamification(token: String, scope: String = "weekly"): GamificationPayload = withContext(Dispatchers.IO) {
        send(request("/api/v1/gamification?scope=$scope", token = token)) {
            json.decodeFromString(GamificationPayload.serializer(), it)
        }
    }

    // ── the account ─────────────────────────────────────────────────────────

    suspend fun meDetail(token: String): MeDetail = withContext(Dispatchers.IO) {
        send(request("/api/v1/me", token = token)) { json.decodeFromString(MeDetail.serializer(), it) }
    }

    suspend fun patchMe(token: String, patch: MePatch): Unit = withContext(Dispatchers.IO) {
        val body = json.encodeToString(MePatch.serializer(), patch)
        send(request("/api/v1/me", token = token, body = body, method = "PATCH")) { it }
    }

    /**
     * `POST /me/email` — start an email change.
     *
     * The address is not swapped here. The server stores it as pending and mails
     * a one-hour link to the *new* address; only the click moves it. A phone that
     * holds a live session but not the new mailbox therefore cannot quietly take
     * the account somewhere else, which is why this is a request rather than a
     * write — and why the screen's confirmation says "check your inbox" instead
     * of "email changed".
     */
    suspend fun requestEmailChange(token: String, password: String, newEmail: String): Unit = withContext(Dispatchers.IO) {
        val body = json.encodeToString(EmailChangeRequest.serializer(), EmailChangeRequest(password, newEmail))
        send(request("/api/v1/me/email", token = token, body = body, method = "POST")) { it }
    }

    /**
     * `POST /me/password` — change the password.
     *
     * Every refresh token is revoked server-side, so the caller's own session is
     * dead the moment this returns. The caller must mint a fresh one immediately
     * (see `refresh`) or the next request will be answered 401 and the app will
     * look signed out for no visible reason.
     */
    suspend fun changePassword(token: String, currentPassword: String, newPassword: String): Unit = withContext(Dispatchers.IO) {
        val body = json.encodeToString(PasswordChangeRequest.serializer(), PasswordChangeRequest(currentPassword, newPassword))
        send(request("/api/v1/me/password", token = token, body = body, method = "POST")) { it }
    }

    /**
     * A public profile. Deliberately unauthenticated: a shared link has to open
     * for someone who is not signed in, and privacy is applied server-side.
     */
    suspend fun profile(handle: String, token: String? = null): PublicProfile = withContext(Dispatchers.IO) {
        send(request("/api/v1/profile/$handle", token = token)) {
            json.decodeFromString(PublicProfile.serializer(), it)
        }
    }

    // ── the update check ────────────────────────────────────────────────────

    /**
     * `GET /version` — the newest client the server knows about.
     *
     * Deliberately unauthenticated and the first thing the app asks on launch:
     * an install that is behind deserves to know before it does anything else,
     * and the endpoint has to work even for a session the server has since
     * refused.
     */
    suspend fun version(): VersionInfo = withContext(Dispatchers.IO) {
        send(request("/api/v1/version")) { json.decodeFromString(VersionInfo.serializer(), it) }
    }

    // ── teaching and admin consoles ──────────────────────────────────────────

    /** `GET /teacher` — my classes with per-student rosters. */
    suspend fun teacher(token: String): TeacherPayload = withContext(Dispatchers.IO) {
        send(request("/api/v1/teacher", token = token)) { json.decodeFromString(TeacherPayload.serializer(), it) }
    }

    /** `GET /content?mine=1` — the topics this account may edit, with counts. */
    suspend fun myTopics(token: String): MyTopicsPayload = withContext(Dispatchers.IO) {
        send(request("/api/v1/content?mine=1", token = token)) { json.decodeFromString(MyTopicsPayload.serializer(), it) }
    }

    /** `GET /admin` — the whole console in one payload, developers only. */
    suspend fun admin(token: String): AdminPayload = withContext(Dispatchers.IO) {
        send(request("/api/v1/admin", token = token)) { json.decodeFromString(AdminPayload.serializer(), it) }
    }

    /**
     * `POST /teacher` and `POST /admin` share the same envelope: an `action`
     * plus whatever that action needs. One door each, exactly as the web does.
     */
    suspend fun teacherAction(token: String, body: JsonObject): JsonObject = withContext(Dispatchers.IO) {
        postJson("/api/v1/teacher", token, body)
    }

    suspend fun adminAction(token: String, body: JsonObject): JsonObject = withContext(Dispatchers.IO) {
        postJson("/api/v1/admin", token, body)
    }

    private suspend fun postJson(path: String, token: String, body: JsonObject): JsonObject =
        withContext(Dispatchers.IO) {
            send(request(path, token = token, body = body.toString(), method = "POST")) {
                json.parseToJsonElement(it).jsonObject
            }
        }

    // ── media: avatar and banner uploads ────────────────────────────────────

    /**
     * The web's upload dance, driven from a phone.
     *
     * 1. `presign` — the server names where the bytes go;
     * 2. the client PUTs the bytes straight to that URL, no auth header — the
     *    presigned URL carries its own;
     * 3. `confirm` — only now does the pointer swap, so an abandoned upload
     *    never half-lands. This mirrors `settings/page.tsx` exactly.
     */
    suspend fun uploadProfileImage(token: String, kind: String, contentType: String, bytes: ByteArray): String =
        withContext(Dispatchers.IO) {
            val presigned = send(request("/api/v1/media", token = token, body = json.encodeToString(
                MediaPresignRequest.serializer(),
                MediaPresignRequest(action = "presign", kind = kind, contentType = contentType, sizeBytes = bytes.size.toLong()),
            ), method = "POST")) {
                json.decodeFromString(MediaPresign.serializer(), it)
            }
            uploadBytes(presigned.url, contentType, bytes)
            send(request("/api/v1/media", token = token, body = json.encodeToString(
                MediaConfirmRequest.serializer(),
                MediaConfirmRequest(action = "confirm", kind = kind, key = presigned.key, contentType = contentType, sizeBytes = bytes.size.toLong()),
            ), method = "POST")) {
                json.decodeFromString(MediaConfirm.serializer(), it).url
            }
        }

    suspend fun removeProfileImage(token: String, kind: String): Unit = withContext(Dispatchers.IO) {
        send(request("/api/v1/media", token = token, body = json.encodeToString(
            MediaRemoveRequest.serializer(),
            MediaRemoveRequest(action = "remove", kind = kind),
        ), method = "POST")) { it }
    }

    private fun uploadBytes(url: String, contentType: String, bytes: ByteArray): Unit = runBlocking {
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url(url)
                .put(bytes.toRequestBody(contentType.toMediaType()))
                .build()
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) throw ApiException(response.code, "upload_failed", "The image upload was rejected. Try a smaller file.")
            }
        }
    }

    /** Pull `srs_refresh` out of the login response's Set-Cookie header. */
    private fun refreshTokenFrom(headers: List<String>): String? {
        for (header in headers) {
            if (!header.startsWith("srs_refresh=")) continue
            return header.substringAfter('=').substringBefore(';').takeIf { it.isNotEmpty() }
        }
        return null
    }
}
