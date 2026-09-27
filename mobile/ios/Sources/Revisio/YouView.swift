import SwiftUI
import RevisioEngine

private let avatarColors = ["ink", "moss", "bee", "dawn", "sky"]

/// You — the account.
///
/// Identity, the six privacy switches and the preferences. Privacy is not decided
/// here: `/profile/:handle` applies it server-side, so a hidden field is absent
/// from the payload rather than hidden by this screen. The switches only write the
/// setting; they never filter anything.
struct YouView: View {
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
                Spacer().frame(height: 8)
                Text("You").font(.title).bold()
                Spacer().frame(height: 12)

                if let me = model.me {
                    Panel {
                        HStack(spacing: 14) {
                            Avatar(emoji: emoji.isEmpty ? me.avatarEmoji : emoji, size: 48)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(me.name.isEmpty ? "No name" : me.name)
                                    .font(.system(size: 16, weight: .semibold))
                                Text(me.email).font(.caption).foregroundColor(muted)
                            }
                            Spacer()
                            Chip(text: me.role)
                        }
                        Text("\(me.gamification.totalXp ?? 0) XP · level \(me.gamification.level ?? 0) · \(me.achievements.count) achievements")
                            .font(.caption).foregroundColor(muted).padding(.top, 8)
                    }

                    SectionTitle(text: "Profile").padding(.top, 16)
                    field("Display name", text: $name)
                    field("Username", text: $username)
                    Text("3–20 characters: letters, numbers, hyphens or underscores.")
                        .font(.caption2).foregroundColor(muted)
                    field("Nickname", text: $nickname)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Bio").font(.caption).foregroundColor(muted)
                        TextEditor(text: $bio)
                            .frame(height: 70)
                            .padding(4)
                            .background(surface2)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .padding(.top, 8)

                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Emoji").font(.caption).foregroundColor(muted)
                            TextField("🙂", text: $emoji)
                                .revisioTextInput()
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 90)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Colour").font(.caption).foregroundColor(muted)
                            HStack(spacing: 6) {
                                ForEach(avatarColors, id: \.self) { option in
                                    if option == color {
                                        Chip(text: option, tint: accent)
                                    } else {
                                        Button(option) { color = option }
                                            .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(muted)
                                    }
                                }
                            }
                        }
                        Spacer()
                    }
                    .padding(.top, 10)

                    Button {
                        model.saveProfile(name: name, username: username, nickname: nickname, bio: bio, emoji: emoji, color: color)
                    } label: {
                        Text("Save profile").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(accent)
                    .disabled(model.busy)
                    .padding(.top, 12)

                    SectionTitle(text: "What your profile shows").padding(.top, 20)
                    Text("Hidden fields are removed by the server before your page is ever sent, so this is a real boundary rather than a filter.")
                        .font(.caption2).foregroundColor(muted)
                    toggle("Display name", me.profileVisibility.name) { set(me.profileVisibility, name: $0) }
                    toggle("Nickname", me.profileVisibility.nickname) { set(me.profileVisibility, nickname: $0) }
                    toggle("Bio", me.profileVisibility.bio) { set(me.profileVisibility, bio: $0) }
                    toggle("Subjects", me.profileVisibility.subjects) { set(me.profileVisibility, subjects: $0) }
                    toggle("Rank, XP and streak", me.profileVisibility.stats) { set(me.profileVisibility, stats: $0) }
                    toggle("Achievements", me.profileVisibility.achievements) { set(me.profileVisibility, achievements: $0) }

                    SectionTitle(text: "Study").padding(.top, 20)
                    toggle("Show me on leaderboards", !me.leaderboardOptOut) { model.setLeaderboardOptOut(!$0) }
                    HStack {
                        Text("Notes density").font(.system(size: 14))
                        Spacer()
                        DensityToggle(density: me.prefs?.noteDensity ?? model.density) { model.setNoteDensity($0) }
                    }
                    .padding(.top, 6)

                    if !me.subjects.isEmpty {
                        SectionTitle(text: "Following").padding(.top, 20)
                        HStack(spacing: 6) {
                            ForEach(me.subjects.prefix(6)) { subject in Chip(text: subject.name) }
                        }
                        .padding(.top, 6)
                    }

                    Button("Sign out") { model.signOut() }
                        .font(.caption).buttonStyle(.plain).foregroundColor(muted)
                        .padding(.top, 22)
                } else {
                    EmptyNote(text: model.online
                        ? "Loading your account…"
                        : "Your account details need a connection. Today's review still works offline.")
                }

                Spacer().frame(height: 20)
            }
            .padding(20)
        }
        .onAppear(perform: seed)
        .onChange(of: model.me?.username, perform: { _ in seed() })
    }

    /// Reseed the draft when the stored value changes, so a save or a fresh load
    /// is reflected rather than being overwritten by a stale draft.
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
    private func field(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundColor(muted)
            TextField(label, text: text).revisioTextInput().textFieldStyle(.roundedBorder)
        }
        .padding(.top, 8)
    }

    @ViewBuilder
    private func toggle(_ label: String, _ value: Bool, _ onChange: @escaping (Bool) -> Void) -> some View {
        Toggle(label, isOn: Binding(get: { value }, set: { onChange($0) }))
            .font(.system(size: 14))
            .padding(.vertical, 2)
    }
}
