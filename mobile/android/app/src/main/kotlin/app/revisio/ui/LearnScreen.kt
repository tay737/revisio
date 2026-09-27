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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.revisio.RevisioViewModel
import app.revisio.Tab
import app.revisio.UiState

/**
 * Learn — the reading surface.
 *
 * Subject → topic → notes, the same hierarchy as the web, but the topic row
 * carries the two intentions that actually matter on a phone: *Learn* meets the
 * unseen questions with the notes beside them, and the paper is what you read
 * when you are not being tested at all.
 */
@Composable
fun LearnScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Learn", fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            DensityToggle(state.density, viewModel::setDensity)
        }
        Spacer(Modifier.height(4.dp))
        Text("Notes for every topic, and the first questions that go with them.", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(16.dp))

        if (state.subjects.isEmpty()) {
            EmptyNote(
                if (!state.online) "Learn needs a connection once — the catalogue is not cached on this device. Today's review still works offline."
                else "Nothing published yet. Ask a teacher to publish a subject, or create your own in My content on the web.",
            )
        }

        state.subjects.forEach { subject ->
            val open = state.openSubject == subject.id
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(subject.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        subject.description?.takeIf { it.isNotBlank() }?.let {
                            Text(it, color = Muted, fontSize = 12.sp)
                        }
                    }
                    Chip("${subject.topicCount} ${if (subject.topicCount == 1) "topic" else "topics"}")
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { viewModel.toggleSubject(subject.id) }) {
                        Text(if (open) "Hide topics" else "Show topics", fontSize = 13.sp)
                    }
                    Spacer(Modifier.weight(1f))
                    if (!subject.enrolled) {
                        OutlinedButton(
                            onClick = { viewModel.enroll(subject.id) },
                            shape = RoundedCornerShape(12.dp),
                        ) { Text("Follow", fontSize = 13.sp) }
                    } else {
                        Text("Following", color = Good, fontSize = 12.sp)
                    }
                }

                if (open) {
                    Spacer(Modifier.height(8.dp))
                    Divider()
                    Spacer(Modifier.height(8.dp))
                    val topics = state.topicsBySubject[subject.id]
                    when {
                        topics == null -> Text("Loading topics…", color = Muted, fontSize = 13.sp)
                        topics.isEmpty() -> Text("No topics under this subject yet.", color = Muted, fontSize = 13.sp)
                        else -> topics.forEach { topic ->
                            val topicOpen = state.openTopic == topic.id
                            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(topic.name, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                                        Text(
                                            "${topic.questions} question${if (topic.questions == 1) "" else "s"} · ${topic.notes} note${if (topic.notes == 1) "" else "s"}",
                                            color = Muted,
                                            fontSize = 12.sp,
                                        )
                                    }
                                    if (topic.visibility == "private") Chip("private")
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = { viewModel.startLearn(topic.id) },
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f),
                                    ) { Text("Learn", fontSize = 13.sp) }
                                    OutlinedButton(
                                        onClick = { viewModel.toggleTopic(topic.id) },
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f),
                                    ) { Text(if (topicOpen) "Hide notes" else "Read notes", fontSize = 13.sp) }
                                }

                                if (topicOpen) {
                                    Spacer(Modifier.height(8.dp))
                                    val lessons = state.lessonsByTopic[topic.id]
                                    when {
                                        lessons == null -> Text("Loading notes…", color = Muted, fontSize = 13.sp)
                                        lessons.isEmpty() -> Text("No notes written for this topic yet.", color = Muted, fontSize = 13.sp)
                                        else -> lessons.forEach { lesson ->
                                            Spacer(Modifier.height(6.dp))
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text(lesson.title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                                                lesson.specRefs?.takeIf { it.isNotBlank() }?.let { Chip(it) }
                                            }
                                            Spacer(Modifier.height(6.dp))
                                            Notes(
                                                (if (state.density == "summary") lesson.summaryMd else lesson.detailedMd)
                                                    ?.takeIf { it.isNotBlank() }
                                                    ?: lesson.detailedMd.orEmpty(),
                                            )
                                            Spacer(Modifier.height(10.dp))
                                        }
                                    }
                                }
                            }
                            Divider()
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TextButton(onClick = { viewModel.loadSubjects() }) { Text("Refresh", color = Muted) }
            TextButton(onClick = { viewModel.selectTab(Tab.CRAM) }) { Text("Cram instead", color = Muted) }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun DensityToggle(density: String, onSet: (String) -> Unit) {
    Row(
        modifier = Modifier.padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        listOf("detailed" to "Full", "summary" to "Summary").forEach { (value, label) ->
            val active = density == value
            if (active) {
                Button(onClick = { onSet(value) }, shape = RoundedCornerShape(10.dp)) { Text(label, fontSize = 12.sp) }
            } else {
                TextButton(onClick = { onSet(value) }) { Text(label, fontSize = 12.sp, color = Muted) }
            }
        }
    }
}
