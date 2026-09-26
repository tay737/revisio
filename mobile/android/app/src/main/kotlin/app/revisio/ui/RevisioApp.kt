package app.revisio.ui

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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.revisio.Feedback
import app.revisio.HomeState
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.FeedbackKind
import app.revisio.engine.OfflineCard

private val Accent = Color(0xFF1C64F2)
private val Surface1 = Color(0xFF1C1C1E)
private val Muted = Color(0xFF98989D)
private val Good = Color(0xFF30D158)
private val Near = Color(0xFFFFD60A)

@Composable
private fun RevisioTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            background = Color.Black,
            surface = Surface1,
            onBackground = Color(0xFFF5F5F7),
            onSurface = Color(0xFFF5F5F7),
        ),
        content = content,
    )
}

/**
 * The root of the native app.
 *
 * There is no route to fall back to and no page to cache: every branch below is
 * compiled in, so losing the network can never strand the user on a marketing
 * screen. The offline case is a *state* of this app, not a different app.
 */
@Composable
fun RevisioApp(viewModel: RevisioViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    RevisioTheme {
        Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    state.loading -> Loading()
                    !state.signedIn -> AuthScreen(state, viewModel::signIn)
                    state.inReview -> ReviewScreen(state, viewModel)
                    else -> HomeScreen(state, viewModel)
                }
                state.message?.let { message ->
                    MessageBanner(message, viewModel::dismissMessage, Modifier.align(Alignment.TopCenter))
                }
            }
        }
    }
}

@Composable
private fun Loading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Accent)
    }
}

@Composable
private fun MessageBanner(message: String, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth().padding(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2C2C2E)),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(message, color = Color(0xFFF5F5F7), fontSize = 14.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}

@Composable
private fun Crest(size: Int = 64) {
    Box(
        modifier = Modifier.size(size.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(color = Accent, shape = RoundedCornerShape((size / 4).dp), modifier = Modifier.fillMaxSize()) {
            Box(contentAlignment = Alignment.Center) {
                Text("R", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = (size * 0.55).sp)
            }
        }
    }
}

// ── auth ────────────────────────────────────────────────────────────────────

@Composable
private fun AuthScreen(state: UiState, onSignIn: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val canSubmit = email.isNotBlank() && password.isNotBlank() && !state.loading

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(72.dp))
        Crest()
        Spacer(Modifier.height(20.dp))
        Text("Revisio", fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text("Sign in to study — then keep studying offline.", color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(32.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { onSignIn(email.trim(), password) },
            enabled = canSubmit,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
        ) {
            if (state.loading) CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
            else Text("Sign in", fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Your session and today's cards are kept on this device, so a lost connection never signs you out.",
            color = Muted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
        )
    }
}

// ── home ────────────────────────────────────────────────────────────────────

@Composable
private fun HomeScreen(state: UiState, viewModel: RevisioViewModel) {
    val home = state.home
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
    ) {
        Spacer(Modifier.height(24.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Crest(44)
            Spacer(Modifier.size(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(if (state.name.isBlank()) "Welcome back" else "Hi, ${state.name}", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(if (state.online) "Online" else "Offline — your saved session still works", color = if (state.online) Good else Near, fontSize = 13.sp)
            }
        }

        Spacer(Modifier.height(24.dp))

        if (home == null) {
            Text("Loading today's session…", color = Muted)
        } else {
            Card(colors = CardDefaults.cardColors(containerColor = Surface1), shape = RoundedCornerShape(18.dp)) {
                Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                    Text("Today", color = Muted, fontSize = 13.sp)
                    Spacer(Modifier.height(4.dp))
                    Text("${home.due} cards ready", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        Stat("Level", home.level.toString())
                        Stat("XP", home.totalXp.toString())
                        Stat("Streak", "${home.streak}d")
                    }
                    if (home.fromCache) {
                        Spacer(Modifier.height(12.dp))
                        Text("Showing the session saved on this device.", color = Near, fontSize = 12.sp)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = viewModel::startReview,
                enabled = home.packCards > 0,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                Text(
                    if (home.packCards > 0) "Start review" else "Connect once to download cards",
                    fontWeight = FontWeight.SemiBold,
                )
            }

            if (state.pending > 0) {
                Spacer(Modifier.height(12.dp))
                Card(colors = CardDefaults.cardColors(containerColor = Surface1), shape = RoundedCornerShape(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("${state.pending} review${if (state.pending == 1) "" else "s"} waiting to sync", fontSize = 14.sp)
                            Text("They'll be graded by the server once you're back online.", color = Muted, fontSize = 12.sp)
                        }
                        if (state.online) TextButton(onClick = viewModel::refreshHome) { Text("Sync") }
                    }
                }
            }
        }

        Spacer(Modifier.height(28.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = viewModel::refreshHome) { Text("Refresh") }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = viewModel::signOut) { Text("Sign out", color = Muted) }
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column {
        Text(label, color = Muted, fontSize = 12.sp)
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ── review ──────────────────────────────────────────────────────────────────

@Composable
private fun ReviewScreen(state: UiState, viewModel: RevisioViewModel) {
    if (state.finished) {
        SummaryScreen(state, viewModel)
        return
    }
    val card = state.cards.getOrNull(state.index) ?: return
    val feedback = state.feedback

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp)) {
        Spacer(Modifier.height(16.dp))
        LinearProgressIndicator(
            progress = { (state.index + 1).toFloat() / state.cards.size.toFloat() },
            modifier = Modifier.fillMaxWidth().height(6.dp),
            color = Accent,
        )
        Spacer(Modifier.height(8.dp))
        Row {
            Text("${card.subjectName} · ${card.topicName}", color = Muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Text("${state.index + 1} / ${state.cards.size}", color = Muted, fontSize = 12.sp)
        }

        Spacer(Modifier.height(20.dp))
        Text(promptOf(card), fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(20.dp))

        when (card.kind) {
            "mcq" -> McqInput(card, state.selection, feedback != null, viewModel::setSelection)
            else -> OutlinedTextField(
                value = state.answer,
                onValueChange = viewModel::setAnswer,
                enabled = feedback == null,
                placeholder = { Text(if (card.kind == "flashcard") "Say it in your own words" else "Your answer", color = Muted) },
                singleLine = card.kind == "cloze",
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(20.dp))

        if (feedback == null) {
            Button(
                onClick = viewModel::submit,
                enabled = inputReady(card, state.answer, state.selection),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
            ) { Text("Check", fontWeight = FontWeight.SemiBold) }
        } else {
            FeedbackPanel(feedback)
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = viewModel::next,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
            ) { Text(if (state.index + 1 >= state.cards.size) "Finish" else "Next card", fontWeight = FontWeight.SemiBold) }
        }
    }
}

@Composable
private fun McqInput(card: OfflineCard, selection: String?, locked: Boolean, onSelect: (String) -> Unit) {
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
    val (label, colour) = when (feedback.verdict.feedbackKind) {
        FeedbackKind.CORRECT -> "Correct" to Good
        FeedbackKind.CASE_ONLY, FeedbackKind.PUNCTUATION_ONLY, FeedbackKind.CASE_AND_PUNCTUATION -> "Correct — check your spelling" to Good
        FeedbackKind.NEAR_MISS -> "Nearly there" to Near
        FeedbackKind.WRONG -> "Not quite" to Color(0xFFFF453A)
    }

    Card(colors = CardDefaults.cardColors(containerColor = Surface1), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, color = colour, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                if (feedback.xpAwarded > 0) Text("+${feedback.xpAwarded} XP", color = Good, fontSize = 14.sp)
            }
            feedback.verdict.note?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = Color(0xFFC7C7CC), fontSize = 14.sp)
            }
            feedback.correctAnswer?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(10.dp))
                Text("Answer: $it", fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
            feedback.verdict.missedPhrases?.takeIf { it.isNotEmpty() }?.let { missed ->
                Spacer(Modifier.height(6.dp))
                Text("Missing: ${missed.joinToString(", ")}", color = Muted, fontSize = 13.sp)
            }
            feedback.explanation?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = Color(0xFFC7C7CC), fontSize = 13.sp)
            }
            if (feedback.provisional) {
                Spacer(Modifier.height(10.dp))
                Text(
                    "Saved on this device. The server will confirm this mark when you reconnect.",
                    color = Near,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun SummaryScreen(state: UiState, viewModel: RevisioViewModel) {
    val percent = if (state.answered == 0) 0 else (state.correct * 100) / state.answered
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Crest(72)
        Spacer(Modifier.height(24.dp))
        Text("Session complete", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text("${state.correct} of ${state.answered} correct ($percent%)", color = Muted)
        if (state.pending > 0) {
            Spacer(Modifier.height(16.dp))
            Text(
                "${state.pending} review${if (state.pending == 1) "" else "s"} will sync when you're online.",
                color = Near,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(32.dp))
        Button(
            onClick = viewModel::endReview,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
        ) { Text("Done", fontWeight = FontWeight.SemiBold) }
    }
}

// ── helpers ─────────────────────────────────────────────────────────────────

private fun promptOf(card: OfflineCard): String = when (card.kind) {
    "cloze" -> card.textWithBlank ?: "Fill in the blank"
    "flashcard" -> card.prompt ?: "Recall the answer"
    else -> card.question ?: "Choose the best answer"
}

private fun inputReady(card: OfflineCard, answer: String, selection: String?): Boolean =
    if (card.kind == "mcq") selection != null else answer.isNotBlank()
