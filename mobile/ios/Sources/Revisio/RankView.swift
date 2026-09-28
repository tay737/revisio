import RevisioEngine
import SwiftUI

/// Rank — the ladder.
///
/// Two answers to "how am I doing", both from `domain/ranked.ts` and never
/// re-derived here: a **rank** built from lifetime XP that never resets, and a
/// **weekly lobby** you are seated in against thirty others. The server decides
/// what "promotion" means and this screen draws what it was handed — one owner for
/// the rule, so the phone and the web cannot disagree about who is going up.
///
/// The crest is the loudest thing here and it carries the tier by **geometry**,
/// not by hue: chevrons in the shield, pips beneath, ticks around the ring. That is
/// what lets a ladder of them read side by side under a one-accent rule, and it is
/// the same drawing the browser makes.
struct RankView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 20)
                HStack(alignment: .center, spacing: 12) {
                    ScreenTitle(title: "Rank", eyebrow: "Progress")
                    Spacer(minLength: 0)
                    IconPill(icon: "rotate", size: 38) { model.loadProgress() }
                }
                Spacer().frame(height: 20)

                if let payload = model.ranked {
                    RankCard(rank: payload.ranked.rank)

                    Spacer().frame(height: 14)
                    SurfaceCard {
                        HStack(alignment: .top, spacing: 20) {
                            Stat(label: "This week", value: "\(payload.me.xpThisWeek)")
                            Stat(label: "Lifetime", value: "\(payload.me.totalXp)")
                            Stat(label: "Level", value: "\(payload.me.level)")
                            Spacer(minLength: 0)
                        }
                    }

                    if payload.ranked.placement.placing {
                        Spacer().frame(height: 14)
                        SurfaceCard {
                            HStack(spacing: 10) {
                                Icon("target", size: 18, color: colors.foreground)
                                Text("Placements")
                                    .font(Type.strong.font)
                                    .foregroundStyle(colors.foreground)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Badge(
                                    text: "\(payload.ranked.placement.done)/\(payload.ranked.placement.target)",
                                    tone: .quiet
                                )
                            }
                            Spacer().frame(height: 8)
                            Text("\(payload.ranked.placement.done) of \(payload.ranked.placement.target) reviews done. A rank is earned, not handed out on arrival.")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer().frame(height: 12)
                            Meter(percent: payload.ranked.placement.percent, tint: colors.foreground)
                        }
                    }

                    Spacer().frame(height: 24)
                    SectionTitle(text: "Weekly lobby")
                    LobbyCard(ranked: payload.ranked)

                    Spacer().frame(height: 24)
                    SectionTitle(text: "Leaderboard")
                    HStack(spacing: 8) {
                        ForEach(
                            [("daily", "Today"), ("weekly", "Week"), ("monthly", "Month")],
                            id: \.0
                        ) { scope, label in
                            Button {
                                if model.boardScope != scope { model.loadProgress(scope: scope) }
                            } label: {
                                ChipPill(text: label, active: model.boardScope == scope)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Spacer().frame(height: 12)

                    if payload.board.isEmpty {
                        EmptyNote(text: "Nobody on this board yet. Review a card and you will be.")
                    } else {
                        SurfaceCard {
                            ForEach(Array(payload.board.prefix(20).enumerated()), id: \.element.id) { index, row in
                                if index > 0 { Spacer().frame(height: 2) }
                                BoardLine(
                                    position: row.rank,
                                    name: row.isMe ? "You" : row.name,
                                    xp: row.xp,
                                    me: row.isMe
                                )
                            }
                        }
                    }

                    let unlocked = payload.achievements.filter(\.unlocked)
                    Spacer().frame(height: 24)
                    SectionTitle(text: "Achievements · \(unlocked.count) of \(payload.achievements.count)")
                    if unlocked.isEmpty {
                        EmptyNote(text: "Nothing unlocked yet. The first one is a review.")
                    } else {
                        ForEach(unlocked) { achievement in
                            AchievementRow(achievement: achievement)
                            Spacer().frame(height: 10)
                        }
                    }

                    Spacer().frame(height: 28)
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
                    Spacer().frame(height: 24)
                }
            }
            .padding(20)
        }
    }
}

private struct RankCard: View {
    @Environment(\.revisio) private var colors
    let rank: Rank

    var body: some View {
        SurfaceCard {
            HStack(alignment: .center, spacing: 18) {
                // The crest's shape carries the tier; colour only says "this is
                // yours" (ink) or "a rung you have not reached" (muted).
                RankCrest(rank: rank, size: 88)
                VStack(alignment: .leading, spacing: 2) {
                    Text(rank.label)
                        .font(Type.displaySm.font)
                        .foregroundStyle(colors.foreground)
                    Text("\(rank.points) RP · \(rank.short)")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                    Spacer().frame(height: 10)
                    Badge(
                        text: rank.isApex ? "Apex" : "\(rank.remaining) RP to go",
                        tone: rank.isApex ? .gold : .quiet,
                        icon: rank.isApex ? "crown" : "climb"
                    )
                }
                Spacer(minLength: 0)
            }
            Spacer().frame(height: 16)
            Meter(percent: rank.percent, tint: colors.foreground)
            Spacer().frame(height: 10)
            Text(
                rank.isApex
                    ? "Top of the ladder."
                    : "\(rank.intoDivision) / \(rank.forDivision) in this division — \(rank.remaining) RP to the next."
            )
            .font(Type.fine.font)
            .foregroundStyle(colors.mutedForeground)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct LobbyCard: View {
    @Environment(\.revisio) private var colors
    let ranked: Ranked

    private var zone: (label: String, tone: BadgeTone, icon: String) {
        switch ranked.lobby.zone {
        case "promotion": return (ranked.lobby.zoneLabel, .good, "zoneUp")
        case "demotion": return (ranked.lobby.zoneLabel, .streak, "zoneDown")
        case "pending": return (ranked.lobby.zoneLabel, .gold, "clock")
        default: return (ranked.lobby.zoneLabel, .quiet, "secure")
        }
    }

    var body: some View {
        let mark = zone
        SurfaceCard {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(ranked.lobby.position > 0 ? "#\(ranked.lobby.position) of \(ranked.lobby.size)" : "Unseated")
                        .font(Type.displaySm.font)
                        .foregroundStyle(colors.foreground)
                    Text(ranked.week.rangeLabel.isEmpty ? "This week" : ranked.week.rangeLabel)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
                Badge(text: mark.label, tone: mark.tone, icon: mark.icon)
            }
            Spacer().frame(height: 12)
            Text("\(ranked.lobby.filled) of \(ranked.lobby.size) seats taken · \(ranked.week.daysLeft) days left")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
            Spacer().frame(height: 12)
            ConfidenceBand(band: ranked.lobby.band, size: ranked.lobby.size)

            Spacer().frame(height: 16)
            ForEach(ranked.lobby.rows.prefix(12)) { seat in
                HStack(spacing: 0) {
                    Text("\(seat.position)")
                        .font(Type.fine.font)
                        .foregroundStyle(seat.isMe ? colors.foreground : colors.mutedForeground)
                        .frame(width: 26, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(seat.isMe ? "You" : seat.name)
                            .font(seat.isMe ? Type.strong.font : Type.caption.font)
                            .foregroundStyle(colors.foreground)
                        Text(seat.rank.label)
                            .font(Type.micro.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    Text("\(seat.xp)")
                        .font(Type.fine.font)
                        .foregroundStyle(seat.isMe ? colors.foreground : colors.mutedForeground)
                }
                .padding(.vertical, 5)
            }
        }
    }
}

/// The promotion and demotion bands, drawn so "am I safe?" is one glance.
private struct ConfidenceBand: View {
    @Environment(\.revisio) private var colors
    let band: Int
    let size: Int

    var body: some View {
        if size > 0 {
            // Widths are computed rather than weighted: the bands are a proportion
            // of the lobby, and a layout heuristic would make them an opinion.
            GeometryReader { geo in
                let unit = geo.size.width / CGFloat(size)
                let gap: CGFloat = 3
                HStack(spacing: gap) {
                    bandView(width: CGFloat(max(band, 1)) * unit - gap, colour: colors.good)
                    bandView(width: CGFloat(max(size - band * 2, 1)) * unit - gap, colour: colors.secondary)
                    bandView(width: CGFloat(max(band, 1)) * unit - gap, colour: colors.destructive)
                }
            }
            .frame(height: 6)
        }
    }

    private func bandView(width: CGFloat, colour: Color) -> some View {
        Capsule()
            .fill(colour)
            .frame(width: max(width, 2), height: 6)
    }
}

/// One line of a board. The learner's own row is ink; everyone else is muted.
private struct BoardLine: View {
    @Environment(\.revisio) private var colors
    let position: Int
    let name: String
    let xp: Int
    let me: Bool

    var body: some View {
        HStack(spacing: 0) {
            Text("\(position)")
                .font(Type.fine.font)
                .foregroundStyle(me ? colors.foreground : colors.mutedForeground)
                .frame(width: 28, alignment: .leading)
            Text(name)
                .font(me ? Type.strong.font : Type.caption.font)
                .foregroundStyle(colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(xp) XP")
                .font(Type.fine.font)
                .foregroundStyle(me ? colors.foreground : colors.mutedForeground)
        }
        .padding(.vertical, 6)
    }
}

/// An achievement.
///
/// The database stores an emoji per achievement, and an emoji would reintroduce
/// off-palette colour — so the row resolves to a registry glyph by id first, then
/// by the legacy emoji, exactly as the web's `achievementIcon` does.
private struct AchievementRow: View {
    @Environment(\.revisio) private var colors
    let achievement: Achievement

    var body: some View {
        SurfaceCard {
            HStack(spacing: 14) {
                Icon(
                    achievementIcon(id: achievement.id, legacyEmoji: achievement.icon),
                    size: 18,
                    color: colors.gold
                )
                .frame(width: 38, height: 38)
                .background(colors.gold.opacity(0.18), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(achievement.name)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    if let description = achievement.description, !description.isEmpty {
                        Text(description)
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}
