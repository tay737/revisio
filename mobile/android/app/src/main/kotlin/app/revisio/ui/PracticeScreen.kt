package app.revisio.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState

/**
 * Practice — generated maths drills.
 *
 * The generator is the server's, and that is the design rather than an accident:
 * a question is derived from its id, so this screen never holds an answer key and
 * there is no second implementation of the maths to drift from the web's. The
 * phone asks for a paper, shows the prompt, and sends back an id and a string.
 *
 * Practice is also deliberately outside the scheduler — nothing here writes a
 * review log or moves a card — which is why it gets its own destination instead
 * of being folded into Cram. It is the difference between "I want to get better
 * at quadratics" and "I have an exam in three days".
 *
 * The three phases are the web's: pick, run, and a summary that shows what was
 * worth another look, because a scoreline alone teaches nothing.
 */
@Composable
fun PracticeScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle("Practice", eyebrow = "Drills")
        Spacer(Modifier.height(4.dp))
        Text(
            "Generate maths questions. Your schedule stays out of it.",
            style = Type.caption.style(Muted),
        )
        Spacer(Modifier.height(18.dp))

        when {
            state.practiceDone -> PracticeSummary(state, viewModel)
            state.practicePaper.isNotEmpty() -> PracticeRun(state, viewModel)
            else -> PracticePick(state, viewModel)
        }

        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun PracticePick(state: UiState, viewModel: RevisioViewModel) {
    if (state.mathsSubjects.isEmpty()) {
        SoftCard {
            Text(
                if (state.busy) "Looking for subjects with practice…"
                else "No subject has maths practice yet.",
                style = Type.caption.style(Muted),
            )
        }
        return
    }

    SurfaceCard(modifier = Modifier.entrance(scale = true)) {
        Text("Subject", style = Type.strong.style(Ink))
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            state.mathsSubjects.forEach { subject ->
                ChipPill(
                    subject.name,
                    active = state.practiceSubject == subject.id,
                    onClick = { viewModel.selectPracticeSubject(subject.id) },
                )
            }
        }
    }

    val catalogue = state.mathsCatalogue
    if (catalogue != null && catalogue.topics.isNotEmpty()) {
        Spacer(Modifier.height(16.dp))
        SurfaceCard(modifier = Modifier.entrance(index = 1, scale = true)) {
            Text("Topics", style = Type.strong.style(Ink))
            Spacer(Modifier.height(4.dp))
            Text(
                "None chosen means every topic in the subject.",
                style = Type.fine.style(Muted),
            )
            Spacer(Modifier.height(10.dp))
            catalogue.topics.forEachIndexed { index, topic ->
                if (index > 0) Spacer(Modifier.height(10.dp))
                Shortcut(
                    RevisioIcons.topic,
                    topic.name,
                    "${topic.sets.size} set${if (topic.sets.size == 1) "" else "s"}",
                    trailing = if (state.practiceTopics.contains(topic.id)) "Chosen" else null,
                ) { viewModel.togglePracticeTopic(topic.id) }
            }
        }

        if (catalogue.concepts.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 2, scale = true)) {
                Text("Concepts", style = Type.strong.style(Ink))
                Spacer(Modifier.height(4.dp))
                Text(
                    "Narrow the drill to particular skills. None chosen means all of them.",
                    style = Type.fine.style(Muted),
                )
                Spacer(Modifier.height(10.dp))
                // The catalogue is long — several dozen concepts — so it is spaced
                // rather than chunked: a chip row that wraps in a scroll view reads
                // better than twenty rows of one chip each.
                catalogue.concepts.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        pair.forEach { concept ->
                            ChipPill(
                                concept.name,
                                active = state.practiceConcepts.contains(concept.id),
                                onClick = { viewModel.togglePracticeConcept(concept.id) },
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    SurfaceCard(modifier = Modifier.entrance(index = 3, scale = true)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Difficulty", style = Type.captionS.style(Ink))
                Text("Mixed deals from every band.", style = Type.fine.style(Muted))
            }
            Segmented(
                options = listOf("easy" to "Easy", "medium" to "Medium", "hard" to "Hard", "mixed" to "Mixed"),
                selected = state.practiceDifficulty,
                onSelect = viewModel::setPracticeDifficulty,
            )
        }
        Spacer(Modifier.height(14.dp))
        Hairline()
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Questions", style = Type.captionS.style(Ink))
                Text("Between 1 and 30.", style = Type.fine.style(Muted))
            }
            Segmented(
                options = listOf("5" to "5", "10" to "10", "15" to "15", "20" to "20"),
                selected = state.practiceCount.toString(),
                onSelect = { viewModel.setPracticeCount(it.toInt()) },
            )
        }
        Spacer(Modifier.height(18.dp))
        PillButton(
            text = "Start practice",
            onClick = viewModel::startPractice,
            tone = PillTone.Good,
            icon = RevisioIcons.start,
            enabled = !state.busy,
            large = true,
        )
    }
}

@Composable
private fun PracticeRun(state: UiState, viewModel: RevisioViewModel) {
    val question = state.practicePaper.getOrNull(state.practiceIndex) ?: return
    val mark = state.practiceMark

    Column(modifier = Modifier.entrance()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Label("${question.conceptName} · ${question.difficulty}", token = Type.eyebrow, color = Muted)
            Spacer(Modifier.weight(1f))
            Label(
                "${state.practiceIndex + 1} / ${state.practicePaper.size}",
                token = Type.micro,
                color = Muted,
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "${question.marks} mark${if (question.marks == 1) "" else "s"}",
            style = Type.fine.style(Muted),
        )
        Spacer(Modifier.height(10.dp))
        Meter(
            ((state.practiceIndex + if (mark != null) 1 else 0) * 100) / state.practicePaper.size.coerceAtLeast(1),
            tint = Ink,
            height = 6.dp,
        )

        Spacer(Modifier.height(20.dp))
        // The prompt is maths, so it is set in the num ladder rather than prose:
        // expressions are read as figures, not sentences.
        Text(question.prompt, style = Type.displaySm.style(Ink))

        Spacer(Modifier.height(20.dp))
        if (mark == null) {
            PracticeAnswerField(state.practiceAnswer, viewModel::setPracticeAnswer)
            Spacer(Modifier.height(20.dp))
            PillButton(
                text = "Check",
                onClick = viewModel::markPractice,
                tone = PillTone.Good,
                enabled = state.practiceAnswer.isNotBlank() && !state.busy,
                large = true,
            )
        } else {
            SurfaceCard(border = (if (mark.correct) Good else Bad).copy(alpha = 0.45f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BoxedGlyph(
                        if (mark.correct) RevisioIcons.correct else RevisioIcons.close,
                        tint = if (mark.correct) Good else Bad,
                        size = 30,
                    )
                    Spacer(Modifier.size(12.dp))
                    Text(
                        if (mark.correct) "Correct" else "Not quite",
                        style = Type.strong.style(if (mark.correct) Good else Bad),
                        modifier = Modifier.weight(1f),
                    )
                    Badge("+${mark.marks}", BadgeTone.Gold, RevisioIcons.xp)
                }
                Spacer(Modifier.height(12.dp))
                Hairline()
                Spacer(Modifier.height(12.dp))
                Text("Answer", style = Type.eyebrow.style(Muted))
                Text(mark.answer, style = Type.strong.style(Ink))
                if (mark.solution.isNotBlank() && !mark.correct) {
                    Spacer(Modifier.height(10.dp))
                    Text("Working", style = Type.eyebrow.style(Muted))
                    Text(mark.solution, style = Type.caption.style(Muted))
                }
            }
            Spacer(Modifier.height(16.dp))
            PillButton(
                text = if (state.practiceIndex + 1 >= state.practicePaper.size) "Finish" else "Next question",
                onClick = viewModel::nextPracticeQuestion,
                icon = if (state.practiceIndex + 1 >= state.practicePaper.size) RevisioIcons.correct else RevisioIcons.next,
                large = true,
            )
        }

        Spacer(Modifier.height(12.dp))
        PillButton(text = "Leave practice", onClick = viewModel::endPractice, tone = PillTone.Ghost)
    }
}

@Composable
private fun PracticeSummary(state: UiState, viewModel: RevisioViewModel) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BoxedGlyph(RevisioIcons.practice, size = 64)
        Spacer(Modifier.height(16.dp))
        Text("Practice complete", style = Type.title.style(Ink), textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "${state.practiceCorrect} of ${state.practicePaper.size} correct",
            style = Type.lead.style(Muted),
        )
        if (state.practiceXp != null) {
            Spacer(Modifier.height(10.dp))
            Badge("+${state.practiceXp.xpAwarded} XP", BadgeTone.Gold, RevisioIcons.xp)
        }

        Spacer(Modifier.height(20.dp))
        SurfaceCard {
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Stat("Correct", "${state.practiceCorrect}", Good)
                Stat("Marks", "${state.practiceMarks}")
                Stat("Out of", "${state.practiceMaxMarks}")
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "These never touched your schedule — practice only earns XP.",
            style = Type.fine.style(Muted),
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(24.dp))
        PillButton(
            text = "Back to setup",
            onClick = viewModel::endPractice,
            icon = RevisioIcons.rotate,
            large = true,
        )
    }
}

@Composable
private fun PracticeAnswerField(value: String, onChange: (String) -> Unit) {
    androidx.compose.material3.OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text("Your answer", style = Type.body.style(Muted.copy(alpha = 0.75f))) },
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
