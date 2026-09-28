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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.graphicsLayer
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
import app.revisio.Destination
import app.revisio.RevisioViewModel
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
                    // A shared profile is a page, not a destination: it opens over
                    // whatever the learner was looking at and closes back to it,
                    // which is what a link out of a chat window should do.
                    state.profileHandle != null -> ProfileScreen(state, viewModel)
                    else -> Column(modifier = Modifier.fillMaxSize()) {
                        Box(modifier = Modifier.weight(1f)) {
                            when (state.destination) {
                                Destination.TODAY -> TodayScreen(state, viewModel)
                                Destination.REVIEW -> ReviewScreen(state, viewModel)
                                Destination.LEARN -> LearnScreen(state, viewModel)
                                Destination.CRAM -> CramScreen(state, viewModel)
                                Destination.RANK -> RankScreen(state, viewModel)
                                Destination.EXAM -> ExamScreen(state, viewModel)
                                Destination.PRACTICE -> PracticeScreen(state, viewModel)
                                Destination.LIBRARY -> LibraryScreen(state, viewModel)
                                Destination.SETTINGS -> SettingsScreen(state, viewModel)
                                Destination.TEACHING, Destination.ADMIN -> ComingSoon(state.destination)
                            }
                        }
                        BottomBar(
                            current = state.destination,
                            role = state.me?.role,
                            due = state.home?.due ?: 0,
                            onSelect = viewModel::go,
                            onMore = viewModel::openMore,
                        )
                    }
                }
                state.message?.let { message ->
                    MessageBanner(message, viewModel::dismissMessage, Modifier.align(Alignment.TopCenter))
                }
                if (state.moreOpen) {
                    MoreSheet(
                        role = state.me?.role,
                        current = state.destination,
                        name = state.me?.name ?: state.name,
                        rank = state.ranked?.ranked?.rank,
                        points = state.ranked?.ranked?.rank?.points,
                        onPick = viewModel::go,
                        onClose = viewModel::closeMore,
                        onSignOut = viewModel::signOut,
                        onProfile = state.me?.username?.let { handle -> { viewModel.openProfile(handle) } },
                    )
                }
            }
        }
    }
}

/**
 * A destination that is real but has no screen yet.
 *
 * The consoles are roles-gated, so a learner never arrives here; a teacher does,
 * and "we have not built this yet" is a worse answer than the truth. Saying so on
 * the page is the honest version of a port in progress.
 */
@Composable
private fun ComingSoon(destination: Destination) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp)) {
        Spacer(Modifier.height(24.dp))
        ScreenTitle(destination.label, eyebrow = "Destination")
        Spacer(Modifier.height(12.dp))
        SoftCard {
            Text(
                "${destination.label} is a teacher and admin console on the website. " +
                    "It is not ported to the phone yet.",
                style = Type.caption.style(Muted),
            )
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
private fun BottomBar(
    current: Destination,
    role: String?,
    due: Int,
    onSelect: (Destination) -> Unit,
    onMore: () -> Unit,
) {
    val tabs = Destination.bar(role)
    val overflow = Destination.overflow(role)
    // More is a real slot, so the indicator has five positions to travel between
    // even though only four of them are destinations — and it parks under More
    // while any page behind it is open, which is what tells the learner where
    // they are when the page itself cannot say so.
    val slots = tabs.size + 1
    val activeSlot = tabs.indexOf(current).takeIf { it >= 0 } ?: (slots - 1)

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
            // The current-slot indicator. It travels on the layout spring rather
            // than blinking, which is what makes the bar read as one control.
            BoxWithConstraints(
                modifier = Modifier.fillMaxWidth().height(3.dp),
            ) {
                val slot = maxWidth / slots
                val travel by animateDpAsState(
                    targetValue = slot * activeSlot + slot / 2 - 18.dp,
                    // The web's shared-layout spring, not a tween: the indicator
                    // *travels* between slots with velocity, which is what makes
                    // the bar read as one control instead of two repaints.
                    animationSpec = Motion.Springs.layout.spec(),
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
                        label = tab.label,
                        icon = tab.icon,
                        active = tab == current,
                        due = if (tab == Destination.REVIEW) due else 0,
                        onClick = { onSelect(tab) },
                        modifier = Modifier.weight(1f),
                    )
                }
                TabSlot(
                    label = "More",
                    icon = RevisioIcons.more,
                    active = overflow.any { it == current },
                    due = 0,
                    onClick = onMore,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/**
 * The overflow sheet — the web's `AccountSheet`, minus the drawer it is not.
 *
 * Every destination the bar cannot hold lives here as a card: label, the web's
 * own four-word hint, and a chevron. The sheet rides the `soft` spring up from
 * below its own height, because that is what the web does with it, and the scrim
 * fades over the quick duration on the way in and the instant one on the way out.
 * Sign out is at the bottom, where a decision belongs after the list of places
 * rather than among them.
 */
@Composable
private fun MoreSheet(
    role: String?,
    current: Destination,
    name: String,
    rank: app.revisio.engine.Rank?,
    points: Int?,
    onPick: (Destination) -> Unit,
    onClose: () -> Unit,
    onSignOut: () -> Unit,
    onProfile: (() -> Unit)?,
) {
    val progress = remember { androidx.compose.animation.core.Animatable(0f) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        progress.animateTo(1f, Motion.Springs.soft.spec())
    }
    val shown = progress.value

    Box(modifier = Modifier.fillMaxSize()) {
        // The scrim. It takes the tap that dismisses, so the sheet never has to
        // catch a gesture meant for the page underneath.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = shown }
                .background(revisioColors.scrim.copy(alpha = 0.5f))
                .clickable(onClick = onClose),
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .graphicsLayer { translationY = (1f - shown) * size.height }
                .clip(RoundedCornerShape(topStart = Radius.xl, topEnd = Radius.xl))
                .background(revisioColors.background)
                .padding(20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(name.ifBlank { "Your account" }, style = Type.strong.style(Ink))
                    if (rank != null) {
                        Text(
                            "${rank.label} · ${points ?: 0} RP",
                            style = Type.fine.style(Muted),
                        )
                    }
                }
                IconPill(RevisioIcons.close, onClose)
            }

            Spacer(Modifier.height(14.dp))
            Hairline()

            Destination.overflow(role).forEach { item ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPick(item) }
                        .padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(Radius.md))
                            .background(Card2),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(item.icon, size = 18, tint = if (item == current) Ink else Muted)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            item.label,
                            style = Type.strong.style(if (item == current) Ink else Ink),
                        )
                        Text(item.hint, style = Type.fine.style(Muted))
                    }
                    Icon(RevisioIcons.expand, size = 16, tint = Muted)
                }
                Hairline()
            }

            if (onProfile != null) {
                Spacer(Modifier.height(14.dp))
                PillButton(
                    text = "View my public profile",
                    onClick = { onClose(); onProfile() },
                    tone = PillTone.Secondary,
                    icon = RevisioIcons.visible,
                )
            }
            Spacer(Modifier.height(10.dp))
            PillButton(
                text = "Sign out",
                onClick = { onClose(); onSignOut() },
                tone = PillTone.Ghost,
                icon = RevisioIcons.signOut,
            )
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun TabSlot(
    label: String,
    icon: ImageVector,
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
        animationSpec = tween(150, easing = Easing.out.easing),
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
                vector = if (active) iconActive(icon) else icon,
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
            label,
            color = ink,
            fontSize = 11.sp,
            fontWeight = if (active) androidx.compose.ui.text.font.FontWeight.SemiBold
            else androidx.compose.ui.text.font.FontWeight.Medium,
            lineHeight = 11.sp,
        )
    }
}

/**
 * The web's registry glyphs, one per destination.
 *
 * `routes.ts` names an icon for every entry, and these are those entries in that
 * order: `progress` is the Rank destination, `person` is Settings. The overflow
 * rows use the same property, so a destination can never be a glyph on the bar
 * and a different one in the sheet.
 */
internal val Destination.icon: ImageVector
    get() = when (this) {
        Destination.TODAY -> RevisioIcons.dashboard
        Destination.REVIEW -> RevisioIcons.review
        Destination.LEARN -> RevisioIcons.learn
        Destination.RANK -> RevisioIcons.rank
        Destination.CRAM -> RevisioIcons.cram
        Destination.EXAM -> RevisioIcons.exam
        Destination.PRACTICE -> RevisioIcons.practice
        Destination.LIBRARY -> RevisioIcons.library
        Destination.SETTINGS -> RevisioIcons.person
        Destination.TEACHING -> RevisioIcons.teacher
        Destination.ADMIN -> RevisioIcons.admin
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
