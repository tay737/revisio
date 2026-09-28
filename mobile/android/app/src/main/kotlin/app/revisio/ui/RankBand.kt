package app.revisio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.revisio.engine.CompanionRead
import app.revisio.engine.Lobby
import app.revisio.engine.Placement
import app.revisio.engine.Rank
import app.revisio.engine.RankLadder
import app.revisio.engine.WeekBounds

/**
 * The rank band, and the ladder that explains it.
 *
 * Both live here rather than on one screen because the dashboard and the Rank
 * page show the same band: the web reads one `RankStrip` from one hook in both
 * places, so the two can never disagree about where a learner stands. Drawing it
 * twice would be the first place they could.
 */

/**
 * Your rank, in one glance — the web's `RankStrip`.
 *
 * A **near-black band on a light canvas**: the stylesheet's own section divider,
 * used as the panel that carries the thing you are working toward. That says
 * "this is the scoreboard" without adding a second accent colour, and it is the
 * loudest thing in the app that is not a button.
 *
 * Everything in it is a fact about the learner's own numbers — RP, the next rung
 * by name, roughly how much work that is, this week's contribution, and where
 * they sit. Nothing that merely *looks* like progress.
 */
@Composable
fun RankStrip(
    rank: Rank,
    lobby: Lobby,
    week: WeekBounds,
    placement: Placement,
    xpThisWeek: Int,
    onLadder: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val placing = placement.placing
    val zoneLabel = when (lobby.zone) {
        "promotion" -> "Promotion zone"
        "demotion" -> "Demotion zone"
        "pending" -> "Being placed"
        else -> "Safe"
    }
    val zoneIcon = if (lobby.zone == "demotion") RevisioIcons.zoneDown else RevisioIcons.zoneUp
    val zoneTint = when (lobby.zone) {
        "promotion" -> Good
        "demotion" -> Bad
        else -> Muted
    }

    TilePanel(tone = TileTone.Dark, modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The crest arrives on the pop spring — scale 0.88, as the web's does,
            // because a rank that was just recomputed is a thing that happened.
            Box(modifier = Modifier.pop(from = 0.88f, rotate = 0f)) {
                RankCrest(rank, size = 96)
            }
            Spacer(Modifier.width(20.dp))
            Column(modifier = Modifier.weight(1f)) {
                Label("Your rank", token = Type.eyebrow, color = Muted)
                Spacer(Modifier.height(4.dp))
                Text(rank.label, style = Type.display.style(Ink))
                Spacer(Modifier.height(6.dp))
                Text(
                    when {
                        placing -> "Placement — ${placement.done} of ${placement.target} reviews before you hold a rank."
                        rank.isApex -> "Top of the ladder. Holding it is the hard part."
                        else -> "${rank.remaining} RP to the next rung · about ${RankLadder.reviewsForRp(rank.remaining)} reviews."
                    },
                    style = Type.fine.style(Muted),
                )
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.weight(1f)) {
                        Meter(percent = if (placing) placement.percent else rank.percent, tint = Ink)
                    }
                    Spacer(Modifier.width(10.dp))
                    NumberTicker(
                        value = if (placing) placement.done else rank.points,
                        style = Type.fine.style(Muted),
                    )
                    Text(
                        if (placing) "/${placement.target}" else " RP",
                        style = Type.fine.style(Muted),
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Lobby status — the weekly stake, with the clock on it.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radius.md))
                .background(revisioColors.secondary)
                .border(1.dp, Line, RoundedCornerShape(Radius.md))
                .clickable(onClick = onLadder)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (week.daysLeft == 1) "Last day this week" else "${week.daysLeft} days left this week",
                    style = Type.fine.style(Muted),
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(zoneLabel, style = Type.strong.style(Ink))
                    Spacer(Modifier.width(6.dp))
                    Icon(zoneIcon, size = 14, tint = zoneTint)
                }
                Spacer(Modifier.height(4.dp))
                Row {
                    Text("${lobby.position} of ${lobby.size} · ", style = Type.fine.style(Muted))
                    NumberTicker(value = xpThisWeek, style = Type.fine.style(Muted))
                    Text(" XP this week", style = Type.fine.style(Muted))
                }
            }
            Icon(RevisioIcons.next, size = 16, tint = Muted)
        }
    }
}

/**
 * The ladder — every rung in the game, with your position marked.
 *
 * A rank means nothing without the rungs above it, so this always shows the whole
 * climb: five tier bars for how much of each tier is banked, then the fifteen
 * rungs as a rail that centres itself on the current one. Rungs not yet reached
 * are drawn with the identical crest in the muted tone — same shape, no colour —
 * which is the only way to show a fifteen-rank ladder inside a one-colour system.
 *
 * The rail is where the rank animation lives: it *travels* to the learner's rung
 * on arrival and on every change, so a promotion is something the screen does
 * rather than something a number says.
 */
@Composable
fun TierProgress(rank: Rank, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Tier progress", style = Type.tagline.style(Ink), modifier = Modifier.weight(1f))
            NumberTicker(value = rank.points, style = Type.fine.style(Muted))
            Text(" RP", style = Type.fine.style(Muted))
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (tier in RankLadder.TIER_ORDER) {
                val base = RankLadder.rungs.first { it.tier == tier }.base
                val total = RankLadder.DIVISION_SPAN.getValue(tier) * 3
                val earned = (rank.points - base).coerceIn(0, total)
                val percent = if (total == 0) 0 else (earned * 100) / total
                val cleared = rank.points >= base + total
                val current = tier == rank.tier
                Column(modifier = Modifier.weight(1f)) {
                    Meter(percent = percent, tint = if (cleared || current) Ink else LineStrong)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        RankLadder.tierName(tier),
                        style = Type.label.copy(size = 10).style(if (current) Ink else Muted),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
fun LadderRail(rank: Rank, modifier: Modifier = Modifier) {
    val state = rememberLazyListState()
    // Scroll into the learner's own rung rather than opening at the start of the
    // list: the point of the rail is where they are, and a rail that always opens
    // on Bronze III hides the only thing anybody opened it for.
    LaunchedEffect(rank.index) {
        val target = (rank.index - 1).coerceAtLeast(0)
        if (state.firstVisibleItemIndex != target) state.animateScrollToItem(target)
    }

    LazyRow(
        state = state,
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 2.dp),
    ) {
        items(RankLadder.rungs.size) { position ->
            val rung = RankLadder.rungs[position]
            val rungRank = RankLadder.rankFor(rung.base)
            val current = rung.index == rank.index
            val reached = rung.index <= rank.index
            Column(
                modifier = Modifier
                    .width(96.dp)
                    .clip(RoundedCornerShape(Radius.md))
                    .background(if (current) Card2 else Card1)
                    .border(1.dp, if (current) Ink else Line, RoundedCornerShape(Radius.md))
                    .padding(horizontal = 10.dp, vertical = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                RankCrest(rungRank, size = 42, showProgress = false, muted = !reached)
                Spacer(Modifier.height(6.dp))
                Text(
                    RankLadder.DIVISION_LABEL.getValue(rung.division),
                    style = Type.strong.style(if (reached) Ink else Muted),
                )
                Text(
                    RankLadder.tierName(rung.tier),
                    style = Type.label.copy(size = 10).style(Muted),
                    textAlign = TextAlign.Center,
                )
                Text("${rung.base} RP", style = Type.label.copy(size = 10, uppercase = false).style(Muted))
            }
        }
    }
}

/** The companion's body, with the copy decided by the engine's `companionFor`. */
@Composable
fun CompanionReadView(read: CompanionRead, rank: Rank?, onAction: (() -> Unit)?, modifier: Modifier = Modifier) {
    if (rank == null) {
        SoftCard(modifier = modifier) {
            Text(read.line, style = Type.strong.style(Ink))
        }
        return
    }
    Companion(
        rank = rank,
        line = read.line,
        action = if (onAction == null) null else read.actionLabel,
        onAction = onAction,
    )
}
