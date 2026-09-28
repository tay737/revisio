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
import androidx.compose.ui.unit.dp
import app.revisio.HomeState
import app.revisio.RevisioViewModel
import app.revisio.Tab
import app.revisio.UiState
import app.revisio.engine.Rank

/**
 * Today — the loop.
 *
 * This is the screen the app opens on and the one it can still serve with no
 * network at all: the session it carries is on the device, and everything here
 * is either the stored pack or the last thing the server told us.
 *
 * The layout is the website's dashboard: the companion first (a body whose face
 * is your rank), then one card holding the day's number and the streak badges,
 * then the single green CTA that starts the session. Green appears here and
 * nowhere else on this screen, because it is the one control that earns rather
 * than navigates.
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

        // The companion, then the greeting. Two lines, no page title: Today is
        // the home, and nobody needs to be told which screen they are on.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Label(
                    if (state.online) "Today" else "Offline",
                    token = Type.eyebrow,
                    color = if (state.online) Muted else Warn,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    if (state.name.isBlank()) "Welcome back" else "Hi, ${state.name}",
                    style = Type.title.style(Ink),
                )
            }
            Avatar(state.me?.avatarEmoji, 44)
        }

        if (home != null) {
            Spacer(Modifier.height(18.dp))
            // The dashboard's rotating opener, over the state it is describing.
            RotatingHeadline(
                openers(
                    due = home.due,
                    streak = home.streak,
                    level = home.level,
                    subject = state.me?.subjects?.firstOrNull()?.name,
                ),
            )
        }

        Spacer(Modifier.height(18.dp))

        if (home == null) {
            SoftCard { Text("Loading today's session…", style = Type.caption.style(Muted)) }
        } else {
            // The companion's body is the learner's own crest, so it only
            // appears once a rank has been computed — an empty shield would say
            // less than nothing.
            state.ranked?.ranked?.rank?.let { rank ->
                Companion(
                    rank = rank,
                    line = companionLine(home, rank),
                    action = if (state.online) "See the ladder" else null,
                    onAction = { viewModel.selectTab(Tab.RANK) },
                )
                Spacer(Modifier.height(20.dp))
            }

            SurfaceCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Label("Due now", token = Type.eyebrow, color = Muted)
                        Spacer(Modifier.height(4.dp))
                        Text("${home.due}", style = Type.num.style(Ink))
                        Spacer(Modifier.height(2.dp))
                        Text(
                            if (home.due == 1) "card ready" else "cards ready",
                            style = Type.caption.style(Muted),
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        if (home.streak > 0) {
                            // The streak is the one thing the fox colour means.
                            Badge("${home.streak} day${if (home.streak == 1) "" else "s"}", BadgeTone.Streak, RevisioIcons.streak)
                            Spacer(Modifier.height(6.dp))
                        }
                        Badge("Level ${home.level}", BadgeTone.Quiet, RevisioIcons.level)
                    }
                }

                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    Stat("XP", "${home.totalXp}")
                    Stat(
                        "Today",
                        if (home.reviewedToday > 0) "${home.correctToday}/${home.reviewedToday}" else "—",
                    )
                    Stat("Streak", "${home.streak}d")
                }

                if (home.fromCache) {
                    Spacer(Modifier.height(16.dp))
                    Hairline()
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(RevisioIcons.clock, size = 14, tint = Warn)
                        Spacer(Modifier.size(8.dp))
                        Text(
                            "Showing the session saved on this device.",
                            style = Type.fine.style(Muted),
                        )
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            // The sessions action. Green carries it because it is the one control
            // on this page that earns rather than navigates — the same call the
            // dashboard makes, with the same glyph and the same due count in it.
            PillButton(
                text = if (home.packCards > 0) "Start review" else "Connect once to download cards",
                onClick = viewModel::startTodayReview,
                enabled = home.packCards > 0,
                tone = if (home.packCards > 0) PillTone.Good else PillTone.Secondary,
                icon = if (home.packCards > 0) RevisioIcons.review else RevisioIcons.download,
                trailing = if (home.packCards > 0) "${home.due}" else null,
                large = true,
            )
            Spacer(Modifier.height(10.dp))
            PillButton(
                text = "Cram instead",
                onClick = { viewModel.selectTab(Tab.CRAM) },
                tone = PillTone.Secondary,
                icon = RevisioIcons.cram,
                large = true,
            )

            if (state.pending > 0) {
                Spacer(Modifier.height(16.dp))
                SoftCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(RevisioIcons.rotate, size = 16, tint = Muted)
                        Spacer(Modifier.size(10.dp))
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
                            modifier = Modifier.clickable(onClick = viewModel::refreshHome),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(28.dp))
        SectionTitle("Elsewhere")
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ShortcutRow("Read notes", RevisioIcons.learn, "The prose behind the cards", Tab.LEARN, viewModel)
            ShortcutRow("Cram", RevisioIcons.cram, "Sprint before an exam", Tab.CRAM, viewModel)
            ShortcutRow("Your rank", RevisioIcons.rank, "Ladder and weekly lobby", Tab.RANK, viewModel)
            ShortcutRow("Profile", RevisioIcons.person, "You and your settings", Tab.YOU, viewModel)
        }

        Spacer(Modifier.height(24.dp))
        PillButton(
            text = "Refresh",
            onClick = viewModel::refreshHome,
            tone = PillTone.Ghost,
            icon = RevisioIcons.rotate,
        )
        Spacer(Modifier.height(28.dp))
    }
}

/** A quiet destination row: an icon, a label and its four-word hint. */
@Composable
private fun ShortcutRow(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    hint: String,
    tab: Tab,
    viewModel: RevisioViewModel,
) {
    SurfaceCard(modifier = Modifier.clickable { viewModel.selectTab(tab) }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(Card2),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, size = 18, tint = Ink)
            }
            Spacer(Modifier.size(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(label, style = Type.strong.style(Ink))
                Text(hint, style = Type.fine.style(Muted))
            }
            Icon(RevisioIcons.expand, size = 16, tint = Muted)
        }
    }
}

/**
 * The lines the opener rotates through — `openers` from `src/lib/profile.ts`,
 * mirrored so the phone rotates the same sentences the dashboard does.
 */
private fun openers(due: Int, streak: Int, level: Int, subject: String?): List<String> {
    val lines = mutableListOf<String>()
    if (due > 0) {
        lines += "$due ${if (due == 1) "card is" else "cards are"} waiting"
        lines += "Let's clear today's queue"
    } else {
        lines += "Nothing is due — you're ahead"
        lines += "Want to get ahead instead?"
    }
    if (streak >= 2) lines += "Day $streak of your streak"
    if (level > 1) lines += "Level $level — keep it moving"
    if (subject != null) lines += "Back to $subject?"
    return lines.distinct().ifEmpty { listOf("Let's get started") }
}

/**
 * The companion's line.
 *
 * The website decides this server-side (`companionFor`, so the shell, the
 * account sheet and the dashboard cannot read the same numbers three ways).
 * Where the server has not sent one, this says something true from the numbers
 * it did send rather than inventing a personality.
 */
private fun companionLine(home: HomeState, rank: Rank): String {
    val remaining = rank.remaining
    return when {
        home.due == 0 && home.reviewedToday > 0 -> "All clear for today. Nice."
        home.due == 0 -> "Nothing due. Come back when the cards are."
        remaining > 0 && home.reviewedToday > 0 ->
            "${home.reviewedToday} done today — $remaining XP to the next division."
        home.streak > 6 -> "${home.streak} days running. Don't break it now."
        else -> "${home.due} due. Starting is the hard part."
    }
}
