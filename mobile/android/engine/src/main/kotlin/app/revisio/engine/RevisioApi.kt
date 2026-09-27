package app.revisio.engine

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.serialization.json.Json

/** A signed-in session, with the refresh token the server handed us at login. */
data class AuthSession(val accessToken: String, val refreshToken: String?, val user: ApiUser)

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

    suspend fun refresh(refreshToken: String): AuthSession? = withContext(Dispatchers.IO) {
        val body = json.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken))
        client.newCall(request("/api/v1/auth/refresh", body = body, method = "POST")).execute().use { response ->
            if (!response.isSuccessful) return@withContext null
            val text = response.body?.string().orEmpty()
            val parsed = runCatching { json.decodeFromString(RefreshResponse.serializer(), text) }.getOrNull()
                ?: return@withContext null
            AuthSession(
                parsed.accessToken,
                refreshTokenFrom(response.headers("Set-Cookie")) ?: refreshToken,
                parsed.user ?: ApiUser("", "", "", "student"),
            )
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
     * A public profile. Deliberately unauthenticated: a shared link has to open
     * for someone who is not signed in, and privacy is applied server-side.
     */
    suspend fun profile(handle: String, token: String? = null): PublicProfile = withContext(Dispatchers.IO) {
        send(request("/api/v1/profile/$handle", token = token)) {
            json.decodeFromString(PublicProfile.serializer(), it)
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
