package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The pieces every screen shares.
 *
 * Everything here reads `Theme.kt`, which is generated from the stylesheet, so a
 * screen never names a colour of its own. The one exception is the notes
 * renderer's code tint, which is deliberately a reader's colour rather than a
 * brand one.
 */

/**
 * Achievement → registry glyph, the same resolution the web performs.
 *
 * The database stores an emoji per achievement. An emoji would reintroduce
 * off-palette colour, so an achievement resolves by id first, then by the legacy
 * emoji, then to a generic award — one mapping, mirrored from
 * `src/components/ui/icons.tsx`, so the phone and the browser draw the same mark.
 */
fun achievementIcon(id: String?, legacyEmoji: String?): androidx.compose.ui.graphics.vector.ImageVector {
    ACHIEVEMENT_BY_ID[id]?.let { return it }
    ACHIEVEMENT_BY_EMOJI[legacyEmoji]?.let { return it }
    return RevisioIcons.achievements
}

private val ACHIEVEMENT_BY_ID: Map<String, androidx.compose.ui.graphics.vector.ImageVector> = mapOf(
    "first-review" to RevisioIcons.start,
    "reviews-50" to RevisioIcons.level,
    "reviews-250" to RevisioIcons.streak,
    "reviews-500" to RevisioIcons.climb,
    "reviews-1000" to RevisioIcons.rocket,
    "streak-7" to RevisioIcons.schedule,
    "streak-30" to RevisioIcons.checked,
    "streak-100" to RevisioIcons.crown,
    "xp-1000" to RevisioIcons.xp,
    "xp-5000" to RevisioIcons.crown,
    "xp-25000" to RevisioIcons.achievements,
    "perfect-session" to RevisioIcons.target,
    "perfect-session-20" to RevisioIcons.secure,
    "level-25" to RevisioIcons.league,
)

private val ACHIEVEMENT_BY_EMOJI: Map<String?, androidx.compose.ui.graphics.vector.ImageVector> = mapOf(
    "\uD83C\uDF31" to RevisioIcons.start,
    "\u26A1" to RevisioIcons.level,
    "\uD83D\uDD25" to RevisioIcons.streak,
    "\uD83D\uDCC5" to RevisioIcons.schedule,
    "\uD83D\uDDD3\uFE0F" to RevisioIcons.checked,
    "\uD83D\uDC8E" to RevisioIcons.xp,
    "\uD83C\uDFAF" to RevisioIcons.target,
    "\uD83C\uDFC3" to RevisioIcons.climb,
    "\uD83D\uDE80" to RevisioIcons.rocket,
    "\uD83C\uDFD4\uFE0F" to RevisioIcons.crown,
    "\uD83D\uDC51" to RevisioIcons.crown,
    "\u26F0\uFE0F" to RevisioIcons.achievements,
    "\uD83D\uDEE1\uFE0F" to RevisioIcons.secure,
    "\uD83C\uDF96\uFE0F" to RevisioIcons.league,
)

/** The brand mark is the wordmark — there is no separate logo lockup. */
@Composable
fun Wordmark(size: TypeToken = Type.tagline) {
    Text("Revisio", style = size.style(Ink))
}

/** The learner's face: their emoji on their colour, or the crest of their rank. */
@Composable
fun Avatar(emoji: String?, size: Int = 40) {
    // The five costume tints from `profile.ts`; the avatar is the one place a
    // learner's own colour is allowed, and it never carries meaning.
    val tint = when ((emoji?.hashCode() ?: 0) % 5) {
        0 -> Card2
        1 -> Good.copy(alpha = 0.22f)
        2 -> Warn.copy(alpha = 0.22f)
        3 -> Info.copy(alpha = 0.22f)
        else -> revisioColors.accent
    }
    Box(
        modifier = Modifier
            .size(size.dp)
            .background(tint, RoundedCornerShape(Radius.pill))
            .border(1.dp, Line, RoundedCornerShape(Radius.pill)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            emoji?.takeIf { it.isNotBlank() } ?: "R",
            fontSize = (size * 0.46f).sp,
        )
    }
}

/** A 16px-radius card with a hairline and no shadow. Level 0 is the default. */
@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    SurfaceCard(modifier = modifier) { content() }
}

/** A label-over-number pair, the shape every stat row on the site uses. */
@Composable
fun Stat(label: String, value: String, tint: androidx.compose.ui.graphics.Color? = null) {
    Column {
        Label(label, token = Type.micro, color = Muted)
        Spacer(Modifier.height(2.dp))
        Text(value, style = Type.displaySm.style(tint ?: Ink))
    }
}

@Composable
fun SectionTitle(text: String) {
    Label(text, token = Type.eyebrow, color = Muted)
    Spacer(Modifier.height(10.dp))
}

/** An eyebrow over a display title — the page header every destination uses. */
@Composable
fun ScreenTitle(title: String, eyebrow: String? = null) {
    Column(modifier = Modifier.fillMaxWidth()) {
        if (eyebrow != null) {
            Label(eyebrow, token = Type.eyebrow, color = Muted)
            Spacer(Modifier.height(4.dp))
        }
        Text(title, style = Type.title.style(Ink))
    }
}

@Composable
fun Chip(text: String, tint: androidx.compose.ui.graphics.Color = Ink) {
    Row(
        modifier = Modifier
            .background(Card2, RoundedCornerShape(Radius.pill))
            .padding(horizontal = 11.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = Type.fine.style(tint), maxLines = 1)
    }
}

/** Division, streak and placement progress: the 10px meter. */
@Composable
fun Bar(percent: Int, tint: androidx.compose.ui.graphics.Color? = null, height: Int = 10) {
    Meter(percent, tint, height.dp)
}

@Composable
fun Divider() = Hairline()

/** One line of "here is what happened", used wherever a screen can be empty. */
@Composable
fun EmptyNote(text: String) {
    SoftCard { Text(text, style = Type.caption.style(Muted)) }
}

@Composable
fun RowSpacer(width: Int = 12) = Spacer(Modifier.size(width.dp))

@Composable
fun ColumnSpacer(height: Int = 12) = Spacer(Modifier.height(height.dp))

@Composable
fun Stack(spacing: Int = 12, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(spacing.dp), modifier = Modifier.fillMaxWidth()) {
        content()
    }
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

/** Notes are reference material, which is the one thing `--info` is for. */
private val CodeInk = androidx.compose.ui.graphics.Color(0xFF1CB0F6)

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
                    Spacer(Modifier.height(10.dp))
                    Hairline()
                    Spacer(Modifier.height(14.dp))
                }
                line.isBlank() -> Spacer(Modifier.height(12.dp))
                HEADING.matches(line) -> {
                    val depth = line.takeWhile { it == '#' }.length
                    val text = HEADING.find(line)?.groupValues?.get(1).orEmpty()
                    Spacer(Modifier.height(8.dp))
                    Text(
                        inlineText(text),
                        style = when (depth) {
                            1 -> Type.displaySm
                            2 -> Type.strong.copy(size = 19, weight = FontWeight.Bold)
                            else -> Type.strong.copy(weight = FontWeight.Bold)
                        }.style(Ink),
                    )
                    Spacer(Modifier.height(6.dp))
                }
                BULLET.matches(line) -> {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text("•", style = Type.body.style(Muted), modifier = Modifier.padding(end = 10.dp))
                        Text(inlineText(BULLET.find(line)?.groupValues?.get(1).orEmpty()), style = Type.body.style(Ink))
                    }
                    Spacer(Modifier.height(6.dp))
                }
                NUMBERED.matches(line) -> {
                    val m = NUMBERED.find(line)!!
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text("${m.groupValues[1]}.", style = Type.body.style(Muted), modifier = Modifier.padding(end = 10.dp))
                        Text(inlineText(m.groupValues[2]), style = Type.body.style(Ink))
                    }
                    Spacer(Modifier.height(6.dp))
                }
                QUOTE.matches(line) -> {
                    // A quote is marked by the notes accent, the same blue the
                    // website gives reference material.
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Box(Modifier.size(width = 3.dp, height = 22.dp).background(Info, RoundedCornerShape(Radius.pill)))
                        Spacer(Modifier.size(12.dp))
                        Text(inlineText(QUOTE.find(line)?.groupValues?.get(1).orEmpty()), style = Type.body.style(Muted))
                    }
                    Spacer(Modifier.height(6.dp))
                }
                else -> {
                    Text(inlineText(line), style = Type.body.style(Ink))
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
        CodeBlock(code.toString())
    }
}

@Composable
private fun CodeBlock(body: String) {
    if (body.isBlank()) return
    Surface(
        color = revisioColors.secondary,
        shape = RoundedCornerShape(Radius.md),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            body.trimEnd(),
            color = CodeInk,
            fontFamily = FontFamily.Monospace,
            fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().padding(14.dp),
        )
    }
    Spacer(Modifier.height(12.dp))
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
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = CodeInk)) {
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
                    withStyle(SpanStyle(color = CodeInk)) { append(text.substring(i + 1, close)) }
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
