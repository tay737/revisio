package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Accent = Color(0xFF1C64F2)
val Surface1 = Color(0xFF1C1C1E)
val Surface2 = Color(0xFF2C2C2E)
val Muted = Color(0xFF98989D)
val Good = Color(0xFF30D158)
val Near = Color(0xFFFFD60A)
val Bad = Color(0xFFFF453A)
val Ink = Color(0xFFF5F5F7)

@Composable
fun Crest(size: Int = 64) {
    Box(modifier = Modifier.size(size.dp), contentAlignment = Alignment.Center) {
        Surface(color = Accent, shape = RoundedCornerShape((size / 4).dp), modifier = Modifier.fillMaxWidth().height(size.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text("R", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = (size * 0.55).sp)
            }
        }
    }
}

/** The learner's face: their emoji on their colour, or the crest if unset. */
@Composable
fun Avatar(emoji: String?, size: Int = 40) {
    val tint = when ((emoji?.hashCode() ?: 0) % 5) {
        0 -> Color(0xFF3A3A3C)
        1 -> Color(0xFF14532D)
        2 -> Color(0xFF713F12)
        3 -> Color(0xFF1E3A5F)
        else -> Color(0xFF3B2A4A)
    }
    Box(modifier = Modifier.size(size.dp), contentAlignment = Alignment.Center) {
        Surface(color = tint, shape = RoundedCornerShape((size / 3).dp), modifier = Modifier.fillMaxWidth().height(size.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text(emoji?.takeIf { it.isNotBlank() } ?: "R", fontSize = (size * 0.45).sp)
            }
        }
    }
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Surface1),
        shape = RoundedCornerShape(18.dp),
    ) { Column(modifier = Modifier.fillMaxWidth().padding(18.dp)) { content() } }
}

@Composable
fun Stat(label: String, value: String, tint: Color = Ink) {
    Column {
        Text(label, color = Muted, fontSize = 12.sp)
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = tint)
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Muted)
    Spacer(Modifier.height(6.dp))
}

@Composable
fun Chip(text: String, tint: Color = Muted) {
    Surface(color = Surface2, shape = RoundedCornerShape(8.dp)) {
        Text(text, color = tint, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
    }
}

@Composable
fun Bar(percent: Int, tint: Color = Accent, height: Int = 6) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height.dp)
            .background(Surface2, RoundedCornerShape(height.dp)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth((percent.coerceIn(0, 100)) / 100f)
                .height(height.dp)
                .background(tint, RoundedCornerShape(height.dp)),
        )
    }
}

@Composable
fun Divider() {
    Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF2C2C2E)))
}

// ── the notes renderer ──────────────────────────────────────────────────────
//
// Notes are authored in Markdown for the web. A native client cannot drop a
// browser engine in for it — that is the whole point — so this is a deliberately
// small renderer: headings, bullets, numbered lists, block quotes, bold/italic
// and inline code. Anything fancier degrades to readable text rather than to
// markup, which is the right failure for prose somebody is studying.

private val HEADING = Regex("^#{1,6}\\s+(.*)$")
private val BULLET = Regex("^\\s*[-*+]\\s+(.*)$")
private val NUMBERED = Regex("^\\s*(\\d+)[.)]\\s+(.*)$")
private val QUOTE = Regex("^>\\s?(.*)$")
private val RULE = Regex("^\\s*(-{3,}|_{3,}|\\*{3,})\\s*$")

@Composable
fun Notes(markdown: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        val lines = markdown.replace("\r\n", "\n").split('\n')
        var inCode = false
        val code = StringBuilder()

        for (raw in lines) {
            val line = raw.trimEnd()
            if (line.trimStart().startsWith("```")) {
                // A fence closes the buffer either way, so an unclosed block still
                // renders as code rather than swallowing the rest of the notes.
                CodeBlock(code.toString())
                code.clear()
                inCode = !inCode
                continue
            }
            if (inCode) {
                code.append(line).append('\n')
                continue
            }

            when {
                RULE.matches(line) -> {
                    Spacer(Modifier.height(8.dp))
                    Divider()
                    Spacer(Modifier.height(12.dp))
                }
                line.isBlank() -> Spacer(Modifier.height(10.dp))
                HEADING.matches(line) -> {
                    val depth = line.takeWhile { it == '#' }.length
                    val text = HEADING.find(line)?.groupValues?.get(1).orEmpty()
                    Spacer(Modifier.height(6.dp))
                    Text(
                        inlineText(text),
                        fontSize = when (depth) { 1 -> 21.sp; 2 -> 18.sp; else -> 16.sp },
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                }
                BULLET.matches(line) -> {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text("•", color = Muted, fontSize = 15.sp, modifier = Modifier.padding(end = 8.dp))
                        Text(inlineText(BULLET.find(line)?.groupValues?.get(1).orEmpty()), fontSize = 15.sp, lineHeight = 22.sp)
                    }
                    Spacer(Modifier.height(4.dp))
                }
                NUMBERED.matches(line) -> {
                    val m = NUMBERED.find(line)!!
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text("${m.groupValues[1]}.", color = Muted, fontSize = 15.sp, modifier = Modifier.padding(end = 8.dp))
                        Text(inlineText(m.groupValues[2]), fontSize = 15.sp, lineHeight = 22.sp)
                    }
                    Spacer(Modifier.height(4.dp))
                }
                QUOTE.matches(line) -> {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Box(Modifier.size(width = 3.dp, height = 20.dp).background(Accent, RoundedCornerShape(2.dp)))
                        Spacer(Modifier.size(10.dp))
                        Text(inlineText(QUOTE.find(line)?.groupValues?.get(1).orEmpty()), color = Muted, fontSize = 15.sp, lineHeight = 22.sp)
                    }
                    Spacer(Modifier.height(4.dp))
                }
                else -> {
                    Text(inlineText(line), fontSize = 15.sp, lineHeight = 23.sp)
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
        CodeBlock(code.toString())
    }
}

@Composable
private fun CodeBlock(body: String) {
    if (body.isBlank()) return
    Surface(color = Color(0xFF121214), shape = RoundedCornerShape(10.dp)) {
        Text(
            body.trimEnd(),
            color = Color(0xFFB9F18D),
            fontFamily = FontFamily.Monospace,
            fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth().padding(12.dp),
        )
    }
    Spacer(Modifier.height(10.dp))
}

/** Bold, italic and inline code, with the markers removed. */
private fun inlineText(text: String) = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        when {
            text.startsWith("**", i) -> {
                val end = text.indexOf("**", i + 2)
                if (end < 0) { append(text.substring(i)); i = text.length }
                else { withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(text.substring(i + 2, end)) }; i = end + 2 }
            }
            text[i] == '*' -> {
                val end = text.indexOf('*', i + 1)
                if (end < 0) { append(text.substring(i)); i = text.length }
                else { withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text.substring(i + 1, end)) }; i = end + 1 }
            }
            text[i] == '`' -> {
                val end = text.indexOf('`', i + 1)
                if (end < 0) { append(text.substring(i)); i = text.length }
                else {
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = Color(0xFFB9F18D))) {
                        append(text.substring(i + 1, end))
                    }
                    i = end + 1
                }
            }
            text[i] == '[' -> {
                // [label](url) — the label is the useful half on a phone.
                val close = text.indexOf(']', i)
                val open = if (close >= 0) text.indexOf('(', close) else -1
                val end = if (open >= 0) text.indexOf(')', open) else -1
                if (close > 0 && end > open) {
                    withStyle(SpanStyle(color = Accent)) { append(text.substring(i + 1, close)) }
                    i = end + 1
                } else { append(text[i]); i++ }
            }
            else -> {
                val stop = nextMarker(text, i)
                append(text.substring(i, stop))
                i = stop
            }
        }
    }
}

/** Where the next markdown marker starts, or the end of the line. */
private fun nextMarker(text: String, from: Int): Int {
    for (i in from until text.length) {
        if (text[i] == '*' || text[i] == '`' || text[i] == '[') return i
    }
    return text.length
}

/** One line of "here is what happened", used wherever a screen can be empty. */
@Composable
fun EmptyNote(text: String) {
    Panel { Text(text, color = Muted, fontSize = 14.sp, lineHeight = 21.sp) }
}

@Composable
fun RowSpacer(width: Int = 12) = Spacer(Modifier.size(width.dp))

@Composable
fun ColumnSpacer(height: Int = 12) = Spacer(Modifier.height(height.dp))

@Composable
fun Stack(spacing: Int = 12, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(spacing.dp), modifier = Modifier.fillMaxWidth()) { content() }
}
