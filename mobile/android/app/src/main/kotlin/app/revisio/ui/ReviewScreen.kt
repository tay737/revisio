package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.revisio.Destination
import app.revisio.RevisioViewModel
import app.revisio.UiState

/**
 * Review — clear the cards due.
 *
 * The website splits Today from Review on purpose, and the split is the reason
 * this screen exists at all. Today is a dashboard: the streak, the numbers, what
 * is waiting, and a shortcut into whatever the learner came for. `/review` is the
 * thing they came for. A phone bar has four slots, and spending one of them on a
 * dashboard while the single most-performed action in the product had no
 * destination was the wrong trade.
 *
 * What it shows is the queue's *shape* rather than the queue: how many cards are
 * due, how long that is likely to take, and whether today's pack is already on
 * the device. The cards themselves are the loop, and the loop is one tap away —
 * deal them here and the session screen takes over.
 */
@Composable
fun ReviewScreen(state: UiState, viewModel: RevisioViewModel) {
    val home = state.home
    val due = home?.due ?: 0
    val offline = home?.fromCache == true || !state.online
    // The estimate promises what the session will actually deal: the pack is
    // capped at twenty, so "about 40 minutes" when due is 200 would be a lie —
    // when offline the session deals the cached pack, not the queue.
    val dealt = if (offline) minOf(home?.packCards ?: 0, 20).coerceAtLeast(0) else due

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle("Review", eyebrow = "Today")
        Spacer(Modifier.height(4.dp))
        Text(
            "Clear the cards due. Every mark is the server's.",
            style = Type.caption.style(Muted),
        )

        Spacer(Modifier.height(20.dp))
        SurfaceCard(modifier = Modifier.entrance(scale = true)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BoxedGlyph(RevisioIcons.review)
                Spacer(Modifier.size(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (due == 0) "Nothing is due" else "$due card${if (due == 1) "" else "s"} waiting",
                        style = Type.strong.style(Ink),
                    )
                    Text(
                        when {
                            due == 0 -> "The scheduler has nothing for you right now. Cram, or read ahead."
                            dealt <= 5 -> "About a minute of work."
                            dealt <= 20 -> "About ${(dealt * 12) / 60} minutes of work."
                            else -> "A longer session — about ${(dealt * 12) / 60} minutes."
                        },
                        style = Type.fine.style(Muted),
                    )
                }
            }

            if (offline) {
                Spacer(Modifier.height(14.dp))
                Hairline()
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.clock, size = 13, tint = Warn)
                    Spacer(Modifier.size(8.dp))
                    Text(
                        "Offline: the session saved on this device is what will be dealt.",
                        style = Type.fine.style(Warn),
                    )
                }
            }

            Spacer(Modifier.height(18.dp))
            PillButton(
                text = if (state.pending > 0) "Start review · ${state.pending} saved" else "Start review",
                onClick = viewModel::startTodayReview,
                tone = PillTone.Good,
                icon = RevisioIcons.start,
                enabled = !state.busy,
                large = true,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Nothing here touches the schedule until a card is actually answered.",
                style = Type.fine.style(Muted),
            )
        }

        if (due == 0) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 1)) {
                Text("Keep it moving", style = Type.strong.style(Ink))
                Spacer(Modifier.height(12.dp))
                Shortcut(RevisioIcons.cram, "Cram", "Sprint before an exam") {
                    viewModel.go(Destination.CRAM)
                }
                Spacer(Modifier.height(10.dp))
                Shortcut(RevisioIcons.practice, "Practice", "Generated maths drills") {
                    viewModel.go(Destination.PRACTICE)
                }
                Spacer(Modifier.height(10.dp))
                Shortcut(RevisioIcons.exam, "Exam", "Sit a marked paper") {
                    viewModel.go(Destination.EXAM)
                }
            }
        }

        Spacer(Modifier.height(28.dp))
    }
}

/**
 * The 38px tile a glyph sits on.
 *
 * One owner for the shape, because these tiles appear in the More sheet, on the
 * library and beside every shortcut row — and a tile that is 36px here and 40px
 * there is the kind of drift that makes a port feel assembled rather than built.
 */
@Composable
internal fun BoxedGlyph(icon: ImageVector, tint: Color? = null, size: Int = 38) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(RoundedCornerShape(Radius.md))
            .background(Card2),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, size = (size * 0.47f).toInt(), tint = tint ?: Ink)
    }
}

/** One tappable row: tile, label, hint, chevron — the More sheet's own row. */
@Composable
internal fun Shortcut(icon: ImageVector, label: String, hint: String, trailing: String? = null, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pressScale(pressed)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        BoxedGlyph(icon)
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = Type.strong.style(Ink))
            Text(hint, style = Type.fine.style(Muted))
        }
        if (trailing != null) {
            Text(trailing, style = Type.captionS.style(Muted))
        } else {
            Icon(RevisioIcons.expand, size = 16, tint = Muted)
        }
    }
}
