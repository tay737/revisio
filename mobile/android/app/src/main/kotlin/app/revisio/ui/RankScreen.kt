package app.revisio.ui

import androidx.compose.foundation.background
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.Rank
import app.revisio.engine.Ranked

/**
 * Rank — the ladder.
 *
 * Two answers to "how am I doing", from `domain/ranked.ts` and never re-derived
 * here: a **rank** built from lifetime XP that never resets, and a **weekly
 * lobby** you are seated in against thirty others. The server decides what
 * "promotion" means and this screen draws what it was handed — one owner for the
 * rule, so the phone and the web cannot disagree about who is going up.
 */
@Composable
fun RankScreen(state: UiState, viewModel: RevisioViewModel) {
    val payload = state.ranked

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Rank", fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton(onClick = { viewModel.loadProgress() }) { Text("Refresh", color = Muted, fontSize = 13.sp) }
        }
        Spacer(Modifier.height(14.dp))

        if (payload == null) {
            EmptyNote(
                if (!state.online) "Your rank needs a connection — it is computed from your whole history."
                else "Loading your rank…",
            )
            Spacer(Modifier.height(24.dp))
            return@Column
        }

        RankCard(payload.ranked.rank)

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
            Stat("This week", "${payload.me.xpThisWeek} XP")
            Stat("Lifetime", "${payload.me.totalXp} XP")
            Stat("Level", payload.me.level.toString())
        }

        if (payload.ranked.placement.placing) {
            Spacer(Modifier.height(14.dp))
            Panel {
                Text("Placements", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Spacer(Modifier.height(6.dp))
                Text(
                    "${payload.ranked.placement.done} of ${payload.ranked.placement.target} reviews done. " +
                        "A rank is earned, not handed out on arrival.",
                    color = Muted,
                    fontSize = 13.sp,
                )
                Spacer(Modifier.height(10.dp))
                Bar(payload.ranked.placement.percent)
            }
        }

        Spacer(Modifier.height(18.dp))
        SectionTitle("Weekly lobby")
        LobbyCard(payload.ranked)

        Spacer(Modifier.height(18.dp))
        SectionTitle("Leaderboard")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("daily" to "Today", "weekly" to "Week", "monthly" to "Month").forEach { (scope, label) ->
                val active = state.boardScope == scope
                if (active) {
                    Chip(label, Accent)
                } else {
                    TextButton(onClick = { viewModel.loadProgress(scope) }) { Text(label, fontSize = 12.sp, color = Muted) }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        if (payload.board.isEmpty()) {
            EmptyNote("Nobody on this board yet. Review a card and you will be.")
        } else {
            Panel {
                payload.board.take(20).forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("${row.rank}", color = if (row.isMe) Accent else Muted, fontSize = 13.sp, modifier = Modifier.size(28.dp))
                        Text(
                            if (row.isMe) "You" else row.name,
                            fontSize = 14.sp,
                            fontWeight = if (row.isMe) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.weight(1f),
                        )
                        Text("${row.xp} XP", fontSize = 13.sp, color = if (row.isMe) Accent else Ink)
                    }
                }
            }
        }

        Spacer(Modifier.height(18.dp))
        val unlocked = payload.achievements.filter { it.unlocked }
        SectionTitle("Achievements · ${unlocked.size} of ${payload.achievements.size}")
        if (unlocked.isEmpty()) {
            EmptyNote("Nothing unlocked yet.")
        } else {
            unlocked.forEach { achievement ->
                Panel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(achievement.icon ?: "★", fontSize = 20.sp)
                        Spacer(Modifier.size(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(achievement.name, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            achievement.description?.takeIf { it.isNotBlank() }?.let {
                                Text(it, color = Muted, fontSize = 12.sp)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun RankCard(rank: Rank) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The crest's shape carries the tier, not a colour — there is exactly
            // one accent in this system, so rank is drawn as a count of chevrons.
            Crest(56)
            Spacer(Modifier.size(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(rank.label, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text("${rank.points} RP · ${rank.short}", color = Muted, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(14.dp))
        Bar(rank.percent)
        Spacer(Modifier.height(8.dp))
        Text(
            if (rank.isApex) "Top of the ladder."
            else "${rank.intoDivision} / ${rank.forDivision} in this division — ${rank.remaining} RP to the next.",
            color = Muted,
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun LobbyCard(ranked: Ranked) {
    val lobby = ranked.lobby
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (lobby.position > 0) "#${lobby.position} of ${lobby.size}" else "Unseated",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(ranked.week.rangeLabel.ifBlank { "This week" }, color = Muted, fontSize = 12.sp)
            }
            Chip(
                lobby.zoneLabel,
                when (lobby.zone) {
                    "promotion" -> Good
                    "demotion" -> Bad
                    "pending" -> Near
                    else -> Muted
                },
            )
        }
        Spacer(Modifier.height(10.dp))
        Text("${lobby.filled} of ${lobby.size} seats taken · ${ranked.week.daysLeft} days left", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(10.dp))
        ConfidenceBand(lobby.band, lobby.size)

        Spacer(Modifier.height(12.dp))
        lobby.rows.take(12).forEach { seat ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${seat.position}", color = Muted, fontSize = 12.sp, modifier = Modifier.size(26.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (seat.isMe) "You" else seat.name,
                        fontSize = 14.sp,
                        fontWeight = if (seat.isMe) FontWeight.Bold else FontWeight.Normal,
                    )
                    seat.rank?.let { Text(it.label, color = Muted, fontSize = 11.sp) }
                }
                Text("${seat.xp} XP", fontSize = 13.sp, color = if (seat.isMe) Accent else Ink)
            }
        }
    }
}

/** The promotion and demotion bands, drawn so "am I safe?" is one glance. */
@Composable
private fun ConfidenceBand(band: Int, size: Int) {
    if (size <= 0) return
    Column {
        Row(modifier = Modifier.fillMaxWidth()) {
            Box(Modifier.weight(band.coerceAtLeast(1).toFloat()).height(5.dp).background(Good, RoundedCornerShape(3.dp)))
            Spacer(Modifier.size(3.dp))
            Box(Modifier.weight((size - band * 2).coerceAtLeast(1).toFloat()).height(5.dp).background(Surface2, RoundedCornerShape(3.dp)))
            Spacer(Modifier.size(3.dp))
            Box(Modifier.weight(band.coerceAtLeast(1).toFloat()).height(5.dp).background(Bad, RoundedCornerShape(3.dp)))
        }
    }
}
