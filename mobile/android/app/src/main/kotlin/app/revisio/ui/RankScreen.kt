package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.revisio.UiState
import app.revisio.RevisioViewModel
import app.revisio.engine.Achievement
import app.revisio.engine.Copy
import app.revisio.engine.Lobby
import app.revisio.engine.Rank
import app.revisio.engine.RankLadder
import app.revisio.engine.WeekBounds

/**
 * Rank — the competitive hub.
 *
 * Organised the way a competitive game puts its progress screen together, which
 * is how the website's `/progress` does it:
 *
 *   • **The scoreboard first.** The same near-black band the dashboard shows,
 *     from the same payload, so the two cannot disagree.
 *   • **Three views, one at a time.** The ladder, the weekly lobby and the raw XP
 *     ledger are tabs rather than a three-column wall.
 *   • **Short copy.** Every paragraph that explained a leaderboard to an adult who
 *     had already seen one is gone; what is left states policy.
 *   • **Honest empty states.** A lobby with unclaimed seats says so; a learner
 *     still in placement is told that rather than shown a fake Bronze III.
 */
@Composable
fun RankScreen(state: UiState, viewModel: RevisioViewModel) {
    var view by remember { mutableIntStateOf(0) }
    val ranked = state.ranked

    if (ranked == null) {
        LazyColumn(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { Spacer(Modifier.height(20.dp)) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ScreenTitle("Rank", eyebrow = "Progress")
                    Spacer(Modifier.weight(1f))
                    IconPill(RevisioIcons.rotate, onClick = { viewModel.loadProgress() }, size = 38.dp)
                }
            }
            item {
                SoftCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(RevisioIcons.rank, size = 16, tint = Muted)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            if (state.online) "Loading your rank…"
                            else "Your rank needs a connection — it is computed from your whole history.",
                            style = Type.caption.style(Muted),
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
        return
    }

    val data = ranked.ranked
    val form = Copy.formFor(state.me?.today?.reviewed ?: 0, state.me?.today?.correct ?: 0)

    LazyColumn(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { Spacer(Modifier.height(20.dp)) }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                ScreenTitle("Rank", eyebrow = "Progress")
                Spacer(Modifier.weight(1f))
                IconPill(RevisioIcons.rotate, onClick = { viewModel.loadProgress() }, size = 38.dp)
            }
        }

        // ── 1. The scoreboard ───────────────────────────────────────────────
        item {
            RankStrip(
                rank = data.rank,
                lobby = data.lobby,
                week = data.week,
                placement = data.placement,
                xpThisWeek = data.xpThisWeek,
                onLadder = { view = 0 },
            )
        }

        // ── 2. Three views, one at a time ───────────────────────────────────
        item {
            Segmented(
                options = listOf("ladder" to "Ladder", "week" to "This week", "board" to "XP"),
                selected = when (view) {
                    1 -> "week"
                    2 -> "board"
                    else -> "ladder"
                },
                onSelect = { next ->
                    view = when (next) {
                        "week" -> 1
                        "board" -> 2
                        else -> 0
                    }
                },
            )
        }

        when (view) {
            0 -> {
                item { SurfaceCard { TierProgress(data.rank) } }
                item {
                    SurfaceCard {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text("The ladder", style = Type.tagline.style(Ink), modifier = Modifier.weight(1f))
                            Text(
                                if (data.placement.placing) "Placement ${data.placement.done}/${data.placement.target}"
                                else "${RankLadder.rungs.size} ranks",
                                style = Type.fine.style(Muted),
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        LadderRail(data.rank)
                        if (!data.rank.isApex) {
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "Next rung in ${data.rank.remaining} RP · about ${RankLadder.reviewsForRp(data.rank.remaining)} reviews.",
                                style = Type.fine.style(Muted),
                            )
                        }
                    }
                }
                item {
                    // The form readout: which gear the learner is in today, said in
                    // the same words the website uses.
                    SurfaceCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(RevisioIcons.form, size = 14, tint = Muted)
                            Spacer(Modifier.width(6.dp))
                            Text("Form", style = Type.fine.style(Muted))
                            Spacer(Modifier.width(6.dp))
                            Text(form.label, style = Type.strong.style(Ink))
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(form.detail, style = Type.fine.style(Muted))
                    }
                }
                item {
                    Text(
                        "Rank comes from lifetime XP and never resets. The weekly lobby only decides where you sit inside your tier — a bad week costs you position, not progress.",
                        style = Type.label.copy(size = 12, uppercase = false).style(Muted),
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
            }

            1 -> {
                item {
                    SurfaceCard {
                        Row(verticalAlignment = Alignment.Top) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("${data.rank.label} lobby", style = Type.tagline.style(Ink))
                                Text(data.week.rangeLabel, style = Type.label.copy(size = 13, uppercase = false).style(Muted))
                            }
                            Badge(
                                if (data.week.daysLeft == 1) "Last day" else "${data.week.daysLeft} days left",
                                BadgeTone.Quiet,
                            )
                        }
                        Spacer(Modifier.height(12.dp))
                        Text(
                            Copy.lobbyLine(
                                zone = data.lobby.zone,
                                position = data.lobby.position,
                                size = data.lobby.size,
                                daysLeft = data.week.daysLeft,
                                rankLabel = data.rank.label,
                            ),
                            style = Type.caption.style(Muted),
                        )

                        // The clock the whole lobby runs on.
                        Spacer(Modifier.height(14.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.weight(1f)) {
                                Meter(percent = data.week.percentElapsed, height = 6.dp)
                            }
                            Spacer(Modifier.width(10.dp))
                            Text("${100 - data.week.percentElapsed}% left", style = Type.fine.style(Muted))
                        }

                        Spacer(Modifier.height(14.dp))
                        if (state.me?.leaderboardOptOut == true) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(Radius.md))
                                    .background(Card2)
                                    .padding(14.dp),
                            ) {
                                Icon(RevisioIcons.private, size = 17, tint = Ink)
                                Spacer(Modifier.width(12.dp))
                                Column {
                                    Text(
                                        "Your name is hidden. Your RP still moves.",
                                        style = Type.caption.style(Ink),
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        "Rejoin",
                                        style = Type.caption.style(Ink),
                                        modifier = Modifier.clickable { viewModel.setLeaderboardOptOut(false) },
                                    )
                                }
                            }
                        } else {
                            LobbyTable(data.lobby) { seatId -> viewModel.openProfile(seatId) }
                        }
                    }
                }
            }

            else -> {
                item {
                    SurfaceCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("XP board", style = Type.tagline.style(Ink), modifier = Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            for (scope in listOf("daily", "weekly", "monthly")) {
                                ChipPill(
                                    text = scope.replaceFirstChar { it.uppercaseChar() },
                                    active = state.boardScope == scope,
                                    onClick = { viewModel.loadProgress(scope) },
                                )
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        if (ranked.board.isEmpty()) {
                            Text(
                                "Nobody has logged XP this ${state.boardScope}. One review puts you on the board.",
                                style = Type.caption.style(Muted),
                            )
                        } else {
                            for ((index, row) in ranked.board.withIndex()) {
                                BoardLine(
                                    position = row.rank,
                                    name = if (row.isMe) "You" else row.name,
                                    xp = row.xp,
                                    me = row.isMe,
                                    modifier = Modifier.entrance(index),
                                )
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(
                            if (state.me?.leaderboardOptOut == true) "Join the boards" else "Hide me from the boards",
                            style = Type.caption.style(Ink),
                            modifier = Modifier.clickable {
                                viewModel.setLeaderboardOptOut(state.me?.leaderboardOptOut != true)
                            },
                        )
                    }
                }
            }
        }

        // ── 3. Achievements ─────────────────────────────────────────────────
        item {
            SurfaceCard {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("Achievements", style = Type.tagline.style(Ink), modifier = Modifier.weight(1f))
                    Text(
                        "${ranked.achievements.count { it.unlocked }}/${ranked.achievements.size}",
                        style = Type.fine.style(Muted),
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text("Permanent — a rank can slip, these cannot.", style = Type.label.copy(size = 13, uppercase = false).style(Muted))
                Spacer(Modifier.height(14.dp))
                for ((index, achievement) in ranked.achievements.withIndex()) {
                    if (index > 0) Spacer(Modifier.height(8.dp))
                    AchievementCard(achievement, modifier = Modifier.entrance(index, scale = true))
                }
            }
        }

        item { Spacer(Modifier.height(28.dp)) }
    }
}

/**
 * A rung's line on a board. The learner's own row is ink; everyone else is muted.
 *
 * The board arrives as a wave rather than as a wall: the web steps the rows by a
 * capped delay and settles each one, so a lobby of twenty reads as a list filling
 * up rather than as a table appearing.
 */
@Composable
private fun BoardLine(
    position: Int,
    name: String,
    xp: Int,
    me: Boolean,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (me) Modifier.clip(RoundedCornerShape(Radius.sm)).background(Card2).padding(horizontal = 8.dp) else Modifier)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "$position",
            style = if (me) Type.strong.style(Ink) else Type.fine.style(Muted),
            textAlign = TextAlign.Center,
            modifier = Modifier.width(24.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            name,
            style = if (me) Type.strong.style(Ink) else Type.caption.style(Ink),
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        NumberTicker(value = xp, style = Type.fine.style(Muted))
        Text(" XP", style = Type.fine.style(Muted))
    }
}

/**
 * An achievement.
 *
 * The database stores an emoji per achievement, and an emoji would reintroduce
 * off-palette colour — so the row resolves to a registry glyph by id first, then
 * by the legacy emoji, exactly as the web's `achievementIcon` does.
 */
@Composable
private fun AchievementCard(achievement: Achievement, modifier: Modifier = Modifier) {
    val unlocked = achievement.unlocked
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.md))
            .background(if (unlocked) Gold.copy(alpha = 0.10f) else Card1)
            .border(
                1.dp,
                if (unlocked) Gold.copy(alpha = 0.6f) else Line,
                RoundedCornerShape(Radius.md),
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(Radius.pill))
                .background(if (unlocked) Gold.copy(alpha = 0.25f) else Card2),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                achievementIcon(achievement.id, achievement.icon),
                size = 17,
                tint = if (unlocked) Ink else Muted,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                achievement.name,
                style = Type.captionS.style(if (unlocked) Ink else Muted),
            )
            achievement.description?.takeIf { it.isNotEmpty() }?.let {
                Text(it, style = Type.label.copy(size = 12, uppercase = false).style(Muted))
            }
        }
        if (unlocked) {
            Spacer(Modifier.width(8.dp))
            Icon(RevisioIcons.checked, size = 16, tint = Ink)
        }
    }
}

/** The lobby's seat table, in the compact form a phone can show. */
@Composable
private fun LobbyTable(lobby: Lobby, onOpenProfile: (String) -> Unit) {
    Column {
        ConfidenceBand(lobby.band, lobby.size)
        Spacer(Modifier.height(8.dp))
        Text(
            "${lobby.filled} of ${lobby.size} seats taken",
            style = Type.fine.style(Muted),
        )
        Spacer(Modifier.height(6.dp))
        for (seat in lobby.rows.take(12)) {
            // The web links every seat but your own to its profile; a phone keeps
            // exactly that rule, with your own row staying inert because tapping
            // "You" can only ever mean editing yourself, which Settings owns.
            val clickable = !seat.isMe && !seat.userId.isNullOrBlank()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(
                        if (clickable) {
                            Modifier.clickable { onOpenProfile(seat.userId!!) }
                        } else {
                            Modifier
                        },
                    )
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${seat.position}",
                    style = Type.fine.style(if (seat.isMe) Ink else Muted),
                    modifier = Modifier.width(26.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (seat.isMe) "You" else seat.name,
                        style = if (seat.isMe) Type.strong.style(Ink) else Type.caption.style(Ink),
                    )
                    seat.rank?.let { Text(it.label, style = Type.label.copy(size = 11, uppercase = false).style(Muted)) }
                }
                Text("${seat.xp}", style = Type.fine.style(if (seat.isMe) Ink else Muted))
                if (clickable) {
                    Spacer(Modifier.width(4.dp))
                    Icon(RevisioIcons.expand, size = 13, tint = Muted)
                }
            }
        }
    }
}

/**
 * The promotion and demotion bands, drawn so "am I safe?" is one glance.
 *
 * Widths are computed rather than weighted: the bands are a proportion of the
 * lobby, and a layout heuristic would make them an opinion.
 */
@Composable
private fun ConfidenceBand(band: Int, size: Int) {
    if (size <= 0) return
    Row(modifier = Modifier.fillMaxWidth().height(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        val unit = 1f / size
        Box(
            Modifier.weight(maxOf(band, 1) * unit).height(6.dp).clip(RoundedCornerShape(Radius.pill)).background(Good),
        )
        Box(
            Modifier.weight(maxOf(size - band * 2, 1) * unit).height(6.dp).clip(RoundedCornerShape(Radius.pill)).background(Card2),
        )
        Box(
            Modifier.weight(maxOf(band, 1) * unit).height(6.dp).clip(RoundedCornerShape(Radius.pill)).background(Bad),
        )
    }
}

/** The week's own band, for a caller that wants it without the whole strip. */
@Composable
fun WeekClock(week: WeekBounds, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.weight(1f)) { Meter(percent = week.percentElapsed, height = 6.dp) }
        Spacer(Modifier.width(10.dp))
        Text("${100 - week.percentElapsed}% left", style = Type.fine.style(Muted))
    }
}
