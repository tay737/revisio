package app.revisio.ui

import android.content.Context
import android.speech.tts.TextToSpeech
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.revisio.engine.QuizCard
import java.util.Locale

/**
 * F3 read-aloud — the platform `TextToSpeech` engine, the Android twin of the
 * web's speechSynthesis helper and Flutter's `Speaker`.
 *
 * Same three rules: capability is probed honestly (no engine, no button);
 * only the question side is ever composed (answers never reach the speaker);
 * one utterance at a time — a new speak() cuts off whatever is running.
 */
object Speaker {
    private var tts: TextToSpeech? = null
    private var ready = false

    /** Probe without vocalising — initialising the engine is the check. */
    fun supported(context: Context, onResult: (Boolean) -> Unit) {
        val app = context.applicationContext
        if (tts == null) {
            tts = TextToSpeech(app) { status ->
                ready = status == TextToSpeech.SUCCESS
                if (ready) {
                    runCatching { tts?.setLanguage(Locale.US) }
                    tts?.setSpeechRate(0.95f)
                }
                onResult(ready)
            }
        } else {
            onResult(ready)
        }
    }

    /** Speak [text], cutting off anything in flight. Returns false when the
     *  engine is not ready — callers treat that as "no button". */
    fun speak(text: String): Boolean {
        val engine = tts ?: return false
        if (!ready || text.isBlank()) return false
        engine.stop()
        return engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "revisio-card") == TextToSpeech.SUCCESS
    }

    fun stop() {
        tts?.stop()
    }

    /** Strip markdown to speakable plain text — mirrors web `stripForSpeech`. */
    fun stripForSpeech(md: String): String = md
        .replace(Regex("!\\[([^\\]]*)\\]\\([^)]*\\)"), "$1")
        .replace(Regex("\\[([^\\]]+)\\]\\([^)]*\\)"), "$1")
        .replace(Regex("`{1,3}[^`]*`{1,3}"), " ")
        .replace(Regex("(?m)^#{1,6}\\s+"), "")
        .replace(Regex("(?m)^\\s*[-*+]\\s+"), "")
        .replace(Regex("(?m)^\\s*\\d+[.)]\\s+"), "")
        .replace(Regex("(?m)^>\\s?"), "")
        .replace(Regex("\\*\\*|__|\\*|_"), "")
        .replace(Regex("\\$\\$?([^$]+)\\$\\$?"), "$1")
        .replace("|", " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    /** The question side of a card, per kind. Never includes answers. */
    fun cardSpeechText(card: QuizCard): String = when (card.kind) {
        "cloze" -> stripForSpeech((card.textWithBlank ?: "").replace(Regex("_{2,}"), " blank "))
        "flashcard" -> stripForSpeech(card.prompt ?: "")
        else -> {
            val parts = mutableListOf(stripForSpeech(card.question ?: ""))
            card.options.orEmpty().forEach { o ->
                val t = stripForSpeech(o.text)
                if (t.isNotEmpty()) parts.add(t)
            }
            parts.filter { it.isNotEmpty() }.joinToString(". ")
        }
    }

    fun markdownSpeechText(md: String): String = stripForSpeech(md)
}

/** A listen/stop ghost button for the session card face and verdict. */
@Composable
fun ListenButton(text: String, compact: Boolean = false) {
    val context = LocalContext.current
    var supported by remember { mutableStateOf<Boolean?>(null) }
    var speaking by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        Speaker.supported(context) { ok -> supported = ok }
    }
    DisposableEffect(Unit) {
        onDispose { Speaker.stop() }
    }
    if (supported != true) return

    val label = if (speaking) "Stop reading aloud" else "Read aloud"
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(Radius.pill))
            .clickable {
                if (speaking) {
                    Speaker.stop()
                    speaking = false
                } else {
                    speaking = Speaker.speak(text)
                    if (!speaking) supported = false
                }
            }
            .padding(horizontal = if (compact) 8.dp else 12.dp, vertical = 8.dp)
            .sizeIn(minWidth = 44.dp, minHeight = 44.dp)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            if (speaking) RevisioIcons.speaking else RevisioIcons.listen,
            size = if (compact) 16 else 18,
            tint = if (speaking) Info else Muted,
        )
        if (!compact) {
            Text(if (speaking) "Stop" else "Listen", style = Type.fine.style(Muted))
        }
    }
}
