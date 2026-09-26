package app.revisio

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.revisio.engine.AuthSession
import app.revisio.engine.FileKeyValueStore
import app.revisio.engine.Grading
import app.revisio.engine.OfflineCard
import app.revisio.engine.OfflineStore
import app.revisio.engine.PendingReview
import app.revisio.engine.RevisioApi
import app.revisio.engine.SessionStore
import app.revisio.engine.SyncEngine
import app.revisio.engine.Verdict
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.time.Instant

/** What the user is looking at, and what the app knows right now. */
data class UiState(
    val loading: Boolean = true,
    val signedIn: Boolean = false,
    val name: String = "",
    val email: String = "",
    val online: Boolean = true,
    val home: HomeState? = null,
    val pending: Int = 0,
    val message: String? = null,
    // the review loop
    val cards: List<OfflineCard> = emptyList(),
    val index: Int = 0,
    val answer: String = "",
    val selection: String? = null,
    val feedback: Feedback? = null,
    val answered: Int = 0,
    val correct: Int = 0,
    val finished: Boolean = false,
    val inReview: Boolean = false,
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
    val verdict: Verdict,
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
 * grading, the pack, the outbox — is the engine's job.
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
        // opens to the learner's home, not a sign-in wall, which is the whole
        // point of an app that works without a network.
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
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, message = e.message ?: "Sign in failed.") }
            }
        }
    }

    fun signOut() {
        accessToken = null
        sessionStore.clear()
        store.clearPack()
        _state.update {
            UiState(loading = false, signedIn = false, online = it.online)
        }
    }

    /** Refresh the access token from the stored refresh token, or give up quietly. */
    private suspend fun ensureToken(): String? {
        accessToken?.let { return it }
        val stored = sessionStore.load() ?: return null
        val session: AuthSession = runCatching { api.refresh(stored.refreshToken) }.getOrNull() ?: return null
        accessToken = session.accessToken
        sessionStore.save(session)
        return session.accessToken
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

    // ── the review loop ─────────────────────────────────────────────────────

    fun startReview() {
        viewModelScope.launch {
            // If we can, take a fresh session now so the pack is current; if not,
            // the cached one is what we came for.
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
            cardStartedAt = System.currentTimeMillis()
            _state.update {
                it.copy(
                    cards = pack.cards,
                    index = 0,
                    answer = "",
                    selection = null,
                    feedback = null,
                    answered = 0,
                    correct = 0,
                    finished = false,
                    inReview = true,
                    message = null,
                )
            }
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
        viewModelScope.launch {
            val token = if (s.online) ensureToken() else null
            if (token != null) {
                val outgoing = PendingReview(
                    id = "direct",
                    cardId = card.id,
                    answer = answer,
                    selectedOptionId = selection,
                    durationMs = duration,
                    mode = "daily",
                    queuedAt = Instant.now().toString(),
                )
                val result = runCatching { api.submitReview(token, outgoing) }.getOrNull()
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
            // No server: grade it here, and owe the server the review.
            store.enqueueReview(card.id, answer, selection, duration, "daily")
            val verdict = Grading.previewVerdict(card, answer, selection)
            apply(verdict, Grading.primaryAnswer(card), null, 0, provisional = true)
        }
    }

    private fun apply(verdict: Verdict, correctAnswer: String?, explanation: String?, xp: Int, provisional: Boolean) {
        _state.update {
            it.copy(
                feedback = Feedback(verdict, correctAnswer, explanation, xp, provisional),
                answered = it.answered + 1,
                correct = it.correct + if (verdict.correct) 1 else 0,
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
            )
        }
        refreshHome()
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    // ── connectivity ────────────────────────────────────────────────────────

    private fun setOnline(online: Boolean) {
        val was = _state.value.online
        _state.update { it.copy(online = online) }
        if (online && !was) refreshHome()
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
