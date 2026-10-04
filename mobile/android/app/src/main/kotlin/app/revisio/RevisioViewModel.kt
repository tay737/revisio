package app.revisio

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.revisio.engine.CramSession
import app.revisio.engine.EMAIL_RE
import app.revisio.engine.FileKeyValueStore
import app.revisio.engine.GamificationPayload
import app.revisio.engine.Grading
import app.revisio.engine.Lesson
import app.revisio.engine.ExamAnswer
import app.revisio.engine.ExamPool
import app.revisio.engine.ExamQuestion
import app.revisio.engine.ExamResult
import app.revisio.engine.MathsAnswer
import app.revisio.engine.MathsCatalogue
import app.revisio.engine.MathsMark
import app.revisio.engine.MathsQuestion
import app.revisio.engine.MathsXp
import app.revisio.engine.MeDetail
import app.revisio.engine.MePatch
import app.revisio.engine.AdminPayload
import app.revisio.engine.MyTopic
import app.revisio.engine.MyTopicsPayload
import app.revisio.engine.Note
import app.revisio.engine.PaperDoc
import app.revisio.engine.StudentProgress
import app.revisio.engine.TeacherPayload
import app.revisio.engine.UpdateKind
import app.revisio.engine.UpdateStatus
import app.revisio.engine.checkForUpdate
import app.revisio.engine.OfflineStore
import app.revisio.engine.Prefs
import app.revisio.engine.PublicProfile
import app.revisio.engine.QuizCard
import app.revisio.engine.RankLadder
import app.revisio.engine.RefreshOutcome
import app.revisio.engine.RevisioApi
import app.revisio.engine.SessionStore
import app.revisio.engine.StudyMode
import app.revisio.engine.Subject
import app.revisio.engine.SyncEngine
import app.revisio.engine.Topic
import app.revisio.engine.Verdict
import app.revisio.engine.Visibility
import app.revisio.engine.toQuizCard
import app.revisio.engine.usernameProblem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

/**
 * The copy for a lost session, a lost connection and a busy server.
 *
 * These are the web's strings for the same three conditions (`src/lib/api.ts`,
 * `BUSY_MESSAGE`), because the same failure should read the same way in both
 * places — and because "Your session has ended" is the sentence that tells a
 * learner why they are suddenly signing in again.
 */
private const val SESSION_ENDED = "Your session has ended. Sign in again."
private const val OFFLINE_NOTE = "You're offline — this needs a connection."
private const val SERVER_BUSY = "We could not reach the server just now. Try that again in a moment."

/**
 * Every place the app can be — `src/components/nav/routes.ts`, ported.
 *
 * That file is the single owner of what the app's destinations are: the sidebar,
 * the bottom bar, the account sheet and the page titles all read it, so a screen
 * can never appear in one surface and be missing from another. This enum is the
 * same list with the same four-word hints, and `onBar` marks the four a thumb
 * reaches without a second tap.
 *
 * The previous five fixed slots truncated the app: Cram was on the bar while
 * Review — "clear the cards due", the one thing a learner opens the app to do —
 * had no destination of its own at all, and exam, practice and library were
 * unreachable on a phone entirely. Four + More is the web's answer, and it is
 * the first time every destination has been reachable here.
 */
enum class Destination(
    val label: String,
    val hint: String,
    /** The four the bar carries. No more, and no fewer. */
    val onBar: Boolean = false,
    /** Who may see it at all; null means everyone. */
    val roles: List<String>? = null,
) {
    TODAY("Today", "Your queue and streak", onBar = true),
    REVIEW("Review", "Clear the cards due", onBar = true),
    LEARN("Learn", "Notes behind the cards", onBar = true),
    RANK("Rank", "Ladder and weekly lobby", onBar = true),
    CRAM("Cram", "Sprint before an exam"),
    EXAM("Exam", "Sit a marked paper"),
    PRACTICE("Practice", "Generated maths drills"),
    LIBRARY("Library", "Subjects and topics"),
    SETTINGS("Settings", "Profile and account"),
    TEACHING("Teaching", "Classes and students", roles = listOf("teacher", "developer")),
    ADMIN("Admin", "Users and content", roles = listOf("developer")),
    ;

    /** `navForRole` — a learner never sees a console they cannot open. */
    fun visibleTo(role: String?): Boolean = roles == null || (role != null && roles.contains(role))

    companion object {
        /** The bar, in the web's `PRIMARY_TABS` order. */
        fun bar(role: String?): List<Destination> =
            entries.filter { it.onBar && it.visibleTo(role) }

        /** Everything one tap behind More, in `NAV` order. */
        fun overflow(role: String?): List<Destination> =
            entries.filter { !it.onBar && it.visibleTo(role) }
    }
}

/** The tab label strings the smoke tests and the bar both read. */
val Destination.isYou: Boolean get() = this == Destination.SETTINGS

/** What the user is looking at, and what the app knows right now. */
data class UiState(
    val loading: Boolean = true,
    val signedIn: Boolean = false,
    val name: String = "",
    val email: String = "",
    val online: Boolean = true,
    val destination: Destination = Destination.TODAY,
    /** Whether the More sheet is open. The shell's one piece of UI state. */
    val moreOpen: Boolean = false,
    val home: HomeState? = null,
    val pending: Int = 0,
    val message: String? = null,
    // the review loop, in whichever mode it was started
    /**
     * The reward moment. Bumped on every correct mark (small burst) and on a
     * promotion at session end (full burst) — the two celebrations the web
     * fires. The screen overlays `Confetti(trigger)`; reduced motion reads none.
     */
    val confettiTrigger: Int = 0,
    /** The session just moved the learner up a rung — the summary's flourish. */
    val promoted: Boolean = false,
    /** Total XP when the session began, so its ladder movement can be judged. */
    val xpAtSessionStart: Int? = null,
    val cards: List<QuizCard> = emptyList(),
    val index: Int = 0,
    val answer: String = "",
    val selection: String? = null,
    val feedback: Feedback? = null,
    val answered: Int = 0,
    val correct: Int = 0,
    val finished: Boolean = false,
    /** The learner ended the session early — the summary says "ended", not "complete". */
    val ended: Boolean = false,
    val inReview: Boolean = false,
    val mode: StudyMode = StudyMode.DAILY,
    val sessionTitle: String = "",
    val sessionNotes: List<Note> = emptyList(),
    val sessionId: String? = null,
    val notesOpen: Boolean = false,
    val met: Int = 0,
    val total: Int = 0,
    // the catalogue
    val subjects: List<Subject> = emptyList(),
    val subjectsLoaded: Boolean = false,
    val openSubject: String? = null,
    val topicsBySubject: Map<String, List<Topic>> = emptyMap(),
    val openTopic: String? = null,
    val lessonsByTopic: Map<String, List<Lesson>> = emptyMap(),
    val density: String = "detailed",
    // cram
    val cramTopics: List<Topic> = emptyList(),
    val cramSelected: Set<String> = emptySet(),
    val maxPerTopic: Int = 20,
    // rank
    val ranked: GamificationPayload? = null,
    val boardScope: String = "weekly",
    // the account
    val me: MeDetail? = null,
    /** The account screen's own load state: it can be loading, failed, or loaded. */
    val meLoading: Boolean = false,
    val meError: String? = null,
    val busy: Boolean = false,
    // maths practice
    /**
     * Only the subjects that can actually deal a paper.
     *
     * `mathsEnabled` is a per-subject flag on the server, so a picker that listed
     * every subject would offer drills that cannot exist — and the learner would
     * find out from a 404 rather than from the list.
     */
    val mathsSubjects: List<Subject> = emptyList(),
    val practiceSubject: String? = null,
    val mathsCatalogue: MathsCatalogue? = null,
    val practiceTopics: Set<String> = emptySet(),
    val practiceConcepts: Set<String> = emptySet(),
    val practiceDifficulty: String = "mixed",
    val practiceCount: Int = 10,
    val practicePaper: List<MathsQuestion> = emptyList(),
    val practiceIndex: Int = 0,
    val practiceAnswer: String = "",
    val practiceMark: MathsMark? = null,
    val practiceCorrect: Int = 0,
    val practiceMarks: Int = 0,
    val practiceMaxMarks: Int = 0,
    val practiceDone: Boolean = false,
    val practiceXp: MathsXp? = null,
    // the exam simulator
    val examPool: ExamPool? = null,
    val examPicked: Set<String> = emptySet(),
    val examPaper: List<ExamQuestion> = emptyList(),
    val examAnswers: Map<String, String> = emptyMap(),
    val examResult: ExamResult? = null,
    val examBusy: Boolean = false,
    /** A stored board paper opened verbatim. */
    val paperDoc: PaperDoc? = null,
    /** A public profile someone shared, and why it could not be opened. */
    val profile: PublicProfile? = null,
    val profileError: String? = null,
    val profileHandle: String? = null,
    /**
     * Settings confirmations and refusals, kept apart from the global banner.
     *
     * The website confirms each section in its own place (`Notice` at the top of
     * the page, cleared on the next action) rather than through one toast: a save
     * in Profile must never answer for a save in Security. Two fields rather than
     * one, because "Saved." and "That did not work." are different claims and a
     * single slot would have to decide which one it currently means.
     */
    val settingsNote: String? = null,
    val settingsError: String? = null,
    /** Whose save is in flight — so only that button says "Saving…". */
    val savingProfile: Boolean = false,
    val savingPassword: Boolean = false,
    val savingEmail: Boolean = false,
    // ── the update check ──────────────────────────────────────────────────
    /** Set once the server has been asked what the newest client is. */
    val update: UpdateStatus = UpdateStatus(UpdateKind.None, ""),
    /** The update card is dismissed for this run of the app. */
    val updateDismissed: Boolean = false,
    // ── teaching and admin consoles ───────────────────────────────────────
    val teacherData: TeacherPayload? = null,
    val myTopics: List<MyTopic> = emptyList(),
    val adminData: AdminPayload? = null,
    val staffBusy: Boolean = false,
    val staffNote: String? = null,
    val staffError: String? = null,
    // ── the per-student progress sheet ───────────────────────────────────
    /** Whose progress is open — opened from a roster or a users row. */
    val studentProgressFor: StaffStudentRef? = null,
    val studentProgress: StudentProgress? = null,
    val studentProgressBusy: Boolean = false,
    val studentProgressError: String? = null,
)

/**
 * The student a staff member is looking at — the roster and the admin users
 * table both open the progress sheet by id and display name, and neither
 * needs more than that.
 */
data class StaffStudentRef(val userId: String, val name: String)

data class HomeState(
    val totalXp: Int,
    val level: Int,
    val streak: Int,
    val due: Int,
    val reviewedToday: Int,
    val correctToday: Int,
    val packCards: Int,
    val packBuiltAt: String?,
    val fromCache: Boolean,
)

data class Feedback(
    /** Null when the answer was queued and this build had no key to mark it. */
    val verdict: Verdict?,
    val correctAnswer: String?,
    val explanation: String?,
    val xpAwarded: Int,
    /** True when the server has not seen this answer yet. */
    val provisional: Boolean,
)

/**
 * The app's single state owner.
 *
 * It decides one thing and only one thing on the user's behalf: whether an
 * answer goes to the server now or into the outbox for later. Everything else —
 * grading, the pack, the outbox, the queue the server picked — is the engine's
 * job.
 */
class RevisioViewModel(app: Application) : AndroidViewModel(app) {

    private val kv = FileKeyValueStore(File(app.filesDir, "revisio"))
    private val store = OfflineStore(kv)
    private val sessionStore = SessionStore(kv)
    private val api = RevisioApi(BuildConfig.API_BASE_URL)
    private val sync = SyncEngine(store, api)

    private var accessToken: String? = null
    private var cardStartedAt: Long = System.currentTimeMillis()
    /** XP the session has earned so far — the promotion check at session end. */
    private var xpThisSession = 0

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        observeConnectivity(app)
        bootstrap()
        checkUpdate()
    }

    // ── the update check ────────────────────────────────────────────────────

    /**
     * Ask the server what the newest client is, once on launch.
     *
     * The comparison is by build number (see `checkForUpdate`), and the result
     * is only ever shown — an old build that ignores it keeps working, which is
     * exactly the point: an update notice must never be the thing that stops a
     * learner from doing their reviews.
     */
    private fun checkUpdate() {
        viewModelScope.launch {
            val info = runCatching { api.version() }.getOrNull() ?: return@launch
            val mine = appBuild()
            _state.update { it.copy(update = checkForUpdate(mine, info.build, info.minBuild), updateDismissed = false) }
        }
    }

    private fun appBuild(): Int {
        val context = getApplication<Application>()
        return try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).let { info ->
                if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else info.versionCode
            }
        } catch (_: Exception) {
            0
        }
    }

    fun dismissUpdate() = _state.update { it.copy(updateDismissed = true) }

    // ── session ─────────────────────────────────────────────────────────────

    private fun bootstrap() {
        val stored = sessionStore.load()
        if (stored == null) {
            _state.update { it.copy(loading = false, signedIn = false, online = isOnline()) }
            return
        }
        // A stored refresh token means we are signed in *even offline*: the app
        // opens to the learner's own screen, not a sign-in wall, which is the
        // whole point of an app that works without a network.
        _state.update {
            it.copy(
                loading = false,
                signedIn = true,
                name = stored.user.name,
                email = stored.user.email,
                pending = store.pendingCount(),
                online = isOnline(),
            )
        }
        refreshHome()
    }

    /** What a sign-in attempt ended in, told to the screen that asked. */
    sealed interface SignInOutcome {
        data object SignedIn : SignInOutcome

        /** The server asked for the six digits, not refused — the 2FA stage. */
        data object MfaRequired : SignInOutcome

        data class Failed(val message: String) : SignInOutcome
    }

    /** What a registration attempt ended in. Registration never signs in. */
    sealed interface SignUpOutcome {
        /** `verifyUrl` is set when the deployment has no mail provider configured. */
        data class Done(val verifyUrl: String?) : SignUpOutcome

        data class Failed(val message: String) : SignUpOutcome
    }

    fun signIn(email: String, password: String, totp: String?, onDone: (SignInOutcome) -> Unit) {
        _state.update { it.copy(loading = true, message = null) }
        viewModelScope.launch {
            try {
                val session = api.login(email, password, totp)
                accessToken = session.accessToken
                sessionStore.save(session)
                _state.update {
                    it.copy(loading = false, signedIn = true, name = session.user.name, email = session.user.email)
                }
                refreshHome()
                loadSubjects()
                onDone(SignInOutcome.SignedIn)
            } catch (e: RevisioApi.MfaRequiredException) {
                _state.update { it.copy(loading = false) }
                onDone(SignInOutcome.MfaRequired)
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, message = e.message ?: "Sign in failed.") }
                onDone(SignInOutcome.Failed(e.message ?: "Sign in failed."))
            }
        }
    }

    /**
     * Create an account. The screen owns the copy that answers — check your
     * inbox, or the verification link when the deployment mails nothing — so
     * this only reports what the server said.
     */
    fun register(
        email: String,
        password: String,
        name: String,
        role: String?,
        subjectIds: List<String>,
        classCode: String?,
        note: String?,
        onDone: (SignUpOutcome) -> Unit,
    ) {
        viewModelScope.launch {
            try {
                val result = api.register(email, password, name, role, note, subjectIds.takeIf { it.isNotEmpty() }, classCode)
                onDone(SignUpOutcome.Done(result.verifyUrl))
            } catch (e: Exception) {
                onDone(SignUpOutcome.Failed(e.message ?: "Registration failed."))
            }
        }
    }

    /** The subjects the registration form offers; empty when unreachable. */
    suspend fun publicSubjects(): List<app.revisio.engine.PublicSubject> = api.publicSubjects()

    /** Re-send a verification email; `true` when the server accepted it. */
    fun resendVerification(email: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch { onDone(api.resendVerification(email)) }
    }

    fun signOut() {
        accessToken = null
        sessionStore.clear()
        store.clearPack()
        _state.update { UiState(loading = false, signedIn = false, online = it.online) }
    }

    /** The three answers a token request can have. */
    private sealed interface Token {
        data class Ready(val value: String) : Token

        /** The server rejected the session; the learner is already at sign-in. */
        data object Ended : Token

        /** We could not reach the server. The session is still good. */
        data object Unavailable : Token
    }

    /**
     * The token to call with, or why we cannot call at all.
     *
     * A refresh the server *rejects* ends the session here and now: the learner
     * goes back to sign in with a reason, instead of staying on a cached screen
     * that can never answer. A refresh we could not *complete* — offline, a 5xx,
     * a capacity refusal — leaves the session exactly as it was, because being
     * unable to ask is not the same as being told no.
     */
    private suspend fun tokenOrReason(): Token {
        accessToken?.let { return Token.Ready(it) }
        val stored = sessionStore.load() ?: return Token.Ended
        return when (val outcome = api.refresh(stored.refreshToken)) {
            is RefreshOutcome.Renewed -> {
                accessToken = outcome.session.accessToken
                sessionStore.save(outcome.session)
                Token.Ready(outcome.session.accessToken)
            }
            RefreshOutcome.Rejected -> {
                endSession(SESSION_ENDED)
                Token.Ended
            }
            RefreshOutcome.Unavailable -> Token.Unavailable
        }
    }

    /**
     * The token, for the callers that only need "can I call now?".
     *
     * It is the same three-way decision as [tokenOrReason] — a rejected refresh
     * still ends the session — but collapsed to a nullable token, because every
     * one of these callers has a cached answer to fall back on (`Today` shows the
     * stored pack). Screens that must say *why* they cannot load use
     * [tokenOrReason] through [withToken] instead.
     */
    private suspend fun ensureToken(): String? =
        when (val token = tokenOrReason()) {
            is Token.Ready -> token.value
            else -> null
        }

    /**
     * End the session on this device.
     *
     * The cached pack deliberately stays: it is the queue the learner was given,
     * and throwing it away plus needing a round trip to get it back is a worse
     * experience than a sign-in prompt with their cards still on the screen. What
     * goes is the credential that no longer opens anything.
     */
    private fun endSession(note: String) {
        accessToken = null
        sessionStore.clear()
        _state.update {
            it.copy(
                signedIn = false,
                me = null,
                meLoading = false,
                meError = null,
                busy = false,
                message = note,
            )
        }
    }

    /**
     * Run a backend call if there is a token, reporting failures as a banner
     * rather than a crash. The app is offline-first, so "no network" is an
     * ordinary state and not an error to shout about.
     *
     * `onFailure` exists for screens that own their own error state — the
     * account screen shows an error with a retry, because a page whose only
     * other state is "loading" has no way to say that the request failed.
     */
    private fun <T> withToken(
        block: suspend (String) -> T,
        // Before `onResult` so that the trailing-lambda call sites keep binding
        // to the result handler, which is how all of the reading screens call it.
        onFailure: ((String) -> Unit)? = null,
        onResult: (T) -> Unit,
    ) {
        viewModelScope.launch {
            when (val token = tokenOrReason()) {
                // endSession() has already surfaced the reason on the sign-in
                // screen; there is nothing for this call to add.
                is Token.Ended -> return@launch
                is Token.Unavailable -> {
                    val note = if (_state.value.online) SERVER_BUSY else OFFLINE_NOTE
                    _state.update { it.copy(message = note, busy = false) }
                    onFailure?.invoke(note)
                }
                is Token.Ready ->
                    runCatching { block(token.value) }
                        .onSuccess { onResult(it) }
                        .onFailure { error ->
                            val note = error.message ?: "That did not work."
                            _state.update { s -> s.copy(message = note, busy = false) }
                            onFailure?.invoke(note)
                        }
            }
        }
    }

    // ── home ────────────────────────────────────────────────────────────────

    fun refreshHome() {
        viewModelScope.launch {
            if (_state.value.online) {
                val token = ensureToken()
                if (token != null) {
                    val me = runCatching { api.me(token) }.getOrNull()
                    val pack = runCatching { api.fetchPack(token) }.getOrNull()
                    if (pack != null) store.savePack(pack)
                    val cached = pack ?: store.cachedPack()
                    if (me != null || cached != null) {
                        val g = me?.gamification
                        _state.update {
                            it.copy(
                                loading = false,
                                name = me?.name?.takeIf { n -> n.isNotBlank() } ?: it.name,
                                home = HomeState(
                                    totalXp = g?.totalXp ?: 0,
                                    level = g?.level ?: 0,
                                    streak = g?.streak ?: 0,
                                    due = me?.today?.due ?: (cached?.cards?.size ?: 0),
                                    reviewedToday = me?.today?.reviewed ?: 0,
                                    correctToday = me?.today?.correct ?: 0,
                                    packCards = cached?.cards?.size ?: 0,
                                    packBuiltAt = cached?.builtAt,
                                    fromCache = false,
                                ),
                                pending = store.pendingCount(),
                            )
                        }
                        drainOutbox(token)
                        return@launch
                    }
                }
            }
            // Offline (or the server was unreachable): show what we already have.
            val cached = store.cachedPack()
            _state.update {
                it.copy(
                    loading = false,
                    home = HomeState(
                        totalXp = it.home?.totalXp ?: 0,
                        level = it.home?.level ?: 0,
                        streak = it.home?.streak ?: 0,
                        due = cached?.cards?.size ?: 0,
                        reviewedToday = it.home?.reviewedToday ?: 0,
                        correctToday = it.home?.correctToday ?: 0,
                        packCards = cached?.cards?.size ?: 0,
                        packBuiltAt = cached?.builtAt,
                        fromCache = true,
                    ),
                    pending = store.pendingCount(),
                )
            }
        }
    }

    private suspend fun drainOutbox(token: String) {
        val outcome = sync.syncOutbox(token)
        _state.update { it.copy(pending = outcome.remaining) }
    }

    // ── navigation ──────────────────────────────────────────────────────────

    /**
     * Go somewhere, and load whatever that destination needs to be useful.
     *
     * A screen that opened onto an empty state it had not asked the server for
     * would look broken, so the fetch travels with the navigation — and the More
     * sheet closes in the same update, because a sheet left open across a
     * navigation would sit on top of the page it just opened.
     */
    fun go(destination: Destination) {
        _state.update { it.copy(destination = destination, moreOpen = false, message = null) }
        when (destination) {
            Destination.LEARN -> if (!_state.value.subjectsLoaded) loadSubjects()
            Destination.CRAM -> if (_state.value.cramTopics.isEmpty()) loadCramTopics()
            Destination.RANK -> loadProgress(_state.value.boardScope)
            Destination.SETTINGS -> loadMe()
            Destination.TODAY -> refreshHome()
            Destination.REVIEW -> reviewNeeds()
            Destination.LIBRARY -> loadSubjects()
            Destination.PRACTICE -> loadMathsSubjects()
            Destination.EXAM -> loadExamPool()
            Destination.TEACHING -> if (_state.value.teacherData == null) loadTeaching()
            Destination.ADMIN -> if (_state.value.adminData == null) loadAdmin()
        }
    }

    /** `selectTab` under its old name, for the shell's bar. */
    fun selectTab(tab: Destination) = go(tab)

    fun openMore() = _state.update { it.copy(moreOpen = true) }

    fun closeMore() = _state.update { it.copy(moreOpen = false) }

    fun setDensity(density: String) = _state.update { it.copy(density = density) }

    fun setMaxPerTopic(value: Int) =
        _state.update { it.copy(maxPerTopic = value.coerceIn(1, 50)) }

    fun toggleNotes() = _state.update { it.copy(notesOpen = !it.notesOpen) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    // ── the catalogue: subjects → topics → notes ─────────────────────────────

    fun loadSubjects() {
        _state.update { it.copy(busy = true) }
        withToken({ api.subjects(it) }) { subjects ->
            _state.update { it.copy(subjects = subjects, subjectsLoaded = true, busy = false) }
        }
    }

    fun toggleSubject(subjectId: String) {
        val open = _state.value.openSubject == subjectId
        _state.update { it.copy(openSubject = if (open) null else subjectId, openTopic = null) }
        if (open || _state.value.topicsBySubject.containsKey(subjectId)) return
        withToken({ api.topics(it, subjectId) }) { topics ->
            _state.update { it.copy(topicsBySubject = it.topicsBySubject + (subjectId to topics), busy = false) }
        }
    }

    fun toggleTopic(topicId: String) {
        val open = _state.value.openTopic == topicId
        _state.update { it.copy(openTopic = if (open) null else topicId) }
        if (open || _state.value.lessonsByTopic.containsKey(topicId)) return
        withToken({ api.lessons(it, topicId) }) { lessons ->
            _state.update { it.copy(lessonsByTopic = it.lessonsByTopic + (topicId to lessons), busy = false) }
        }
    }

    fun enroll(subjectId: String) {
        withToken({ api.enroll(it, subjectId) }) {
            _state.update { s ->
                s.copy(
                    subjects = s.subjects.map { if (it.id == subjectId) it.copy(enrolled = true) else it },
                    busy = false,
                )
            }
        }
    }

    // ── cram ────────────────────────────────────────────────────────────────

    fun loadCramTopics() {
        _state.update { it.copy(busy = true) }
        withToken({ api.cramTopics(it) }) { topics ->
            _state.update { it.copy(cramTopics = topics, busy = false) }
        }
    }

    fun toggleCramTopic(topicId: String) {
        _state.update {
            val selected = if (it.cramSelected.contains(topicId)) it.cramSelected - topicId else it.cramSelected + topicId
            it.copy(cramSelected = selected)
        }
    }

    // ── rank ────────────────────────────────────────────────────────────────

    fun loadProgress(scope: String = _state.value.boardScope) {
        _state.update { it.copy(boardScope = scope, busy = true) }
        withToken({ api.gamification(it, scope) }) { payload ->
            _state.update { it.copy(ranked = payload, busy = false) }
        }
    }

    // ── the account ─────────────────────────────────────────────────────────

    fun loadMe() {
        _state.update { it.copy(meLoading = true, meError = null) }
        withToken(
            block = { api.meDetail(it) },
            onResult = { me -> _state.update { it.copy(me = me, meLoading = false, meError = null) } },
            onFailure = { note -> _state.update { it.copy(meLoading = false, meError = note) } },
        )
    }

    fun saveProfile(name: String, username: String, nickname: String, bio: String, emoji: String, color: String) {
        usernameProblem(username)?.let { problem ->
            _state.update { it.copy(settingsError = problem, settingsNote = null) }
            return
        }
        val patch = MePatch(
            name = name.trim().ifBlank { null },
            username = username.trim().lowercase().ifBlank { null },
            nickname = nickname.trim().ifBlank { null },
            bio = bio.trim().ifBlank { null },
            avatarEmoji = emoji.trim().ifBlank { null },
            avatarColor = color,
        )
        _state.update { it.copy(savingProfile = true, settingsError = null, settingsNote = null) }
        withToken(
            block = { api.patchMe(it, patch); api.meDetail(it) },
            onResult = { me ->
                _state.update { it.copy(me = me, savingProfile = false, settingsNote = "Profile saved.") }
            },
            onFailure = { note -> _state.update { it.copy(savingProfile = false, settingsError = note) } },
        )
    }

    /** The banner's wash, saved through the same `/me` door as the avatar's. */
    fun saveBannerColor(color: String) {
        _state.update { it.copy(savingProfile = true, settingsError = null, settingsNote = null) }
        withToken(
            block = { api.patchMe(it, MePatch(bannerColor = color)); api.meDetail(it) },
            onResult = { me ->
                _state.update { it.copy(me = me, savingProfile = false, settingsNote = "Banner saved.") }
            },
            onFailure = { note -> _state.update { it.copy(savingProfile = false, settingsError = note) } },
        )
    }

    /**
     * Upload a profile image — the web's presign → PUT → confirm dance.
     *
     * The web filters to ≤5 MB before starting; the phone does the same check
     * locally so the refusal is instant rather than a round trip.
     */
    fun uploadImage(kind: String, bytes: ByteArray, contentType: String) {
        if (bytes.size > 5 * 1024 * 1024) {
            _state.update { it.copy(settingsError = "That image is over 5 MB — pick a smaller one.", settingsNote = null) }
            return
        }
        _state.update { it.copy(savingProfile = true, settingsError = null, settingsNote = null) }
        withToken(
            block = { api.uploadProfileImage(it, kind, contentType, bytes) },
            onResult = {
                viewModelScope.launch {
                    val token = ensureToken()
                    val me = token?.let { t -> runCatching { api.meDetail(t) }.getOrNull() }
                    _state.update {
                        it.copy(me = me ?: it.me, savingProfile = false, settingsNote = "Image updated.")
                    }
                }
            },
            onFailure = { note -> _state.update { it.copy(savingProfile = false, settingsError = note) } },
        )
    }

    fun removeImage(kind: String) {
        _state.update { it.copy(savingProfile = true, settingsError = null, settingsNote = null) }
        withToken(
            block = { api.removeProfileImage(it, kind) },
            onResult = {
                viewModelScope.launch {
                    val token = ensureToken()
                    val me = token?.let { t -> runCatching { api.meDetail(t) }.getOrNull() }
                    _state.update {
                        it.copy(me = me ?: it.me, savingProfile = false, settingsNote = "Image removed.")
                    }
                }
            },
            onFailure = { note -> _state.update { it.copy(savingProfile = false, settingsError = note) } },
        )
    }

    /**
     * A privacy toggle.
     *
     * The web writes the switch optimistically and then puts it *back* if the
     * save does not land, so the control never shows a state the server does not
     * have. This does the same: patch first, and on failure reload the account so
     * the switch returns to the stored value.
     */
    fun setVisibility(visibility: Visibility) {
        _state.update { state ->
            state.copy(me = state.me?.copy(profileVisibility = visibility), settingsError = null, settingsNote = null)
        }
        withToken(
            block = { api.patchMe(it, MePatch(profileVisibility = visibility)); api.meDetail(it) },
            onResult = { me -> _state.update { it.copy(me = me, settingsNote = "Privacy updated.") } },
            onFailure = { note ->
                _state.update { it.copy(settingsError = note) }
                loadMe()
            },
        )
    }

    fun setLeaderboardOptOut(optOut: Boolean) {
        _state.update { state ->
            state.copy(me = state.me?.copy(leaderboardOptOut = optOut), settingsError = null, settingsNote = null)
        }
        withToken(
            block = { api.patchMe(it, MePatch(leaderboardOptOut = optOut)); api.meDetail(it) },
            onResult = { me -> _state.update { it.copy(me = me, settingsNote = "Saved.") } },
            onFailure = { note ->
                _state.update { it.copy(settingsError = note) }
                loadMe()
            },
        )
    }

    fun setNoteDensity(density: String) = savePrefs(Prefs(noteDensity = density, reducedMotion = _state.value.me?.prefs?.reducedMotion ?: false))

    fun setReducedMotion(reduced: Boolean) = savePrefs(Prefs(noteDensity = _state.value.me?.prefs?.noteDensity ?: "detailed", reducedMotion = reduced))

    private fun savePrefs(prefs: Prefs) {
        _state.update { state ->
            state.copy(
                density = prefs.noteDensity,
                me = state.me?.copy(prefs = prefs),
                settingsError = null,
                settingsNote = null,
            )
        }
        withToken(
            block = { api.patchMe(it, MePatch(prefs = prefs)); api.meDetail(it) },
            onResult = { me -> _state.update { it.copy(me = me, settingsNote = "Saved.") } },
            onFailure = { note ->
                _state.update { it.copy(settingsError = note) }
                loadMe()
            },
        )
    }

    /**
     * Start an email change. Nothing about `me` changes on success — the address
     * is pending until the link is clicked — so the confirmation has to say where
     * to look rather than claim the change happened.
     */
    fun requestEmailChange(password: String, newEmail: String) {
        val address = newEmail.trim().lowercase()
        if (password.isBlank() || !EMAIL_RE.matches(address)) {
            _state.update { it.copy(settingsError = "Enter your password and a valid new email address.", settingsNote = null) }
            return
        }
        _state.update { it.copy(savingEmail = true, settingsError = null, settingsNote = null) }
        withToken(
            block = { api.requestEmailChange(it, password, address) },
            onResult = {
                _state.update {
                    it.copy(savingEmail = false, settingsNote = "Check $address — the link to confirm arrives by email.")
                }
            },
            onFailure = { note -> _state.update { it.copy(savingEmail = false, settingsError = note) } },
        )
    }

    /**
     * Change the password, then re-mint this device's session.
     *
     * The server revokes *every* refresh token as part of the change, so the
     * credential this app is holding is dead the instant the call returns. The
     * web re-signs in quietly for exactly this reason; the phone does the same by
     * refreshing with the token it still has in hand, and only falls back to the
     * sign-in screen if that refresh is refused.
     */
    fun changePassword(currentPassword: String, newPassword: String, confirmPassword: String) {
        if (newPassword != confirmPassword) {
            _state.update { it.copy(settingsError = "The two new passwords do not match.", settingsNote = null) }
            return
        }
        if (newPassword.length < 8) {
            _state.update { it.copy(settingsError = "New password must be at least 8 characters.", settingsNote = null) }
            return
        }
        _state.update { it.copy(savingPassword = true, settingsError = null, settingsNote = null) }
        viewModelScope.launch {
            val stored = sessionStore.load()
            when (val token = tokenOrReason()) {
                is Token.Ready -> runCatching {
                    api.changePassword(token.value, currentPassword, newPassword)
                }
                    .onSuccess {
                        val renewed = stored?.refreshToken?.let { refresh -> api.refresh(refresh) }
                        when (renewed) {
                            is RefreshOutcome.Renewed -> {
                                accessToken = renewed.session.accessToken
                                sessionStore.save(renewed.session)
                                _state.update {
                                    it.copy(savingPassword = false, settingsNote = "Password changed. Other devices have been signed out.")
                                }
                            }
                            // The old refresh token died with the change and the
                            // new one never arrived: there is nothing left to hold.
                            else -> endSession("Password changed. Sign in again on this device.")
                        }
                    }
                    .onFailure { error ->
                        val note = error.message ?: "We could not change the password."
                        _state.update { it.copy(savingPassword = false, settingsError = note) }
                    }
                is Token.Unavailable ->
                    _state.update {
                        it.copy(
                            savingPassword = false,
                            settingsError = if (_state.value.online) SERVER_BUSY else OFFLINE_NOTE,
                        )
                    }
                is Token.Ended -> _state.update { it.copy(savingPassword = false) }
            }
        }
    }

    fun dismissSettingsNotice() = _state.update { it.copy(settingsNote = null, settingsError = null) }

    // ── Review ──────────────────────────────────────────────────────────────

    /**
     * Review's own destination, which is the loop and nothing else.
     *
     * The web splits Today from Review on purpose: Today is the dashboard — the
     * streak, the numbers, what is waiting — while `/review` is the thing you go
     * to in order to *do* it. Folding the second into the first was how the phone
     * ended up with the bar's most valuable slot spent on a screen nobody needs a
     * second time. This brings the same split, and starting the loop is the same
     * call Today makes, so the two can never deal different cards.
     */
    private fun reviewNeeds() {
        if (_state.value.home == null) refreshHome()
    }

    // ── the library ─────────────────────────────────────────────────────────

    /**
     * Who may see a topic this learner owns.
     *
     * The server applies this to the topic's cards and lessons together, and it is
     * the only knob a learner has over their own content — so the screen writes it
     * and reads back the counts that changed, rather than assuming a number.
     */
    fun setTopicVisibility(topicId: String, visibility: String) {
        _state.update { it.copy(busy = true) }
        withToken(
            block = { api.setTopicVisibility(it, topicId, visibility) },
            onResult = { counts ->
                _state.update { state ->
                    state.copy(
                        busy = false,
                        message = "Visibility saved · ${counts.cards} cards, ${counts.lessons} lessons.",
                    )
                }
                // Re-read the open subject so the counts on screen are the ones
                // the server just reported, not the ones from before the write.
                val open = _state.value.openSubject
                if (open != null) {
                    _state.update { it.copy(topicsBySubject = it.topicsBySubject - open) }
                    _state.update { it.copy(openSubject = null) }
                    toggleSubject(open)
                }
            },
            onFailure = { note -> _state.update { it.copy(busy = false, message = note) } },
        )
    }

    fun joinClass(code: String) {
        if (code.isBlank()) return
        _state.update { it.copy(busy = true) }
        withToken(
            block = { api.joinClass(it, code.trim()) },
            onResult = { result ->
                _state.update { it.copy(busy = false, message = "Joined ${result.joined.name}.") }
                loadSubjects()
            },
            onFailure = { note -> _state.update { it.copy(busy = false, message = note) } },
        )
    }

    // ── maths practice ──────────────────────────────────────────────────────

    /** The subjects that can deal a paper — `mathsEnabled` decides. */
    fun loadMathsSubjects() {
        _state.update { it.copy(busy = true) }
        withToken(
            block = { api.subjects(it) },
            onResult = { subjects ->
                val playable = subjects.filter { it.mathsEnabled }
                _state.update { it.copy(mathsSubjects = playable, busy = false) }
                // One playable subject is not a choice, so it is made for them —
                // the same shortcut the web takes.
                val only = playable.singleOrNull()
                if (only != null && _state.value.practiceSubject != only.id) selectPracticeSubject(only.id)
            },
            onFailure = { note -> _state.update { it.copy(busy = false, message = note) } },
        )
    }

    fun selectPracticeSubject(subjectId: String) {
        _state.update {
            it.copy(
                practiceSubject = subjectId,
                mathsCatalogue = null,
                practiceTopics = emptySet(),
                practiceConcepts = emptySet(),
            )
        }
        withToken(
            block = { api.mathsCatalogue(it, subjectId) },
            onResult = { catalogue -> _state.update { it.copy(mathsCatalogue = catalogue) } },
            onFailure = { note ->
                _state.update { it.copy(mathsCatalogue = MathsCatalogue(), message = note) }
            },
        )
    }

    fun togglePracticeTopic(id: String) = _state.update {
        it.copy(practiceTopics = if (it.practiceTopics.contains(id)) it.practiceTopics - id else it.practiceTopics + id)
    }

    fun togglePracticeConcept(id: String) = _state.update {
        it.copy(practiceConcepts = if (it.practiceConcepts.contains(id)) it.practiceConcepts - id else it.practiceConcepts + id)
    }

    fun setPracticeDifficulty(value: String) = _state.update { it.copy(practiceDifficulty = value) }

    fun setPracticeCount(value: Int) = _state.update { it.copy(practiceCount = value.coerceIn(1, 30)) }

    fun startPractice() {
        val subject = _state.value.practiceSubject
        if (subject == null) {
            _state.update { it.copy(message = "Pick a subject to practise.") }
            return
        }
        _state.update { it.copy(busy = true) }
        withToken(
            block = {
                api.startPractice(
                    token = it,
                    topicIds = _state.value.practiceTopics.toList(),
                    conceptIds = _state.value.practiceConcepts.toList(),
                    difficulty = _state.value.practiceDifficulty,
                    count = _state.value.practiceCount,
                )
            },
            onResult = { session ->
                _state.update {
                    it.copy(
                        busy = false,
                        practicePaper = session.paper,
                        practiceIndex = 0,
                        practiceAnswer = "",
                        practiceMark = null,
                        practiceCorrect = 0,
                        practiceMarks = 0,
                        practiceMaxMarks = 0,
                        practiceDone = false,
                        practiceXp = null,
                    )
                }
            },
            onFailure = { note -> _state.update { it.copy(busy = false, message = note) } },
        )
    }

    fun setPracticeAnswer(value: String) = _state.update { it.copy(practiceAnswer = value) }

    /**
     * Mark one question.
     *
     * Per question rather than the whole paper at the end, because the server's
     * marking returns the worked solution for a wrong answer and the whole point
     * of practice is to read that while the attempt is still in your head.
     */
    fun markPractice() {
        val state = _state.value
        val question = state.practicePaper.getOrNull(state.practiceIndex) ?: return
        if (state.practiceMark != null || state.busy) return
        _state.update { it.copy(busy = true) }
        withToken(
            block = { api.markPractice(it, listOf(MathsAnswer(question.questionId, state.practiceAnswer))) },
            onResult = { results ->
                val mark = results.firstOrNull() ?: return@withToken
                _state.update {
                    it.copy(
                        busy = false,
                        practiceMark = mark,
                        practiceCorrect = it.practiceCorrect + if (mark.correct) 1 else 0,
                        practiceMarks = it.practiceMarks + if (mark.correct) mark.marks else 0,
                        practiceMaxMarks = it.practiceMaxMarks + mark.marks,
                    )
                }
            },
            onFailure = { note -> _state.update { it.copy(busy = false, message = note) } },
        )
    }

    fun nextPracticeQuestion() {
        val state = _state.value
        if (state.practiceIndex + 1 >= state.practicePaper.size) {
            _state.update { it.copy(practiceDone = true, practiceMark = null) }
            // One call per finished session: practice writes no review log and
            // moves no schedule, so the XP is the only thing it changes.
            withToken(
                block = {
                    api.awardPracticeXp(
                        token = it,
                        marks = state.practiceMarks,
                        maxMarks = state.practiceMaxMarks.coerceAtLeast(1),
                        correct = state.practiceCorrect,
                        total = state.practicePaper.size.coerceAtLeast(1),
                    )
                },
                onResult = { xp -> _state.update { it.copy(practiceXp = xp) } },
            )
        } else {
            _state.update { it.copy(practiceIndex = it.practiceIndex + 1, practiceAnswer = "", practiceMark = null) }
        }
    }

    fun endPractice() = _state.update {
        it.copy(
            practicePaper = emptyList(),
            practiceIndex = 0,
            practiceAnswer = "",
            practiceMark = null,
            practiceDone = false,
            practiceXp = null,
        )
    }

    // ── the exam simulator ──────────────────────────────────────────────────

    fun loadExamPool() {
        _state.update { it.copy(busy = true) }
        withToken(
            block = { api.examPool(it) },
            onResult = { pool -> _state.update { it.copy(examPool = pool, busy = false) } },
            onFailure = { note ->
                _state.update { it.copy(examPool = ExamPool(), busy = false, message = note) }
            },
        )
    }

    fun toggleExamTopic(id: String) = _state.update {
        it.copy(examPicked = if (it.examPicked.contains(id)) it.examPicked - id else it.examPicked + id)
    }

    fun startExam(questionCount: Int = 5) {
        val picked = _state.value.examPicked.toList()
        if (picked.isEmpty()) {
            _state.update { it.copy(message = "Pick at least one topic to sit a paper on.") }
            return
        }
        _state.update { it.copy(examBusy = true) }
        withToken(
            block = { api.examPaper(it, picked, questionCount) },
            onResult = { paper ->
                _state.update {
                    it.copy(examBusy = false, examPaper = paper.paper, examAnswers = emptyMap(), examResult = null)
                }
            },
            onFailure = { note -> _state.update { it.copy(examBusy = false, message = note) } },
        )
    }

    /** One answer, kept by question id until the whole script is handed in. */
    fun setExamAnswer(questionId: String, value: String) = _state.update {
        it.copy(examAnswers = it.examAnswers + (questionId to value))
    }

    fun submitExam() {
        val state = _state.value
        if (state.examPaper.isEmpty()) return
        _state.update { it.copy(examBusy = true) }
        val answers = state.examPaper.map { question ->
            val given = state.examAnswers[question.id].orEmpty()
            // A multiple-choice question sends the chosen option; a free response
            // sends prose. Which one it is comes from the paper, not from whether
            // the string happens to look like an option.
            if (question.kind == "mcq") ExamAnswer(question.id, selectedOptionId = given.ifBlank { null })
            else ExamAnswer(question.id, answer = given)
        }
        withToken(
            block = { api.markExam(it, state.examPicked.toList(), answers) },
            onResult = { result ->
                _state.update { it.copy(examBusy = false, examResult = result) }
                refreshHome()
            },
            onFailure = { note -> _state.update { it.copy(examBusy = false, message = note) } },
        )
    }

    fun endExam() = _state.update {
        it.copy(examPaper = emptyList(), examAnswers = emptyMap(), examResult = null)
    }

    /** One stored paper, verbatim — opened from the pool's papers list. */
    fun loadPaperDoc(paperId: String) {
        _state.update { it.copy(examBusy = true) }
        withToken(
            block = { api.examPaperDoc(it, paperId) },
            onResult = { doc -> _state.update { it.copy(examBusy = false, paperDoc = doc) } },
            onFailure = { note -> _state.update { it.copy(examBusy = false, message = note) } },
        )
    }

    fun closePaperDoc() = _state.update { it.copy(paperDoc = null) }

    // ── teaching and admin consoles ──────────────────────────────────────────

    /** Everything the Teaching screen reads, in one go — as the web's page does. */
    fun loadTeaching() {
        _state.update { it.copy(staffBusy = true, staffNote = null, staffError = null) }
        withToken(
            block = { token ->
                val classes = api.teacher(token)
                val topics = runCatching { api.myTopics(token) }.getOrNull()
                classes to topics
            },
            onResult = { (classes, topics) ->
                _state.update {
                    it.copy(
                        staffBusy = false,
                        teacherData = classes,
                        myTopics = topics?.topics ?: emptyList(),
                    )
                }
            },
            onFailure = { note -> _state.update { it.copy(staffBusy = false, staffError = note) } },
        )
    }

    fun loadAdmin() {
        _state.update { it.copy(staffBusy = true, staffNote = null, staffError = null) }
        withToken(
            block = { api.admin(it) },
            onResult = { data -> _state.update { it.copy(staffBusy = false, adminData = data) } },
            onFailure = { note -> _state.update { it.copy(staffBusy = false, staffError = note) } },
        )
    }

    /**
     * One staff action, then re-read whatever it changed.
     *
     * The web's `post()` confirms in a `Notice` and reloads; this is the same
     * shape — the note lands in `staffNote`, the error in `staffError`, and the
     * console's data is refreshed so the screen never shows a state the server
     * has already moved past.
     */
    fun staffAction(admin: Boolean, body: kotlinx.serialization.json.JsonObject, okMsg: String) {
        _state.update { it.copy(staffBusy = true, staffNote = null, staffError = null) }
        withToken(
            block = { token ->
                if (admin) api.adminAction(token, body) else api.teacherAction(token, body)
            },
            onResult = {
                _state.update { it.copy(staffBusy = false, staffNote = okMsg) }
                if (admin) loadAdmin() else loadTeaching()
            },
            onFailure = { note -> _state.update { it.copy(staffBusy = false, staffError = note) } },
        )
    }

    fun clearStaffNote() = _state.update { it.copy(staffNote = null, staffError = null) }

    // ── the per-student progress sheet ──────────────────────────────────────

    /**
     * Open one learner's progress, the web's `StudentProgressPanel`.
     *
     * The sheet is its own read, not a slice of the console: the roster's
     * weekly numbers cannot answer "what are they actually answering?", and
     * this payload can. Loading, error and empty each state themselves, since
     * a teacher who taps a silent student deserves to know whether the silence
     * is theirs or the network's.
     */
    fun openStudentProgress(student: StaffStudentRef) {
        _state.update {
            it.copy(
                studentProgressFor = student,
                studentProgress = null,
                studentProgressBusy = true,
                studentProgressError = null,
            )
        }
        withToken(
            block = { api.studentProgress(it, student.userId) },
            onResult = { data -> _state.update { it.copy(studentProgress = data, studentProgressBusy = false) } },
            onFailure = { note -> _state.update { it.copy(studentProgressBusy = false, studentProgressError = note) } },
        )
    }

    fun closeStudentProgress() = _state.update {
        it.copy(studentProgressFor = null, studentProgress = null, studentProgressError = null)
    }

    // ── a public profile ────────────────────────────────────────────────────

    /**
     * Open someone's shared profile.
     *
     * Deliberately unauthenticated on the server: a shared link has to open for
     * someone who is not signed in, and privacy is applied server-side, so a
     * hidden field arrives absent rather than hidden here.
     */
    fun openProfile(handle: String) {
        val clean = handle.trim().trimStart('@').removePrefix("u/").trim('/')
        if (clean.isEmpty()) return
        _state.update { it.copy(profileHandle = clean, profile = null, profileError = null) }
        viewModelScope.launch {
            runCatching { api.profile(clean, accessToken) }
                .onSuccess { loaded -> _state.update { it.copy(profile = loaded, profileError = null) } }
                .onFailure { error ->
                    _state.update {
                        it.copy(
                            profile = null,
                            profileError = error.message ?: "We could not open that profile.",
                        )
                    }
                }
        }
    }

    fun closeProfile() = _state.update { it.copy(profile = null, profileError = null, profileHandle = null) }

    // ── the review loop, in any mode ────────────────────────────────────────

    /** Today's queue: the session the app carries offline, keys and all. */
    fun startTodayReview() {
        viewModelScope.launch {
            if (_state.value.online) {
                ensureToken()?.let { token ->
                    runCatching { api.fetchPack(token) }.getOrNull()?.let { store.savePack(it) }
                }
            }
            val pack = store.cachedPack()
            if (pack == null || pack.cards.isEmpty()) {
                _state.update {
                    it.copy(message = "No cards saved on this device yet. Connect once to download today's session.")
                }
                return@launch
            }
            begin(pack.cards.map { it.toQuizCard() }, StudyMode.DAILY, emptyList(), "Today", null, 0, 0)
        }
    }

    /**
     * First exposure.
     *
     * The server picks the *unseen* cards and sends the notes with them, because
     * a first attempt at material you have not read is a guess. From here the
     * session is the ordinary review loop with `mode = learn`.
     */
    fun startLearn(topicId: String) {
        val topic = _state.value.topicsBySubject.values.flatten().find { it.id == topicId }
        val title = topic?.name ?: "Learning"
        _state.update { it.copy(busy = true) }
        withToken({ api.firstExposure(it, topicId, 4) }) { exposure ->
            val cards = exposure.batch.map { card -> card.toQuizCard() }
            if (cards.isEmpty()) {
                _state.update { it.copy(busy = false, message = "Every card in ${exposure.topic.name} has been met. Try cramming it instead.") }
                return@withToken
            }
            _state.update { it.copy(busy = false) }
            begin(
                cards = cards,
                mode = StudyMode.LEARN,
                notes = exposure.notes.map { if (it.topicId == null) it.copy(topicId = topicId) else it },
                title = exposure.topic.name.ifBlank { title },
                sessionId = null,
                met = exposure.progress.met,
                total = exposure.progress.total,
            )
        }
    }

    /**
     * Cram.
     *
     * The server deals a fixed number per topic and hands back the notes at the
     * chosen density. Nothing here touches the scheduler — that is what cramming
     * means — but the marks are still the server's.
     */
    fun startCram() {
        val selected = _state.value.cramSelected.toList()
        if (selected.isEmpty()) {
            _state.update { it.copy(message = "Pick at least one topic to cram.") }
            return
        }
        val density = _state.value.density
        val max = _state.value.maxPerTopic
        _state.update { it.copy(busy = true) }
        withToken({ api.cram(it, selected, max, density) }) { session: CramSession ->
            val cards = session.queue.map { card -> card.toQuizCard() }
            if (cards.isEmpty()) {
                _state.update { it.copy(busy = false, message = "Those topics have no questions to cram yet.") }
                return@withToken
            }
            _state.update { it.copy(busy = false) }
            val names = _state.value.cramTopics.filter { selected.contains(it.id) }.map { it.name }
            begin(
                cards = cards,
                mode = StudyMode.CRAM,
                notes = session.notes,
                title = if (names.size == 1) names.first() else "${names.size} topics",
                sessionId = session.sessionId,
                met = 0,
                total = cards.size,
            )
        }
    }

    private fun begin(
        cards: List<QuizCard>,
        mode: StudyMode,
        notes: List<Note>,
        title: String,
        sessionId: String?,
        met: Int,
        total: Int,
    ) {
        cardStartedAt = System.currentTimeMillis()
        xpThisSession = 0
        _state.update {
            it.copy(
                xpAtSessionStart = _state.value.home?.totalXp,
                cards = cards,
                index = 0,
                answer = "",
                selection = null,
                feedback = null,
                answered = 0,
                correct = 0,
                finished = false,
                inReview = true,
                mode = mode,
                sessionNotes = notes,
                sessionTitle = title,
                sessionId = sessionId,
                notesOpen = false,
                confettiTrigger = 0,
                promoted = false,
                met = met,
                total = total,
                message = null,
            )
        }
    }

    /**
     * Whether the typed cloze answer is already exactly right — the input ticks
     * green and Enter becomes "continue" instead of "check".
     *
     * Instant marking, the web's own loop (`ReviewClient`'s `autoMark`): while a
     * cloze answer is being typed it is graded with the same rules the server
     * will apply, from the key the pack already carries. The moment it is right
     * the field wears the game colour and the CTA says so. Wrong answers never
     * auto-mark — nothing red appears until the learner actually submits — and
     * first-exposure cards carry no key by design, so there the flow is
     * unchanged.
     */
    fun autoMarkFor(state: UiState): Boolean {
        if (state.feedback != null) return false
        val card = state.cards.getOrNull(state.index) ?: return false
        if (card.kind != "cloze") return false
        val answer = state.answer.trim()
        if (answer.isEmpty()) return false
        return Grading.previewVerdict(card, answer, null)?.correct == true
    }

    fun setAnswer(text: String) = _state.update { it.copy(answer = text) }

    /** Where the XP total moved to — remembered for the promotion check. */
    private fun noteXp(xp: Int) {
        xpThisSession += xp
    }

    fun setSelection(optionId: String) = _state.update { it.copy(selection = optionId) }

    fun submit() = submit(advanceOnCorrect = false)

    /**
     * Grade the card on screen.
     *
     * `advanceOnCorrect` is the web's "one Enter does the whole loop" on an
     * already-green cloze: the verdict that comes back — the server's or the
     * pack-key preview offline — decides whether the same press moves straight
     * on. The check happens where the verdict lands, so there is no race
     * between grading and advancing.
     */
    fun submit(advanceOnCorrect: Boolean) {
        val s = _state.value
        val card = s.cards.getOrNull(s.index) ?: return
        if (s.feedback != null) return
        val answer = s.answer.trim().ifBlank { null }
        val selection = s.selection
        if (card.kind == "mcq" && selection == null) return
        if (card.kind != "mcq" && answer == null) return

        val duration = (System.currentTimeMillis() - cardStartedAt).coerceAtLeast(0)
        val mode = s.mode.wire
        val sessionId = s.sessionId
        viewModelScope.launch {
            val token = if (s.online) ensureToken() else null
            if (token != null) {
                val result = runCatching {
                    api.submit(token, card.id, answer, selection, duration, mode, sessionId)
                }.getOrNull()
                if (result != null) {
                    store.dropCardFromPack(card.id)
                    apply(
                        result.verdict,
                        result.primaryAnswer ?: result.modelAnswer ?: Grading.primaryAnswer(card),
                        result.explanation,
                        result.xpAwarded,
                        provisional = false,
                    )
                    if (advanceOnCorrect && card.kind == "cloze" && result.verdict?.correct == true) next()
                    return@launch
                }
            }
            // No server: owe it the review. With a key we can still mark it here;
            // without one, say plainly that the mark is coming rather than invent
            // a verdict the server may disagree with.
            store.enqueueReview(card.id, answer, selection, duration, mode)
            val preview = Grading.previewVerdict(card, answer, selection)
            apply(preview, Grading.primaryAnswer(card), null, 0, provisional = true)
            if (advanceOnCorrect && card.kind == "cloze" && preview?.correct == true) next()
        }
    }

    private fun apply(verdict: Verdict?, correctAnswer: String?, explanation: String?, xp: Int, provisional: Boolean) {
        noteXp(xp)
        _state.update {
            it.copy(
                feedback = Feedback(verdict, correctAnswer, explanation, xp, provisional),
                answered = it.answered + 1,
                correct = it.correct + if (verdict?.correct == true) 1 else 0,
                // The reward moment: a correct mark fires the small burst, the
                // same instant the web's `burst(46, 0.46)` does.
                confettiTrigger = if (verdict?.correct == true) it.confettiTrigger + 1 else it.confettiTrigger,
                pending = store.pendingCount(),
            )
        }
    }

    fun next() {
        val s = _state.value
        val nextIndex = s.index + 1
        if (nextIndex >= s.cards.size) {
            // The queue is empty — the moment the ladder visibly lands. Compare
            // where the session started with where the fresh ladder puts us: a
            // higher rung earns the full burst, exactly the web's
            // `change?.promoted` celebration. Reduced motion reads no confetti
            // (the gate lives in the overlay), and no haptic when quiet.
            val promoted = runCatching {
                val start = s.xpAtSessionStart ?: return@runCatching null
                val before = RankLadder.rankFor(start)
                val after = RankLadder.rankFor(start + xpThisSession)
                after.index > before.index
            }.getOrNull() == true
            _state.update {
                it.copy(
                    finished = true,
                    feedback = null,
                    promoted = promoted,
                    confettiTrigger = if (promoted) it.confettiTrigger + 1 else it.confettiTrigger,
                )
            }
            viewModelScope.launch { ensureToken()?.let { drainOutbox(it) } }
        } else {
            cardStartedAt = System.currentTimeMillis()
            _state.update { it.copy(index = nextIndex, answer = "", selection = null, feedback = null) }
        }
    }

    /**
     * The learner ends the session early — the web's "End session".
     *
     * Every answered card's XP and count is already banked, so nothing is lost;
     * the summary still opens (titled "Session ended", not "complete") and the
     * remaining cards simply stay due.
     */
    fun endSessionEarly() {
        _state.update { it.copy(finished = true, ended = true, feedback = null) }
        viewModelScope.launch { ensureToken()?.let { drainOutbox(it) } }
    }

    fun endReview() {
        _state.update {
            it.copy(
                cards = emptyList(),
                index = 0,
                inReview = false,
                finished = false,
                ended = false,
                promoted = false,
                answered = 0,
                correct = 0,
                feedback = null,
                sessionNotes = emptyList(),
                sessionId = null,
                met = 0,
                total = 0,
            )
        }
        refreshHome()
        // A session in a mode that moves the ladder should land on the ladder.
        if (_state.value.ranked != null) loadProgress()
    }

    /** The notes for the card on screen, if this session carried any. */
    fun notesFor(card: QuizCard?): List<Note> {
        if (card == null) return emptyList()
        val all = _state.value.sessionNotes
        if (all.isEmpty()) return emptyList()
        val mine = all.filter { it.topicId == null || it.topicId == card.topicId }
        return if (mine.isEmpty()) all else mine
    }

    fun achievementCount(): Int = _state.value.me?.achievements?.size ?: 0

    // ── connectivity ────────────────────────────────────────────────────────

    private fun setOnline(online: Boolean) {
        val was = _state.value.online
        _state.update { it.copy(online = online) }
        if (online && !was) {
            refreshHome()
            if (_state.value.signedIn) loadSubjects()
        }
    }

    private fun observeConnectivity(context: Context) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: run {
            _state.update { it.copy(online = true) }
            return
        }
        _state.update { it.copy(online = isOnline(cm)) }
        runCatching {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = setOnline(isOnline(cm))
                override fun onLost(network: Network) = setOnline(isOnline(cm))
            })
        }
    }

    private fun isOnline(): Boolean =
        (getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager)?.let { isOnline(it) } ?: true

    private fun isOnline(cm: ConnectivityManager): Boolean {
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
