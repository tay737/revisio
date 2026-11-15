package app.revisio

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * `revisio://` links delivered by the OS, newest pending one only.
 *
 * MainActivity offers every VIEW intent that carries the scheme; the shell
 * collects [pending], hands it to the ViewModel once and clears it. A link
 * that arrives before sign-in is held by the ViewModel, not lost here.
 */
object DeepLinkBus {
    private val _pending = MutableStateFlow<Uri?>(null)
    val pending: StateFlow<Uri?> = _pending.asStateFlow()

    fun offer(uri: Uri) {
        _pending.value = uri
    }

    fun consume() {
        _pending.value = null
    }
}

/**
 * The destination a `revisio://` link names, or null when it names none.
 *
 * The host is the web's own path word — `revisio://teacher` is `/teacher`,
 * `revisio://admin` is `/admin` — with `teaching` and `you` accepted as the
 * aliases the enum already answers to. Anything else is not ours to open.
 */
fun deepLinkDestination(uri: Uri): Destination? {
    if (!uri.scheme.equals("revisio", ignoreCase = true)) return null
    val host = uri.host?.takeIf { it.isNotEmpty() } ?: uri.pathSegments.firstOrNull()
    return when (host?.lowercase()) {
        "today" -> Destination.TODAY
        "review" -> Destination.REVIEW
        "learn" -> Destination.LEARN
        "rank" -> Destination.RANK
        "cram" -> Destination.CRAM
        "exam" -> Destination.EXAM
        "practice" -> Destination.PRACTICE
        "library" -> Destination.LIBRARY
        "settings", "you" -> Destination.SETTINGS
        "teacher", "teaching" -> Destination.TEACHING
        "admin" -> Destination.ADMIN
        else -> null
    }
}
