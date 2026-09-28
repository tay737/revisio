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
import androidx.compose.foundation.layout.width
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
import app.revisio.Destination
import app.revisio.HomeState
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.Copy

/**
 * Today — the dashboard.
 *
 * The screen the app opens on, and the one it can still serve with no network at
 * all: the session it carries is on the device, and everything here is either the
 * stored pack or the last thing the server told us.
 *
 * The layout is the website's dashboard, in the Duolingo order of operations:
 *
 *   1. **The hero** — the greeting, one rotating line of conversation, and the
 *      single green button that starts a session. On a phone it is the only thing
 *      above the fold, which is the point: there is one thing to do.
 *   2. **Four numbers** — due, done, streak, XP, two to a row so each is a
 *      comfortable tap-and-read block rather than a 60px sliver.
 *   3. **Rank** — the same near-black band the Rank page uses, because where you
 *      stand is the second half of the answer to "what now".
 *   4. **Four ways in** — one line each. A hint is four words; the page that
 *      follows can explain itself.
 *
 * The tile rhythm carries the structure (dark hero → light grid → dark rank band
 * → light grid), which is the spec's polarity flip doing the work that borders
 * and shadows are not allowed to do here.
 */
@Composable
fun TodayScreen(state: UiState, viewModel: RevisioViewModel) {
    val home = state.home

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(20.dp))

        if (home == null) {
            SoftCard {
                Text("Loading today's session…", style = Type.caption.style(Muted))
            }
            Spacer(Modifier.height(28.dp))
            return@Column
        }

        // ── 1. The hero: greeting, one line, one green button ───────────────
        TilePanel(tone = TileTone.Dark) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // The greeting takes the room it needs and wraps rather than being
                // clipped: a name is the one string here that must never be cut.
                Column(modifier = Modifier.weight(1f)) {
                    Label(
                        Copy.greetingFor(state.name.ifEmpty { null }, java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)),
                        token = Type.eyebrow,
                        color = Muted,
                    )
                }
                if (!state.online) {
                    // Said on the hero rather than in a banner: the one thing that
                    // changes what the buttons do belongs next to the buttons.
                    Spacer(Modifier.width(10.dp))
                    Badge("Offline", BadgeTone.Streak, RevisioIcons.clock)
                }
            }
            Spacer(Modifier.height(6.dp))
            RotatingHeadline(
                words = Copy.openers(
                    due = home.due,
                    streak = home.streak,
                    level = home.level,
                    subject = state.me?.subjects?.firstOrNull()?.name,
                ),
                modifier = Modifier.height(40.dp).fillMaxWidth(),
            )
            Spacer(Modifier.height(18.dp))

            PillButton(
                text = if (home.due > 0) "Start review" else "Get ahead",
                onClick = {
                    if (home.due > 0) viewModel.startTodayReview() else viewModel.go(Destination.LEARN)
                },
                tone = PillTone.Good,
                icon = if (home.due > 0) RevisioIcons.review else RevisioIcons.learn,
                trailing = if (home.due > 0) "${home.due}" else null,
                large = true,
                enabled = home.packCards > 0,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            PillButton(
                text = "Cram instead",
                onClick = { viewModel.go(Destination.CRAM) },
                tone = PillTone.Secondary,
                icon = RevisioIcons.cram,
                large = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // The companion, under a hairline, inside the hero — the way the
            // dashboard puts it: the numbers got you here, this says what they mean.
            val rank = state.ranked?.ranked?.rank
            if (rank != null) {
                Spacer(Modifier.height(18.dp))
                Hairline()
                Spacer(Modifier.height(14.dp))
                Companion(
                    rank = rank,
                    line = Copy.companionFor(
                        name = state.name,
                        due = home.due,
                        reviewed = home.reviewedToday,
                        correct = home.correctToday,
                        streak = home.streak,
                        bestStreak = state.me?.gamification?.bestStreak ?: home.streak,
                        totalXp = home.totalXp,
                        rankLabel = rank.label,
                        hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY),
                    ).line,
                )
            }
        }

        // ── 2. Four numbers ─────────────────────────────────────────────────
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile(
                icon = RevisioIcons.review,
                label = "Due",
                value = home.due,
                tint = if (home.due > 0) Good else null,
                modifier = Modifier.weight(1f),
            )
            StatTile(
                icon = RevisioIcons.reviewed,
                label = "Done today",
                value = home.reviewedToday,
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile(
                icon = RevisioIcons.streak,
                label = "Streak",
                value = home.streak,
                suffix = if (home.streak == 1) " day" else " days",
                tint = if (home.streak > 0) Warn else null,
                modifier = Modifier.weight(1f),
            )
            StatTile(
                icon = RevisioIcons.xp,
                label = "Total XP",
                value = home.totalXp,
                modifier = Modifier.weight(1f),
            )
        }

        // ── 3. Rank: the second dark band ───────────────────────────────────
        state.ranked?.ranked?.let { data ->
            Spacer(Modifier.height(14.dp))
            Box(modifier = Modifier.entrance(scale = true)) {
                RankStrip(
                    rank = data.rank,
                    lobby = data.lobby,
                    week = data.week,
                    placement = data.placement,
                    xpThisWeek = data.xpThisWeek,
                    onLadder = { viewModel.go(Destination.RANK) },
                )
            }
        }

        // ── 4. Four ways in ─────────────────────────────────────────────────
        Spacer(Modifier.height(20.dp))
        SectionTitle("Ways in")
        Spacer(Modifier.height(10.dp))
        val actions = listOf(
            Action("Cram", "Before an exam", RevisioIcons.cram, Destination.CRAM),
            Action("Notes", "The full topic", RevisioIcons.learn, Destination.LEARN),
            Action("Exam", "A marked paper", RevisioIcons.exam, Destination.EXAM),
            Action("Rank", "Ladder and lobby", RevisioIcons.rank, Destination.RANK),
        )
        for ((row, pair) in actions.chunked(2).withIndex()) {
            if (row > 0) Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for ((column, action) in pair.withIndex()) {
                    ActionTile(action, Modifier.weight(1f).entrance(row * 2 + column, scale = true)) {
                        viewModel.go(action.destination)
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        // ── Subjects, and the two facts worth keeping ──────────────────────
        Spacer(Modifier.height(20.dp))
        SurfaceCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Your subjects", style = Type.strong.style(Ink), modifier = Modifier.weight(1f))
                Text(
                    "Manage",
                    style = Type.caption.style(Ink),
                    modifier = Modifier.clickable { viewModel.go(Destination.LIBRARY) },
                )
            }
            Spacer(Modifier.height(12.dp))
            val subjects = state.me?.subjects.orEmpty()
            if (subjects.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (subject in subjects.take(3)) {
                        Chip(subject.name)
                    }
                }
            } else {
                Text(
                    "Pick a subject and your queue fills itself.",
                    style = Type.caption.style(Muted),
                )
            }
            Spacer(Modifier.height(14.dp))
            Hairline()
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                Column {
                    Text("Best streak", style = Type.fine.style(Muted))
                    Row {
                        NumberTicker(value = state.me?.gamification?.bestStreak ?: home.streak, style = Type.strong.style(Ink))
                        Text(
                            if ((state.me?.gamification?.bestStreak ?: home.streak) == 1) " day" else " days",
                            style = Type.strong.style(Muted),
                        )
                    }
                }
                Column {
                    Text("Accuracy today", style = Type.fine.style(Muted))
                    Text(
                        if (home.reviewedToday > 0) {
                            "${Math.round((home.correctToday.toDouble() / home.reviewedToday) * 100)}%"
                        } else {
                            "—"
                        },
                        style = Type.strong.style(Ink),
                    )
                }
            }
        }

        if (state.pending > 0) {
            Spacer(Modifier.height(14.dp))
            SoftCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.rotate, size = 16, tint = Muted)
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "${state.pending} review${if (state.pending == 1) "" else "s"} waiting to sync",
                        style = Type.strong.style(Ink),
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "They'll be graded by the server once you're back online.",
                    style = Type.fine.style(Muted),
                )
                if (state.online) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Sync now",
                        style = Type.captionS.style(Ink),
                        modifier = Modifier.clickable { viewModel.refreshHome() },
                    )
                }
            }
        }

        if (home.fromCache) {
            Spacer(Modifier.height(14.dp))
            SoftCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(RevisioIcons.clock, size = 14, tint = Warn)
                    Spacer(Modifier.width(8.dp))
                    Text("Showing the session saved on this device.", style = Type.fine.style(Muted))
                }
            }
        }

        Spacer(Modifier.height(28.dp))
    }
}

private data class Action(
    val title: String,
    val hint: String,
    val icon: ImageVector,
    val destination: Destination,
)

/** One of the four ways in: an icon, a title, and a four-word hint. */
@Composable
private fun ActionTile(action: Action, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(Radius.lg))
            .background(Card1)
            .border(1.dp, Line, RoundedCornerShape(Radius.lg))
            .clickable(onClick = onClick)
            .padding(16.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(Radius.pill))
                .background(Card2),
            contentAlignment = Alignment.Center,
        ) {
            Icon(action.icon, size = 18, tint = Ink)
        }
        Spacer(Modifier.height(10.dp))
        Text(action.title, style = Type.strong.style(Ink))
        Text(action.hint, style = Type.label.copy(size = 13, uppercase = false).style(Muted))
    }
}

/**
 * One number, at the size the dashboard gives it.
 *
 * Counted rather than printed: the web runs a `NumberTicker` on every stat, so a
 * dashboard that has just loaded counts up to its numbers instead of appearing
 * with them — which is the difference between "here is your day" and "here is a
 * table".
 */
@Composable
private fun StatTile(
    icon: ImageVector,
    label: String,
    value: Int,
    modifier: Modifier = Modifier,
    suffix: String? = null,
    tint: androidx.compose.ui.graphics.Color? = null,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(Radius.lg))
            .background(Card1)
            .border(1.dp, Line, RoundedCornerShape(Radius.lg))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, size = 15, tint = tint ?: Muted)
            Spacer(Modifier.width(6.dp))
            Text(label, style = Type.fine.style(tint ?: Muted))
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            NumberTicker(value = value, style = Type.numSm.style(Ink))
            if (suffix != null) {
                Text(suffix, style = Type.label.copy(size = 12, uppercase = false).style(Muted))
            }
        }
    }
}
