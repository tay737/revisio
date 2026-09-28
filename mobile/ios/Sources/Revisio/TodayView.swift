import RevisioEngine
import SwiftUI

/// Today — the loop.
///
/// The screen the app opens on, and the one it can still serve with no network
/// at all: the session it carries is on the device, and everything here is either
/// the stored pack or the last thing the server told us.
///
/// The layout is the website's dashboard: the companion first (a body whose face
/// is your own crest), then one card holding the day's number and the streak
/// badges, then the single green CTA that starts the session. Green appears here
/// and nowhere else on this screen, because it is the one control that earns
/// rather than navigates.
struct TodayView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 20)

                // The greeting, then the companion. No page title: Today is the
                // home, and nobody needs to be told which screen they are on.
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        LabelText(
                            text: model.online ? "Today" : "Offline",
                            token: Type.eyebrow,
                            color: model.online ? colors.mutedForeground : colors.streak
                        )
                        Text(model.name.isEmpty ? "Welcome back" : "Hi, \(model.name)")
                            .font(Type.title.font)
                            .foregroundStyle(colors.foreground)
                    }
                    Spacer(minLength: 0)
                    Avatar(emoji: model.me?.avatarEmoji, size: 44)
                }

                if let home = model.home {
                    Spacer().frame(height: 18)
                    // The dashboard's rotating opener, over the state it describes.
                    RotatingHeadline(
                        words: openers(
                            due: home.due,
                            streak: home.streak,
                            level: home.level,
                            subject: model.me?.subjects.first?.name
                        )
                    )
                    .frame(height: 40, alignment: .leading)
                }

                Spacer().frame(height: 18)

                if let home = model.home {
                    // The companion needs a body, so it only appears once a rank
                    // has been computed — an empty shield would say less than
                    // nothing.
                    if let rank = model.ranked?.ranked.rank {
                        Companion(
                            rank: rank,
                            line: companionLine(home: home, rank: rank),
                            action: model.online ? "See the ladder" : nil,
                            onAction: { model.selectTab(.rank) }
                        )
                        Spacer().frame(height: 20)
                    }

                    SurfaceCard {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                LabelText(text: "Due now", token: Type.eyebrow, color: colors.mutedForeground)
                                Text("\(home.due)")
                                    .font(Type.num.font)
                                    .foregroundStyle(colors.foreground)
                                Text(home.due == 1 ? "card ready" : "cards ready")
                                    .font(Type.caption.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }
                            Spacer(minLength: 0)
                            VStack(alignment: .trailing, spacing: 6) {
                                if home.streak > 0 {
                                    Badge(
                                        text: "\(home.streak) day\(home.streak == 1 ? "" : "s")",
                                        tone: .streak,
                                        icon: "streak"
                                    )
                                }
                                Badge(text: "Level \(home.level)", tone: .quiet, icon: "level")
                            }
                        }

                        Spacer().frame(height: 16)
                        HStack(alignment: .top, spacing: 20) {
                            Stat(label: "XP", value: "\(home.totalXp)")
                            Stat(
                                label: "Today",
                                value: home.reviewedToday > 0 ? "\(home.correctToday)/\(home.reviewedToday)" : "—"
                            )
                            Stat(label: "Streak", value: "\(home.streak)d")
                            Spacer(minLength: 0)
                        }

                        if home.fromCache {
                            Spacer().frame(height: 16)
                            Hairline()
                            Spacer().frame(height: 12)
                            HStack(spacing: 8) {
                                Icon("clock", size: 14, color: colors.streak)
                                Text("Showing the session saved on this device.")
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }
                        }
                    }

                    Spacer().frame(height: 16)
                    // The green CTA. It carries the due count inside the pill,
                    // the way the dashboard's does, so starting a session answers
                    // "how much is left" in the same glance.
                    PillButton(
                        text: home.packCards > 0 ? "Start review" : "Connect once to download cards",
                        tone: home.packCards > 0 ? .good : .secondary,
                        icon: home.packCards > 0 ? "review" : "download",
                        trailing: home.packCards > 0 ? "\(home.due)" : nil,
                        enabled: home.packCards > 0,
                        large: true
                    ) {
                        model.startTodayReview()
                    }
                    Spacer().frame(height: 10)
                    PillButton(text: "Cram instead", tone: .secondary, icon: "cram", large: true) {
                        model.selectTab(.cram)
                    }

                    if model.pending > 0 {
                        Spacer().frame(height: 16)
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
                                Button {
                                    model.refreshHome()
                                } label: {
                                    Text("Sync now")
                                        .font(Type.captionS.font)
                                        .foregroundStyle(colors.foreground)
                                }
                                .buttonStyle(.plain)
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
                SectionTitle(text: "Elsewhere")
                VStack(spacing: 10) {
                    ShortcutRow(
                        label: "Read notes",
                        icon: "learn",
                        hint: "The prose behind the cards",
                        tab: .learn,
                        model: model
                    )
                    ShortcutRow(
                        label: "Cram",
                        icon: "cram",
                        hint: "Sprint before an exam",
                        tab: .cram,
                        model: model
                    )
                    ShortcutRow(
                        label: "Your rank",
                        icon: "rank",
                        hint: "Ladder and weekly lobby",
                        tab: .rank,
                        model: model
                    )
                    ShortcutRow(
                        label: "Profile",
                        icon: "person",
                        hint: "You and your settings",
                        tab: .you,
                        model: model
                    )
                }

                Spacer().frame(height: 16)
                PillButton(text: "Refresh", tone: .ghost, icon: "rotate") {
                    model.refreshHome()
                }
                Spacer().frame(height: 28)
            }
            .padding(.horizontal, 20)
        }
    }
}

/// A quiet destination row: an icon, a label and its four-word hint.
private struct ShortcutRow: View {
    @Environment(\.revisio) private var colors
    let label: String
    let icon: String
    let hint: String
    let tab: Tab
    @ObservedObject var model: AppModel

    var body: some View {
        Button {
            model.selectTab(tab)
        } label: {
            SurfaceCard {
                HStack(spacing: 14) {
                    Icon(icon, size: 18, color: colors.foreground)
                        .frame(width: 38, height: 38)
                        .background(colors.secondary, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label)
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        Text(hint)
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    Icon("expand", size: 16, color: colors.mutedForeground)
                }
            }
        }
        .buttonStyle(PressScaleStyle())
    }
}

/// The companion's line.
///
/// The website decides this server-side (`companionFor`, so the shell, the
/// account sheet and the dashboard cannot read the same numbers three ways).
/// Where the server has not sent one, this says something true from the numbers
/// it did send rather than inventing a personality.
private func companionLine(home: Home, rank: Rank) -> String {
    let remaining = rank.remaining
    if home.due == 0 && home.reviewedToday > 0 { return "All clear for today. Nice." }
    if home.due == 0 { return "Nothing due. Come back when the cards are." }
    if remaining > 0 && home.reviewedToday > 0 {
        return "\(home.reviewedToday) done today — \(remaining) XP to the next division."
    }
    if home.streak > 6 { return "\(home.streak) days running. Don't break it now." }
    return "\(home.due) due. Starting is the hard part."
}
