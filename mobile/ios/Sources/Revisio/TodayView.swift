import RevisioEngine
import SwiftUI

/// Today — the dashboard.
///
/// The screen the app opens on, and the one it can still serve with no network at
/// all: the session it carries is on the device, and everything here is either the
/// stored pack or the last thing the server told us.
///
/// The layout is the website's dashboard, in the Duolingo order of operations:
///
///   1. **The hero** — the greeting, one rotating line of conversation, and the
///      single green button that starts a session. On a phone it is the only thing
///      above the fold, which is the point: there is one thing to do.
///   2. **Four numbers** — due, done, streak, XP, two to a row so each is a
///      comfortable tap-and-read block rather than a 60px sliver.
///   3. **Rank** — the same near-black band the Rank page uses, because where you
///      stand is the second half of the answer to "what now".
///   4. **Four ways in** — one line each. A hint is four words; the page that
///      follows can explain itself.
///
/// The tile rhythm carries the structure (dark hero → light grid → dark rank band
/// → light grid), which is the spec's polarity flip doing the work that borders
/// and shadows are not allowed to do here.
struct TodayView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    private struct Action {
        let title: String
        let hint: String
        let icon: String
        let destination: Destination
    }

    private let actions: [Action] = [
        Action(title: "Cram", hint: "Before an exam", icon: "cram", destination: .cram),
        Action(title: "Notes", hint: "The full topic", icon: "learn", destination: .learn),
        Action(title: "Exam", hint: "A marked paper", icon: "exam", destination: .exam),
        Action(title: "Rank", hint: "Ladder and lobby", icon: "rank", destination: .rank),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Spacer().frame(height: 6)

                if let home = model.home {
                    hero(home)
                    numbers(home)

                    if let data = model.ranked?.ranked {
                        RankStripBand(
                            rank: data.rank,
                            lobby: data.lobby,
                            week: data.week,
                            placement: data.placement,
                            xpThisWeek: data.xpThisWeek,
                            onLadder: { model.go(.rank) }
                        )
                        .entrance(2, scale: true)
                    }

                    SectionTitle(text: "Ways in")
                    waysIn

                    subjects(home)

                    if model.pending > 0 {
                        SoftCard {
                            HStack(spacing: 10) {
                                Icon("rotate", size: 16, color: colors.mutedForeground)
                                Text("\(model.pending) review\(model.pending == 1 ? "" : "s") waiting to sync")
                                    .font(Type.strong.font)
                                    .foregroundStyle(colors.foreground)
                            }
                            Spacer().frame(height: 4)
                            Text("They'll be graded by the server once you're back online.")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                            if model.online {
                                Spacer().frame(height: 10)
                                Button("Sync now") { model.refreshHome() }
                                    .buttonStyle(.plain)
                                    .font(Type.captionS.font)
                                    .foregroundStyle(colors.foreground)
                            }
                        }
                    }

                    if home.fromCache {
                        SoftCard {
                            HStack(spacing: 8) {
                                Icon("clock", size: 14, color: colors.streak)
                                Text("Showing the session saved on this device.")
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }
                        }
                    }
                } else {
                    SoftCard {
                        Text("Loading today's session…")
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                }

                Spacer().frame(height: 28)
            }
            .padding(.horizontal, 20)
        }
    }

    // ── 1. The hero: greeting, one line, one green button ────────────────────

    @ViewBuilder private func hero(_ home: Home) -> some View {
        TilePanel(tone: .dark) {
            HStack(spacing: 10) {
                // The greeting takes the room it needs and wraps rather than being
                // clipped: a name is the one string here that must never be cut.
                Text(Copy.greetingFor(model.name.isEmpty ? nil : model.name, hour: hourNow))
                    .font(Type.eyebrow.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if !model.online {
                    // Said on the hero rather than in a banner: the one thing that
                    // changes what the buttons do belongs next to the buttons.
                    Badge(text: "Offline", tone: .streak, icon: "clock")
                }
            }

            // The dashboard's rotating opener, over the state it describes.
            RotatingHeadline(
                words: Copy.openers(
                    due: home.due,
                    streak: home.streak,
                    level: home.level,
                    subject: model.me?.subjects.first?.name
                )
            )
            .frame(height: 40, alignment: .leading)
            .padding(.vertical, 2)

            VStack(spacing: 10) {
                PillButton(
                    text: home.due > 0 ? "Start review" : "Get ahead",
                    tone: .good,
                    icon: home.due > 0 ? "review" : "learn",
                    trailing: home.due > 0 ? "\(home.due)" : nil,
                    enabled: home.packCards > 0,
                    large: true
                ) {
                    if home.due > 0 { model.startTodayReview() } else { model.go(.learn) }
                }
                PillButton(text: "Cram instead", tone: .secondary, icon: "cram", large: true) {
                    model.go(.cram)
                }
            }
            .padding(.top, 14)

            // The companion, under a hairline, inside the hero — the way the
            // dashboard puts it: the numbers got you here, this says what they mean.
            if let rank = model.ranked?.ranked.rank {
                Divider().overlay(colors.border).padding(.vertical, 16)
                Companion(
                    rank: rank,
                    line: Copy.companionFor(
                        name: model.name,
                        due: home.due,
                        reviewed: home.reviewedToday,
                        correct: home.correctToday,
                        streak: home.streak,
                        bestStreak: model.me?.gamification.bestStreak ?? home.streak,
                        totalXp: home.totalXp,
                        rankLabel: rank.label,
                        hour: hourNow
                    ).line
                )
            }
        }
    }

    // ── 2. Four numbers ─────────────────────────────────────────────────────

    @ViewBuilder private func numbers(_ home: Home) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            StatTile(icon: "review", label: "Due", value: home.due, tint: home.due > 0 ? colors.good : nil)
            StatTile(icon: "reviewed", label: "Done today", value: home.reviewedToday)
            StatTile(
                icon: "streak",
                label: "Streak",
                value: home.streak,
                suffix: home.streak == 1 ? " day" : " days",
                tint: home.streak > 0 ? colors.streak : nil
            )
            StatTile(icon: "xp", label: "Total XP", value: home.totalXp)
        }
    }

    // ── 4. Four ways in ─────────────────────────────────────────────────────

    private var waysIn: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(Array(actions.enumerated()), id: \.element.title) { index, action in
                Button { model.go(action.destination) } label: {
                    ActionTile(title: action.title, hint: action.hint, icon: action.icon)
                }
                .buttonStyle(PressScaleStyle())
                .entrance(index, scale: true)
            }
        }
    }

    private func subjects(_ home: Home) -> some View {
        SurfaceCard {
            HStack(spacing: 12) {
                Text("Your subjects")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer(minLength: 0)
                Button("Manage") { model.go(.library) }
                    .buttonStyle(.plain)
                    .font(Type.caption.font)
                    .foregroundStyle(colors.foreground)
                    .underline()
            }
            Spacer().frame(height: 12)
            let names = (model.me?.subjects ?? []).map(\.name)
            if names.isEmpty {
                Text("Pick a subject and your queue fills itself.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
            } else {
                ChipRows(items: names, perRow: 3)
            }
            Spacer().frame(height: 14)
            Hairline()
            Spacer().frame(height: 12)
            HStack(alignment: .top, spacing: 24) {
                let best = model.me?.gamification.bestStreak ?? home.streak
                VStack(alignment: .leading, spacing: 2) {
                    Text("Best streak")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                    HStack(spacing: 0) {
                        NumberTicker(value: best, font: Type.strong.font, color: colors.foreground)
                        Text(best == 1 ? " day" : " days")
                            .font(Type.strong.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Accuracy today")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                    Text(
                        home.reviewedToday > 0
                            ? "\(Int((Double(home.correctToday) / Double(home.reviewedToday) * 100).rounded()))%"
                            : "—"
                    )
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var hourNow: Int {
        Calendar.current.component(.hour, from: Date())
    }
}

/// One of the four ways in: an icon, a title, and a four-word hint.
private struct ActionTile: View {
    @Environment(\.revisio) private var colors
    let title: String
    let hint: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Icon(icon, size: 18, color: colors.foreground)
                .frame(width: 36, height: 36)
                .background(colors.secondary, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Text(hint)
                    .font(.system(size: 13))
                    .foregroundStyle(colors.mutedForeground)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(colors.card)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .strokeBorder(colors.border, lineWidth: 1)
        )
    }
}

/// One number, at the size the dashboard gives it.
///
/// Counted rather than printed: the web runs a `NumberTicker` on every stat, so a
/// dashboard that has just loaded counts up to its numbers instead of appearing
/// with them — which is the difference between "here is your day" and "here is a
/// table".
private struct StatTile: View {
    @Environment(\.revisio) private var colors
    let icon: String
    let label: String
    let value: Int
    var suffix: String?
    var tint: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Icon(icon, size: 15, color: tint ?? colors.mutedForeground)
                Text(label)
                    .font(Type.fine.font)
                    .foregroundStyle(tint ?? colors.mutedForeground)
            }
            HStack(alignment: .bottom, spacing: 0) {
                NumberTicker(value: value, font: Type.numSm.font, color: colors.foreground)
                if let suffix {
                    Text(suffix)
                        .font(.system(size: 12))
                        .foregroundStyle(colors.mutedForeground)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(colors.card)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .strokeBorder(colors.border, lineWidth: 1)
        )
    }
}
