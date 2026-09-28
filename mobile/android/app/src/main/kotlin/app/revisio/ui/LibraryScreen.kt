package app.revisio.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.revisio.Destination
import app.revisio.RevisioViewModel
import app.revisio.UiState

/**
 * Library — subjects and topics.
 *
 * The web's `/library` is two things stacked: the catalogue every learner reads,
 * and the authoring tools (`ComposeTopic`, `ImportDeck`, `GenerateCloze`,
 * `MathsSets`, `ClozeMarking`) that only a teacher or developer sees. The
 * catalogue is the half a phone needs — a learner on a train wants to find the
 * topic and open its notes — so this is that half, and it says so rather than
 * pretending: the authoring cards are not here.
 *
 * What it does keep is the one write a learner has over their own content: a
 * topic they wrote can be switched between private and public, and the switch
 * reports the counts the server actually changed.
 */
@Composable
fun LibraryScreen(state: UiState, viewModel: RevisioViewModel) {
    var classCode by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle("Library", eyebrow = "Content")
        Spacer(Modifier.height(4.dp))
        Text(
            "Subjects and topics. Everything you are studying, and everything you could.",
            style = Type.caption.style(Muted),
        )

        Spacer(Modifier.height(18.dp))
        if (state.subjects.isEmpty()) {
            SoftCard {
                Text(
                    if (state.busy) "Loading the catalogue…"
                    else "The catalogue needs a connection. Your reviews still work offline.",
                    style = Type.caption.style(Muted),
                )
            }
        } else {
            state.subjects.forEachIndexed { index, subject ->
                val open = state.openSubject == subject.id
                val topics = state.topicsBySubject[subject.id]
                SurfaceCard(modifier = Modifier.entrance(index = index, scale = true)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { viewModel.toggleSubject(subject.id) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        BoxedGlyph(if (open) RevisioIcons.collapse else RevisioIcons.expand)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(subject.name, style = Type.strong.style(Ink))
                            Text(
                                "${subject.topicCount} topic${if (subject.topicCount == 1) "" else "s"}" +
                                    if (subject.description != null) " · ${subject.description}" else "",
                                style = Type.fine.style(Muted),
                            )
                        }
                        if (!subject.enrolled) {
                            ChipPill("Follow", onClick = { viewModel.enroll(subject.id) })
                        }
                    }

                    if (open) {
                        Spacer(Modifier.height(12.dp))
                        Hairline()
                        if (topics == null) {
                            Spacer(Modifier.height(12.dp))
                            Text("Loading topics…", style = Type.caption.style(Muted))
                        } else if (topics.isEmpty()) {
                            Spacer(Modifier.height(12.dp))
                            Text("No topics here yet.", style = Type.caption.style(Muted))
                        } else {
                            topics.forEachIndexed { topicIndex, topic ->
                                if (topicIndex > 0) Hairline()
                                TopicRow(topic.name, topic.cards ?: topic.cardCount ?: 0, topic.visibility) { visibility ->
                                    viewModel.setTopicVisibility(topic.id, visibility)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
            }
        }

        Spacer(Modifier.height(10.dp))
        SurfaceCard {
            Text("Join a class", style = Type.strong.style(Ink))
            Spacer(Modifier.height(4.dp))
            Text(
                "Your teacher gives you a code; the class's content appears here.",
                style = Type.fine.style(Muted),
            )
            Spacer(Modifier.height(12.dp))
            ClassCodeField(value = classCode, onChange = { classCode = it.uppercase() })
            Spacer(Modifier.height(12.dp))
            PillButton(
                text = "Join",
                onClick = { viewModel.joinClass(classCode) },
                tone = PillTone.Secondary,
                icon = RevisioIcons.join,
                enabled = classCode.isNotBlank() && !state.busy,
            )
        }

        Spacer(Modifier.height(20.dp))
        SurfaceCard {
            Text("Where else to go", style = Type.strong.style(Ink))
            Spacer(Modifier.height(10.dp))
            Shortcut(RevisioIcons.practice, "Practice", "Generated maths drills") {
                viewModel.go(Destination.PRACTICE)
            }
            Spacer(Modifier.height(6.dp))
            Shortcut(RevisioIcons.exam, "Exam", "Sit a marked paper") {
                viewModel.go(Destination.EXAM)
            }
            Spacer(Modifier.height(6.dp))
            Shortcut(RevisioIcons.cram, "Cram", "Sprint before an exam") {
                viewModel.go(Destination.CRAM)
            }
        }

        Spacer(Modifier.height(28.dp))
    }
}

/**
 * One topic: its name, how many cards it holds, and its visibility.
 *
 * The toggle only appears where the server said a visibility — `null` means the
 * public catalogue, which nobody edits from here. Offering a control that will
 * be refused is worse than not offering it.
 */
@Composable
private fun TopicRow(name: String, cards: Int, visibility: String?, onVisibility: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(name, style = Type.captionS.style(Ink))
            Text("$cards card${if (cards == 1) "" else "s"}", style = Type.fine.style(Muted))
        }
        if (visibility != null) {
            ChipPill(
                if (visibility == "public") "Public" else "Private",
                active = visibility == "public",
                icon = if (visibility == "public") RevisioIcons.visible else RevisioIcons.private,
                onClick = { onVisibility(if (visibility == "public") "private" else "public") },
            )
        }
    }
}

/** The join box: an uppercase code with no label, because its placeholder is one. */
@Composable
private fun ClassCodeField(value: String, onChange: (String) -> Unit) {
    androidx.compose.material3.OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text("CLASS-CODE", style = Type.body.style(Muted.copy(alpha = 0.75f))) },
        singleLine = true,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(Radius.sm),
        textStyle = Type.body.style(Ink),
        colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Ink,
            unfocusedBorderColor = Line,
            cursorColor = Ink,
            focusedContainerColor = Card1,
            unfocusedContainerColor = Card1,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}
