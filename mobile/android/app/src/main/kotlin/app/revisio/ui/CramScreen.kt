package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState

/**
 * Cram — the drill.
 *
 * Time-boxed practice that bypasses the scheduler on purpose: nothing here moves
 * a card's due date, which is what makes it safe to do the night before an exam.
 * The marks are still the server's, and the notes come along at whichever
 * density was asked for.
 *
 * Choosing topics replaces the checkbox list with selectable rows: on a phone a
 * 20px checkbox is a poor target, and the row already has to carry two numbers,
 * so the whole row is the control and the tick is the confirmation.
 */
@Composable
fun CramScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(20.dp))
        ScreenTitle("Cram", eyebrow = "Practice")
        Spacer(Modifier.height(6.dp))
        Text(
            "Practice without touching the schedule — nothing you cram is re-scheduled.",
            style = Type.caption.style(Muted),
        )
        Spacer(Modifier.height(20.dp))

        if (state.cramTopics.isEmpty()) {
            SoftCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.cram, size = 16, tint = Muted)
                    Spacer(Modifier.size(10.dp))
                    Text(
                        if (!state.online) "Cram needs a connection: the server deals the questions."
                        else "No topics to cram yet.",
                        style = Type.caption.style(Muted),
                    )
                }
            }
        } else {
            // The settings, in one surface: density and how deep to go.
            SurfaceCard {
                Label("Notes", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(8.dp))
                Segmented(
                    options = listOf("detailed" to "Full", "summary" to "Brief"),
                    selected = state.density,
                    onSelect = viewModel::setDensity,
                )

                Spacer(Modifier.height(18.dp))
                Hairline()
                Spacer(Modifier.height(16.dp))

                Label("Questions per topic", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    IconPill(RevisioIcons.collapse, onClick = { viewModel.setMaxPerTopic(state.maxPerTopic - 5) }, size = 34.dp)
                    Text("${state.maxPerTopic}", style = Type.displaySm.style(Ink))
                    IconPill(RevisioIcons.add, onClick = { viewModel.setMaxPerTopic(state.maxPerTopic + 5) }, size = 34.dp)
                    Spacer(Modifier.weight(1f))
                    Text(
                        "${state.cramTopics.size} topic${if (state.cramTopics.size == 1) "" else "s"} available",
                        style = Type.fine.style(Muted),
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
            SectionTitle("Topics")
            state.cramTopics.forEach { topic ->
                val checked = state.cramSelected.contains(topic.id)
                TopicPick(
                    name = topic.name,
                    meta = "${topic.questions} question${if (topic.questions == 1) "" else "s"} · " +
                        "${topic.notes} note${if (topic.notes == 1) "" else "s"}",
                    checked = checked,
                    onClick = { viewModel.toggleCramTopic(topic.id) },
                )
                Spacer(Modifier.height(10.dp))
            }

            Spacer(Modifier.height(8.dp))
            // Starting a session is the one green action on this screen — the
            // same call the dashboard makes about "Start review".
            PillButton(
                text = if (state.cramSelected.isEmpty()) "Pick at least one topic"
                else "Cram ${state.cramSelected.size} topic${if (state.cramSelected.size == 1) "" else "s"}",
                onClick = viewModel::startCram,
                enabled = state.cramSelected.isNotEmpty() && !state.busy,
                tone = if (state.cramSelected.isEmpty()) PillTone.Secondary else PillTone.Good,
                icon = if (state.cramSelected.isEmpty()) null else RevisioIcons.cram,
                trailing = state.cramSelected.size.takeIf { it > 0 }?.toString(),
                large = true,
            )
        }

        Spacer(Modifier.height(12.dp))
        PillButton(
            text = "Refresh topics",
            onClick = { viewModel.loadCramTopics() },
            tone = PillTone.Ghost,
            icon = RevisioIcons.rotate,
        )
        Spacer(Modifier.height(28.dp))
    }
}

/**
 * A topic you can pick.
 *
 * The whole row is the target, and the tick is drawn on `--good` because
 * "selected for the thing you are about to do" is a state, not chrome.
 */
@Composable
internal fun TopicPick(name: String, meta: String, checked: Boolean, onClick: () -> Unit) {
    SurfaceCard(
        modifier = Modifier.clickable(onClick = onClick),
        border = if (checked) Good else Line,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(name, style = Type.strong.style(Ink))
                Text(meta, style = Type.fine.style(Muted))
            }
            Spacer(Modifier.size(12.dp))
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(if (checked) Good else Card2),
                contentAlignment = Alignment.Center,
            ) {
                if (checked) {
                    Icon(RevisioIcons.correct, size = 15, tint = revisioColors.background)
                }
            }
        }
    }
}
