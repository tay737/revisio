import SwiftUI
import RevisioEngine

/// Rank — the ladder.
///
/// Two answers to "how am I doing", both from `domain/ranked.ts` and never
/// re-derived here: a **rank** built from lifetime XP that never resets, and a
/// **weekly lobby** you are seated in against thirty others. The server decides
/// what "promotion" means and this screen draws what it was handed — one owner
/// for the rule, so the phone and the web cannot disagree about who is going up.
struct RankView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 8)
                HStack {
                    Text("Rank").font(.title).bold()
                    Spacer()
                    Button("Refresh") { model.loadProgress() }
                        .font(.caption).buttonStyle(.plain).foregroundColor(muted)
                }
                Spacer().frame(height: 12)

                if let payload = model.ranked {
                    RankCard(rank: payload.ranked.rank)

                    HStack(spacing: 22) {
                        Stat(label: "This week", value: "\(payload.me.xpThisWeek) XP")
                        Stat(label: "Lifetime", value: "\(payload.me.totalXp) XP")
                        Stat(label: "Level", value: "\(payload.me.level)")
                    }
                    .padding(.top, 12)

                    if payload.ranked.placement.placing {
                        Panel {
                            Text("Placements").font(.system(size: 15, weight: .semibold))
                            Text("\(payload.ranked.placement.done) of \(payload.ranked.placement.target) reviews done. A rank is earned, not handed out on arrival.")
                                .font(.caption).foregroundColor(muted).padding(.top, 4)
                            Bar(percent: payload.ranked.placement.percent).padding(.top, 10)
                        }
                        .padding(.top, 12)
                    }

                    SectionTitle(text: "Weekly lobby").padding(.top, 18)
                    LobbyCard(ranked: payload.ranked).padding(.top, 8)

                    SectionTitle(text: "Leaderboard").padding(.top, 18)
                    HStack(spacing: 6) {
                        ForEach([("daily", "Today"), ("weekly", "Week"), ("monthly", "Month")], id: \.0) { scope, label in
                            if model.boardScope == scope {
                                Chip(text: label, tint: accent)
                            } else {
                                Button(label) { model.loadProgress(scope: scope) }
                                    .font(.caption2).buttonStyle(.plain).foregroundColor(muted)
                            }
                        }
                    }
                    .padding(.top, 8)

                    if payload.board.isEmpty {
                        EmptyNote(text: "Nobody on this board yet. Review a card and you will be.")
                            .padding(.top, 10)
                    } else {
                        Panel {
                            ForEach(payload.board.prefix(20)) { row in
                                HStack {
                                    Text("\(row.rank)")
                                        .font(.caption)
                                        .foregroundColor(row.isMe ? accent : muted)
                                        .frame(width: 26, alignment: .leading)
                                    Text(row.isMe ? "You" : row.name)
                                        .font(.system(size: 14, weight: row.isMe ? .bold : .regular))
                                    Spacer()
                                    Text("\(row.xp) XP")
                                        .font(.caption)
                                        .foregroundColor(row.isMe ? accent : ink)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .padding(.top, 10)
                    }

                    let unlocked = payload.achievements.filter(\.unlocked)
                    SectionTitle(text: "Achievements · \(unlocked.count) of \(payload.achievements.count)")
                        .padding(.top, 18)
                    if unlocked.isEmpty {
                        EmptyNote(text: "Nothing unlocked yet.").padding(.top, 8)
                    } else {
                        ForEach(unlocked) { achievement in
                            Panel {
                                HStack {
                                    Text(achievement.icon ?? "★").font(.title3)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(achievement.name).font(.system(size: 14, weight: .semibold))
                                        if let description = achievement.description, !description.isEmpty {
                                            Text(description).font(.caption).foregroundColor(muted)
                                        }
                                    }
                                    Spacer()
                                }
                            }
                            .padding(.top, 8)
                        }
                    }
                } else {
                    EmptyNote(text: model.online
                        ? "Loading your rank…"
                        : "Your rank needs a connection — it is computed from your whole history.")
                }

                Spacer().frame(height: 20)
            }
            .padding(20)
        }
    }
}

private struct RankCard: View {
    let rank: Rank

    var body: some View {
        Panel {
            HStack(spacing: 14) {
                // The crest's shape carries the tier, not a colour — there is
                // exactly one accent in this system, so rank is a count, not a hue.
                Crest(size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text(rank.label).font(.title3).bold()
                    Text("\(rank.points) RP · \(rank.short)").font(.caption).foregroundColor(muted)
                }
                Spacer()
            }
            Bar(percent: rank.percent).padding(.top, 14)
            Text(rank.isApex
                 ? "Top of the ladder."
                 : "\(rank.intoDivision) / \(rank.forDivision) in this division — \(rank.remaining) RP to the next.")
                .font(.caption).foregroundColor(muted).padding(.top, 8)
        }
    }
}

private struct LobbyCard: View {
    let ranked: Ranked

    var body: some View {
        Panel {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(ranked.lobby.position > 0 ? "#\(ranked.lobby.position) of \(ranked.lobby.size)" : "Unseated")
                        .font(.system(size: 16, weight: .semibold))
                    Text(ranked.week.rangeLabel.isEmpty ? "This week" : ranked.week.rangeLabel)
                        .font(.caption).foregroundColor(muted)
                }
                Spacer()
                Chip(text: ranked.lobby.zoneLabel, tint: zoneTint)
            }
            Text("\(ranked.lobby.filled) of \(ranked.lobby.size) seats taken · \(ranked.week.daysLeft) days left")
                .font(.caption).foregroundColor(muted).padding(.top, 10)
            ConfidenceBand(band: ranked.lobby.band, size: ranked.lobby.size).padding(.top, 10)

            ForEach(ranked.lobby.rows.prefix(12)) { seat in
                HStack {
                    Text("\(seat.position)").font(.caption).foregroundColor(muted).frame(width: 24, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(seat.isMe ? "You" : seat.name)
                            .font(.system(size: 14, weight: seat.isMe ? .bold : .regular))
                        Text(seat.rank.label).font(.caption2).foregroundColor(muted)
                    }
                    Spacer()
                    Text("\(seat.xp) XP").font(.caption).foregroundColor(seat.isMe ? accent : ink)
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var zoneTint: Color {
        switch ranked.lobby.zone {
        case "promotion": return good
        case "demotion": return bad
        case "pending": return near
        default: return muted
        }
    }
}

/// The promotion and demotion bands, drawn so "am I safe?" is one glance.
private struct ConfidenceBand: View {
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
                    bandView(width: CGFloat(band) * unit - gap, colour: good)
                    bandView(width: CGFloat(size - band * 2) * unit - gap, colour: surface2)
                    bandView(width: CGFloat(band) * unit - gap, colour: bad)
                }
            }
            .frame(height: 5)
        }
    }

    private func bandView(width: CGFloat, colour: Color) -> some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(colour)
            .frame(width: max(width, 2), height: 5)
    }
}
