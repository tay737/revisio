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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.Achievement
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
 *
 * The crest is the loudest thing here and it carries the tier by **geometry**,
 * not by hue: chevrons in the shield, pips beneath, ticks around the ring. That
 * is what lets a ladder of them read side by side under a one-accent rule, and
 * it is the same drawing the browser makes.
 */
@Composable
fun RankScreen(state: UiState, viewModel: RevisioViewModel) {
    val payload = state.ranked

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(20.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            ScreenTitle("Rank", eyebrow = "Progress")
            Spacer(Modifier.weight(1f))
            IconPill(RevisioIcons.rotate, onClick = { viewModel.loadProgress() }, size = 38.dp)
        }
        Spacer(Modifier.height(20.dp))

        if (payload == null) {
            SoftCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.rank, size = 16, tint = Muted)
                    Spacer(Modifier.size(10.dp))
                    Text(
                        if (!state.online) "Your rank needs a connection — it is computed from your whole history."
                        else "Loading your rank…",
                        style = Type.caption.style(Muted),
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
            return@Column
        }

        RankCard(payload.ranked.rank)

        Spacer(Modifier.height(14.dp))
        SurfaceCard {
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Stat("This week", "${payload.me.xpThisWeek}")
                Stat("Lifetime", "${payload.me.totalXp}")
                Stat("Level", "${payload.me.level}")
            }
        }

        if (payload.ranked.placement.placing) {
            Spacer(Modifier.height(14.dp))
            SurfaceCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.target, size = 18, tint = Ink)
                    Spacer(Modifier.size(10.dp))
                    Text("Placements", style = Type.strong.style(Ink), modifier = Modifier.weight(1f))
                    Badge(
                        "${payload.ranked.placement.done}/${payload.ranked.placement.target}",
                        BadgeTone.Quiet,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "${payload.ranked.placement.done} of ${payload.ranked.placement.target} reviews done. " +
                        "A rank is earned, not handed out on arrival.",
                    style = Type.fine.style(Muted),
                )
                Spacer(Modifier.height(12.dp))
                Meter(payload.ranked.placement.percent, tint = Ink)
            }
        }

        Spacer(Modifier.height(24.dp))
        SectionTitle("Weekly lobby")
        LobbyCard(payload.ranked)

        Spacer(Modifier.height(24.dp))
        SectionTitle("Leaderboard")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("daily" to "Today", "weekly" to "Week", "monthly" to "Month").forEach { (scope, label) ->
                val active = state.boardScope == scope
                Box(modifier = Modifier.clickable { if (!active) viewModel.loadProgress(scope) }) {
                    ChipPill(label, active = active)
                }
            }
        }
        Spacer(Modifier.height(12.dp))

        if (payload.board.isEmpty()) {
            EmptyNote("Nobody on this board yet. Review a card and you will be.")
        } else {
            SurfaceCard {
                payload.board.take(20).forEachIndexed { index, row ->
                    if (index > 0) Spacer(Modifier.height(2.dp))
                    BoardRow(
                        position = row.rank,
                        name = if (row.isMe) "You" else row.name,
                        xp = row.xp,
                        me = row.isMe,
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        val unlocked = payload.achievements.filter { it.unlocked }
        SectionTitle("Achievements · ${unlocked.size} of ${payload.achievements.size}")
        if (unlocked.isEmpty()) {
            EmptyNote("Nothing unlocked yet. The first one is a review.")
        } else {
            unlocked.forEach { achievement ->
                AchievementRow(achievement)
                Spacer(Modifier.height(10.dp))
            }
        }

        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun RankCard(rank: Rank) {
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The crest's shape carries the tier; colour only says "this is
            // yours" (ink) or "a rung you have not reached" (muted).
            RankCrest(rank, size = 88)
            Spacer(Modifier.size(18.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(rank.label, style = Type.displaySm.style(Ink))
                Spacer(Modifier.height(2.dp))
                Text("${rank.points} RP · ${rank.short}", style = Type.fine.style(Muted))
                Spacer(Modifier.height(10.dp))
                Badge(
                    if (rank.isApex) "Apex" else "${rank.remaining} RP to go",
                    if (rank.isApex) BadgeTone.Gold else BadgeTone.Quiet,
                    if (rank.isApex) RevisioIcons.crown else RevisioIcons.climb,
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Meter(rank.percent, tint = Ink)
        Spacer(Modifier.height(10.dp))
        Text(
            if (rank.isApex) "Top of the ladder."
            else "${rank.intoDivision} / ${rank.forDivision} in this division — ${rank.remaining} RP to the next.",
            style = Type.fine.style(Muted),
        )
    }
}

@Composable
private fun LobbyCard(ranked: Ranked) {
    val lobby = ranked.lobby
    val zoneTone = when (lobby.zone) {
        "promotion" -> BadgeTone.Good
        "demotion" -> BadgeTone.Streak
        "pending" -> BadgeTone.Gold
        else -> BadgeTone.Quiet
    }
    val zoneIcon: ImageVector = when (lobby.zone) {
        "promotion" -> RevisioIcons.zoneUp
        "demotion" -> RevisioIcons.zoneDown
        "pending" -> RevisioIcons.clock
        else -> RevisioIcons.secure
    }

    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (lobby.position > 0) "#${lobby.position} of ${lobby.size}" else "Unseated",
                    style = Type.displaySm.style(Ink),
                )
                Text(
                    ranked.week.rangeLabel.ifBlank { "This week" },
                    style = Type.fine.style(Muted),
                )
            }
            Badge(lobby.zoneLabel, zoneTone, zoneIcon)
        }
        Spacer(Modifier.height(12.dp))
        Text(
            "${lobby.filled} of ${lobby.size} seats taken · ${ranked.week.daysLeft} days left",
            style = Type.fine.style(Muted),
        )
        Spacer(Modifier.height(12.dp))
        ConfidenceBand(lobby.band, lobby.size)

        Spacer(Modifier.height(16.dp))
        lobby.rows.take(12).forEach { seat ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${seat.position}",
                    style = Type.fine.style(if (seat.isMe) Ink else Muted),
                    modifier = Modifier.size(26.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (seat.isMe) "You" else seat.name,
                        style = if (seat.isMe) Type.strong.style(Ink) else Type.caption.style(Ink),
                    )
                    seat.rank?.let { Text(it.label, style = Type.micro.style(Muted)) }
                }
                Text(
                    "${seat.xp}",
                    style = Type.fine.style(if (seat.isMe) Ink else Muted),
                )
            }
        }
    }
}

/** The promotion and demotion bands, drawn so "am I safe?" is one glance. */
@Composable
private fun ConfidenceBand(band: Int, size: Int) {
    if (size <= 0) return
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(
            Modifier.weight(band.coerceAtLeast(1).toFloat()).height(6.dp)
                .background(Good, RoundedCornerShape(Radius.pill)),
        )
        Box(
            Modifier.weight((size - band * 2).coerceAtLeast(1).toFloat()).height(6.dp)
                .background(Card2, RoundedCornerShape(Radius.pill)),
        )
        Box(
            Modifier.weight(band.coerceAtLeast(1).toFloat()).height(6.dp)
                .background(Bad, RoundedCornerShape(Radius.pill)),
        )
    }
}

/** One line of a board. The learner's own row is ink; everyone else is muted. */
@Composable
private fun BoardRow(position: Int, name: String, xp: Int, me: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "$position",
            style = Type.fine.style(if (me) Ink else Muted),
            modifier = Modifier.size(28.dp),
        )
        Text(
            name,
            style = if (me) Type.strong.style(Ink) else Type.caption.style(Ink),
            modifier = Modifier.weight(1f),
        )
        Text("$xp XP", style = Type.fine.style(if (me) Ink else Muted))
    }
}

/**
 * An achievement.
 *
 * The database stores an emoji per achievement, and emoji would reintroduce
 * off-palette colour — so the row resolves to a registry glyph by id first, then
 * by the legacy emoji, exactly as `achievementIcon` does on the web.
 */
@Composable
private fun AchievementRow(achievement: Achievement) {
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(Gold.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    achievementIcon(achievement.id, achievement.icon),
                    size = 18,
                    tint = Gold,
                )
            }
            Spacer(Modifier.size(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(achievement.name, style = Type.strong.style(Ink))
                achievement.description?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = Type.fine.style(Muted))
                }
            }
        }
    }
}
