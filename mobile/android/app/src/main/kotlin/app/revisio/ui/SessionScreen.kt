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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.revisio.Feedback
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.FeedbackKind
import app.revisio.engine.QuizCard
import app.revisio.engine.StudyMode

/**
 * The review loop, in whichever mode it was started.
 *
 * One screen for today's queue, first exposure and cram: the server picks which
 * cards and grades the answers in all three, and the only difference the learner
 * sees is the label and whether the notes travel alongside. Building three loops
 * would have meant three places for a mark to be awarded differently.
 */
@Composable
fun SessionScreen(state: UiState, viewModel: RevisioViewModel) {
    if (state.finished) {
        SummaryScreen(state, viewModel)
        return
    }
    val card = state.cards.getOrNull(state.index) ?: return
    val feedback = state.feedback
    val notes = viewModel.notesFor(card)

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(state.mode.label, color = Accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.size(8.dp))
            Text(state.sessionTitle, color = Muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Text("${state.index + 1} / ${state.cards.size}", color = Muted, fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
        LinearProgressIndicator(
            progress = { (state.index + 1).toFloat() / state.cards.size.toFloat() },
            modifier = Modifier.fillMaxWidth().height(6.dp),
            color = Accent,
        )

        if (notes.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            TextButton(onClick = viewModel::toggleNotes) {
                Text(if (state.notesOpen) "Hide notes" else "Show notes (${notes.size})", fontSize = 13.sp)
            }
            if (state.notesOpen) {
                notes.forEach { note ->
                    Panel {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(note.title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                            note.specRefs?.takeIf { it.isNotBlank() }?.let { Chip(it) }
                        }
                        if (note.hasAnyBody()) {
                            Spacer(Modifier.height(10.dp))
                            Notes(note.body(state.density == "summary"))
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        Text(card.subjectName + " · " + card.topicName, color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(8.dp))
        Text(card.promptText, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(18.dp))

        if (card.kind == "mcq") {
            McqInput(card, state.selection, feedback != null, viewModel::setSelection)
        } else {
            OutlinedTextField(
                value = state.answer,
                onValueChange = viewModel::setAnswer,
                enabled = feedback == null,
                placeholder = {
                    Text(if (card.kind == "flashcard") "Say it in your own words" else "Your answer", color = Muted)
                },
                singleLine = card.kind == "cloze",
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(18.dp))

        if (feedback == null) {
            Button(
                onClick = viewModel::submit,
                enabled = inputReady(card, state.answer, state.selection),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
            ) { Text("Check", fontWeight = FontWeight.SemiBold) }
        } else {
            FeedbackPanel(feedback)
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = viewModel::next,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(
                    if (state.index + 1 >= state.cards.size) "Finish" else "Next card",
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        Spacer(Modifier.height(10.dp))
        TextButton(onClick = viewModel::endReview) { Text("Leave session", color = Muted, fontSize = 13.sp) }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun McqInput(card: QuizCard, selection: String?, locked: Boolean, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        card.options.orEmpty().forEach { option ->
            val chosen = option.id == selection
            if (chosen) {
                Button(
                    onClick = { if (!locked) onSelect(option.id) },
                    enabled = !locked,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                ) { Text(option.text, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Start) }
            } else {
                OutlinedButton(
                    onClick = { if (!locked) onSelect(option.id) },
                    enabled = !locked,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                ) { Text(option.text, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Start) }
            }
        }
    }
}

@Composable
private fun FeedbackPanel(feedback: Feedback) {
    val verdict = feedback.verdict
    val (label, colour) = when (verdict?.feedbackKind) {
        FeedbackKind.CORRECT -> "Correct" to Good
        FeedbackKind.CASE_ONLY, FeedbackKind.PUNCTUATION_ONLY, FeedbackKind.CASE_AND_PUNCTUATION ->
            "Correct — check your spelling" to Good
        FeedbackKind.NEAR_MISS -> "Nearly there" to Near
        FeedbackKind.WRONG -> "Not quite" to Bad
        null -> "Saved" to Near
    }

    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = colour, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
            if (feedback.xpAwarded > 0) Text("+${feedback.xpAwarded} XP", color = Good, fontSize = 14.sp)
        }
        verdict?.note?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, color = Color(0xFFC7C7CC), fontSize = 14.sp)
        }
        feedback.correctAnswer?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(10.dp))
            Text("Answer: $it", fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
        verdict?.missedPhrases?.takeIf { it.isNotEmpty() }?.let { missed ->
            Spacer(Modifier.height(6.dp))
            Text("Missing: ${missed.joinToString(", ")}", color = Muted, fontSize = 13.sp)
        }
        feedback.explanation?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Color(0xFFC7C7CC), fontSize = 13.sp)
        }
        if (feedback.provisional) {
            Spacer(Modifier.height(10.dp))
            // Say which of the two situations this is. A card from today's pack
            // carries its key, so the mark above is the real one, held back only
            // by the network; a card the server picked has no key here at all,
            // and pretending otherwise would be inventing a mark.
            Text(
                if (verdict == null) {
                    "Saved on this device. This card came from the server, so the server will mark it when you reconnect."
                } else {
                    "Saved on this device. The server will confirm this mark when you reconnect."
                },
                color = Near,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun SummaryScreen(state: UiState, viewModel: RevisioViewModel) {
    val percent = if (state.answered == 0) 0 else (state.correct * 100) / state.answered
    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Crest(72)
        Spacer(Modifier.height(20.dp))
        Text(
            when (state.mode) {
                StudyMode.CRAM -> "Cram complete"
                StudyMode.LEARN -> "Topic met"
                StudyMode.DAILY -> "Session complete"
            },
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(8.dp))
        Text("${state.correct} of ${state.answered} correct ($percent%)", color = Muted)
        if (state.mode == StudyMode.LEARN && state.total > 0) {
            Spacer(Modifier.height(8.dp))
            Text("${state.met + state.answered} of ${state.total} cards met in ${state.sessionTitle}", color = Muted, fontSize = 13.sp)
        }
        if (state.pending > 0) {
            Spacer(Modifier.height(14.dp))
            Text(
                "${state.pending} review${if (state.pending == 1) "" else "s"} will sync when you're online.",
                color = Near,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(28.dp))
        Button(
            onClick = viewModel::endReview,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
        ) { Text("Done", fontWeight = FontWeight.SemiBold) }
    }
}

private fun inputReady(card: QuizCard, answer: String, selection: String?): Boolean =
    if (card.kind == "mcq") selection != null else answer.isNotBlank()
