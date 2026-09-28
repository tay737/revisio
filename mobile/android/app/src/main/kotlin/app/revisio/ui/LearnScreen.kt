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
import app.revisio.Destination
import app.revisio.UiState
import app.revisio.engine.Topic

/**
 * Learn — the reading.
 *
 * Subject → topic → notes, the same hierarchy as the web, but the topic row
 * carries the two intentions that actually matter on a phone: *Learn* meets the
 * unseen questions with the notes beside them, and the paper is what you read
 * when you are not being tested at all.
 *
 * Notes are reference material, which is the one thing the macaw blue is for —
 * so the notes affordance is the only place that colour appears on this screen.
 */
@Composable
fun LearnScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(20.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            ScreenTitle("Learn", eyebrow = "Notes")
            Spacer(Modifier.weight(1f))
            Segmented(
                options = listOf("detailed" to "Full", "summary" to "Brief"),
                selected = state.density,
                onSelect = viewModel::setDensity,
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "Notes for every topic, and the first questions that go with them.",
            style = Type.caption.style(Muted),
        )
        Spacer(Modifier.height(20.dp))

        if (state.subjects.isEmpty()) {
            SoftCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.learn, size = 16, tint = Muted)
                    Spacer(Modifier.size(10.dp))
                    Text(
                        if (!state.online) "Learn needs a connection once — the catalogue is not cached on this device. Today's review still works offline."
                        else "Nothing published yet. Ask a teacher to publish a subject, or create your own in My content on the web.",
                        style = Type.caption.style(Muted),
                    )
                }
            }
        }

        state.subjects.forEach { subject ->
            val open = state.openSubject == subject.id
            SurfaceCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(subject.name, style = Type.strong.style(Ink))
                        subject.description?.takeIf { it.isNotBlank() }?.let {
                            Spacer(Modifier.height(2.dp))
                            Text(it, style = Type.fine.style(Muted))
                        }
                    }
                    ChipPill("${subject.topicCount} ${if (subject.topicCount == 1) "topic" else "topics"}")
                }

                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Toggle(
                        label = if (open) "Hide topics" else "Show topics",
                        icon = if (open) RevisioIcons.collapse else RevisioIcons.expand,
                        onClick = { viewModel.toggleSubject(subject.id) },
                    )
                    Spacer(Modifier.weight(1f))
                    if (!subject.enrolled) {
                        SmallPill("Follow", RevisioIcons.join) { viewModel.enroll(subject.id) }
                    } else {
                        Badge("Following", BadgeTone.Good, RevisioIcons.correct)
                    }
                }

                if (open) {
                    Spacer(Modifier.height(16.dp))
                    Hairline()

                    val topics = state.topicsBySubject[subject.id]
                    when {
                        topics == null -> {
                            Spacer(Modifier.height(14.dp))
                            Text("Loading topics…", style = Type.caption.style(Muted))
                        }
                        topics.isEmpty() -> {
                            Spacer(Modifier.height(14.dp))
                            Text("No topics under this subject yet.", style = Type.caption.style(Muted))
                        }
                        else -> topics.forEach { topic ->
                            Spacer(Modifier.height(14.dp))
                            TopicRow(
                                topic = topic,
                                open = state.openTopic == topic.id,
                                density = state.density,
                                state = state,
                                viewModel = viewModel,
                            )
                            Spacer(Modifier.height(14.dp))
                            Hairline()
                        }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
        }

        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PillButton(
                text = "Refresh",
                onClick = { viewModel.loadSubjects() },
                tone = PillTone.Ghost,
                icon = RevisioIcons.rotate,
                modifier = Modifier.weight(1f),
            )
            PillButton(
                text = "Cram instead",
                onClick = { viewModel.go(Destination.CRAM) },
                tone = PillTone.Ghost,
                icon = RevisioIcons.cram,
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun TopicRow(
    topic: Topic,
    open: Boolean,
    density: String,
    state: UiState,
    viewModel: RevisioViewModel,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(topic.name, style = Type.strong.style(Ink))
                Text(
                    "${topic.questions} question${if (topic.questions == 1) "" else "s"} · " +
                        "${topic.notes} note${if (topic.notes == 1) "" else "s"}",
                    style = Type.fine.style(Muted),
                )
            }
            if (topic.visibility == "private") {
                Badge("Private", BadgeTone.Quiet, RevisioIcons.private)
            }
        }

        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PillButton(
                text = "Learn",
                onClick = { viewModel.startLearn(topic.id) },
                icon = RevisioIcons.review,
                modifier = Modifier.weight(1f),
            )
            PillButton(
                text = if (open) "Hide notes" else "Read notes",
                onClick = { viewModel.toggleTopic(topic.id) },
                tone = PillTone.Secondary,
                icon = RevisioIcons.notes,
                modifier = Modifier.weight(1f),
            )
        }

        if (open) {
            Spacer(Modifier.height(14.dp))
            val lessons = state.lessonsByTopic[topic.id]
            when {
                lessons == null -> Text("Loading notes…", style = Type.caption.style(Muted))
                lessons.isEmpty() -> Text("No notes written for this topic yet.", style = Type.caption.style(Muted))
                else -> lessons.forEach { lesson ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(lesson.title, style = Type.strong.style(Ink), modifier = Modifier.weight(1f))
                        lesson.specRefs?.takeIf { it.isNotBlank() }?.let { ChipPill(it) }
                    }
                    Spacer(Modifier.height(8.dp))
                    Notes(
                        (if (density == "summary") lesson.summaryMd else lesson.detailedMd)
                            ?.takeIf { it.isNotBlank() }
                            ?: lesson.detailedMd.orEmpty(),
                    )
                }
            }
        }
    }
}

/**
 * A small ink pill for a third-tier action, sized down rather than given its own
 * component: the stylesheet's radius and lip still apply, only the height drops.
 */
@Composable
private fun SmallPill(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(Radius.pill))
            .background(Ink)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, size = 14, tint = revisioColors.primaryForeground)
        Text(label, style = Type.captionS.style(revisioColors.primaryForeground))
    }
}

/** A quiet disclosure control: a hairline affordance, not a filled button. */
@Composable
private fun Toggle(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier.clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(label, style = Type.captionS.style(Ink))
        Icon(icon, size = 15, tint = Muted)
    }
}
