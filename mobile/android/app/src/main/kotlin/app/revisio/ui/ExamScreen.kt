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
import app.revisio.engine.ExamQuestion

/**
 * Exam simulator — sit a marked paper.
 *
 * The web's `/exam` is not another loop with a different label, and porting it as
 * one would have missed the point. A paper is dealt by topic, the mark scheme
 * stays on the server until the script is handed in, and handing it in *stores an
 * attempt* — so this is the one surface in the app that produces a record rather
 * than moving a schedule.
 *
 * The three phases are the web's: pick topics, sit the paper, read the marked
 * script. None of them is optional and none is merged, because "which topics
 * should this cover" and "what did I get" are different questions and a screen
 * that answers both at once answers neither.
 */
@Composable
fun ExamScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle("Exam simulator", eyebrow = "Papers")
        Spacer(Modifier.height(4.dp))
        Text("Marked against the mark scheme.", style = Type.caption.style(Muted))
        Spacer(Modifier.height(18.dp))

        when {
            state.examResult != null -> ExamMarked(state, viewModel)
            state.examPaper.isNotEmpty() -> ExamRun(state, viewModel)
            else -> ExamPick(state, viewModel)
        }

        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun ExamPick(state: UiState, viewModel: RevisioViewModel) {
    val pool = state.examPool

    SurfaceCard(modifier = Modifier.entrance(scale = true)) {
        Text("Topics", style = Type.strong.style(Ink))
        Spacer(Modifier.height(4.dp))
        Text(
            "The paper is dealt from the topics you choose. A topic with no questions cannot be picked.",
            style = Type.fine.style(Muted),
        )
        Spacer(Modifier.height(12.dp))

        if (pool == null) {
            Text(if (state.busy) "Loading the question pool…" else "Nothing loaded yet.", style = Type.caption.style(Muted))
        } else {
            Text(
                "${pool.questionsAvailable} question${if (pool.questionsAvailable == 1) "" else "s"} available",
                style = Type.micro.style(Muted),
            )
            Spacer(Modifier.height(10.dp))
            pool.topics.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    pair.forEach { topic ->
                        ChipPill(
                            topic.name,
                            active = state.examPicked.contains(topic.id),
                            onClick = { viewModel.toggleExamTopic(topic.id) },
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
            }

            Spacer(Modifier.height(14.dp))
            PillButton(
                text = if (state.examBusy) "Building the paper…" else "Sit a paper",
                onClick = { viewModel.startExam() },
                tone = PillTone.Good,
                icon = RevisioIcons.exam,
                enabled = state.examPicked.isNotEmpty() && !state.examBusy,
                large = true,
            )
        }
    }

    // Past attempts are shown, not hidden: a learner who has sat this paper before
    // should be able to see whether the last one went better.
    val attempts = pool?.attempts.orEmpty()
    if (attempts.isNotEmpty()) {
        Spacer(Modifier.height(20.dp))
        SurfaceCard {
            Text("Past papers", style = Type.strong.style(Ink))
            Spacer(Modifier.height(10.dp))
            attempts.take(8).forEachIndexed { index, attempt ->
                if (index > 0) Hairline()
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        // The server stores halves, so the display halves too —
                        // a mark out of 20 shown as 40/20 would be a port bug.
                        Text(
                            "${(attempt.score / 2).let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() }}" +
                                " / ${(attempt.maxScore / 2).toInt()}",
                            style = Type.strong.style(Ink),
                        )
                        Text(attempt.createdAt?.take(10) ?: "—", style = Type.fine.style(Muted))
                    }
                    Badge(
                        "${if (attempt.maxScore > 0) ((attempt.score / attempt.maxScore) * 100).toInt() else 0}%",
                        BadgeTone.Quiet,
                    )
                }
            }
        }
    }
}

@Composable
private fun ExamRun(state: UiState, viewModel: RevisioViewModel) {
    val answered = state.examAnswers.size
    val total = state.examPaper.size

    Column(modifier = Modifier.entrance()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Label("Paper", token = Type.eyebrow, color = Muted)
            Spacer(Modifier.weight(1f))
            Label("$answered / $total answered", token = Type.micro, color = Muted)
        }
        Spacer(Modifier.height(10.dp))
        Meter((answered * 100) / total.coerceAtLeast(1), tint = Ink, height = 6.dp)
        Spacer(Modifier.height(20.dp))

        state.examPaper.forEachIndexed { index, question ->
            ExamQuestionBlock(
                index = index + 1,
                question = question,
                answer = state.examAnswers[question.id].orEmpty(),
                onChange = { viewModel.setExamAnswer(question.id, it) },
            )
            Spacer(Modifier.height(14.dp))
        }

        Spacer(Modifier.height(6.dp))
        PillButton(
            text = if (state.examBusy) "Handing in…" else "Hand in",
            onClick = viewModel::submitExam,
            icon = RevisioIcons.publish,
            enabled = !state.examBusy,
            large = true,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "The mark scheme is applied when you hand in — the paper never carried it.",
            style = Type.fine.style(Muted),
        )
        Spacer(Modifier.height(12.dp))
        PillButton(text = "Leave paper", onClick = viewModel::endExam, tone = PillTone.Ghost)
    }
}

@Composable
private fun ExamQuestionBlock(index: Int, question: ExamQuestion, answer: String, onChange: (String) -> Unit) {
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("$index", style = Type.numSm.style(Muted))
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(question.questionMd, style = Type.strong.style(Ink))
                Text(
                    "${question.marks} mark${if (question.marks == 1) "" else "s"}" +
                        (question.board?.let { " · $it" } ?: "") +
                        (question.sourceYear?.let { " $it" } ?: ""),
                    style = Type.fine.style(Muted),
                )
            }
        }
        Spacer(Modifier.height(14.dp))

        if (question.kind == "mcq") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                question.options.orEmpty().forEachIndexed { optionIndex, option ->
                    val letter = ('A' + optionIndex).toString()
                    OptionRow(
                        text = "$letter. $option",
                        state = if (answer == letter) OptionState.Selected else OptionState.Idle,
                        enabled = true,
                        onClick = { onChange(letter) },
                    )
                }
            }
        } else {
            androidx.compose.material3.OutlinedTextField(
                value = answer,
                onValueChange = onChange,
                placeholder = {
                    Text("Your answer", style = Type.body.style(Muted.copy(alpha = 0.75f)))
                },
                minLines = 3,
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
    }
}

@Composable
private fun ExamMarked(state: UiState, viewModel: RevisioViewModel) {
    val result = state.examResult ?: return

    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        BoxedGlyph(RevisioIcons.exam, size = 64)
        Spacer(Modifier.height(16.dp))
        Text("Paper marked", style = Type.title.style(Ink), textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "${result.score.formatted()} of ${result.maxScore.formatted()} · ${result.percentage}%",
            style = Type.lead.style(Muted),
        )
        if (result.xpAwarded > 0) {
            Spacer(Modifier.height(10.dp))
            Badge("+${result.xpAwarded} XP", BadgeTone.Gold, RevisioIcons.xp)
        }
    }

    Spacer(Modifier.height(20.dp))
    SurfaceCard {
        Text("Marked script", style = Type.strong.style(Ink))
        Spacer(Modifier.height(10.dp))
        result.detail.forEachIndexed { index, line ->
            if (index > 0) Hairline()
            val question = state.examPaper.firstOrNull { it.id == line.questionId }
            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${index + 1}.",
                        style = Type.captionS.style(Muted),
                    )
                    Spacer(Modifier.size(10.dp))
                    Text(
                        question?.questionMd ?: "Question",
                        style = Type.captionS.style(Ink),
                        modifier = Modifier.weight(1f),
                    )
                    Badge(
                        "${line.awarded.formatted()} / ${line.marks}",
                        if (line.correct) BadgeTone.Good else BadgeTone.Streak,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Your answer: ${line.userAnswer.ifBlank { "—" }}",
                    style = Type.fine.style(Muted),
                )
                Spacer(Modifier.height(4.dp))
                Text(line.feedback, style = Type.fine.style(if (line.correct) Good else Warn))
            }
        }
    }

    Spacer(Modifier.height(24.dp))
    Column(modifier = Modifier.fillMaxWidth()) {
        PillButton(
            text = "Back to the pool",
            onClick = viewModel::endExam,
            icon = RevisioIcons.rotate,
            large = true,
        )
    }
}

/**
 * Halves are real marks, so they are shown as halves.
 *
 * The server stores an exam score doubled so that a half mark survives the round
 * trip; printing `3.0` where the learner earned `3` would be the port leaking its
 * own arithmetic.
 */
private fun Double.formatted(): String =
    if (this % 1.0 == 0.0) toInt().toString() else toString()
