import RevisioEngine
import SwiftUI

/// Rank — the competitive hub.
///
/// Organised the way a competitive game puts its progress screen together, which
/// is how the website's `/progress` does it:
///
///   • **The scoreboard first.** The same near-black band the dashboard shows,
///     from the same payload, so the two cannot disagree.
///   • **Three views, one at a time.** The ladder, the weekly lobby and the raw XP
///     ledger are tabs rather than a three-column wall.
///   • **Short copy.** Every paragraph that explained a leaderboard to an adult who
///     had already seen one is gone; what is left states policy.
///   • **Honest empty states.** A lobby with unclaimed seats says so; a learner
///     still in placement is told that rather than shown a fake Bronze III.
struct RankView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    enum View3: String, CaseIterable {
        case ladder, week, board
        var label: String {
            switch self {
            case .ladder: return "Ladder"
            case .week: return "This week"
            case .board: return "XP"
            }
        }
    }

    @State private var view: View3 = .ladder

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Spacer().frame(height: 4)
                HStack(alignment: .center, spacing: 12) {
                    ScreenTitle(title: "Rank", eyebrow: "Progress")
                    Spacer(minLength: 0)
                    IconPill(icon: "rotate", size: 38) { model.loadProgress() }
                }

                if let payload = model.ranked {
                    RankStripBand(
                        rank: payload.ranked.rank,
                        lobby: payload.ranked.lobby,
                        week: payload.ranked.week,
                        placement: payload.ranked.placement,
                        xpThisWeek: payload.ranked.xpThisWeek,
                        onLadder: { view = .ladder }
                    )

                    // Three views, one at a time — the web's Tabs, on the phone.
                    Segmented(
                        options: View3.allCases.map { ($0.rawValue, $0.label) },
                        selected: view.rawValue,
                        onSelect: { next in view = View3(rawValue: next) ?? .ladder }
                    )

                    switch view {
                    case .ladder:
                        TierProgressCard(rank: payload.ranked.rank)

                        SurfaceCard {
                            HStack(alignment: .bottom, spacing: 0) {
                                Text("The ladder")
                                    .font(Type.tagline.font)
                                    .foregroundStyle(colors.foreground)
                                Spacer(minLength: 0)
                                Text(
                                    payload.ranked.placement.placing
                                        ? "Placement \(payload.ranked.placement.done)/\(payload.ranked.placement.target)"
                                        : "\(RankLadder.rungs.count) ranks"
                                )
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                            }
                            Spacer().frame(height: 14)
                            LadderRail(rank: payload.ranked.rank)
                            if !payload.ranked.rank.isApex {
                                Spacer().frame(height: 12)
                                Text("Next rung in \(payload.ranked.rank.remaining) RP · about \(RankLadder.reviewsForRp(payload.ranked.rank.remaining)) reviews.")
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }
                        }

                        // Form — which gear the learner is in today, in the words
                        // `src/domain/ranked.ts` uses.
                        SurfaceCard {
                            let form = Copy.formFor(
                                reviewed: model.me?.today.reviewed ?? 0,
                                correct: model.me?.today.correct ?? 0
                            )
                            HStack(alignment: .center, spacing: 6) {
                                Icon("form", size: 14, color: colors.mutedForeground)
                                Text("Form")
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                                Text(form.label)
                                    .font(Type.strong.font)
                                    .foregroundStyle(colors.foreground)
                            }
                            Spacer().frame(height: 4)
                            Text(form.detail)
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }

                        Text("Rank comes from lifetime XP and never resets. The weekly lobby only decides where you sit inside your tier — a bad week costs you position, not progress.")
                            .font(.system(size: 12))
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 4)

                    case .week:
                        SurfaceCard {
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(payload.ranked.rank.label) lobby")
                                        .font(Type.tagline.font)
                                        .foregroundStyle(colors.foreground)
                                    Text(payload.ranked.week.rangeLabel)
                                        .font(.system(size: 13))
                                        .foregroundStyle(colors.mutedForeground)
                                }
                                Spacer(minLength: 0)
                                Badge(
                                    text: payload.ranked.week.daysLeft == 1
                                        ? "Last day"
                                        : "\(payload.ranked.week.daysLeft) days left",
                                    tone: .quiet
                                )
                            }
                            Spacer().frame(height: 12)
                            Text(
                                Copy.lobbyLine(
                                    zone: payload.ranked.lobby.zone,
                                    position: payload.ranked.lobby.position,
                                    size: payload.ranked.lobby.size,
                                    daysLeft: payload.ranked.week.daysLeft,
                                    rankLabel: payload.ranked.rank.label
                                )
                            )
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)

                            // The clock the whole lobby runs on.
                            Spacer().frame(height: 14)
                            HStack(spacing: 10) {
                                Meter(percent: payload.ranked.week.percentElapsed, height: 6)
                                Text("\(100 - payload.ranked.week.percentElapsed)% left")
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }

                            Spacer().frame(height: 14)
                            if model.me?.leaderboardOptOut == true {
                                HStack(alignment: .top, spacing: 12) {
                                    Icon("private", size: 17, color: colors.foreground)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Your name is hidden. Your RP still moves.")
                                            .font(Type.caption.font)
                                            .foregroundStyle(colors.foreground)
                                        Button("Rejoin") { model.setLeaderboardOptOut(false) }
                                            .buttonStyle(.plain)
                                            .font(Type.caption.font.weight(.semibold))
                                            .foregroundStyle(colors.foreground)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(14)
                                .background(
                                    colors.secondary,
                                    in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                                )
                            } else {
                                LobbyTable(lobby: payload.ranked.lobby)
                            }
                        }

                    case .board:
                        SurfaceCard {
                            Text("XP board")
                                .font(Type.tagline.font)
                                .foregroundStyle(colors.foreground)
                            Spacer().frame(height: 10)
                            HStack(spacing: 6) {
                                ForEach(["daily", "weekly", "monthly"], id: \.self) { scope in
                                    Button {
                                        if model.boardScope != scope { model.loadProgress(scope: scope) }
                                    } label: {
                                        ChipPill(text: scope.capitalized, active: model.boardScope == scope)
                                    }
                                    .buttonStyle(.plain)
                                }
                                Spacer(minLength: 0)
                            }
                            Spacer().frame(height: 12)

                            if payload.board.isEmpty {
                                Text("Nobody has logged XP this \(model.boardScope). One review puts you on the board.")
                                    .font(Type.caption.font)
                                    .foregroundStyle(colors.mutedForeground)
                            } else {
                                ForEach(Array(payload.board.prefix(30).enumerated()), id: \.element.id) { (index: Int, row: BoardRow) in
                                    BoardLine(
                                        position: row.rank,
                                        name: row.isMe ? "You" : row.name,
                                        xp: row.xp,
                                        me: row.isMe
                                    )
                                    .entrance(index)
                                }
                            }

                            Spacer().frame(height: 10)
                            Button(model.me?.leaderboardOptOut == true ? "Join the boards" : "Hide me from the boards") {
                                model.setLeaderboardOptOut(!(model.me?.leaderboardOptOut == true))
                            }
                            .buttonStyle(.plain)
                            .font(Type.caption.font.weight(.medium))
                            .foregroundStyle(colors.foreground)
                        }
                    }

                    // ── Achievements ────────────────────────────────────────
                    SurfaceCard {
                        HStack(alignment: .bottom, spacing: 0) {
                            Text("Achievements")
                                .font(Type.tagline.font)
                                .foregroundStyle(colors.foreground)
                            Spacer(minLength: 0)
                            Text("\(payload.achievements.filter(\.unlocked).count)/\(payload.achievements.count)")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }
                        Spacer().frame(height: 4)
                        Text("Permanent — a rank can slip, these cannot.")
                            .font(.system(size: 13))
                            .foregroundStyle(colors.mutedForeground)
                        Spacer().frame(height: 14)
                        ForEach(Array(payload.achievements.enumerated()), id: \.element.id) { (index: Int, achievement: Achievement) in
                            if index > 0 { Spacer().frame(height: 8) }
                            AchievementCard(achievement: achievement)
                                .entrance(index, scale: true)
                        }
                    }
                } else {
                    SoftCard {
                        HStack(spacing: 10) {
                            Icon("rank", size: 16, color: colors.mutedForeground)
                            Text(
                                model.online
                                    ? "Loading your rank…"
                                    : "Your rank needs a connection — it is computed from your whole history."
                            )
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                Spacer().frame(height: 28)
            }
            .padding(20)
        }
    }
}

/// One line of a board. The learner's own row is ink; everyone else is muted.
///
/// The board arrives as a wave rather than as a wall: the rows are stepped by a
/// capped delay and settled one at a time, so a lobby of thirty reads as a list
/// filling up rather than as a table appearing.
private struct BoardLine: View {
    @Environment(\.revisio) private var colors
    let position: Int
    let name: String
    let xp: Int
    let me: Bool

    var body: some View {
        HStack(spacing: 8) {
            Text("\(position)")
                .font(me ? Type.strong.font : Type.fine.font)
                .foregroundStyle(me ? colors.foreground : colors.mutedForeground)
                .frame(width: 24)
            Text(name)
                .font(me ? Type.strong.font : Type.caption.font)
                .foregroundStyle(colors.foreground)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            NumberTicker(value: xp, font: Type.fine.font, color: colors.mutedForeground)
            Text(" XP")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, me ? 8 : 0)
        .background(
            me ? colors.secondary : Color.clear,
            in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
        )
    }
}

/// An achievement.
///
/// The database stores an emoji per achievement, and an emoji would reintroduce
/// off-palette colour — so the row resolves to a registry glyph by id first, then
/// by the legacy emoji, exactly as the web's `achievementIcon` does. The unlocked
/// state is the only place gold appears on this screen.
private struct AchievementCard: View {
    @Environment(\.revisio) private var colors
    let achievement: Achievement

    var body: some View {
        let unlocked = achievement.unlocked
        HStack(spacing: 12) {
            Icon(
                achievementIcon(id: achievement.id, legacyEmoji: achievement.icon),
                size: 17,
                color: unlocked ? colors.foreground : colors.mutedForeground
            )
            .frame(width: 36, height: 36)
            .background(
                unlocked ? colors.gold.opacity(0.25) : colors.secondary,
                in: Circle()
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(achievement.name)
                    .font(Type.captionS.font)
                    .foregroundStyle(unlocked ? colors.foreground : colors.mutedForeground)
                if let description = achievement.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 12))
                        .foregroundStyle(colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if unlocked {
                Icon("checked", size: 16, color: colors.foreground)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            unlocked ? colors.gold.opacity(0.10) : colors.card,
            in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .strokeBorder(unlocked ? colors.gold.opacity(0.6) : colors.border, lineWidth: 1)
        )
    }
}

/// The lobby's seats, with the promotion and demotion bands drawn above them.
///
/// The bands are the answer to "am I safe?", so they are a proportion of the
/// lobby rather than a decorative stripe: widths are computed, not weighted,
/// because a layout heuristic would make them an opinion.
private struct LobbyTable: View {
    @Environment(\.revisio) private var colors
    let lobby: Lobby

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geo in
                let unit = geo.size.width / CGFloat(max(lobby.size, 1))
                let gap: CGFloat = 3
                HStack(spacing: gap) {
                    band(width: CGFloat(max(lobby.band, 1)) * unit - gap, colour: colors.good)
                    band(width: CGFloat(max(lobby.size - lobby.band * 2, 1)) * unit - gap, colour: colors.secondary)
                    band(width: CGFloat(max(lobby.band, 1)) * unit - gap, colour: colors.destructive)
                }
            }
            .frame(height: 6)

            Text("\(lobby.filled) of \(lobby.size) seats taken")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)

            ForEach(lobby.rows.prefix(12)) { seat in
                HStack(spacing: 0) {
                    Text("\(seat.position)")
                        .font(Type.fine.font)
                        .foregroundStyle(seat.isMe ? colors.foreground : colors.mutedForeground)
                        .frame(width: 26, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(seat.isMe ? "You" : seat.name)
                            .font(seat.isMe ? Type.strong.font : Type.caption.font)
                            .foregroundStyle(colors.foreground)
                        if !seat.rank.label.isEmpty {
                            Text(seat.rank.label)
                                .font(.system(size: 11))
                                .foregroundStyle(colors.mutedForeground)
                        }
                    }
                    Spacer(minLength: 0)
                    Text("\(seat.xp)")
                        .font(Type.fine.font)
                        .foregroundStyle(seat.isMe ? colors.foreground : colors.mutedForeground)
                }
                .padding(.vertical, 6)
            }
        }
    }

    private func band(width: CGFloat, colour: Color) -> some View {
        Capsule().fill(colour).frame(width: max(width, 2), height: 6)
    }
}
