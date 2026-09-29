package app.revisio.ui

import androidx.compose.foundation.background
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.revisio.Destination
import app.revisio.RevisioViewModel
import app.revisio.UiState
import app.revisio.engine.PublicProfile
import app.revisio.engine.Rank

/**
 * A staff-granted badge chip. Colour tokens match `profile-badge.tsx`: gold on
 * its amber, primary on info, good on green, rose on destructive — all at the
 * soft opacities the web wears, with ink to match.
 */
@Composable
private fun BadgeChip(badge: app.revisio.engine.ProfileBadgeChip) {
    val background = when (badge.color) {
        "primary" -> Info.copy(alpha = 0.15f)
        "good" -> GoodSoft
        "rose" -> Bad.copy(alpha = 0.15f)
        else -> Gold.copy(alpha = 0.30f)
    }
    val ink = when (badge.color) {
        "primary" -> Info
        "good" -> revisioColors.goodPressed
        "rose" -> Bad
        else -> Ink
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(100))
            .background(background)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        badge.icon.takeIf { it.isNotBlank() }?.let { glyph ->
            Text(glyph, style = Type.fine.style(ink))
        }
        Text(badge.label, style = Type.fine.style(ink))
    }
}

/**
 * A public profile — `/u/:handle`, ported.
 *
 * Privacy is not decided here and must never be. `GET /api/v1/profile/:handle` is
 * deliberately unauthenticated — a link shared into a chat window has to open for
 * someone who is not signed in — and the visibility rules are applied server-side,
 * so a hidden field arrives **absent** rather than hidden by this screen. Every
 * value below is therefore optional, and the blanks are the feature: a hidden
 * field is blank, never a lock icon asking questions the visitor did not ask.
 *
 * The owner gets one quiet affordance, exactly as the web does: their own profile
 * links to Settings, because the moment you see your profile is the moment you
 * want to edit it.
 */
@Composable
fun ProfileScreen(state: UiState, viewModel: RevisioViewModel) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Spacer(Modifier.height(12.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            IconPill(RevisioIcons.close, viewModel::closeProfile)
            Spacer(Modifier.size(12.dp))
            ScreenTitle("Profile", eyebrow = "@${state.profileHandle.orEmpty()}")
        }
        Spacer(Modifier.height(18.dp))

        val profile = state.profile
        if (profile == null) {
            SoftCard {
                Text(
                    state.profileError ?: "Opening this profile…",
                    style = Type.caption.style(if (state.profileError != null) Ink else Muted),
                )
            }
            return@Column
        }

        val display = profile.nickname?.takeIf { it.isNotBlank() }
            ?: profile.name?.takeIf { it.isNotBlank() }
            ?: "This learner"
        val mine = profile.id.isNotEmpty() && state.me?.id == profile.id

        // ── identity ───────────────────────────────────────────────────────
        // The web's profile page leads with the banner and pulls the avatar up
        // over its lower edge; the same two stacked pieces here, with the avatar's
        // overlap reserved by the spacer rather than by negative padding.
        ProfileBanner(profile.bannerUrl, profile.bannerColor)
        Spacer(Modifier.height(14.dp))
        SurfaceCard(modifier = Modifier.entrance(scale = true)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(
                    profile.avatarEmoji,
                    size = 72,
                    color = profile.avatarColor,
                    name = display,
                    imageUrl = profile.avatarUrl,
                )
                Spacer(Modifier.size(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(display, style = Type.displaySm.style(Ink))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Badge(profile.role.replaceFirstChar { it.uppercase() })
                        profile.username?.let { handle ->
                            Text("@$handle", style = Type.fine.style(Muted))
                        }
                    }
                    // Staff-granted badge chips, exactly as the web renders them
                    // beside the role. Colour resolves from the same four tokens.
                    if (profile.badges.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            profile.badges.take(4).forEach { badge -> BadgeChip(badge) }
                        }
                    }
                    // The real name only appears when the owner allows it *and* it
                    // is not already the name being led with — which is the web's
                    // own condition, not an approximation of it.
                    if (profile.visibility.name) {
                        profile.name?.takeIf { it.isNotBlank() && it != display }?.let { real ->
                            Text(real, style = Type.fine.style(Muted))
                        }
                    }
                }
            }

            profile.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                Spacer(Modifier.height(14.dp))
                Hairline()
                Spacer(Modifier.height(14.dp))
                Text(bio, style = Type.body.style(Ink))
            }

            if (mine) {
                Spacer(Modifier.height(16.dp))
                PillButton(
                    text = "Edit profile",
                    onClick = { viewModel.closeProfile(); viewModel.go(Destination.SETTINGS) },
                    tone = PillTone.Secondary,
                    icon = RevisioIcons.edit,
                )
            }
        }

        // ── rank and stats ─────────────────────────────────────────────────
        val stats = profile.gamification
        if (stats != null) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 1)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // The crest is rebuilt from the numbers the payload carries —
                    // the server sends the tier, the division and the label, so the
                    // phone does not need the ranking rules to draw the shape.
                    RankCrest(
                        Rank(
                            tier = stats.rankTier.ifBlank { "bronze" },
                            division = stats.rankDivision,
                            label = stats.rankLabel.ifBlank { "Unranked" },
                            points = stats.totalXp,
                        ),
                        size = 72,
                        showProgress = false,
                    )
                    Spacer(Modifier.size(18.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(stats.rankLabel.ifBlank { "Unranked" }, style = Type.strong.style(Ink))
                        Text(
                            "${stats.totalXp} XP · Level ${stats.level}",
                            style = Type.fine.style(Muted),
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
                Hairline()
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    Stat("Streak", "${stats.streak}d")
                    Stat("Reviews", "${profile.reviewCount}")
                    Stat("Badges", "${profile.achievements.size}")
                }
            }
        } else if (mine) {
            // Its own case, said in its own words: "nothing to show" and "you hid
            // this" are different sentences, and only one of them has an action.
            Spacer(Modifier.height(20.dp))
            SoftCard {
                Text(
                    "Your stats are hidden from visitors. Turn them on in Settings → Privacy if you want them shown.",
                    style = Type.caption.style(Muted),
                )
            }
        }

        if (profile.subjects.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 2)) {
                Text("Studying", style = Type.strong.style(Ink))
                Spacer(Modifier.height(10.dp))
                profile.subjects.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        pair.forEach { subject -> ChipPill(subject.name) }
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }
        }

        if (profile.achievements.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SurfaceCard(modifier = Modifier.entrance(index = 3)) {
                Text("Achievements", style = Type.strong.style(Ink))
                Spacer(Modifier.height(10.dp))
                profile.achievements.forEachIndexed { index, achievement ->
                    if (index > 0) Hairline()
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        BoxedGlyph(achievementIcon(achievement.id, achievement.icon), tint = Gold)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(achievement.name, style = Type.captionS.style(Ink))
                            achievement.description?.takeIf { it.isNotBlank() }?.let {
                                Text(it, style = Type.fine.style(Muted))
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        PillButton(text = "Close", onClick = viewModel::closeProfile, tone = PillTone.Ghost)
        Spacer(Modifier.height(28.dp))
    }
}
