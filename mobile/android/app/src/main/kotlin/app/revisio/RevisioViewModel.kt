package app.revisio

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.revisio.engine.CramSession
import app.revisio.engine.FileKeyValueStore
import app.revisio.engine.GamificationPayload
import app.revisio.engine.Grading
import app.revisio.engine.Lesson
import app.revisio.engine.MeDetail
import app.revisio.engine.MePatch
import app.revisio.engine.Note
import app.revisio.engine.OfflineStore
import app.revisio.engine.Prefs
import app.revisio.engine.QuizCard
import app.revisio.engine.RevisioApi
import app.revisio.engine.SessionStore
import app.revisio.engine.StudyMode
import app.revisio.engine.Subject
import app.revisio.engine.SyncEngine
import app.revisio.engine.Topic
import app.revisio.engine.Verdict
import app.revisio.engine.Visibility
import app.revisio.engine.toQuizCard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

/** The five places the app can be. */
enum class Tab(val label: String) {
    TODAY("Today"),
    LEARN("Learn"),
    CRAM("Cram"),
    RANK("Rank"),
    YOU("You"),
}

/** What the user is looking at, and what the app knows right now. */
data class UiState(
    val loading: Boolean = true,
    val signedIn: Boolean = false,
    val name: String = "",
    val email: String = "",
    val online: Boolean = true,
    val tab: Tab = Tab.TODAY,
    val home: HomeState? = null,
    val pending: Int = 0,
    val message: String? = null,
    // the review loop, in whichever mode it was started
    val cards: List<QuizCard> = emptyList(),
    val index: Int = 0,
    val answer: String = "",
    val selection: String? = null,
    val feedback: Feedback? = null,
    val answered: Int = 0,
    val correct: Int = 0,
    val finished: Boolean = false,
    val inReview: Boolean = false,
    val mode: StudyMode = StudyMode.DAILY,
    val sessionTitle: String = "",
    val sessionNotes: List<Note> = emptyList(),
    val sessionId: String? = null,
    val notesOpen: Boolean = true,
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
    val busy: Boolean = false,
)

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

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        observeConnectivity(app)
        bootstrap()
    }

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

    fun signIn(email: String, password: String) {
        _state.update { it.copy(loading = true, message = null) }
        viewModelScope.launch {
            try {
                val session = api.login(email, password)
                accessToken = session.accessToken
                sessionStore.save(session)
                _state.update {
                    it.copy(loading = false, signedIn = true, name = session.user.name, email = session.user.email)
                }
                refreshHome()
                loadSubjects()
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, message = e.message ?: "Sign in failed.") }
            }
        }
    }

    fun signOut() {
        accessToken = null
        sessionStore.clear()
        store.clearPack()
        _state.update { UiState(loading = false, signedIn = false, online = it.online) }
    }

    /** Refresh the access token from the stored refresh token, or give up quietly. */
    private suspend fun ensureToken(): String? {
        accessToken?.let { return it }
        val stored = sessionStore.load() ?: return null
        val session = runCatching { api.refresh(stored.refreshToken) }.getOrNull() ?: return null
        accessToken = session.accessToken
        sessionStore.save(session)
        return session.accessToken
    }

    /**
     * Run a backend call if there is a token and a network, reporting failures as
     * a banner rather than a crash. The app is offline-first, so "no network" is
     * an ordinary state and not an error to shout about.
     */
    private fun <T> withToken(block: suspend (String) -> T, onResult: (T) -> Unit) {
        viewModelScope.launch {
            val token = ensureToken()
            if (token == null) {
                // A token we could not renew while offline is not a signed-out
                // user, so do not tell them to sign in: the session on the device
                // is still good and will renew by itself once the network is back.
                val note = if (_state.value.online) {
                    "Sign in again to reach the server."
                } else {
                    "You're offline — this needs a connection."
                }
                _state.update { it.copy(message = note, busy = false) }
                return@launch
            }
            runCatching { block(token) }
                .onSuccess { onResult(it) }
                .onFailure { _state.update { s -> s.copy(message = it.message ?: "That did not work.", busy = false) } }
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

    fun selectTab(tab: Tab) {
        _state.update { it.copy(tab = tab, message = null) }
        when (tab) {
            Tab.LEARN -> if (!_state.value.subjectsLoaded) loadSubjects()
            Tab.CRAM -> if (_state.value.cramTopics.isEmpty()) loadCramTopics()
            Tab.RANK -> loadProgress(_state.value.boardScope)
            Tab.YOU -> loadMe()
            Tab.TODAY -> refreshHome()
        }
    }

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
        withToken({ api.meDetail(it) }) { me -> _state.update { it.copy(me = me, busy = false) } }
    }

    fun saveProfile(name: String, username: String, nickname: String, bio: String, emoji: String, color: String) {
        val patch = MePatch(
            name = name.trim().ifBlank { null },
            username = username.trim().ifBlank { null },
            nickname = nickname.trim().ifBlank { null },
            bio = bio.trim().ifBlank { null },
            avatarEmoji = emoji.trim().ifBlank { null },
            avatarColor = color,
        )
        patchMe(patch, "Saved.")
    }

    fun setVisibility(visibility: Visibility) = patchMe(MePatch(profileVisibility = visibility), null)

    fun setLeaderboardOptOut(optOut: Boolean) = patchMe(MePatch(leaderboardOptOut = optOut), null)

    fun setNoteDensity(density: String) {
        _state.update { it.copy(density = density) }
        patchMe(MePatch(prefs = Prefs(noteDensity = density)), null)
    }

    private fun patchMe(patch: MePatch, okMessage: String?) {
        _state.update { it.copy(busy = true) }
        withToken({ api.patchMe(it, patch); api.meDetail(it) }) { me ->
            _state.update { it.copy(me = me, busy = false, message = okMessage) }
        }
    }

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
        _state.update {
            it.copy(
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
                notesOpen = true,
                met = met,
                total = total,
                message = null,
            )
        }
    }

    fun setAnswer(text: String) = _state.update { it.copy(answer = text) }

    fun setSelection(optionId: String) = _state.update { it.copy(selection = optionId) }

    fun submit() {
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
                    return@launch
                }
            }
            // No server: owe it the review. With a key we can still mark it here;
            // without one, say plainly that the mark is coming rather than invent
            // a verdict the server may disagree with.
            store.enqueueReview(card.id, answer, selection, duration, mode)
            apply(Grading.previewVerdict(card, answer, selection), Grading.primaryAnswer(card), null, 0, provisional = true)
        }
    }

    private fun apply(verdict: Verdict?, correctAnswer: String?, explanation: String?, xp: Int, provisional: Boolean) {
        _state.update {
            it.copy(
                feedback = Feedback(verdict, correctAnswer, explanation, xp, provisional),
                answered = it.answered + 1,
                correct = it.correct + if (verdict?.correct == true) 1 else 0,
                pending = store.pendingCount(),
            )
        }
    }

    fun next() {
        val s = _state.value
        val nextIndex = s.index + 1
        if (nextIndex >= s.cards.size) {
            _state.update { it.copy(finished = true, feedback = null) }
            viewModelScope.launch { ensureToken()?.let { drainOutbox(it) } }
        } else {
            cardStartedAt = System.currentTimeMillis()
            _state.update { it.copy(index = nextIndex, answer = "", selection = null, feedback = null) }
        }
    }

    fun endReview() {
        _state.update {
            it.copy(
                cards = emptyList(),
                index = 0,
                inReview = false,
                finished = false,
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
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: run {
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
        getApplication<Application>().getSystemService(ConnectivityManager::class.java)?.let { isOnline(it) } ?: true

    private fun isOnline(cm: ConnectivityManager): Boolean {
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
