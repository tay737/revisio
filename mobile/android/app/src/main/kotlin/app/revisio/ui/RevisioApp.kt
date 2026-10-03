package app.revisio.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.BackHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.revisio.Destination
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.UpdateKind

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
        // The account's own calm preference joins the system's: either one
        // settles the springs, whichever the learner used to ask for it.
        val accountMotionOff = state.me?.prefs?.reducedMotion == true
        CompositionLocalProvider(LocalReducedMotion provides (accountMotionOff || reducedMotion())) {
            // Edge-to-edge: the app draws the whole screen, so the app owns the
            // system bars' clearance too. Consumed once, here — status-bar
            // height above the tree, gesture-nav and keyboard handled at the
            // bottom bar and the session field — instead of every screen
            // guessing with fixed spacers.
            val topInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
            val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
            Surface(color = revisioColors.background, modifier = Modifier.fillMaxSize()) {
                Box(modifier = Modifier.fillMaxSize()) {
                    when {
                        state.loading -> Loading()
                        !state.signedIn -> AuthScreen(state, viewModel, topInset, bottomInset)
                        state.inReview -> SessionScreen(state, viewModel)
                        // A shared profile is a page, not a destination: it opens over
                        // whatever the learner was looking at and closes back to it,
                        // which is what a link out of a chat window should do.
                        state.profileHandle != null -> ProfileScreen(state, viewModel)
                        else -> Column(modifier = Modifier.fillMaxSize()) {
                            Spacer(Modifier.height(topInset))
                            // The update notice rides above every destination: asked
                            // once at launch, shown until dismissed, and never in the
                            // way of the screens themselves.
                            UpdateBanner(state, viewModel::dismissUpdate)
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
                                    Destination.TEACHING -> TeachingScreen(state, viewModel)
                                    Destination.ADMIN -> AdminScreen(state, viewModel)
                                }
                            }
                            BottomBar(
                                current = state.destination,
                                role = state.me?.role,
                                due = state.home?.due ?: 0,
                                onSelect = viewModel::go,
                                onMore = viewModel::openMore,
                                // Gesture navigation draws over the bar's bottom
                                // edge; clear it the same way the web clears
                                // `pb-safe` under its own bar.
                                bottomInset = bottomInset,
                            )
                        }
                    }
                    state.message?.let { message ->
                        MessageBanner(message, viewModel::dismissMessage, Modifier.align(Alignment.TopCenter))
                    }
                    // The system Back button speaks the app's language: mid-review
                    // it means "end the session" (the summary — the same contract
                    // as the web's End session), anywhere else it closes whatever
                    // overlay is open. It never falls through to exiting the app
                    // from inside a session.
                    BackHandler(enabled = state.inReview && !state.finished) {
                        viewModel.endSessionEarly()
                    }
                    BackHandler(enabled = state.moreOpen) {
                        viewModel.closeMore()
                    }
                    BackHandler(enabled = state.profileHandle != null) {
                        viewModel.closeProfile()
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
}

/**
 * The update notice, shown over every destination until dismissed.
 *
 * The server was asked once at launch what the newest client is; this renders
 * the answer. "Available" is a sentence, "required" is a sentence and a
 * different weight — the server's `minBuild` floor is what makes the
 * difference, and the copy does not pretend otherwise. Either way the app
 * keeps working: an update notice must never be the thing that stops a learner
 * from doing their reviews.
 */
@Composable
private fun UpdateBanner(state: UiState, onDismiss: () -> Unit) {
    val update = state.update
    if (state.updateDismissed || update.kind == UpdateKind.None) return
    val required = update.kind == UpdateKind.Required
    SurfaceCard(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BoxedGlyph(if (required) RevisioIcons.rocket else RevisioIcons.download, tint = if (required) Warn else Ink)
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (required) "This version must be updated" else "An update is available",
                    style = Type.strong.style(Ink),
                )
                Text(
                    if (required) {
                        "Version ${update.latest} is required — older builds can no longer be guaranteed to work."
                    } else {
                        "Version ${update.latest} is out. You can keep studying either way."
                    },
                    style = Type.fine.style(Muted),
                )
            }
            IconPill(RevisioIcons.close, onDismiss)
        }
    }
}

/**
 * The loading state, with a shape: the wordmark and one honest line instead of a
 * bare spinner — the web's skeleton, reduced to what a phone needs.
 */
@Composable
private fun Loading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Revisio", style = Type.display.style(Ink))
            Spacer(Modifier.height(10.dp))
            Text("Loading your queue…", style = Type.caption.style(Muted))
        }
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
    bottomInset: Dp = 0.dp,
) {
    val tabs = Destination.bar(role)
    val overflow = Destination.overflow(role)
    // More is a real slot, so the indicator has five positions to travel between
    // even though only four of them are destinations — and it parks under More
    // while any page behind it is open, which is what tells the learner where
    // they are when the page itself cannot say so.
    val slots = tabs.size + 1
    val activeSlot = tabs.indexOf(current).takeIf { it >= 0 } ?: (slots - 1)

    Column(modifier = Modifier.fillMaxWidth().padding(bottom = bottomInset)) {
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
//
// The web's auth pages, ported: a compact ink band as the header — wordmark
// tile, tagline, eyebrow and display line — with the form card overlapping its
// lower edge by a fixed 32px. A fixed overlap is what makes the card look
// placed instead of fallen, which is the same judgement `AuthShell.tsx` makes.
// One screen carries login and register, exactly as `AuthForm.tsx` does: the
// MFA stage appears in place, registration offers the student/teacher choice
// with subject chips and a class code, and every response lands in the Notice.

private enum class AuthMode { Login, Register }

@Composable
private fun AuthScreen(state: UiState, viewModel: RevisioViewModel, topInset: Dp, bottomInset: Dp) {
    var mode by remember { mutableStateOf(AuthMode.Login) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            // The band runs to the screen's top edge on Android 15+, so the
            // status-bar clearance is the scroll content's own first spacer.
            .padding(top = topInset, bottom = bottomInset),
    ) {
        // ── the band ────────────────────────────────────────────────────────
        // Written once against the band palette, which TilePanel's own trick
        // produces: remap the roles, not the colours, so ink text on a canvas
        // becomes white on near-black without a second set of tokens — the
        // `.band` scope in the stylesheet, not a fork of it.
        Band(
            modifier = Modifier.padding(horizontal = 20.dp),
        ) {
                Spacer(Modifier.height(20.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // The wordmark tile: a 28px square with the letter, as the
                    // web's login header does. Inside the band the tile and its
                    // letter invert together, because both read the scope.
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(Radius.sm))
                            .background(revisioColors.primary),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "R",
                            color = revisioColors.primaryForeground,
                            style = Type.fine.style(revisioColors.primaryForeground).copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                            ),
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Text("Revisio", style = Type.tagline.style(revisioColors.foreground))
                }
                Spacer(Modifier.height(40.dp))
                Label("Spaced repetition", token = Type.eyebrow, color = revisioColors.mutedForeground)
                Spacer(Modifier.height(8.dp))
            Text("Ten minutes a day.", style = Type.display.style(revisioColors.foreground))
            // The band runs 64px past the display line; the card below
            // overlaps its last 32, as the web's `-mt-8` does.
            Spacer(Modifier.height(64.dp))
        }

        // ── the card, pulled up over the band's lower edge by a fixed 32px ──
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
            SurfaceCard(
                modifier = Modifier
                    .offset(y = (-32).dp)
                    .entrance(index = 0, scale = true),
                tone = revisioColors.card,
            ) {
                AuthCard(state, viewModel, mode) { mode = it }
            }
            // Cancel the overlap's offset in the flow, so the footer sits where
            // the band's own bottom padding would have put it.
            Spacer(Modifier.height(0.dp))
            Text(
                if (mode == AuthMode.Login)
                    "No account yet? Create one — or study offline; your session and today's cards are kept on this device."
                else
                    "Already registered? Sign in — then keep studying offline.",
                style = Type.caption.style(Muted),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            // Password reset lives on the web for now; a stated path beats a
            // missing affordance (the phones' share of the P0-2 fix).
            if (mode == AuthMode.Login) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Forgot your password? Reset it on the web at revisio-srs.vercel.app.",
                    style = Type.fine.style(Muted),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun AuthCard(
    state: UiState,
    viewModel: RevisioViewModel,
    mode: AuthMode,
    onModeChange: (AuthMode) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("student") }
    var subjectIds by remember { mutableStateOf(setOf<String>()) }
    var classCode by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var mfaStage by remember { mutableStateOf(false) }
    var unverifiedEmail by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf("") }
    var info by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var subjects by remember { mutableStateOf(listOf<app.revisio.engine.PublicSubject>()) }

    // The registration form's subject list — fetched once, like the web's
    // `/auth/subjects-public` read, and quietly absent when the network is not
    // there: an offline register was never going to land anyway.
    LaunchedEffect(Unit) {
        subjects = runCatching { viewModel.publicSubjects() }.getOrDefault(emptyList())
    }

    // The one submit path, shared by the password field's Done key and the
    // button — so the keyboard's action can never disagree with the CTA.
    fun submitLogin() {
        if (busy) return
        error = ""
        info = ""
        busy = true
        // The code goes through whole: a six-digit TOTP or a recovery code —
        // the server decides which it got, so nothing here strips characters.
        val code = if (mfaStage) totp.trim().replace(" ", "").takeIf { it.isNotEmpty() } else null
        viewModel.signIn(email.trim(), password, code) { outcome ->
            busy = false
            when (outcome) {
                is RevisioViewModel.SignInOutcome.MfaRequired -> {
                    mfaStage = true
                    info = "Enter the six-digit code from your authenticator app — or one of your recovery codes."
                }
                is RevisioViewModel.SignInOutcome.Failed -> {
                    // An unverified address is a different door: the offer to
                    // re-send appears, as the web's does.
                    unverifiedEmail = null
                    error = outcome.message
                }
                RevisioViewModel.SignInOutcome.SignedIn -> {}
            }
        }
    }

    val title = if (mode == AuthMode.Login) "Welcome back" else "Create your account"
    val subtitle = if (mode == AuthMode.Login) "Your queue is where you left it."
    else "Choose your subjects now — you can change them later."

    Column {
        Text(title, style = Type.tagline.style(Ink))
        Spacer(Modifier.height(6.dp))
        Text(subtitle, style = Type.caption.style(Muted))
        Spacer(Modifier.height(24.dp))

        if (mode == AuthMode.Register) {
            AuthField(icon = RevisioIcons.person, label = "Full name", value = name, onValue = { name = it }, placeholder = "Ada Lovelace")
            Spacer(Modifier.height(16.dp))
        }
        AuthField(icon = RevisioIcons.mail, label = "Email", value = email, onValue = { email = it }, placeholder = "you@school.edu")
        Spacer(Modifier.height(16.dp))
        AuthField(
            icon = RevisioIcons.secure,
            label = "Password",
            value = password,
            onValue = { password = it },
            placeholder = if (mode == AuthMode.Login) "Your password" else "At least 8 characters",
            password = true,
            onImeAction = {
                // The keyboard's action key submits when signing in — the web's
                // form behaviour. "Next" that does nothing is a dead key.
                if (mode == AuthMode.Login && password.isNotEmpty()) submitLogin()
            },
        )

        if (mode == AuthMode.Register) {
            Spacer(Modifier.height(20.dp))
            Label("I am joining as", token = Type.label, color = Ink)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RoleOption(
                    label = "Student",
                    hint = "Study my own subjects",
                    icon = RevisioIcons.start,
                    selected = role == "student",
                    modifier = Modifier.weight(1f),
                ) { role = "student" }
                RoleOption(
                    label = "Teacher",
                    hint = "Run classes and share content",
                    icon = RevisioIcons.teacher,
                    selected = role == "teacher",
                    modifier = Modifier.weight(1f),
                ) { role = "teacher" }
            }

            if (role == "student" && subjects.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Label("Subjects", token = Type.label, color = Ink)
                Spacer(Modifier.height(8.dp))
                SubjectChips(
                    subjects = subjects,
                    selected = subjectIds,
                    onToggle = { id ->
                        subjectIds = if (subjectIds.contains(id)) subjectIds - id else subjectIds + id
                    },
                )
            }

            if (role == "student") {
                Spacer(Modifier.height(16.dp))
                AuthField(
                    icon = RevisioIcons.join,
                    label = "Class code (optional)",
                    value = classCode,
                    onValue = { classCode = it },
                    placeholder = "B7K2QM",
                    uppercase = true,
                )
            } else {
                Spacer(Modifier.height(16.dp))
                Label("Why do you need a teacher account?", token = Type.label, color = Ink)
                Spacer(Modifier.height(6.dp))
                AuthTextArea(value = note, onChange = { note = it }, placeholder = "School, role, subjects you teach…")
                Spacer(Modifier.height(6.dp))
                Text("A developer reads this before activating the account.", style = Type.caption.style(Muted))
            }
        }

        // The 2FA stage: the server has asked for the six digits. It arrives in
        // place with the sheet spring, as the web's AnimatePresence height
        // animation does — the form grows rather than a second page appearing.
        androidx.compose.animation.AnimatedVisibility(
            visible = mfaStage,
            enter = fadeIn(tween(Motion.Durations.quick, easing = Easing.out.easing)) +
                expandVertically(
                    animationSpec = Motion.Springs.soft.spec<IntSize>(),
                    expandFrom = Alignment.Top,
                ),
        ) {
            Column {
                Spacer(Modifier.height(16.dp))
                AuthField(
                    icon = RevisioIcons.private,
                    label = "Two-factor code",
                    value = totp,
                    onValue = { totp = it },
                    placeholder = "000000",
                    // Digits and spaces only, capped at 24: a TOTP code is six
                    // digits, but the same field accepts a recovery code and the
                    // server decides which it got — so the field must not mangle
                    // one into the other.
                    digitsOnly = true,
                    maxLength = 24,
                )
            }
        }

        if (error.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Notice(text = error, good = false, onDismiss = { error = "" })
        }
        if (info.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Notice(text = info, good = true, onDismiss = { info = "" })
        }

        if (unverifiedEmail != null) {
            Spacer(Modifier.height(12.dp))
            PillButton(
                text = "Re-send the verification email",
                onClick = {
                    busy = true
                    viewModel.resendVerification(unverifiedEmail!!) { sent ->
                        busy = false
                        error = ""
                        info = if (sent) "Sent again to $unverifiedEmail. It can take a minute to arrive."
                        else "We could not re-send that right now. Try again shortly."
                    }
                },
                tone = PillTone.Secondary,
                icon = RevisioIcons.rotate,
                enabled = !busy,
            )
        }

        Spacer(Modifier.height(16.dp))
        PillButton(
            text = when {
                busy -> "Just a moment…"
                mode == AuthMode.Login && mfaStage -> "Verify and sign in"
                mode == AuthMode.Login -> "Sign in"
                else -> "Create account"
            },
            onClick = {
                if (mode == AuthMode.Login) {
                    submitLogin()
                } else {
                    busy = true
                    viewModel.register(
                        email = email.trim(),
                        password = password,
                        name = name.trim(),
                        role = role,
                        subjectIds = subjectIds.toList(),
                        classCode = classCode.trim().takeIf { it.isNotEmpty() },
                        note = note.trim().takeIf { it.isNotEmpty() },
                    ) { outcome ->
                        busy = false
                        when (outcome) {
                            is RevisioViewModel.SignUpOutcome.Done -> {
                                info = if (outcome.verifyUrl != null)
                                    "Email delivery is not configured on this deployment, so here is your verification link."
                                else
                                    "Account created. Check your inbox for the verification link, then sign in."
                            }
                            is RevisioViewModel.SignUpOutcome.Failed -> error = outcome.message
                        }
                    }
                }
            },
            enabled = when {
                busy -> false
                mode == AuthMode.Login -> email.isNotBlank() && password.isNotEmpty() &&
                    (!mfaStage || totp.isNotBlank())
                else -> email.isNotBlank() && password.length >= 8 && name.isNotBlank()
            },
            large = true,
        )

        Spacer(Modifier.height(20.dp))
        Text(
            if (mode == AuthMode.Login) "No account yet? Create one" else "Already registered? Sign in",
            style = Type.caption.style(if (state.busy) Muted else Ink),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radius.pill))
                .clickable {
                    error = ""
                    info = ""
                    mfaStage = false
                    totp = ""
                    onModeChange(if (mode == AuthMode.Login) AuthMode.Register else AuthMode.Login)
                }
                .padding(vertical = 4.dp),
        )
    }
}

/** Label + leading glyph + control — the web's `Field`, glyph against the pill. */
@Composable
private fun AuthField(
    icon: ImageVector,
    label: String,
    value: String,
    onValue: (String) -> Unit,
    placeholder: String,
    password: Boolean = false,
    uppercase: Boolean = false,
    digitsOnly: Boolean = false,
    maxLength: Int = Int.MAX_VALUE,
    onImeAction: (() -> Unit)? = null,
) {
    Column {
        Label(label, token = Type.label, color = Ink)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = { next ->
                onValue(
                    when {
                        digitsOnly -> next.filter { it.isDigit() || it == ' ' }.take(maxLength)
                        uppercase -> next.uppercase().take(maxLength)
                        else -> next.take(maxLength)
                    },
                )
            },
            placeholder = { Text(placeholder, style = Type.body.style(Muted.copy(alpha = 0.75f))) },
            leadingIcon = { Icon(icon, size = 17, tint = Muted) },
            singleLine = true,
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                keyboardType = when {
                    password -> KeyboardType.Password
                    digitsOnly -> KeyboardType.Number
                    else -> KeyboardType.Email
                },
                imeAction = if (onImeAction != null) ImeAction.Done else ImeAction.Next,
            ),
            keyboardActions = KeyboardActions(
                onDone = { onImeAction?.invoke() },
                onNext = { onImeAction?.invoke() },
            ),
            shape = RoundedCornerShape(Radius.sm),
            textStyle = Type.body.style(Ink).copy(
                letterSpacing = if (uppercase) 2.sp else androidx.compose.ui.unit.TextUnit.Unspecified,
            ),
            colors = OutlinedTextFieldDefaults.colors(
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

/** The multi-line note a teacher registration asks for. */
@Composable
private fun AuthTextArea(value: String, onChange: (String) -> Unit, placeholder: String) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text(placeholder, style = Type.body.style(Muted.copy(alpha = 0.75f))) },
        minLines = 3,
        shape = RoundedCornerShape(Radius.sm),
        textStyle = Type.body.style(Ink),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Ink,
            unfocusedBorderColor = Line,
            cursorColor = Ink,
            focusedContainerColor = Card1,
            unfocusedContainerColor = Card1,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * The student/teacher choice: two labelled options with meaning, not a pair of
 * bare buttons that require guessing — the web's `option` cards.
 */
@Composable
private fun RoleOption(
    label: String,
    hint: String,
    icon: ImageVector,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onSelect: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(Radius.md))
            .background(if (selected) Card2 else Card1)
            .border(2.dp, if (selected) Ink else Line, RoundedCornerShape(Radius.md))
            .clickable(onClick = onSelect)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, size = 17, tint = Ink)
            Text(label, style = Type.body.style(Ink).copy(fontWeight = FontWeight.SemiBold))
        }
        Spacer(Modifier.height(4.dp))
        Text(hint, style = Type.caption.style(Muted))
    }
}

/** Subject chips that wrap — the web's `flex flex-wrap gap-2` row. */
@Composable
private fun SubjectChips(
    subjects: List<app.revisio.engine.PublicSubject>,
    selected: Set<String>,
    onToggle: (String) -> Unit,
) {
    subjects.chunked(3).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            row.forEach { subject ->
                ChipPill(
                    text = subject.name,
                    active = selected.contains(subject.id),
                ) { onToggle(subject.id) }
            }
        }
        Spacer(Modifier.height(6.dp))
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
