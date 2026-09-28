import RevisioEngine
import SwiftUI

private let avatarColors = ["ink", "moss", "bee", "dawn", "sky"]

/// You — the account.
///
/// Identity, the six privacy switches and the preferences. Privacy is not decided
/// here: `/profile/:handle` applies it server-side, so a hidden field is absent
/// from the payload rather than hidden by this screen. The switches only write the
/// setting; they never filter anything.
///
/// The header shows the learner their own crest and rank, because the account page
/// is where "who am I here" should be answered at a glance.
struct YouView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    @State private var name = ""
    @State private var username = ""
    @State private var nickname = ""
    @State private var bio = ""
    @State private var emoji = ""
    @State private var color = "ink"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 20)
                ScreenTitle(title: "You", eyebrow: "Account")
                Spacer().frame(height: 20)

                if let me = model.me {
                    accountCard(me)
                    profile(me)
                    privacy(me)
                    study(me)

                    if !me.subjects.isEmpty {
                        Spacer().frame(height: 28)
                        SectionTitle(text: "Following")
                        HStack(spacing: 8) {
                            ForEach(me.subjects.prefix(6)) { subject in
                                ChipPill(text: subject.name)
                            }
                        }
                    }

                    Spacer().frame(height: 28)
                    PillButton(text: "Sign out", tone: .ghost, icon: "signOut") { model.signOut() }
                    Spacer().frame(height: 28)
                } else {
                    SoftCard {
                        HStack(spacing: 10) {
                            Icon("person", size: 16, color: colors.mutedForeground)
                            Text(
                                model.online
                                    ? "Loading your account…"
                                    : "Your account details need a connection. Today's review still works offline."
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
        .onAppear(perform: seed)
        .onChange(of: model.me?.username, perform: { _ in seed() })
    }

    // ── the account card ────────────────────────────────────────────────────

    private func accountCard(_ me: MeDetail) -> some View {
        SurfaceCard {
            HStack(spacing: 16) {
                if let rank = model.ranked?.ranked.rank {
                    RankCrest(rank: rank, size: 54, showProgress: false)
                } else {
                    Avatar(emoji: emoji.isEmpty ? me.avatarEmoji : emoji, size: 54)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(me.name.isEmpty ? "No name" : me.name)
                        .font(Type.strong.font)
                        .foregroundStyle(colors.foreground)
                    Text(me.email)
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
                Spacer(minLength: 0)
                ChipPill(text: me.role)
            }
            Spacer().frame(height: 14)
            Hairline()
            Spacer().frame(height: 14)
            HStack(alignment: .top, spacing: 20) {
                Stat(label: "XP", value: "\(me.gamification.totalXp ?? 0)")
                Stat(label: "Level", value: "\(me.gamification.level ?? 0)")
                Stat(label: "Streak", value: "\(me.gamification.streak ?? 0)d")
                Stat(label: "Badges", value: "\(me.achievements.count)")
                Spacer(minLength: 0)
            }
        }
    }

    // ── profile ─────────────────────────────────────────────────────────────

    private func profile(_ me: MeDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 24)
            SectionTitle(text: "Profile")

            labelled("Display name") {
                Field(placeholder: "Your name", value: $name)
            }
            Spacer().frame(height: 14)
            labelled("Username") {
                Field(placeholder: "your-handle", value: $username)
            }
            Spacer().frame(height: 6)
            Text("3–20 characters: letters, numbers, hyphens or underscores.")
                .font(Type.micro.font)
                .foregroundStyle(colors.mutedForeground)
            Spacer().frame(height: 14)
            labelled("Nickname") {
                Field(placeholder: "What we call you", value: $nickname)
            }
            Spacer().frame(height: 14)
            labelled("Bio") {
                BioField(placeholder: "A line about you", value: $bio)
            }

            Spacer().frame(height: 16)
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    LabelText(text: "Avatar", token: Type.eyebrow, color: colors.mutedForeground)
                    Spacer().frame(height: 6)
                    Avatar(emoji: emoji.isEmpty ? me.avatarEmoji : emoji, size: 44)
                }
                VStack(alignment: .leading, spacing: 0) {
                    LabelText(text: "Colour", token: Type.eyebrow, color: colors.mutedForeground)
                    Spacer().frame(height: 6)
                    HStack(spacing: 6) {
                        ForEach(avatarColors, id: \.self) { option in
                            Button {
                                color = option
                            } label: {
                                ChipPill(text: option, active: option == color)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Spacer(minLength: 0)
            }

            Spacer().frame(height: 18)
            PillButton(text: "Save profile", enabled: !model.busy, large: true) {
                model.saveProfile(
                    name: name,
                    username: username,
                    nickname: nickname,
                    bio: bio,
                    emoji: emoji,
                    color: color
                )
            }
        }
    }

    // ── privacy ─────────────────────────────────────────────────────────────

    private func privacy(_ me: MeDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 28)
            SectionTitle(text: "What your profile shows")
            Text("Hidden fields are removed by the server before your page is ever sent, so this is a real boundary rather than a filter.")
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 12)

            let visibility = me.profileVisibility
            SurfaceCard {
                SwitchRow(label: "Display name", checked: visibility.name) { on in
                    set(visibility, name: on)
                }
                SwitchRow(label: "Nickname", checked: visibility.nickname) { on in
                    set(visibility, nickname: on)
                }
                SwitchRow(label: "Bio", checked: visibility.bio) { on in
                    set(visibility, bio: on)
                }
                SwitchRow(label: "Subjects", checked: visibility.subjects) { on in
                    set(visibility, subjects: on)
                }
                SwitchRow(label: "Rank, XP and streak", checked: visibility.stats) { on in
                    set(visibility, stats: on)
                }
                SwitchRow(label: "Achievements", checked: visibility.achievements, last: true) { on in
                    set(visibility, achievements: on)
                }
            }
        }
    }

    // ── study ───────────────────────────────────────────────────────────────

    private func study(_ me: MeDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 28)
            SectionTitle(text: "Study")
            SurfaceCard {
                SwitchRow(label: "Show me on leaderboards", checked: !me.leaderboardOptOut, last: true) { on in
                    model.setLeaderboardOptOut(!on)
                }
                Spacer().frame(height: 10)
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Notes density")
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        Text((me.prefs?.noteDensity ?? model.density) == "summary" ? "Just the summary" : "Full prose")
                            .font(Type.fine.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    Segmented(
                        options: [("detailed", "Full"), ("summary", "Brief")],
                        selected: me.prefs?.noteDensity ?? model.density,
                        onSelect: { model.setNoteDensity($0) }
                    )
                }
            }
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /// Reseed the draft when the stored value changes, so a save or a fresh load is
    /// reflected rather than being overwritten by a stale draft.
    private func seed() {
        guard let me = model.me else { return }
        name = me.name
        username = me.username ?? ""
        nickname = me.nickname ?? ""
        bio = me.bio ?? ""
        emoji = me.avatarEmoji ?? ""
        color = me.avatarColor
    }

    private func set(
        _ base: RevisioEngine.Visibility,
        name: Bool? = nil,
        nickname: Bool? = nil,
        bio: Bool? = nil,
        subjects: Bool? = nil,
        stats: Bool? = nil,
        achievements: Bool? = nil
    ) {
        model.setVisibility(RevisioEngine.Visibility(
            name: name ?? base.name,
            nickname: nickname ?? base.nickname,
            bio: bio ?? base.bio,
            subjects: subjects ?? base.subjects,
            stats: stats ?? base.stats,
            achievements: achievements ?? base.achievements
        ))
    }

    @ViewBuilder
    private func labelled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: label, token: Type.eyebrow, color: colors.mutedForeground)
            Spacer().frame(height: 6)
            content()
        }
    }
}

/// A switch row.
///
/// The rows inside one card are separated by hairlines rather than by gaps, which
/// is how the website reads a settings list: one surface, many settings.
private struct SwitchRow: View {
    @Environment(\.revisio) private var colors
    let label: String
    let checked: Bool
    var last: Bool = false
    let onChange: (Bool) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(label)
                    .font(Type.caption.font)
                    .foregroundStyle(colors.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Toggle("", isOn: Binding(get: { checked }, set: onChange))
                    .labelsHidden()
                    .tint(colors.foreground)
            }
            .padding(.vertical, 8)
            if !last { Hairline() }
        }
    }
}

/// The one multi-line field, in the same 2px-stroke language as the single-line
/// one, because a bio is prose and a prose field that looks like a code box is a
/// different control pretending to be the same one.
private struct BioField: View {
    @Environment(\.revisio) private var colors
    let placeholder: String
    @Binding var value: String

    var body: some View {
        TextEditor(text: $value)
            .font(Type.body.font)
            .foregroundStyle(colors.foreground)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 88)
            .padding(10)
            .background(colors.card, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                    .strokeBorder(colors.border, lineWidth: Metrics.inputBorder)
            }
            .overlay(alignment: .topLeading) {
                if value.isEmpty {
                    Text(placeholder)
                        .font(Type.body.font)
                        .foregroundColor(colors.mutedForeground.opacity(0.75))
                        .padding(.horizontal, 15)
                        .padding(.vertical, 18)
                        .allowsHitTesting(false)
                }
            }
    }
}
