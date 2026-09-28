package app.revisio.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.Visibility

private val AVATAR_COLORS = listOf("ink", "moss", "bee", "dawn", "sky")

/**
 * You — the account.
 *
 * Identity, the six privacy switches and the preferences. Privacy is not decided
 * here: `/profile/:handle` applies it server-side, so a hidden field is absent
 * from the payload rather than hidden by this screen. The switches only write the
 * setting; they never filter anything.
 *
 * The header shows the learner their own crest and rank, because the account page
 * is where "who am I here" should be answered at a glance.
 */
@Composable
fun YouScreen(state: UiState, viewModel: RevisioViewModel) {
    val me = state.me

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(20.dp))
        ScreenTitle("You", eyebrow = "Account")
        Spacer(Modifier.height(20.dp))

        if (me == null) {
            SoftCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.person, size = 16, tint = Muted)
                    Spacer(Modifier.size(10.dp))
                    Text(
                        if (!state.online) "Your account details need a connection. Today's review still works offline."
                        else "Loading your account…",
                        style = Type.caption.style(Muted),
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
            return@Column
        }

        // Reseed the form whenever the stored value changes, so a save or a fresh
        // load is reflected rather than being overwritten by a stale draft.
        var name by remember(me.name) { mutableStateOf(me.name) }
        var username by remember(me.username) { mutableStateOf(me.username.orEmpty()) }
        var nickname by remember(me.nickname) { mutableStateOf(me.nickname.orEmpty()) }
        var bio by remember(me.bio) { mutableStateOf(me.bio.orEmpty()) }
        var emoji by remember(me.avatarEmoji) { mutableStateOf(me.avatarEmoji.orEmpty()) }
        var color by remember(me.avatarColor) { mutableStateOf(me.avatarColor) }

        // ── the account card ────────────────────────────────────────────────
        SurfaceCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (state.ranked?.ranked?.rank != null) {
                    RankCrest(state.ranked.ranked.rank, size = 54, showProgress = false)
                } else {
                    Avatar(emoji.ifBlank { me.avatarEmoji }, 54)
                }
                Spacer(Modifier.size(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(me.name.ifBlank { "No name" }, style = Type.strong.style(Ink))
                    Text(me.email, style = Type.fine.style(Muted))
                }
                ChipPill(me.role)
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

        // ── profile ─────────────────────────────────────────────────────────
        Spacer(Modifier.height(24.dp))
        SectionTitle("Profile")
        Label("Display name", token = Type.eyebrow, color = Muted)
        Spacer(Modifier.height(6.dp))
        Field(value = name, onChange = { name = it }, placeholder = "Your name")

        Spacer(Modifier.height(14.dp))
        Label("Username", token = Type.eyebrow, color = Muted)
        Spacer(Modifier.height(6.dp))
        Field(value = username, onChange = { username = it }, placeholder = "your-handle")
        Spacer(Modifier.height(6.dp))
        Text(
            "3–20 characters: letters, numbers, hyphens or underscores.",
            style = Type.micro.style(Muted),
        )

        Spacer(Modifier.height(14.dp))
        Label("Nickname", token = Type.eyebrow, color = Muted)
        Spacer(Modifier.height(6.dp))
        Field(value = nickname, onChange = { nickname = it }, placeholder = "What we call you")

        Spacer(Modifier.height(14.dp))
        Label("Bio", token = Type.eyebrow, color = Muted)
        Spacer(Modifier.height(6.dp))
        Field(value = bio, onChange = { bio = it }, placeholder = "A line about you")

        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Label("Avatar", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(6.dp))
                Avatar(emoji.ifBlank { me.avatarEmoji }, 44)
            }
            Spacer(Modifier.width(4.dp))
            Column(modifier = Modifier.weight(1f)) {
                Label("Colour", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AVATAR_COLORS.forEach { option ->
                        Box(modifier = Modifier.clickable { color = option }) {
                            ChipPill(option, active = option == color)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(18.dp))
        PillButton(
            text = "Save profile",
            onClick = { viewModel.saveProfile(name, username, nickname, bio, emoji, color) },
            enabled = !state.busy,
            large = true,
        )

        // ── privacy ─────────────────────────────────────────────────────────
        Spacer(Modifier.height(28.dp))
        SectionTitle("What your profile shows")
        Text(
            "Hidden fields are removed by the server before your page is ever sent, so this is a real boundary rather than a filter.",
            style = Type.fine.style(Muted),
        )
        Spacer(Modifier.height(12.dp))
        val visibility = me.profileVisibility
        SurfaceCard {
            SwitchRow("Display name", visibility.name) { viewModel.setVisibility(visibility.copy(name = it)) }
            SwitchRow("Nickname", visibility.nickname) { viewModel.setVisibility(visibility.copy(nickname = it)) }
            SwitchRow("Bio", visibility.bio) { viewModel.setVisibility(visibility.copy(bio = it)) }
            SwitchRow("Subjects", visibility.subjects) { viewModel.setVisibility(visibility.copy(subjects = it)) }
            SwitchRow("Rank, XP and streak", visibility.stats) { viewModel.setVisibility(visibility.copy(stats = it)) }
            SwitchRow(
                "Achievements",
                visibility.achievements,
                last = true,
            ) { viewModel.setVisibility(visibility.copy(achievements = it)) }
        }

        // ── study ───────────────────────────────────────────────────────────
        Spacer(Modifier.height(28.dp))
        SectionTitle("Study")
        SurfaceCard {
            SwitchRow("Show me on leaderboards", !me.leaderboardOptOut) {
                viewModel.setLeaderboardOptOut(!it)
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Notes density", style = Type.strong.style(Ink))
                    Text(
                        if (me.prefs.noteDensity == "summary") "Just the summary" else "Full prose",
                        style = Type.fine.style(Muted),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("detailed" to "Full", "summary" to "Brief").forEach { (value, label) ->
                        Box(modifier = Modifier.clickable { viewModel.setNoteDensity(value) }) {
                            ChipPill(label, active = me.prefs.noteDensity == value)
                        }
                    }
                }
            }
        }

        if (me.subjects.isNotEmpty()) {
            Spacer(Modifier.height(28.dp))
            SectionTitle("Following")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                me.subjects.take(6).forEach { ChipPill(it.name) }
            }
        }

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
 * A switch row.
 *
 * The rows inside one card are separated by hairlines rather than by gaps, which
 * is how the website reads a settings list: one surface, many settings.
 */
@Composable
private fun SwitchRow(
    label: String,
    checked: Boolean,
    last: Boolean = false,
    onChange: (Boolean) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = Type.caption.style(Ink), modifier = Modifier.weight(1f))
            Switch(
                checked = checked,
                onCheckedChange = onChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = revisioColors.background,
                    checkedTrackColor = Ink,
                    uncheckedThumbColor = Muted,
                    uncheckedTrackColor = Card2,
                    uncheckedBorderColor = Line,
                ),
            )
        }
        if (!last) Hairline()
    }
}
