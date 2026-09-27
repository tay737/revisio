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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.revisio.RevisioViewModel
import app.revisio.Tab
import app.revisio.UiState

/**
 * Today — the loop.
 *
 * This is the screen the app opens on and the one it can still serve with no
 * network at all: the session it carries is on the device, and everything here
 * is either the stored pack or the last thing the server told us.
 */
@Composable
fun TodayScreen(state: UiState, viewModel: RevisioViewModel) {
    val home = state.home
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(state.me?.avatarEmoji, 44)
            Spacer(Modifier.size(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (state.name.isBlank()) "Welcome back" else "Hi, ${state.name}",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    if (state.online) "Online" else "Offline — your saved session still works",
                    color = if (state.online) Good else Near,
                    fontSize = 13.sp,
                )
            }
            TextButton(onClick = viewModel::signOut) { Text("Sign out", color = Muted, fontSize = 13.sp) }
        }

        Spacer(Modifier.height(20.dp))

        if (home == null) {
            Text("Loading today's session…", color = Muted)
        } else {
            Panel {
                Text("Today", color = Muted, fontSize = 13.sp)
                Spacer(Modifier.height(4.dp))
                Text("${home.due} cards ready", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                    Stat("Level", home.level.toString())
                    Stat("XP", home.totalXp.toString())
                    Stat("Streak", "${home.streak}d")
                }
                if (home.reviewedToday > 0) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "${home.correctToday} of ${home.reviewedToday} correct today",
                        color = Muted,
                        fontSize = 13.sp,
                    )
                }
                if (home.fromCache) {
                    Spacer(Modifier.height(12.dp))
                    Text("Showing the session saved on this device.", color = Near, fontSize = 12.sp)
                }
            }

            Spacer(Modifier.height(14.dp))
            Button(
                onClick = viewModel::startTodayReview,
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
                Panel {
                    Text("${state.pending} review${if (state.pending == 1) "" else "s"} waiting to sync", fontSize = 14.sp)
                    Text(
                        "They'll be graded by the server once you're back online.",
                        color = Muted,
                        fontSize = 12.sp,
                    )
                    if (state.online) {
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = viewModel::refreshHome) { Text("Sync now") }
                    }
                }
            }
        }

        Spacer(Modifier.height(22.dp))
        SectionTitle("Elsewhere")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = { viewModel.selectTab(Tab.LEARN) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(14.dp),
            ) { Text("Read notes") }
            TextButton(
                onClick = { viewModel.selectTab(Tab.CRAM) },
                modifier = Modifier.weight(1f),
            ) { Text("Cram") }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            TextButton(
                onClick = { viewModel.selectTab(Tab.RANK) },
                modifier = Modifier.weight(1f),
            ) { Text("Your rank") }
            TextButton(
                onClick = { viewModel.selectTab(Tab.YOU) },
                modifier = Modifier.weight(1f),
            ) { Text("Profile") }
        }

        Spacer(Modifier.height(24.dp))
        TextButton(onClick = viewModel::refreshHome) { Text("Refresh", color = Muted) }
        Spacer(Modifier.height(24.dp))
    }
}
