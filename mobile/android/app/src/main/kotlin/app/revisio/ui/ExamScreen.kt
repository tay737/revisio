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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.AoRow
import app.revisio.engine.AoSplit
import app.revisio.engine.ExamMark
import app.revisio.engine.ExamQuestion
import app.revisio.engine.StoredPaper

/**
 * Exam simulator — sit a marked paper, and read the board's own documents.
 *
 * The web's `/exam` is not another loop with a different label, and porting it as
 * one would have missed the point. A paper is dealt by topic, the mark scheme
 * stays on the server until the script is handed in, and handing it in *stores an
 * attempt* — so this is the one surface in the app that produces a record rather
 * than moving a schedule.
 *
 * The three phases are the web's: pick topics, sit the paper, read the marked
 * script. Beside them sit the two things the web grew: the stored papers (real
 * question papers, mark schemes and formulae sheets, opened verbatim), and a
 * marking report that says *what kind* of mark was lost — per assessment
 * objective — not just how many.
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
            state.paperDoc != null -> PaperDocView(state, viewModel)
            state.examResult != null -> ExamMarked(state, viewModel)
            state.examPaper.isNotEmpty() -> ExamRun(state, viewModel)
            else -> ExamPick(state, viewModel)
        }

        Spacer(Modifier.height(28.dp))
    }
}

// ── AO copy, mirrored from `AO_EXPLAINER` in the web's exam page ─────────────

private fun aoLabel(ao: String): String = when (ao) {
    "AO1" -> "Knowledge & understanding"
    "AO2" -> "Application"
    "AO3" -> "Analysis & evaluation"
    else -> "Assessment objective"
}

private fun aoDescription(ao: String): String = when (ao) {
    "AO1" -> "Recall marks. Awarded for stating accurate facts, definitions and terms — naming the thing correctly. No context needed: a correct fact is a mark even in isolation."
    "AO2" -> "Application marks. Awarded for using knowledge in the scenario given — the answer must refer to the context (the club, the college, the data), not just state general theory."
    "AO3" -> "Reasoning marks. Awarded for chains of reasoning: weighing options, drawing conclusions, making justified judgements. \"This means… therefore… which affects the business because…\""
    else -> ""
}

/**
 * One-sentence revision directive from the AO profile — the web's `aoDirective`.
 *
 * Ties only when every objective scored the same; in that case say the honest
 * thing rather than inventing a weakest link.
 */
private fun aoDirective(profile: List<AoRow>): String {
    val sorted = profile.sortedBy { it.percentage }
    if (sorted.isEmpty()) return ""
    val weakest = sorted.first()
    val strongest = sorted.last()
    if (sorted.size > 1 && weakest.percentage == strongest.percentage) {
        return "Every objective scored the same — revise the questions you lost, whatever kind of mark they were."
    }
    if (weakest.percentage >= strongest.percentage - 10) {
        return "Marks are spread evenly across objectives. Revise from the per-question breakdown below."
    }
    val tail = when (weakest.ao) {
        "AO1" -> "re-read the notes for the facts and definitions you were expected to state."
        "AO2" -> "practise tying your answers to the scenario — every point should name the business, person or data in the question."
        else -> "practise finishing answers with a reasoned judgement: weigh both sides, then decide."
    }
    return "Your weakest objective is ${weakest.ao} (${aoLabel(weakest.ao).lowercase()}) at ${weakest.percentage}% — $tail"
}

// ── pick ─────────────────────────────────────────────────────────────────────

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

    // ── stored board papers ────────────────────────────────────────────────
    val papers = pool?.papers.orEmpty()
    if (papers.isNotEmpty()) {
        Spacer(Modifier.height(20.dp))
        SurfaceCard {
            Text("Real papers & mark schemes", style = Type.strong.style(Ink))
            Spacer(Modifier.height(4.dp))
            Text(
                "The board's own documents, extracted from the originals. The mark scheme is the most honest revision guide there is — read it beside the notes.",
                style = Type.fine.style(Muted),
            )
            Spacer(Modifier.height(12.dp))
            papers.forEachIndexed { index, paper ->
                if (index > 0) Hairline()
                StoredPaperRow(paper) { viewModel.loadPaperDoc(paper.id) }
            }
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
private fun StoredPaperRow(paper: StoredPaper, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChipPill(paperKindLabel(paper.kind), active = paper.kind == "question_paper")
            }
            Spacer(Modifier.height(4.dp))
            Text(paper.title, style = Type.strong.style(Ink))
            val meta = listOfNotNull(paper.board, paper.series, paper.paperCode, paper.durationMinutes?.let { "$it min" })
                .filter { it.isNotBlank() }
                .joinToString(" · ")
            if (meta.isNotEmpty()) Text(meta, style = Type.fine.style(Muted))
        }
        paper.totalMarks?.let { marks ->
            Spacer(Modifier.size(8.dp))
            Badge("$marks marks", BadgeTone.Quiet)
        }
        Spacer(Modifier.size(10.dp))
        PillButton(text = "Open", onClick = onOpen, tone = PillTone.Ghost, icon = RevisioIcons.expand)
    }
}

private fun paperKindLabel(kind: String): String = when (kind) {
    "question_paper" -> "Question paper"
    "mark_scheme" -> "Mark scheme"
    "formulae_sheet" -> "Formulae sheet"
    else -> "Document"
}

/** A stored paper, read verbatim — the web opens the same document inline. */
@Composable
private fun PaperDocView(state: UiState, viewModel: RevisioViewModel) {
    val doc = state.paperDoc ?: return
    Column(modifier = Modifier.entrance()) {
        Text(doc.title, style = Type.title.style(Ink))
        val meta = listOfNotNull(doc.board, doc.series, doc.paperCode, doc.durationMinutes?.let { "$it min" })
            .filter { it.isNotBlank() }
            .joinToString(" · ")
        if (meta.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(meta, style = Type.fine.style(Muted))
        }
        Spacer(Modifier.height(14.dp))
        SurfaceCard {
            Notes(doc.contentMd)
        }
        Spacer(Modifier.height(16.dp))
        PillButton(text = "Close", onClick = viewModel::closePaperDoc, tone = PillTone.Ghost, icon = RevisioIcons.collapse)
    }
}

// ── run ──────────────────────────────────────────────────────────────────────

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
                label = question.questionRef.ifBlank { (index + 1).toString() },
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
private fun ExamQuestionBlock(label: String, question: ExamQuestion, answer: String, onChange: (String) -> Unit) {
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Q$label", style = Type.numSm.style(Muted))
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(question.questionMd, style = Type.strong.style(Ink))
                val total = question.marks + question.qwcMarks
                Text(
                    "$total mark${if (total == 1) "" else "s"}" +
                        (if (question.qwcMarks > 0) " (incl. ${question.qwcMarks} QWC)" else "") +
                        (question.board?.let { " · $it" } ?: "") +
                        (question.sourceYear?.let { " $it" } ?: ""),
                    style = Type.fine.style(Muted),
                )
            }
        }
        // The AO split is dealt with the paper: how many of these marks are
        // knowledge, application, reasoning. The web prints the same rows.
        question.aoSplit?.takeIf { it.isNotEmpty() }?.let { splits ->
            Spacer(Modifier.height(10.dp))
            Text("WHERE THE MARKS LIVE", style = Type.micro.style(Muted))
            Spacer(Modifier.height(6.dp))
            splits.forEach { split -> AoSplitRow(split) }
        }
        question.specRefs.takeIf { it.isNotBlank() }?.let { refs ->
            Spacer(Modifier.height(8.dp))
            Text("Spec: $refs", style = Type.fine.style(Muted))
        }
        Spacer(Modifier.height(14.dp))

        if (question.kind == "mcq") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                question.options.orEmpty().forEachIndexed { optionIndex, option ->
                    val letter = ('A' + optionIndex).toString()
                    OptionRow(
                        text = "$letter. ${option.text}",
                        state = if (answer == option.id) OptionState.Selected else OptionState.Idle,
                        enabled = true,
                        onClick = { onChange(option.id) },
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
private fun AoSplitRow(split: AoSplit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${split.ao} — ${aoLabel(split.ao)}",
                style = Type.captionS.style(Ink),
                modifier = Modifier.weight(1f),
            )
            Text("${split.marks} mark${if (split.marks == 1) "" else "s"}", style = Type.fine.style(Muted))
        }
        aoDescription(split.ao).takeIf { it.isNotEmpty() }?.let {
            Text(it, style = Type.fine.style(Muted))
        }
        Spacer(Modifier.height(6.dp))
    }
}

// ── marked ───────────────────────────────────────────────────────────────────

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
        Spacer(Modifier.height(6.dp))
        Text(
            when {
                result.percentage >= 80 -> "That is a strong paper. The remainder is worth a look while the marking is fresh."
                result.percentage >= 50 -> "A solid pass. Read the feedback below before you move on."
                else -> "Worth re-reading the notes on the questions you lost marks on."
            },
            style = Type.caption.style(Muted),
            textAlign = TextAlign.Center,
        )
    }

    Spacer(Modifier.height(20.dp))

    result.detail.forEachIndexed { index, line ->
        MarkedQuestion(index, line, state)
        Spacer(Modifier.height(12.dp))
    }

    // The AO profile answers the question a percentage cannot: *what kind* of
    // marks am I losing? Aggregated per assessment objective over the paper.
    if (result.aoProfile.isNotEmpty()) {
        SurfaceCard {
            Text("Where the marks went", style = Type.strong.style(Ink))
            Spacer(Modifier.height(4.dp))
            Text("marks earned by assessment objective", style = Type.fine.style(Muted))
            Spacer(Modifier.height(10.dp))
            result.aoProfile.forEach { row ->
                Column(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${row.ao} — ${aoLabel(row.ao)}",
                            style = Type.captionS.style(Ink),
                            modifier = Modifier.weight(1f),
                        )
                        Text("${row.awarded}/${row.available} · ${row.percentage}%", style = Type.fine.style(Muted))
                    }
                    aoDescription(row.ao).takeIf { it.isNotEmpty() }?.let {
                        Text(it, style = Type.fine.style(Muted))
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
            Hairline()
            Spacer(Modifier.height(8.dp))
            Text(aoDirective(result.aoProfile), style = Type.caption.style(Muted))
        }
        Spacer(Modifier.height(12.dp))
    }

    Spacer(Modifier.height(12.dp))
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
 * One marked question, as the web's `ResultDetail` shows it: score, feedback,
 * the points hit and missed, the AO split, and — behind one disclosure — the
 * marking material: how an examiner marks this, the mark scheme itself, a model
 * answer, and the learner's own answer to compare against.
 */
@Composable
private fun MarkedQuestion(index: Int, line: ExamMark, state: UiState) {
    var open by remember { mutableStateOf(false) }
    val question = state.examPaper.firstOrNull { it.id == line.questionId }

    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (line.questionRef.isNotBlank()) "Question ${line.questionRef}" else "Question ${index + 1}",
                style = Type.captionS.style(Muted),
                modifier = Modifier.weight(1f),
            )
            Text(
                "${line.awarded.formatted()} / ${line.total}",
                style = Type.captionS.style(if (line.correct) Good else Warn),
            )
        }
        question?.questionMd?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, style = Type.captionS.style(Ink))
        }
        Spacer(Modifier.height(8.dp))
        Text(line.feedback, style = Type.fine.style(if (line.correct) Good else Warn))

        if (line.matchedPhrases.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text("Points covered: ${line.matchedPhrases.joinToString(" · ")}", style = Type.fine.style(Good))
        }
        if (line.missedPhrases.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(
                "Missing for more marks: ${line.missedPhrases.take(5).joinToString(" · ")}",
                style = Type.fine.style(Ink),
            )
        }

        line.aoSplit?.takeIf { it.isNotEmpty() }?.let { splits ->
            Spacer(Modifier.height(10.dp))
            Text("WHERE THE MARKS LIVE", style = Type.micro.style(Muted))
            Spacer(Modifier.height(6.dp))
            splits.forEach { AoSplitRow(it) }
            if (line.qwcMarks > 0) {
                Text(
                    "Plus ${line.qwcMarks} QWC ${if (line.qwcMarks == 1) "mark" else "marks"} for quality of written communication — clear structure, controlled grammar, and the subject's technical terms used properly.",
                    style = Type.fine.style(Muted),
                )
            }
        }

        if (line.markSchemeMd.isNotBlank() || line.modelAnswerMd.isNotBlank() || line.markingNotesMd.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            PillButton(
                text = if (open) "Hide marking material" else "Mark scheme & model answer",
                onClick = { open = !open },
                tone = PillTone.Ghost,
                icon = if (open) RevisioIcons.collapse else RevisioIcons.expand,
            )
            if (open) {
                Spacer(Modifier.height(10.dp))
                Hairline()
                Spacer(Modifier.height(10.dp))
                if (line.markingNotesMd.isNotBlank()) {
                    Text("HOW AN EXAMINER MARKS THIS", style = Type.micro.style(Muted))
                    Notes(line.markingNotesMd)
                    Spacer(Modifier.height(8.dp))
                }
                if (line.markSchemeMd.isNotBlank()) {
                    Text("MARK SCHEME", style = Type.micro.style(Muted))
                    Notes(line.markSchemeMd)
                    Spacer(Modifier.height(8.dp))
                }
                if (line.modelAnswerMd.isNotBlank()) {
                    Text("MODEL ANSWER", style = Type.micro.style(Muted))
                    Notes(line.modelAnswerMd)
                    Spacer(Modifier.height(8.dp))
                }
                Text("YOUR ANSWER", style = Type.micro.style(Muted))
                Text(line.userAnswer.ifBlank { "—" }, style = Type.fine.style(Ink))
            }
        }
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
