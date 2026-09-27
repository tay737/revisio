package app.revisio.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.revisio.RevisioViewModel
import app.revisio.UiState

/**
 * Cram — the drill.
 *
 * Time-boxed practice that bypasses the scheduler on purpose: nothing here moves
 * a card's due date, which is what makes it safe to do the night before an exam.
 * The marks are still the server's, and the notes come along at whichever
 * density was asked for.
 */
@Composable
fun CramScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        Text("Cram", fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Practice without touching the schedule — nothing you cram is re-scheduled.",
            color = Muted,
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(16.dp))

        if (state.cramTopics.isEmpty()) {
            EmptyNote(
                if (!state.online) "Cram needs a connection: the server deals the questions."
                else "No topics to cram yet.",
            )
        } else {
            Panel {
                Text("Notes", color = Muted, fontSize = 12.sp)
                Spacer(Modifier.height(6.dp))
                DensityToggle(state.density, viewModel::setDensity)
                Spacer(Modifier.height(14.dp))
                Text("Questions per topic", color = Muted, fontSize = 12.sp)
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextButton(onClick = { viewModel.setMaxPerTopic(state.maxPerTopic - 5) }) { Text("−5") }
                    Text("${state.maxPerTopic}", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = { viewModel.setMaxPerTopic(state.maxPerTopic + 5) }) { Text("+5") }
                }
            }

            Spacer(Modifier.height(14.dp))
            SectionTitle("Topics")
            state.cramTopics.forEach { topic ->
                val checked = state.cramSelected.contains(topic.id)
                Panel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = checked, onCheckedChange = { viewModel.toggleCramTopic(topic.id) })
                        Column(modifier = Modifier.weight(1f)) {
                            Text(topic.name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                            Text(
                                "${topic.questions} question${if (topic.questions == 1) "" else "s"} · ${topic.notes} note${if (topic.notes == 1) "" else "s"}",
                                color = Muted,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            Spacer(Modifier.height(6.dp))
            Button(
                onClick = viewModel::startCram,
                enabled = state.cramSelected.isNotEmpty() && !state.busy,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                Text(
                    if (state.cramSelected.isEmpty()) "Pick at least one topic"
                    else "Cram ${state.cramSelected.size} topic${if (state.cramSelected.size == 1) "" else "s"}",
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        Spacer(Modifier.height(10.dp))
        TextButton(onClick = { viewModel.loadCramTopics() }) { Text("Refresh", color = Muted) }
        Spacer(Modifier.height(24.dp))
    }
}
