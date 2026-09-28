package app.revisio.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.revisio.RevisioViewModel
import app.revisio.Tab
import app.revisio.UiState

/**
 * The root of the native app.
 *
 * There is no route to fall back to and no page to cache: every destination is
 * compiled in, so losing the network can never strand the user on a marketing
 * screen. Offline is a *state* of this app, not a different app.
 *
 * Five slots, and the bar that carries them is the website's `BottomNav`, not a
 * Material navigation bar: full-bleed and flush to the bottom, a hairline
 * instead of a shadow, a 3px ink bar over the current slot that travels between
 * slots rather than blinking, and the due count on the slot that clears it.
 */
@Composable
fun RevisioApp(viewModel: RevisioViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    RevisioTheme {
        Surface(color = revisioColors.background, modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    state.loading -> Loading()
                    !state.signedIn -> AuthScreen(state, viewModel::signIn)
                    state.inReview -> SessionScreen(state, viewModel)
                    else -> Column(modifier = Modifier.fillMaxSize()) {
                        Box(modifier = Modifier.weight(1f)) {
                            when (state.tab) {
                                Tab.TODAY -> TodayScreen(state, viewModel)
                                Tab.LEARN -> LearnScreen(state, viewModel)
                                Tab.CRAM -> CramScreen(state, viewModel)
                                Tab.RANK -> RankScreen(state, viewModel)
                                Tab.YOU -> YouScreen(state, viewModel)
                            }
                        }
                        BottomBar(
                            current = state.tab,
                            due = state.home?.due ?: 0,
                            onSelect = viewModel::selectTab,
                        )
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
        CircularProgressIndicator(color = Ink, strokeWidth = 2.dp)
    }
}

/**
 * The five destinations, with the web's registry glyphs.
 *
 * Each slot is a full-height target; the current one carries a 3px ink bar whose
 * offset animates between slots, which is what makes moving between them read as
 * one gesture rather than a series of repaints.
 */
@Composable
private fun BottomBar(current: Tab, due: Int, onSelect: (Tab) -> Unit) {
    val tabs = Tab.entries
    val index = tabs.indexOf(current).coerceAtLeast(0)

    Column(modifier = Modifier.fillMaxWidth()) {
        // The hairline: no shadow tier. The bar is flush to the bottom edge.
        Hairline()
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(Metrics.navHeight)
                // `glass-bar`: translucent enough that the page is visibly
                // passing underneath it. Compose cannot blur a backdrop the way
                // `backdrop-filter` does, so the surface stays a shade more
                // opaque than the stylesheet's 82% to keep text legible.
                .background(revisioColors.background.copy(alpha = 0.94f)),
        ) {
            // The current-slot indicator. It travels on the snap curve rather
            // than blinking, which is what makes the bar read as one control.
            BoxWithConstraints(
                modifier = Modifier.fillMaxWidth().height(3.dp),
            ) {
                val slot = maxWidth / tabs.size
                val travel by animateDpAsState(
                    targetValue = slot * index + slot / 2 - 18.dp,
                    animationSpec = tween(300, easing = Motion.snap),
                    label = "navIndicator",
                )
                Box(
                    modifier = Modifier
                        .offset(x = travel)
                        .width(36.dp)
                        .height(3.dp)
                        .clip(RoundedCornerShape(bottomStart = Radius.pill, bottomEnd = Radius.pill))
                        .background(Ink),
                )
            }

            Row(modifier = Modifier.fillMaxSize()) {
                tabs.forEach { tab ->
                    TabSlot(
                        tab = tab,
                        active = tab == current,
                        due = if (tab == Tab.TODAY) due else 0,
                        onClick = { onSelect(tab) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun TabSlot(
    tab: Tab,
    active: Boolean,
    due: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    // The bar's own press feedback: the slot shrinks a little under the thumb.
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.94f else 1f,
        animationSpec = tween(150, easing = Motion.out),
        label = "slotPress",
    )
    val ink = if (active) Ink else Muted

    Column(
        modifier = modifier
            .fillMaxSize()
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(top = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            modifier = Modifier.scale(scale),
            contentAlignment = Alignment.TopEnd,
        ) {
            Icon(
                vector = if (active) iconActive(tab.icon) else tab.icon,
                size = 22,
                tint = ink,
            )
            if (due > 0) {
                // "There is something here for you" — the one badge colour.
                Box(
                    modifier = Modifier
                        .offset(x = 12.dp, y = (-6).dp)
                        .clip(RoundedCornerShape(Radius.pill))
                        .background(Good)
                        .padding(horizontal = 5.dp, vertical = 2.dp),
                ) {
                    Text(
                        if (due > 99) "99+" else due.toString(),
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        lineHeight = 11.sp,
                    )
                }
            }
        }
        Text(
            tab.label,
            color = ink,
            fontSize = 11.sp,
            fontWeight = if (active) androidx.compose.ui.text.font.FontWeight.SemiBold
            else androidx.compose.ui.text.font.FontWeight.Medium,
            lineHeight = 11.sp,
        )
    }
}

private val Tab.icon: ImageVector
    get() = when (this) {
        Tab.TODAY -> RevisioIcons.dashboard
        Tab.LEARN -> RevisioIcons.learn
        Tab.CRAM -> RevisioIcons.cram
        Tab.RANK -> RevisioIcons.rank
        Tab.YOU -> RevisioIcons.person
    }

/**
 * A banner rather than a dialog: the app is offline-first, so "that did not
 * work" is information, not an interruption. It floats over the top of whatever
 * is showing and can be dismissed.
 */
@Composable
private fun MessageBanner(message: String, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
            .clip(RoundedCornerShape(Radius.lg))
            .background(revisioColors.foreground)
            .clickable(onClick = onDismiss)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            message,
            style = Type.caption.style(revisioColors.primaryForeground),
            modifier = Modifier.weight(1f),
        )
        Label("Dismiss", token = Type.micro, color = revisioColors.primaryForeground.copy(alpha = 0.7f))
    }
}

// ── auth ────────────────────────────────────────────────────────────────────

@Composable
private fun AuthScreen(state: UiState, onSignIn: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val canSubmit = email.isNotBlank() && password.isNotBlank() && !state.busy

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(72.dp))
        Wordmark(Type.displaySm)
        Spacer(Modifier.height(10.dp))
        Text(
            "Sign in to study — then keep studying offline.",
            style = Type.lead.style(Muted),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(32.dp))

        Column(modifier = Modifier.fillMaxWidth()) {
            Label("Email", token = Type.eyebrow, color = Muted)
            Spacer(Modifier.height(6.dp))
            Field(value = email, onChange = { email = it }, placeholder = "you@example.com")
            Spacer(Modifier.height(16.dp))
            Label("Password", token = Type.eyebrow, color = Muted)
            Spacer(Modifier.height(6.dp))
            Field(
                value = password,
                onChange = { password = it },
                placeholder = "••••••••",
                password = true,
            )
        }

        Spacer(Modifier.height(24.dp))
        PillButton(
            text = "Sign in",
            onClick = { onSignIn(email.trim(), password) },
            enabled = canSubmit,
            large = true,
        )

        Spacer(Modifier.height(18.dp))
        Text(
            "Your session and today's cards are kept on this device, so a lost connection never signs you out.",
            style = Type.fine.style(Muted),
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * The 48px field with a 2px stroke. The style is the stylesheet's `text-input` /
 * `text-input-focused` pair, carried through one component so no screen invents
 * a second input.
 */
@Composable
internal fun Field(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String = "",
    password: Boolean = false,
    imeAction: ImeAction = ImeAction.Next,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text(placeholder, style = Type.body.style(Muted.copy(alpha = 0.75f))) },
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (password) KeyboardType.Password else KeyboardType.Email,
            imeAction = imeAction,
        ),
        shape = RoundedCornerShape(Radius.sm),
        textStyle = Type.body.style(Ink),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Ink,
            unfocusedBorderColor = Line,
            cursorColor = Ink,
            focusedContainerColor = Card1,
            unfocusedContainerColor = Card1,
        ),
        modifier = modifier.fillMaxWidth(),
    )
}
