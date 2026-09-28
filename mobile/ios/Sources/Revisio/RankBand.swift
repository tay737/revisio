import RevisioEngine
import SwiftUI

/// The rank band, and the ladder that explains it.
///
/// Both live here rather than on one screen because the dashboard and the Rank
/// page show the same band: the web reads one `RankStrip` from one hook in both
/// places, so the two can never disagree about where a learner stands. Drawing it
/// twice would be the first place they could.
///
/// Everything in it is a fact about the learner's own numbers — RP, the next rung
/// by name, roughly how much work that is, this week's contribution, and where
/// they sit. Nothing that merely *looks* like progress.

/// Your rank, in one glance — the web's `RankStrip`.
///
/// A **near-black band on a light canvas**: the stylesheet's own section divider,
/// used as the panel that carries the thing you are working toward. That says
/// "this is the scoreboard" without adding a second accent colour, and it is the
/// loudest thing in the app that is not a button.
struct RankStripBand: View {
    @Environment(\.revisio) private var colors
    let rank: Rank
    let lobby: Lobby
    let week: WeekBounds
    let placement: Placement
    let xpThisWeek: Int
    var onLadder: () -> Void

    private var zoneLabel: String {
        switch lobby.zone {
        case "promotion": return "Promotion zone"
        case "demotion": return "Demotion zone"
        case "pending": return "Being placed"
        default: return "Safe"
        }
    }

    private var zoneIcon: String { lobby.zone == "demotion" ? "zoneDown" : "zoneUp" }

    private var zoneTint: Color {
        switch lobby.zone {
        case "promotion": return colors.good
        case "demotion": return colors.destructive
        default: return colors.mutedForeground
        }
    }

    private var blurb: String {
        if placement.placing {
            return "Placement — \(placement.done) of \(placement.target) reviews before you hold a rank."
        }
        if rank.isApex { return "Top of the ladder. Holding it is the hard part." }
        return "\(rank.remaining) RP to the next rung · about \(RankLadder.reviewsForRp(rank.remaining)) reviews."
    }

    var body: some View {
        TilePanel(tone: .dark) {
            HStack(alignment: .center, spacing: 20) {
                // The crest arrives on the pop spring — from 0.88, as the web's
                // does, because a rank that was just recomputed is a thing that
                // happened rather than a label that is simply there.
                RankCrest(rank: rank, size: 96)
                    .scaleEffect(1)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Your rank")
                        .font(Type.eyebrow.font)
                        .foregroundStyle(colors.mutedForeground)
                    Text(rank.label)
                        .font(Type.display.font)
                        .foregroundStyle(colors.foreground)
                    Text(blurb)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 10) {
                        Meter(percent: placement.placing ? placement.percent : rank.percent, tint: colors.foreground)
                        HStack(spacing: 0) {
                            NumberTicker(
                                value: placement.placing ? placement.done : rank.points,
                                font: Type.fine.font,
                                color: colors.mutedForeground
                            )
                            Text(placement.placing ? "/\(placement.target)" : " RP")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }
                    }
                    .padding(.top, 8)
                }
                Spacer(minLength: 0)
            }

            // Lobby status — the weekly stake, with the clock on it.
            Button(action: onLadder) {
                HStack(alignment: .center, spacing: 16) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(week.daysLeft == 1 ? "Last day this week" : "\(week.daysLeft) days left this week")
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                        HStack(spacing: 6) {
                            Text(zoneLabel)
                                .font(Type.strong.font)
                                .foregroundStyle(colors.foreground)
                            Icon(zoneIcon, size: 13, color: zoneTint)
                        }
                        HStack(spacing: 0) {
                            Text("\(lobby.position) of \(lobby.size) · ")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                            NumberTicker(value: xpThisWeek, font: Type.fine.font, color: colors.mutedForeground)
                            Text(" XP this week")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }
                    }
                    Spacer(minLength: 0)
                    Icon("next", size: 16, color: colors.mutedForeground)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(colors.secondary, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .strokeBorder(colors.border, lineWidth: 1)
                )
            }
            .buttonStyle(PressScaleStyle())
            .padding(.top, 16)
        }
    }
}

/// Tier progress — five bars, one per tier, and how much of each is banked.
struct TierProgressCard: View {
    @Environment(\.revisio) private var colors
    let rank: Rank

    var body: some View {
        SurfaceCard {
            HStack(alignment: .bottom, spacing: 0) {
                Text("Tier progress")
                    .font(Type.tagline.font)
                    .foregroundStyle(colors.foreground)
                Spacer(minLength: 0)
                NumberTicker(value: rank.points, font: Type.fine.font, color: colors.mutedForeground)
                Text(" RP")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }

            HStack(alignment: .top, spacing: 6) {
                ForEach(RankLadder.tierOrder, id: \.self) { tier in
                    let base = RankLadder.rungs.first { $0.tier == tier }?.base ?? 0
                    let total = (RankLadder.divisionSpan[tier] ?? 1) * 3
                    let earned = max(0, min(total, rank.points - base))
                    let percent = total == 0 ? 0 : Int((Double(earned) / Double(total) * 100).rounded())
                    let cleared = rank.points >= base + total
                    let current = tier == rank.tier
                    VStack(alignment: .leading, spacing: 6) {
                        Meter(
                            percent: percent,
                            tint: cleared || current ? colors.foreground : colors.borderStrong
                        )
                        Text(RankLadder.tierName(tier))
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.6)
                            .textCase(.uppercase)
                            .foregroundStyle(current ? colors.foreground : colors.mutedForeground)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.top, 14)
        }
    }
}

/// The ladder — every rung in the game, with your position marked.
///
/// A rank means nothing without the rungs above it, so this always shows the whole
/// climb. Rungs not yet reached are drawn with the identical crest in the muted
/// tone — same shape, no colour — which is the only way to show a fifteen-rank
/// ladder inside a one-colour system.
///
/// The rail is where the rank animation lives: it *travels* to the learner's rung
/// on arrival and on every change, so a promotion is something the screen does
/// rather than something a number says.
struct LadderRail: View {
    @Environment(\.revisio) private var colors
    let rank: Rank

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(RankLadder.rungs, id: \.index) { rung in
                        let rungRank = RankLadder.rankFor(rung.base)
                        let current = rung.index == rank.index
                        let reached = rung.index <= rank.index
                        VStack(spacing: 6) {
                            RankCrest(rank: rungRank, size: 42, showProgress: false, muted: !reached)
                            Text(RankLadder.divisionLabel[rung.division] ?? "")
                                .font(Type.strong.font)
                                .foregroundStyle(reached ? colors.foreground : colors.mutedForeground)
                            Text(RankLadder.tierName(rung.tier))
                                .font(.system(size: 10, weight: .bold))
                                .tracking(0.6)
                                .textCase(.uppercase)
                                .foregroundStyle(colors.mutedForeground)
                            Text("\(rung.base) RP")
                                .font(.system(size: 10, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(colors.mutedForeground)
                        }
                        .frame(width: 96)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 14)
                        .background(current ? colors.secondary : colors.card)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                                .strokeBorder(current ? colors.foreground : colors.border, lineWidth: 1)
                        )
                        .id(rung.index)
                    }
                }
                .padding(.vertical, 2)
            }
            .onAppear { proxy.scrollTo(rank.index, anchor: .center) }
            .onChange(of: rank.index) { next in
                withAnimation(Motion.Springs.soft.animation) { proxy.scrollTo(next, anchor: .center) }
            }
        }
    }
}

/// The companion, with its line decided by the engine's `Copy.companionFor`
/// rather than by whichever screen happens to be drawing it.
struct CompanionReadView: View {
    @Environment(\.revisio) private var colors
    let read: CompanionRead
    let rank: Rank?
    var onAction: (() -> Void)?

    var body: some View {
        if let rank {
            Companion(
                rank: rank,
                line: read.line,
                action: onAction == nil ? nil : read.actionLabel,
                onAction: onAction
            )
        } else {
            SoftCard {
                Text(read.line)
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
