package app.revisio.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import app.revisio.RevisioViewModel
import app.revisio.Tab
import app.revisio.UiState

@Composable
fun RevisioTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            background = Color.Black,
            surface = Surface1,
            onBackground = Ink,
            onSurface = Ink,
        ),
        content = content,
    )
}

/**
 * The root of the native app.
 *
 * There is no route to fall back to and no page to cache: every tab below is
 * compiled in, so losing the network can never strand the user on a marketing
 * screen. The offline case is a *state* of this app, not a different app.
 *
 * Five tabs, because the web's rails cannot be a phone's navigation: Today is
 * the loop, Learn is the reading, Cram is the drilling, Rank is the ladder and
 * You is the account.
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
                    state.inReview -> SessionScreen(state, viewModel)
                    else -> Scaffold(
                        containerColor = Color.Black,
                        bottomBar = { Tabs(state.tab, viewModel::selectTab) },
                    ) { inset ->
                        Box(modifier = Modifier.fillMaxSize().padding(inset)) {
                            when (state.tab) {
                                Tab.TODAY -> TodayScreen(state, viewModel)
                                Tab.LEARN -> LearnScreen(state, viewModel)
                                Tab.CRAM -> CramScreen(state, viewModel)
                                Tab.RANK -> RankScreen(state, viewModel)
                                Tab.YOU -> YouScreen(state, viewModel)
                            }
                        }
                    }
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
        colors = CardDefaults.cardColors(containerColor = Surface2),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
            Text(message, color = Ink, fontSize = 14.sp)
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}

/** The five destinations. Emoji rather than an icon font this build does not ship. */
@Composable
private fun Tabs(current: Tab, onSelect: (Tab) -> Unit) {
    NavigationBar(containerColor = Color(0xFF131315)) {
        Tab.entries.forEach { tab ->
            NavigationBarItem(
                selected = current == tab,
                onClick = { onSelect(tab) },
                icon = { Text(glyph(tab), fontSize = 15.sp) },
                label = { Text(tab.label, fontSize = 11.sp) },
            )
        }
    }
}

private fun glyph(tab: Tab): String = when (tab) {
    Tab.TODAY -> "◎"
    Tab.LEARN -> "▤"
    Tab.CRAM -> "⚡"
    Tab.RANK -> "★"
    Tab.YOU -> "☺"
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
