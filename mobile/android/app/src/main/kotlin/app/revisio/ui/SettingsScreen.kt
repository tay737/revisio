package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.MeDetail
import app.revisio.engine.Visibility
import app.revisio.engine.usernameProblem

/**
 * Settings — one page, five questions, exactly as `src/app/(app)/settings/page.tsx`
 * asks them:
 *
 *   • Who you are on the outside (Profile)
 *   • Who may see it (Privacy)
 *   • Where we reach you (Account — email)
 *   • What guards the door (Security — password, 2FA)
 *   • How the app behaves (Preferences)
 *
 * The shape matters as much as the contents. Settings is the screen where a
 * phone port most often stops being a port: one flat list of switches is easier
 * to write than five surfaces that each own their own confirmation, and it is
 * wrong for the same reason it would be wrong on the website — a save in Profile
 * must never answer for a save in Privacy.
 *
 * So the five sections are the web's five sections, each one a card, with the
 * account's notice at the top where the web puts it, and the same copy under the
 * same field. Where the web enforces something before the request (the username
 * rule, the password match) this does too, from the generated rules in
 * `AccountRules.kt` rather than from a second opinion.
 */

/** `AVATAR_COLORS` — the five the website offers, in its order. */
private val AVATAR_COLORS = listOf("ink", "moss", "bee", "dawn", "sky")

/** `AVATAR_EMOJI` — ditto. An uploaded picture replaces whichever is chosen. */
private val AVATAR_EMOJI = listOf("🦉", "🧠", "📚", "⚡", "🌟", "🦊", "🐢", "🌙", "🎯", "🧪")

/** `VISIBILITY_ROWS` — key, label and hint, in the web's order. */
private val VISIBILITY_ROWS = listOf(
    Triple("name", "Full name", "Your real name, as registered."),
    Triple("nickname", "Display name", "The name your profile leads with."),
    Triple("bio", "About me", "Your short introduction."),
    Triple("subjects", "Subjects", "What you are studying."),
    Triple("stats", "XP and rank", "Your level, XP, streak and review count."),
    Triple("achievements", "Achievements", "The badges you have earned."),
)

@Composable
fun SettingsScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        ScreenTitle("Settings", eyebrow = "Account")
        Spacer(Modifier.height(4.dp))
        Text(
            "Your profile, account and how the app behaves.",
            style = Type.caption.style(Muted),
        )
        Spacer(Modifier.height(18.dp))

        // The page's own notice, in the web's two tones and in the web's place:
        // above everything, so a section that answered can be seen answering.
        val note = state.settingsNote
        val error = state.settingsError
        if (note != null) Notice(note, good = true, onDismiss = viewModel::dismissSettingsNotice)
        if (error != null) Notice(error, good = false, onDismiss = viewModel::dismissSettingsNotice)
        if (note != null || error != null) Spacer(Modifier.height(16.dp))

        val me = state.me
        if (me == null) {
            Unloaded(state, viewModel)
            return@Column
        }

        Identity(me, state)
        ProfileCard(me, state, viewModel)
        PrivacyCard(me, viewModel)
        AccountCard(me, state, viewModel)
        SecurityCard(me, state, viewModel)
        PreferencesCard(me, viewModel)

        Spacer(Modifier.height(28.dp))
        PillButton(
            text = "Sign out",
            onClick = viewModel::signOut,
            tone = PillTone.Ghost,
            icon = RevisioIcons.signOut,
        )
        Spacer(Modifier.height(28.dp))
    }
}

/**
 * The three ways this page can have nothing to show.
 *
 * A page whose only other state is a spinner cannot tell "this failed, try
 * again" from "this is still coming", and that ambiguity is what made this screen
 * read as stuck: it kept saying Loading while nothing was on its way. Loading,
 * failed, and offline each say what they are.
 */
@Composable
private fun Unloaded(state: UiState, viewModel: RevisioViewModel) {
    val error = state.meError
    SoftCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(RevisioIcons.person, size = 16, tint = Muted)
            Spacer(Modifier.size(10.dp))
            // Offline is checked before the error, because "we could not reach the
            // server" is what `meError` says when the network is off — true, but
            // less useful than the specific thing this screen cannot do. Which
            // message won used to depend on the order the two arrived in, and that
            // made the same device say two different things about itself.
            Text(
                when {
                    state.meLoading -> "Loading your account…"
                    !state.online -> "Your account details need a connection. Today's review still works offline."
                    error != null -> error
                    else -> "Your account details are not loaded yet."
                },
                style = Type.caption.style(if (error != null && state.online) Ink else Muted),
            )
        }
    }
    Spacer(Modifier.height(14.dp))
    PillButton(
        text = if (state.online) "Try again" else "Sign in again",
        onClick = { if (state.online) viewModel.loadMe() else viewModel.signOut() },
        tone = PillTone.Secondary,
        enabled = !state.busy,
    )
}

/**
 * Who you are, at a glance — the crest you are building and the numbers behind
 * it.
 *
 * The website answers this on the Profile page rather than in Settings. On a
 * phone this is the account slot in the bar: the one tap that should say "this
 * is you". It reads the same payload the web does, so the two cannot disagree.
 */
@Composable
private fun Identity(me: MeDetail, state: UiState) {
    SurfaceCard(modifier = Modifier.entrance(scale = true)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val rank = state.ranked?.ranked?.rank
            if (rank != null) {
                RankCrest(rank, size = 58, showProgress = false)
            } else {
                Avatar(me.avatarEmoji, 58, me.avatarColor, me.name)
            }
            Spacer(Modifier.size(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(me.name.ifBlank { "No name" }, style = Type.strong.style(Ink))
                Text(me.email, style = Type.fine.style(Muted))
            }
            Badge(me.role.replaceFirstChar { it.uppercase() })
        }
        Spacer(Modifier.height(14.dp))
        Hairline()
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Stat("XP", "${me.gamification.totalXp}")
            Stat("Level", "${me.gamification.level}")
            Stat("Streak", "${me.gamification.streak}d")
            Stat("Badges", "${me.achievements.size}")
        }
    }
}

// ── Profile ─────────────────────────────────────────────────────────────────

@Composable
private fun ProfileCard(me: MeDetail, state: UiState, viewModel: RevisioViewModel) {
    // Reseed whenever the stored value changes, so a save or a fresh load is
    // reflected rather than being overwritten by a stale draft. The web gets the
    // same effect by remounting the body whenever `me` arrives.
    var name by remember(me.name) { mutableStateOf(me.name) }
    var nickname by remember(me.nickname) { mutableStateOf(me.nickname.orEmpty()) }
    var username by remember(me.username) { mutableStateOf(me.username.orEmpty()) }
    var bio by remember(me.bio) { mutableStateOf(me.bio.orEmpty()) }
    var emoji by remember(me.avatarEmoji) { mutableStateOf(me.avatarEmoji) }
    var color by remember(me.avatarColor) { mutableStateOf(me.avatarColor) }

    val problem = usernameProblem(username)
    val handle = username.trim().lowercase()
    // avatarUrl and bannerUrl are deliberately absent from `dirty`: uploads
    // confirm and save themselves, so "Unsaved changes" never lies about them.
    val dirty = name != me.name ||
        nickname != (me.nickname ?: "") ||
        username != (me.username ?: "") ||
        bio != (me.bio ?: "") ||
        emoji != me.avatarEmoji ||
        color != me.avatarColor

    Spacer(Modifier.height(20.dp))
    SurfaceCard(modifier = Modifier.entrance(index = 1)) {
        Text("Profile", style = Type.strong.style(Ink))
        Spacer(Modifier.height(4.dp))
        Text(
            if (handle.isNotBlank()) {
                "How you appear on your public profile /u/$handle."
            } else {
                "How you appear on your public profile — pick a username to get an address."
            },
            style = Type.caption.style(Muted),
        )

        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Avatar(emoji, 64, color, name)
            Column(modifier = Modifier.weight(1f)) {
                Label("Colour", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    AVATAR_COLORS.forEach { option ->
                        // The web marks the choice with a 2px ring rather than a
                        // tick: the swatch is the answer, so a tick would cover it.
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(Radius.pill))
                                .border(
                                    width = 2.dp,
                                    color = if (option == color) Ink else Color.Transparent,
                                    shape = RoundedCornerShape(Radius.pill),
                                )
                                .padding(2.dp)
                                .clickable { color = option },
                        ) {
                            Avatar("Aa", 28, color = option)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        Label("Symbol", token = Type.eyebrow, color = Muted)
        Spacer(Modifier.height(6.dp))
        // `flex-wrap` on the web: the Initials chip and ten symbols do not fit on
        // one phone row, so they wrap in the same order, six to a row.
        (listOf<String?>(null) + AVATAR_EMOJI).chunked(6).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { option ->
                    ChipPill(option ?: "Initials", active = emoji == option, onClick = { emoji = option })
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        Text("An uploaded picture replaces the symbol.", style = Type.fine.style(Muted))

        Spacer(Modifier.height(18.dp))
        SettingsField(
            label = "Full name",
            value = name,
            onChange = { name = it },
            placeholder = "Your name",
        )
        Spacer(Modifier.height(14.dp))
        SettingsField(
            label = "Display name",
            value = nickname,
            onChange = { nickname = it },
            placeholder = "Optional",
            hint = "Shown on your profile instead of your full name.",
        )
        Spacer(Modifier.height(14.dp))
        SettingsField(
            label = "Username",
            value = username,
            onChange = { username = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '-' || c == '_' } },
            placeholder = "Optional",
            hint = problem
                ?: if (handle.isNotBlank()) "Your profile: /u/$handle" else "Optional — letters, numbers, hyphens.",
            bad = problem != null,
        )
        Spacer(Modifier.height(14.dp))
        SettingsField(
            label = "About me",
            value = bio,
            onChange = { if (it.length <= 240) bio = it },
            placeholder = "Optional",
            hint = "A line or two, up to 240 characters.",
            lines = 3,
            imeAction = ImeAction.Default,
        )

        Spacer(Modifier.height(18.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PillButton(
                text = if (state.savingProfile) "Saving…" else "Save profile",
                onClick = { viewModel.saveProfile(name, username, nickname, bio, emoji.orEmpty(), color) },
                icon = RevisioIcons.checked,
                // The web disables Save until something actually changed *and*
                // the handle is legal, then says why — it never offers a button
                // that would be refused.
                enabled = dirty && problem == null && !state.savingProfile,
                large = true,
                modifier = Modifier.weight(1f),
            )
            if (dirty && problem == null) {
                Text("Unsaved changes", style = Type.caption.style(Muted))
            }
        }
    }
}

/** `Visibility` has six named flags; the row list addresses them by key. */
private fun Visibility.flag(key: String): Boolean = when (key) {
    "name" -> name
    "nickname" -> nickname
    "bio" -> bio
    "subjects" -> subjects
    "stats" -> stats
    else -> achievements
}

private fun Visibility.withFlag(key: String, value: Boolean): Visibility = when (key) {
    "name" -> copy(name = value)
    "nickname" -> copy(nickname = value)
    "bio" -> copy(bio = value)
    "subjects" -> copy(subjects = value)
    "stats" -> copy(stats = value)
    else -> copy(achievements = value)
}

// ── Privacy ─────────────────────────────────────────────────────────────────

@Composable
private fun PrivacyCard(me: MeDetail, viewModel: RevisioViewModel) {
    val visibility = me.profileVisibility
    Spacer(Modifier.height(20.dp))
    SurfaceCard(modifier = Modifier.entrance(index = 2)) {
        Text("Privacy", style = Type.strong.style(Ink))
        Spacer(Modifier.height(4.dp))
        Text(
            "Choose what someone visiting your profile can see. You always see everything.",
            style = Type.caption.style(Muted),
        )
        Spacer(Modifier.height(4.dp))
        VISIBILITY_ROWS.forEachIndexed { index, (key, label, hint) ->
            if (index > 0) Hairline()
            SettingsSwitch(
                label = label,
                hint = hint,
                checked = visibility.flag(key),
                last = index == VISIBILITY_ROWS.lastIndex,
                onChange = { next -> viewModel.setVisibility(visibility.withFlag(key, next)) },
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            "Your email is never shown to anyone. Leaderboard visibility is a separate switch in Preferences.",
            style = Type.fine.style(Muted),
        )
    }
}

// ── Account ─────────────────────────────────────────────────────────────────

@Composable
private fun AccountCard(me: MeDetail, state: UiState, viewModel: RevisioViewModel) {
    var newEmail by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val canSend = newEmail.isNotBlank() && password.isNotBlank() && !state.savingEmail

    Spacer(Modifier.height(20.dp))
    SurfaceCard(modifier = Modifier.entrance(index = 3)) {
        Text("Account", style = Type.strong.style(Ink))
        Spacer(Modifier.height(4.dp))
        Text(
            "Signed in as ${me.email}" + if (me.status != "active") " — email not verified yet." else ".",
            style = Type.caption.style(Muted),
        )

        Spacer(Modifier.height(16.dp))
        SettingsField(
            label = "New email",
            value = newEmail,
            onChange = { newEmail = it },
            placeholder = "you@school.example",
            hint = "We email a confirmation link; the change happens when you click it.",
            keyboard = KeyboardType.Email,
        )
        Spacer(Modifier.height(14.dp))
        SettingsField(
            label = "Current password",
            value = password,
            onChange = { password = it },
            placeholder = "Proof it is you",
            password = true,
        )

        Spacer(Modifier.height(18.dp))
        PillButton(
            text = if (state.savingEmail) "Sending…" else "Send confirmation email",
            onClick = { viewModel.requestEmailChange(password, newEmail) },
            icon = RevisioIcons.mail,
            tone = PillTone.Secondary,
            enabled = canSend,
            large = true,
        )
    }
}

// ── Security ────────────────────────────────────────────────────────────────

@Composable
private fun SecurityCard(me: MeDetail, state: UiState, viewModel: RevisioViewModel) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    // The web's own three conditions, so Change is never offered for a password
    // the server would refuse.
    val canChange = current.isNotBlank() && next.length >= 8 && next == confirm && !state.savingPassword

    Spacer(Modifier.height(20.dp))
    SurfaceCard(modifier = Modifier.entrance(index = 4)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Security", style = Type.strong.style(Ink))
                Spacer(Modifier.height(4.dp))
                Text(
                    "Two-factor authentication is ${if (me.totpEnabled) "on." else "off."}",
                    style = Type.caption.style(Muted),
                )
            }
            ChipPill(
                if (me.totpEnabled) "2FA on" else "2FA off",
                active = me.totpEnabled,
                icon = RevisioIcons.secure,
            )
        }

        Spacer(Modifier.height(16.dp))
        SettingsField(
            label = "Current password",
            value = current,
            onChange = { current = it },
            password = true,
        )
        Spacer(Modifier.height(14.dp))
        SettingsField(
            label = "New password",
            value = next,
            onChange = { next = it },
            hint = "At least 8 characters.",
            password = true,
        )
        Spacer(Modifier.height(14.dp))
        val mismatch = confirm.isNotBlank() && confirm != next
        SettingsField(
            label = "Repeat new password",
            value = confirm,
            onChange = { confirm = it },
            bad = mismatch,
            hint = if (mismatch) "The two new passwords do not match." else null,
            password = true,
            imeAction = ImeAction.Done,
        )

        Spacer(Modifier.height(18.dp))
        PillButton(
            text = if (state.savingPassword) "Changing…" else "Change password",
            onClick = { viewModel.changePassword(current, next, confirm) },
            icon = RevisioIcons.secure,
            enabled = canChange,
            large = true,
        )
        Spacer(Modifier.height(8.dp))
        Text("Changing your password signs out every other device.", style = Type.fine.style(Muted))
    }
}

// ── Preferences ─────────────────────────────────────────────────────────────

@Composable
private fun PreferencesCard(me: MeDetail, viewModel: RevisioViewModel) {
    Spacer(Modifier.height(20.dp))
    SurfaceCard(modifier = Modifier.entrance(index = 5)) {
        Text("Preferences", style = Type.strong.style(Ink))
        Spacer(Modifier.height(10.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Note density", style = Type.captionS.style(Ink))
                Text(
                    "Full notes while learning, or the short version.",
                    style = Type.caption.style(Muted),
                )
            }
            Segmented(
                options = listOf("detailed" to "Detailed", "summary" to "Summary"),
                selected = me.prefs?.noteDensity ?: "detailed",
                onSelect = viewModel::setNoteDensity,
            )
        }
        Spacer(Modifier.height(12.dp))
        Hairline()

        SettingsSwitch(
            label = "Reduce motion",
            hint = "Calmer animations throughout the app.",
            checked = me.prefs?.reducedMotion ?: false,
            onChange = viewModel::setReducedMotion,
        )

        SettingsSwitch(
            label = "Show me on leaderboards",
            hint = "Your rank is unaffected either way.",
            checked = !me.leaderboardOptOut,
            last = true,
            onChange = { viewModel.setLeaderboardOptOut(!it) },
        )
    }
}

// ── the pieces a settings list is built from ────────────────────────────────

/**
 * The page's notice.
 *
 * The web keeps a good slot and a bad slot and clears them on the next action,
 * which is what lets a section confirm itself without a modal. The colours are
 * the stylesheet's `notice-good` / `notice-bad`, not a Material snackbar — a
 * snackbar that slides in over the content and leaves on a timer is a different
 * promise from a line of text that stays until the next thing happens.
 */
@Composable
private fun Notice(text: String, good: Boolean, onDismiss: () -> Unit) {
    val ink = if (good) revisioColors.goodPressed else Bad
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.md))
            .background(ink.copy(alpha = 0.1f))
            .border(1.dp, ink.copy(alpha = 0.3f), RoundedCornerShape(Radius.md))
            .clickable(onClick = onDismiss)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(if (good) RevisioIcons.checked else RevisioIcons.secure, size = 16, tint = ink)
        Text(text, style = Type.caption.style(Ink), modifier = Modifier.weight(1f))
    }
}

/**
 * A labelled row with a switch, separated by hairlines rather than gaps — which
 * is how the website reads a settings list: one surface, many settings.
 */
@Composable
private fun SettingsSwitch(
    label: String,
    hint: String? = null,
    checked: Boolean,
    last: Boolean = false,
    onChange: (Boolean) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(label, style = Type.captionS.style(Ink))
                if (hint != null) Text(hint, style = Type.caption.style(Muted))
            }
            Toggle(checked, label, onChange)
        }
        if (!last) Hairline()
    }
}

/**
 * The web's `Toggle`: a 48×28 pill whose knob slides on a 150ms transition.
 *
 * Material's `Switch` is the same idea at a different size — 52×32 with a 20px
 * track height — and that difference is exactly the kind of drift this port
 * exists to remove. It is used anyway because it carries switch semantics, which
 * a hand-drawn pill would have to re-earn; the colours are the web's, so the
 * control reads as the same control.
 */
@Composable
private fun Toggle(checked: Boolean, label: String, onChange: (Boolean) -> Unit) {
    Switch(
        checked = checked,
        onCheckedChange = onChange,
        colors = SwitchDefaults.colors(
            checkedThumbColor = Color.White,
            checkedTrackColor = Good,
            uncheckedThumbColor = Color.White,
            uncheckedTrackColor = Line,
            uncheckedBorderColor = LineStrong,
        ),
        modifier = Modifier.semantics { contentDescription = label },
    )
}

/**
 * A settings field: label above, control, hint below — and the hint turns red
 * with the field when the value is refused, which is the web's `bad` state.
 */
@Composable
private fun SettingsField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    placeholder: String = "",
    hint: String? = null,
    bad: Boolean = false,
    password: Boolean = false,
    keyboard: KeyboardType = KeyboardType.Text,
    lines: Int = 1,
    imeAction: ImeAction = ImeAction.Next,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Label(label, token = Type.eyebrow, color = Muted)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            placeholder = { Text(placeholder, style = Type.body.style(Muted.copy(alpha = 0.75f))) },
            singleLine = lines == 1,
            minLines = lines,
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = if (password) KeyboardType.Password else keyboard,
                imeAction = imeAction,
            ),
            shape = RoundedCornerShape(Radius.sm),
            textStyle = Type.body.style(Ink),
            colors = OutlinedTextFieldDefaults.colors(
                // The web's `bad` field is the same box with a red stroke — it
                // does not change size or weight, so the form never reflows as
                // the learner types their way into and out of a valid handle.
                focusedBorderColor = if (bad) Bad else Ink,
                unfocusedBorderColor = if (bad) Bad else Line,
                cursorColor = Ink,
                focusedContainerColor = Card1,
                unfocusedContainerColor = Card1,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        if (hint != null) {
            Spacer(Modifier.height(6.dp))
            Text(hint, style = Type.fine.style(if (bad) Bad else Muted))
        }
    }
}
