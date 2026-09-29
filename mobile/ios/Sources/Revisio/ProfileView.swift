import RevisioEngine
import SwiftUI

/// A public profile — `/u/:handle`, ported.
///
/// Privacy is not decided here and must never be. `GET /api/v1/profile/:handle` is
/// deliberately unauthenticated — a link shared into a chat window has to open for
/// someone who is not signed in — and the visibility rules are applied server-side,
/// so a hidden field arrives **absent** rather than hidden by this screen. Every
/// value below is therefore optional, and the blanks are the feature: a hidden
/// field is blank, never a lock icon asking questions the visitor did not ask.
///
/// The owner gets one quiet affordance, exactly as the web does: their own profile
/// links to Settings, because the moment you see your profile is the moment you
/// want to edit it.
struct ProfileView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                HStack(spacing: 12) {
                    IconPill(icon: "close") { model.closeProfile() }
                    ScreenTitle(title: "Profile", eyebrow: "@\(model.profileHandle ?? "")")
                }
                Spacer().frame(height: 18)

                if let profile = model.profile {
                    // The web's profile page leads with the banner and pulls the
                    // avatar up over its lower edge; the same two stacked pieces
                    // here, with the overlap reserved by the spacer.
                    ProfileBanner(imageUrl: profile.bannerUrl, color: profile.bannerColor ?? "dusk")
                    Spacer().frame(height: 14)
                    identity(profile)
                    if let stats = profile.gamification {
                        rankCard(stats, profile)
                            .entrance(1)
                    } else if isMine(profile) {
                        hiddenStatsCard
                    }
                    if !profile.subjects.isEmpty {
                        subjectsCard(profile)
                            .entrance(2)
                    }
                    if !profile.achievements.isEmpty {
                        achievementsCard(profile)
                            .entrance(3)
                    }
                } else {
                    SoftCard {
                        Text(model.profileError ?? "Opening this profile…")
                            .font(Type.caption.font)
                            .foregroundStyle(model.profileError == nil ? colors.mutedForeground : colors.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Spacer().frame(height: 24)
                PillButton(text: "Close", tone: .ghost) { model.closeProfile() }
                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }

    private func isMine(_ profile: PublicProfile) -> Bool {
        !profile.id.isEmpty && model.me?.id == profile.id
    }

    private func display(_ profile: PublicProfile) -> String {
        let nickname = profile.nickname ?? ""
        let name = profile.name ?? ""
        if !nickname.isEmpty { return nickname }
        if !name.isEmpty { return name }
        return "This learner"
    }

    // ── identity ────────────────────────────────────────────────────────────

    private func identity(_ profile: PublicProfile) -> some View {
        let shown = display(profile)
        return SurfaceCard {
            HStack(spacing: 16) {
                Avatar(
                    emoji: profile.avatarEmoji,
                    size: 72,
                    color: profile.avatarColor,
                    name: shown,
                    imageUrl: profile.avatarUrl
                )
                VStack(alignment: .leading, spacing: 4) {
                    Text(shown)
                        .font(Type.displaySm.font)
                        .foregroundStyle(colors.foreground)
                    HStack(spacing: 8) {
                        Badge(text: profile.role.capitalized)
                        if let username = profile.username {
                            Text("@\(username)")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }
                    }
                    // Staff-granted badge chips, exactly as the web renders them
                    // beside the role. Colour resolves from the same four tokens.
                    if let badges = profile.badges, !badges.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(badges.prefix(4)) { badge in
                                ProfileBadgeChipView(badge: badge)
                            }
                        }
                    }
                    // The real name only appears when the owner allows it *and* it
                    // is not already the name being led with — which is the web's
                    // own condition, not an approximation of it.
                    if profile.visibility.name, let name = profile.name, !name.isEmpty, name != shown {
                        Text(name)
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                }
                Spacer(minLength: 0)
            }

            if let bio = profile.bio, !bio.isEmpty {
                Spacer().frame(height: 14)
                Hairline()
                Spacer().frame(height: 14)
                Text(bio)
                    .font(Type.body.font)
                    .foregroundStyle(colors.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if isMine(profile) {
                Spacer().frame(height: 16)
                PillButton(text: "Edit profile", tone: .secondary, icon: "edit") {
                    model.closeProfile()
                    model.go(.settings)
                }
            }
        }
        .entrance(scale: true)
    }

    // ── rank and stats ──────────────────────────────────────────────────────

    private func rankCard(_ stats: ProfileGamification, _ profile: PublicProfile) -> some View {
        SurfaceCard {
            HStack(spacing: 18) {
                // The crest is rebuilt from the numbers the payload carries — the
                // server sends the tier, the division and the label, so the phone
                // does not need the ranking rules to draw the shape.
                RankCrest(
                    rank: Rank(
                        tier: stats.rankTier.isEmpty ? "bronze" : stats.rankTier,
                        division: stats.rankDivision,
                        index: 0,
                        label: stats.rankLabel.isEmpty ? "Unranked" : stats.rankLabel,
                        short: "",
                        points: stats.totalXp,
                        intoDivision: 0,
                        forDivision: 0,
                        percent: 0,
                        remaining: 0,
                        isApex: false
                    ),
                    size: 72,
                    showProgress: false
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(stats.rankLabel.isEmpty ? "Unranked" : stats.rankLabel)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Text("\(stats.totalXp) XP · Level \(stats.level)")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
            }
            Spacer().frame(height: 14)
            Hairline()
            Spacer().frame(height: 14)
            HStack(alignment: .top, spacing: 20) {
                Stat(label: "Streak", value: "\(stats.streak)d")
                Stat(label: "Reviews", value: "\(profile.reviewCount)")
                Stat(label: "Badges", value: "\(profile.achievements.count)")
                Spacer(minLength: 0)
            }
        }
    }

    /// Its own case, said in its own words: "nothing to show" and "you hid this"
    /// are different sentences, and only one of them has an action.
    private var hiddenStatsCard: some View {
        SoftCard {
            Text("Your stats are hidden from visitors. Turn them on in Settings → Privacy if you want them shown.")
                .font(Type.caption.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .entrance(1)
    }

    private func subjectsCard(_ profile: PublicProfile) -> some View {
        SurfaceCard {
            Text("Studying")
                .font(Type.strong.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 10)
            let names = profile.subjects.map(\.name)
            ChipRows(items: names, perRow: 2)
        }
    }

    private func achievementsCard(_ profile: PublicProfile) -> some View {
        SurfaceCard {
            Text("Achievements")
                .font(Type.strong.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 10)
            ForEach(Array(profile.achievements.enumerated()), id: \.element.id) { index, achievement in
                if index > 0 { Hairline() }
                HStack(spacing: 12) {
                    BoxedGlyph(
                        icon: achievementIcon(id: achievement.id, legacyEmoji: achievement.icon),
                        tint: colors.gold
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(achievement.name)
                            .font(Type.captionS.font)
                            .foregroundStyle(colors.foreground)
                        if let description = achievement.description, !description.isEmpty {
                            Text(description)
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 12)
            }
        }
    }
}

/// A staff-granted badge chip. Colour tokens match `profile-badge.tsx`: gold on
/// its amber, primary on info, good on green, rose on destructive — all at the
/// soft opacities the web wears.
struct ProfileBadgeChipView: View {
    @Environment(\.revisio) private var colors
    let badge: ProfileBadgeChip

    private var background: Color {
        switch badge.color {
        case "primary": return colors.info.opacity(0.15)
        case "good": return colors.goodSoft
        case "rose": return colors.destructive.opacity(0.15)
        default: return colors.gold.opacity(0.30)
        }
    }

    private var ink: Color {
        switch badge.color {
        case "primary": return colors.info
        case "good": return colors.goodPressed
        case "rose": return colors.destructive
        default: return colors.foreground
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            if !badge.icon.isEmpty {
                Text(badge.icon)
                    .font(Type.fine.font)
                    .foregroundStyle(ink)
            }
            Text(badge.label)
                .font(Type.fine.font)
                .foregroundStyle(ink)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(background, in: Capsule())
    }
}
