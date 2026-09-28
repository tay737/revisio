package app.revisio.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.revisio.Feedback
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.FeedbackKind
import app.revisio.engine.QuizCard
import app.revisio.engine.StudyMode

/**
 * The study loop.
 *
 * One screen for today's queue, first exposure and cram: the server picks which
 * cards and grades the answers in all three, and the only difference the learner
 * sees is the label and whether the notes travel alongside. Building three loops
 * would have meant three places for a mark to be awarded differently.
 *
 * This is the one viewport where green is allowed to carry a primary action — it
 * is the button you press *inside* the session, the one that earns rather than
 * navigates. Every other control on this screen is ink, and the verdict wears the
 * game colours: owl green correct, cardinal red wrong, fox orange for a near
 * miss or a queued answer.
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
        Spacer(Modifier.height(16.dp))

        // The header: what this session is, and how far through it we are. The
        // meter is the same 10px pill the rest of the app uses.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Label(state.mode.label, token = Type.eyebrow, color = state.mode.tint())
            Spacer(Modifier.size(10.dp))
            Text(state.sessionTitle, style = Type.fine.style(Muted), modifier = Modifier.weight(1f))
            Label("${state.index + 1} / ${state.cards.size}", token = Type.micro, color = Muted)
        }
        Spacer(Modifier.height(10.dp))
        val progress by animateFloatAsState(
            targetValue = (state.index + 1).toFloat() / state.cards.size.toFloat(),
            animationSpec = tween(320, easing = Motion.snap),
            label = "sessionProgress",
        )
        Meter((progress * 100).toInt(), tint = Ink, height = 6.dp)

        if (notes.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            PillButton(
                text = if (state.notesOpen) "Hide notes" else "Show notes (${notes.size})",
                onClick = viewModel::toggleNotes,
                tone = PillTone.Ghost,
                icon = RevisioIcons.notes,
            )
            if (state.notesOpen) {
                Spacer(Modifier.height(12.dp))
                notes.forEach { note ->
                    SurfaceCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(note.title, style = Type.strong.style(Ink), modifier = Modifier.weight(1f))
                            note.specRefs?.takeIf { it.isNotBlank() }?.let { Chip(it) }
                        }
                        if (note.hasAnyBody()) {
                            Spacer(Modifier.height(12.dp))
                            Notes(note.body(state.density == "summary"))
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // The card itself: where it came from, and the question.
        Label("${card.subjectName} · ${card.topicName}", token = Type.micro, color = Muted)
        Spacer(Modifier.height(8.dp))
        Text(card.promptText, style = Type.displaySm.style(Ink))
        Spacer(Modifier.height(20.dp))

        if (card.kind == "mcq") {
            McqInput(card, state.selection, feedback != null, viewModel::setSelection)
        } else {
            AnswerField(card, state, feedback != null, viewModel::setAnswer)
        }

        Spacer(Modifier.height(20.dp))

        if (feedback == null) {
            // The in-session CTA. Uppercase and letterspaced, per the label
            // treatment the design language reserves for controls.
            PillButton(
                text = "Check",
                onClick = viewModel::submit,
                tone = PillTone.Good,
                enabled = inputReady(card, state.answer, state.selection),
                large = true,
            )
        } else {
            AnimatedVisibility(
                visible = true,
                enter = fadeIn(tween(160, easing = Motion.out)) +
                    slideInVertically(tween(220, easing = Motion.snap)) { it / 3 },
            ) {
                FeedbackPanel(feedback)
            }
            Spacer(Modifier.height(16.dp))
            PillButton(
                text = if (state.index + 1 >= state.cards.size) "Finish" else "Next card",
                onClick = viewModel::next,
                icon = if (state.index + 1 >= state.cards.size) RevisioIcons.correct else RevisioIcons.next,
                large = true,
            )
        }

        Spacer(Modifier.height(12.dp))
        PillButton(
            text = "Leave session",
            onClick = viewModel::endReview,
            tone = PillTone.Ghost,
        )
        Spacer(Modifier.height(28.dp))
    }
}

/** The mode earns its own eyebrow colour: reading borrows the notes blue. */
@Composable
private fun StudyMode.tint(): Color = when (this) {
    StudyMode.DAILY -> Muted
    StudyMode.LEARN -> Info
    StudyMode.CRAM -> Warn
}

@Composable
private fun AnswerField(
    card: QuizCard,
    state: UiState,
    locked: Boolean,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = state.answer,
        onValueChange = onChange,
        enabled = !locked,
        placeholder = {
            Text(
                if (card.kind == "flashcard") "Say it in your own words" else "Your answer",
                style = Type.body.style(Muted.copy(alpha = 0.75f)),
            )
        },
        singleLine = card.kind == "cloze",
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        shape = RoundedCornerShape(Radius.sm),
        textStyle = Type.body.style(Ink),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Ink,
            unfocusedBorderColor = Line,
            disabledBorderColor = Line,
            cursorColor = Ink,
            focusedContainerColor = Card1,
            unfocusedContainerColor = Card1,
            disabledContainerColor = Card2,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * The options.
 *
 * Once the answer is in, the row that was right and the row that was chosen each
 * say so in their own colour — which is the whole reason the game colours exist
 * apart from the chrome.
 */
@Composable
private fun McqInput(card: QuizCard, selection: String?, locked: Boolean, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        card.options.orEmpty().forEach { option ->
            val chosen = option.id == selection
            val state = when {
                !locked -> if (chosen) OptionState.Selected else OptionState.Idle
                card.key?.let { it.kind == "mcq" && it.correctOptionId == option.id } == true ->
                    OptionState.Correct
                chosen -> OptionState.Wrong
                else -> OptionState.Idle
            }
            OptionRow(
                text = option.text,
                state = state,
                enabled = !locked,
                onClick = { onSelect(option.id) },
            )
        }
    }
}

@Composable
private fun FeedbackPanel(feedback: Feedback) {
    val verdict = feedback.verdict
    val (label, tone, icon) = when (verdict?.feedbackKind) {
        FeedbackKind.CORRECT -> Triple("Correct", Good, RevisioIcons.correct)
        FeedbackKind.CASE_ONLY, FeedbackKind.PUNCTUATION_ONLY, FeedbackKind.CASE_AND_PUNCTUATION ->
            Triple("Correct — check your spelling", Good, RevisioIcons.correct)
        FeedbackKind.NEAR_MISS -> Triple("Nearly there", Warn, RevisioIcons.due)
        FeedbackKind.WRONG -> Triple("Not quite", Bad, RevisioIcons.close)
        null -> Triple("Saved", Warn, RevisioIcons.clock)
    }

    SurfaceCard(border = tone.copy(alpha = 0.45f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(tone),
                contentAlignment = Alignment.Center,
            ) {
                // The glyph sits on the verdict colour, in the page's own ground,
                // so a correct mark reads as ink-on-green rather than as a
                // second colour arriving uninvited.
                Icon(icon, size = 16, tint = revisioColors.background)
            }
            Spacer(Modifier.size(12.dp))
            Text(label, style = Type.strong.style(tone), modifier = Modifier.weight(1f))
            if (feedback.xpAwarded > 0) {
                Badge("+${feedback.xpAwarded} XP", BadgeTone.Gold, RevisioIcons.xp)
            }
        }

        verdict?.note?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(12.dp))
            Hairline()
            Spacer(Modifier.height(12.dp))
            Text(it, style = Type.caption.style(Ink))
        }

        // An answer is queued in two situations, and they are not the same: a
        // card that came from today's pack carries its key, so the mark above is
        // the real one and only the confirmation is pending; a card the server
        // dealt has no key here at all, so nothing was marked either.
        if (feedback.provisional || verdict == null) {
            Spacer(Modifier.height(12.dp))
            Hairline()
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(RevisioIcons.clock, size = 13, tint = Warn)
                Spacer(Modifier.size(8.dp))
                Label("Saved on this device", token = Type.micro, color = Warn)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                if (verdict == null)
                    "This card came from the server, so the server will mark it when you reconnect."
                else "The server will confirm this mark when you reconnect.",
                style = Type.fine.style(Muted),
            )
        }
    }
}

/**
 * The verdict.
 *
 * The crest is the loudest thing here on purpose: finishing a session is the
 * moment the ladder moves, so the summary shows where you now stand rather than
 * a scoreline alone.
 */
@Composable
private fun SummaryScreen(state: UiState, viewModel: RevisioViewModel) {
    val percent = if (state.answered == 0) 0 else (state.correct * 100) / state.answered
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))

        val rank = state.ranked?.ranked?.rank
        if (rank != null) {
            RankCrest(rank, size = 104)
            Spacer(Modifier.height(18.dp))
            RankChip(rank, size = 26)
            Spacer(Modifier.height(22.dp))
        } else {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(Card2),
                contentAlignment = Alignment.Center,
            ) {
                Icon(RevisioIcons.achievements, size = 32, tint = Ink)
            }
            Spacer(Modifier.height(22.dp))
        }

        Text(
            when (state.mode) {
                StudyMode.CRAM -> "Cram complete"
                StudyMode.LEARN -> "Topic met"
                StudyMode.DAILY -> "Session complete"
            },
            style = Type.title.style(Ink),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "${state.correct} of ${state.answered} correct ($percent%)",
            style = Type.lead.style(Muted),
        )

        if (state.mode == StudyMode.LEARN && state.total > 0) {
            Spacer(Modifier.height(6.dp))
            Text(
                "${state.met + state.answered} of ${state.total} cards met in ${state.sessionTitle}",
                style = Type.fine.style(Muted),
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(20.dp))
        // Accuracy is stated, never hidden: a session of near-misses should not
        // read as a session of hits.
        SurfaceCard {
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Stat("Correct", "${state.correct}", Good)
                Stat("Answered", "${state.answered}")
                Stat("Accuracy", "$percent%")
            }
        }

        if (state.pending > 0) {
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(RevisioIcons.clock, size = 14, tint = Warn)
                Spacer(Modifier.size(8.dp))
                Text(
                    "${state.pending} review${if (state.pending == 1) "" else "s"} will sync when you're online.",
                    style = Type.fine.style(Warn),
                )
            }
        }

        Spacer(Modifier.height(28.dp))
        PillButton(
            text = "Done",
            onClick = viewModel::endReview,
            large = true,
        )
        Spacer(Modifier.height(24.dp))
    }
}

private fun inputReady(card: QuizCard, answer: String, selection: String?): Boolean =
    if (card.kind == "mcq") selection != null else answer.isNotBlank()
