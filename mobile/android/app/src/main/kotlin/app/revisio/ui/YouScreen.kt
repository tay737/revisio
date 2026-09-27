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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
 */
@Composable
fun YouScreen(state: UiState, viewModel: RevisioViewModel) {
    val me = state.me

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        Text("You", fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(14.dp))

        if (me == null) {
            EmptyNote(
                if (!state.online) "Your account details need a connection. Today's review still works offline."
                else "Loading your account…",
            )
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

        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(emoji.ifBlank { me.avatarEmoji }, 48)
                Spacer(Modifier.size(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(me.name.ifBlank { "No name" }, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    Text(me.email, color = Muted, fontSize = 12.sp)
                }
                Chip(me.role)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "${me.gamification.totalXp} XP · level ${me.gamification.level} · ${me.achievements.size} achievements",
                color = Muted,
                fontSize = 12.sp,
            )
        }

        Spacer(Modifier.height(16.dp))
        SectionTitle("Profile")
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Display name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(4.dp))
        Text("3–20 characters: letters, numbers, hyphens or underscores.", color = Muted, fontSize = 11.sp)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = nickname,
            onValueChange = { nickname = it },
            label = { Text("Nickname") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = bio,
            onValueChange = { bio = it },
            label = { Text("Bio") },
            minLines = 2,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                value = emoji,
                onValueChange = { emoji = it.take(2) },
                label = { Text("Emoji") },
                singleLine = true,
                modifier = Modifier.size(width = 120.dp, height = 60.dp),
            )
            Column {
                Text("Colour", color = Muted, fontSize = 12.sp)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AVATAR_COLORS.forEach { option ->
                        if (option == color) {
                            Chip(option, Accent)
                        } else {
                            TextButton(onClick = { color = option }) { Text(option, fontSize = 11.sp, color = Muted) }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { viewModel.saveProfile(name, username, nickname, bio, emoji, color) },
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(14.dp),
        ) { Text("Save profile", fontWeight = FontWeight.SemiBold) }

        Spacer(Modifier.height(20.dp))
        SectionTitle("What your profile shows")
        Text(
            "Hidden fields are removed by the server before your page is ever sent, so this is a real boundary rather than a filter.",
            color = Muted,
            fontSize = 11.sp,
        )
        Spacer(Modifier.height(8.dp))
        val visibility = me.profileVisibility
        SwitchRow("Display name", visibility.name) { viewModel.setVisibility(visibility.copy(name = it)) }
        SwitchRow("Nickname", visibility.nickname) { viewModel.setVisibility(visibility.copy(nickname = it)) }
        SwitchRow("Bio", visibility.bio) { viewModel.setVisibility(visibility.copy(bio = it)) }
        SwitchRow("Subjects", visibility.subjects) { viewModel.setVisibility(visibility.copy(subjects = it)) }
        SwitchRow("Rank, XP and streak", visibility.stats) { viewModel.setVisibility(visibility.copy(stats = it)) }
        SwitchRow("Achievements", visibility.achievements) { viewModel.setVisibility(visibility.copy(achievements = it)) }

        Spacer(Modifier.height(20.dp))
        SectionTitle("Study")
        SwitchRow("Show me on leaderboards", !me.leaderboardOptOut) { viewModel.setLeaderboardOptOut(!it) }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Notes density", fontSize = 14.sp, modifier = Modifier.weight(1f))
            DensityToggle(me.prefs.noteDensity) { viewModel.setNoteDensity(it) }
        }

        if (me.subjects.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SectionTitle("Following")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                me.subjects.take(6).forEach { Chip(it.name) }
            }
        }

        Spacer(Modifier.height(24.dp))
        TextButton(onClick = viewModel::signOut) { Text("Sign out", color = Muted) }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
