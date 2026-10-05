import RevisioEngine
import PhotosUI
import SwiftUI

/// `AVATAR_COLORS` — the five the website offers, in its order.
private let avatarColors = ["ink", "moss", "bee", "dawn", "sky"]

/// `AVATAR_EMOJI` — ditto. An uploaded picture replaces whichever is chosen.
private let avatarEmoji = ["🦉", "🧠", "📚", "⚡", "🌟", "🦊", "🐢", "🌙", "🎯", "🧪"]

/// `VISIBILITY_ROWS` — key, label and hint, in the web's order.
private let visibilityRows: [(key: String, label: String, hint: String)] = [
    ("name", "Full name", "Your real name, as registered."),
    ("nickname", "Display name", "The name your profile leads with."),
    ("bio", "About me", "Your short introduction."),
    ("pronouns", "Pronouns", "The words you want to be referred to by."),
    ("subjects", "Subjects", "What you are studying."),
    ("stats", "XP and rank", "Your level, XP, streak and review count."),
    ("achievements", "Achievements", "The badges you have earned."),
]

/// Settings — one page, five questions, exactly as `src/app/(app)/settings/page.tsx`
/// asks them:
///
///   • Who you are on the outside (Profile)
///   • Who may see it (Privacy)
///   • Where we reach you (Account — email)
///   • What guards the door (Security — password, 2FA)
///   • How the app behaves (Preferences)
///
/// The shape matters as much as the contents. Settings is the screen where a
/// phone port most often stops being a port: one flat list of switches is easier
/// to write than five surfaces that each own their own confirmation, and it is
/// wrong for the same reason it would be wrong on the website — a save in Profile
/// must never answer for a save in Privacy.
///
/// So the five sections are the web's five sections, each one a card, with the
/// account's notice at the top where the web puts it, and the same copy under the
/// same field. Where the web enforces something before the request (the username
/// rule, the password match) this does too, from the generated rules in
/// `AccountRules.swift` rather than from a second opinion.
struct SettingsView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    @State private var name = ""
    @State private var username = ""
    @State private var nickname = ""
    @State private var bio = ""
    @State private var pronouns = ""
    @State private var emoji: String?
    @State private var color = "ink"

    @State private var newEmail = ""
    @State private var emailPassword = ""
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 12)
                ScreenTitle(title: "Settings", eyebrow: "Account")
                Spacer().frame(height: 4)
                Text("Your profile, account and how the app behaves.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)

                Spacer().frame(height: 18)

                // The page's own notice, in the web's two tones and in the web's
                // place: above everything, so a section that answered can be seen
                // answering.
                if let note = model.settingsNote, let error = model.settingsError {
                    VStack(alignment: .leading, spacing: 10) {
                        NoticeView(text: note, good: true) { model.dismissSettingsNotice() }
                        NoticeView(text: error, good: false) { model.dismissSettingsNotice() }
                    }
                    Spacer().frame(height: 16)
                } else if let note = model.settingsNote {
                    NoticeView(text: note, good: true) { model.dismissSettingsNotice() }
                    Spacer().frame(height: 16)
                } else if let error = model.settingsError {
                    NoticeView(text: error, good: false) { model.dismissSettingsNotice() }
                    Spacer().frame(height: 16)
                }

                if let me = model.me {
                    identity(me)
                    profile(me)
                    media(me)
                    privacy(me)
                    account(me)
                    security(me)
                    preferences(me)

                    Spacer().frame(height: 28)
                    PillButton(text: "Sign out", tone: .ghost, icon: "signOut") { model.signOut() }
                    Spacer().frame(height: 28)
                } else {
                    unloaded
                }
            }
            .padding(20)
        }
        .onAppear(perform: seed)
        .onChange(of: model.me?.username, perform: { _ in seed() })
        .onChange(of: model.me?.name, perform: { _ in seed() })
    }

    // ── the three ways this page can be empty ───────────────────────────────

    /// A page whose only other state is a spinner cannot tell "this failed, try
    /// again" from "this is still coming", and that ambiguity is what made this
    /// screen read as stuck: it kept saying Loading while nothing was on its way.
    @ViewBuilder
    private var unloaded: some View {
        let error = model.meError
        SoftCard {
            HStack(spacing: 10) {
                Icon("person", size: 16, color: colors.mutedForeground)
                // Offline is checked before the error, because "we could not reach
                // the server" is what `meError` says when the network is off —
                // true, but less useful than the specific thing this screen cannot
                // do. Which message won used to depend on the order the two arrived
                // in, and that made the same device say two different things about
                // itself.
                Text(
                    model.meLoading
                        ? "Loading your account…"
                        : (!model.online
                            ? "Your account details need a connection. Today's review still works offline."
                            : (error ?? "Your account details are not loaded yet."))
                )
                .font(Type.caption.font)
                .foregroundStyle(error == nil || !model.online ? colors.mutedForeground : colors.foreground)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        Spacer().frame(height: 14)
        PillButton(
            text: model.online ? "Try again" : "Sign in again",
            tone: .secondary,
            enabled: !model.busy,
            action: { model.online ? model.loadMe() : model.signOut() }
        )
    }

    // ── who you are ─────────────────────────────────────────────────────────

    /// Who you are, at a glance — the crest you are building and the numbers
    /// behind it. The website answers this on the Profile page; on a phone this is
    /// the account slot in the bar, the one tap that should say "this is you".
    private func identity(_ me: MeDetail) -> some View {
        SurfaceCard {
            HStack(spacing: 16) {
                if let rank = model.ranked?.ranked.rank {
                    RankCrest(rank: rank, size: 58, showProgress: false)
                } else {
                    Avatar(emoji: me.avatarEmoji, size: 58, color: me.avatarColor, name: me.name, imageUrl: me.avatarUrl)
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
                Badge(text: me.role.capitalized)
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
        .entrance(scale: true)
    }

    // ── Profile ─────────────────────────────────────────────────────────────

    /// Pictures — the uploaded avatar and banner, plus the banner's wash colour.
    ///
    /// The web keeps uploads inside the Profile card; on a phone the photo
    /// picker needs somewhere to explain itself, so it is its own card with the
    /// same copy. Uploads confirm and save themselves (presign → PUT →
    /// confirm, the web's own dance), so nothing here participates in the
    /// profile's dirty check.
    private func media(_ me: MeDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Pictures")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 4)
                Text("Up to 5 MB. An uploaded picture replaces the symbol; the banner image covers the wash.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer().frame(height: 16)
                // The banner preview — what a visitor sees behind the identity.
                ProfileBanner(imageUrl: me.bannerUrl, color: me.bannerColor ?? "dusk", height: 96)

                Spacer().frame(height: 14)
                LabelText(text: "Banner colour", token: Type.eyebrow, color: colors.mutedForeground)
                Spacer().frame(height: 6)
                // The web's BANNER_WASH names, in its order. The web marks the
                // choice with a ring; the same treatment, the same order.
                HStack(spacing: 4) {
                    ForEach(BANNER_COLORS, id: \.self) { option in
                        Button {
                            model.saveBannerColor(option)
                        } label: {
                            ProfileBanner(imageUrl: nil, color: option, height: 28)
                                .frame(width: 44)
                                .padding(2)
                                .overlay {
                                    RoundedRectangle(cornerRadius: Radius.lg)
                                        .strokeBorder(
                                            option == (me.bannerColor ?? "dusk") ? colors.foreground : .clear,
                                            lineWidth: 2
                                        )
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Spacer().frame(height: 16)
                PhotoPickerButton(
                    model: model,
                    kind: "avatar",
                    label: me.avatarUrl == nil ? "Upload avatar" : "Replace avatar"
                )
                if me.avatarUrl != nil {
                    Spacer().frame(height: 8)
                    PillButton(text: "Remove avatar", tone: .ghost, enabled: !model.savingProfile) {
                        model.removeImage(kind: "avatar")
                    }
                }
                Spacer().frame(height: 12)
                PhotoPickerButton(
                    model: model,
                    kind: "banner",
                    label: me.bannerUrl == nil ? "Upload banner" : "Replace banner"
                )
                if me.bannerUrl != nil {
                    Spacer().frame(height: 8)
                    PillButton(text: "Remove banner", tone: .ghost, enabled: !model.savingProfile) {
                        model.removeImage(kind: "banner")
                    }
                }
                if model.savingProfile {
                    Spacer().frame(height: 10)
                    Text("Working…")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                }
            }
            .entrance(2)
        }
    }

    private func profile(_ me: MeDetail) -> some View {
        let handle = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let problem = usernameProblem(username)
        // avatarUrl and bannerUrl are deliberately absent from `dirty`: uploads
        // confirm and save themselves, so "Unsaved changes" never lies about them.
        let dirty = name != me.name
            || nickname != (me.nickname ?? "")
            || username != (me.username ?? "")
            || bio != (me.bio ?? "")
            || pronouns != (me.pronouns ?? "")
            || emoji != me.avatarEmoji
            || color != me.avatarColor

        return VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Profile")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 4)
                Text(
                    handle.isEmpty
                        ? "How you appear on your public profile — pick a username to get an address."
                        : "How you appear on your public profile /u/\(handle)."
                )
                .font(Type.caption.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)

                Spacer().frame(height: 16)
                HStack(alignment: .top, spacing: 14) {
                    Avatar(emoji: emoji, size: 64, color: color, name: name)
                    VStack(alignment: .leading, spacing: 0) {
                        LabelText(text: "Colour", token: Type.eyebrow, color: colors.mutedForeground)
                        Spacer().frame(height: 6)
                        HStack(spacing: 4) {
                            ForEach(avatarColors, id: \.self) { option in
                                // The web marks the choice with a 2px ring rather
                                // than a tick: the swatch is the answer, so a tick
                                // would cover it.
                                Button {
                                    color = option
                                } label: {
                                    Avatar(emoji: "Aa", size: 28, color: option)
                                        .padding(2)
                                        .overlay {
                                            Circle().strokeBorder(
                                                option == color ? colors.foreground : .clear,
                                                lineWidth: 2
                                            )
                                        }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }

                Spacer().frame(height: 14)
                LabelText(text: "Symbol", token: Type.eyebrow, color: colors.mutedForeground)
                Spacer().frame(height: 6)
                // `flex-wrap` on the web: the Initials chip and ten symbols do not
                // fit on one phone row, so they wrap in the same order, six a row.
                SymbolPicker(selected: $emoji)
                Spacer().frame(height: 6)
                Text("An uploaded picture replaces the symbol.")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)

                Spacer().frame(height: 18)
                SettingsField(label: "Full name", placeholder: "Your name", value: $name)
                Spacer().frame(height: 14)
                SettingsField(
                    label: "Display name",
                    placeholder: "Optional",
                    value: $nickname,
                    hint: "Shown on your profile instead of your full name."
                )
                Spacer().frame(height: 14)
                SettingsField(
                    label: "Username",
                    placeholder: "Optional",
                    value: Binding(
                        get: { username },
                        set: { username = $0.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" } }
                    ),
                    hint: problem ?? (handle.isEmpty ? "Optional — letters, numbers, hyphens." : "Your profile: /u/\(handle)"),
                    bad: problem != nil
                )
                Spacer().frame(height: 14)
                SettingsField(
                    label: "About me",
                    placeholder: "Optional",
                    value: Binding(get: { bio }, set: { bio = String($0.prefix(240)) }),
                    hint: "A line or two, up to 240 characters.",
                    lines: 3
                )
                Spacer().frame(height: 14)
                // Pronouns are a free-text field with a shortlist attached, not a
                // list of fixed choices. The chips sit above the field (which
                // brings its own label, so the word appears once) and tapping the
                // selected one clears it — a shortlist you can only add to would
                // make "ask me" impossible to choose.
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 92), spacing: 6)],
                    alignment: .leading,
                    spacing: 6
                ) {
                    ForEach(pronounSuggestions, id: \.self) { option in
                        ChipPill(text: option, active: pronouns.trimmedLower == option) {
                            pronouns = pronouns.trimmedLower == option ? "" : option
                        }
                    }
                }
                Spacer().frame(height: 8)
                SettingsField(
                    label: "Pronouns",
                    placeholder: "Optional — anything you want to be called by",
                    value: Binding(get: { pronouns }, set: { pronouns = String($0.prefix(pronounMax)) })
                )
                Spacer().frame(height: 4)
                // The two answers this field can give: what it will be called,
                // and whether anyone but the owner will see it. The second is a
                // switch in Privacy below, so it is stated here rather than left
                // to be discovered on a shared link.
                Text(
                    me.profileVisibility.pronouns
                        ? "Shown on your public profile beside your name."
                        : "Private for now — visitors will not see it. Switch Pronouns on under Privacy below."
                )
                .font(Type.fine.font)
                .foregroundStyle(colors.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)

                Spacer().frame(height: 18)
                HStack(spacing: 12) {
                    // The web disables Save until something actually changed *and*
                    // the handle is legal, then says why — it never offers a button
                    // that would be refused.
                    PillButton(
                        text: model.savingProfile ? "Saving…" : "Save profile",
                        icon: "checked",
                        enabled: dirty && problem == nil && !model.savingProfile,
                        large: true
                    ) {
                        model.saveProfile(name: name, username: username, nickname: nickname, bio: bio, pronouns: pronouns, emoji: emoji ?? "", color: color)
                    }
                    if dirty, problem == nil {
                        Text("Unsaved changes")
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                    }
                }
            }
        }
        .entrance(1)
    }

    // ── Privacy ─────────────────────────────────────────────────────────────

    private func privacy(_ me: MeDetail) -> some View {
        let visibility = me.profileVisibility
        return VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Privacy")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 4)
                Text("Choose what someone visiting your profile can see. You always see everything.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer().frame(height: 4)

                ForEach(Array(visibilityRows.enumerated()), id: \.element.key) { index, row in
                    if index > 0 { Hairline() }
                    SettingsSwitchRow(
                        label: row.label,
                        hint: row.hint,
                        checked: visibility.flag(row.key),
                        last: index == visibilityRows.count - 1
                    ) { next in
                        model.setVisibility(visibility.withFlag(row.key, next))
                    }
                }

                Spacer().frame(height: 10)
                Text("Your email is never shown to anyone. Leaderboard visibility is a separate switch in Preferences.")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .entrance(2)
    }

    // ── Account ─────────────────────────────────────────────────────────────

    private func account(_ me: MeDetail) -> some View {
        let canSend = !newEmail.trimmingCharacters(in: .whitespaces).isEmpty
            && !emailPassword.isEmpty
            && !model.savingEmail

        return VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Account")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 4)
                Text("Signed in as \(me.email)\(me.status != "active" ? " — email not verified yet." : ".")")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer().frame(height: 16)
                SettingsField(
                    label: "New email",
                    placeholder: "you@school.example",
                    value: $newEmail,
                    hint: "We email a confirmation link; the change happens when you click it.",
                    keyboard: .emailAddress
                )
                Spacer().frame(height: 14)
                SettingsField(
                    label: "Current password",
                    placeholder: "Proof it is you",
                    value: $emailPassword,
                    secure: true
                )

                Spacer().frame(height: 18)
                PillButton(
                    text: model.savingEmail ? "Sending…" : "Send confirmation email",
                    tone: .secondary,
                    icon: "mail",
                    enabled: canSend,
                    large: true
                ) {
                    model.requestEmailChange(password: emailPassword, newEmail: newEmail)
                }
            }
        }
        .entrance(3)
    }

    // ── Security ────────────────────────────────────────────────────────────

    private func security(_ me: MeDetail) -> some View {
        // The web's own three conditions, so Change is never offered for a
        // password the server would refuse.
        let canChange = !currentPassword.isEmpty
            && newPassword.count >= 8
            && newPassword == confirmPassword
            && !model.savingPassword
        let mismatch = !confirmPassword.isEmpty && confirmPassword != newPassword

        return VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Security")
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        // A stated path beats a dead chip: enrolment is a web
                        // flow for now, so the row says where instead of
                        // pretending to be a control.
                        Text(
                            me.totpEnabled
                                ? "Two-factor is on. Manage it on the web — enrolment needs a QR scan."
                                : "Two-factor is off. Enrol on the web, in Settings → Security."
                        )
                        .font(Type.caption.font)
                        .foregroundStyle(colors.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    ChipPill(text: me.totpEnabled ? "2FA on" : "2FA off", active: me.totpEnabled, icon: "secure")
                }

                Spacer().frame(height: 16)
                SettingsField(label: "Current password", value: $currentPassword, secure: true)
                Spacer().frame(height: 14)
                SettingsField(
                    label: "New password",
                    value: $newPassword,
                    hint: "At least 8 characters.",
                    secure: true
                )
                Spacer().frame(height: 14)
                SettingsField(
                    label: "Repeat new password",
                    value: $confirmPassword,
                    hint: mismatch ? "The two new passwords do not match." : nil,
                    bad: mismatch,
                    secure: true,
                    submitLabel: .done
                )

                Spacer().frame(height: 18)
                PillButton(
                    text: model.savingPassword ? "Changing…" : "Change password",
                    icon: "secure",
                    enabled: canChange,
                    large: true
                ) {
                    model.changePassword(current: currentPassword, next: newPassword, confirm: confirmPassword)
                }
                Spacer().frame(height: 8)
                Text("Changing your password signs out every other device.")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
            }
        }
        .entrance(4)
    }

    // ── Preferences ─────────────────────────────────────────────────────────

    private func preferences(_ me: MeDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 20)
            SurfaceCard {
                Text("Preferences")
                    .font(Type.strong.font)
                    .foregroundStyle(colors.foreground)
                Spacer().frame(height: 10)

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Note density")
                            .font(Type.captionS.font)
                            .foregroundStyle(colors.foreground)
                        Text("Full notes while learning, or the short version.")
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Segmented(
                        options: [("detailed", "Detailed"), ("summary", "Summary")],
                        selected: me.prefs?.noteDensity ?? "detailed",
                        onSelect: { model.setNoteDensity($0) }
                    )
                }
                Spacer().frame(height: 12)
                Hairline()

                SettingsSwitchRow(
                    label: "Reduce motion",
                    hint: "Calmer animations throughout the app.",
                    checked: me.prefs?.reducedMotion ?? false
                ) { model.setReducedMotion($0) }

                SettingsSwitchRow(
                    label: "Show me on leaderboards",
                    hint: "Your rank is unaffected either way.",
                    checked: !me.leaderboardOptOut,
                    last: true
                ) { model.setLeaderboardOptOut(!$0) }
            }
        }
        .entrance(5)
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /// Reseed the draft when the stored value changes, so a save or a fresh load is
    /// reflected rather than being overwritten by a stale draft. The web gets the
    /// same effect by remounting the body whenever `me` arrives.
    private func seed() {
        guard let me = model.me else { return }
        name = me.name
        username = me.username ?? ""
        nickname = me.nickname ?? ""
        bio = me.bio ?? ""
        pronouns = me.pronouns ?? ""
        emoji = me.avatarEmoji
        color = me.avatarColor
    }
}

// ── the pieces a settings list is built from ────────────────────────────────

/// The typed value as the shortlist spells it, so a chip is active whether the
/// learner tapped it or typed it. Case is folded here *only* for the chip
/// comparison — what gets stored is what they typed, untouched.
private extension String {
    var trimmedLower: String { trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
}

/// `Visibility` has seven named flags; the row list addresses them by key.
private extension RevisioEngine.Visibility {
    func flag(_ key: String) -> Bool {
        switch key {
        case "name": return name
        case "nickname": return nickname
        case "bio": return bio
        case "pronouns": return pronouns
        case "subjects": return subjects
        case "stats": return stats
        default: return achievements
        }
    }

    func withFlag(_ key: String, _ value: Bool) -> RevisioEngine.Visibility {
        switch key {
        case "name": return RevisioEngine.Visibility(name: value, nickname: nickname, bio: bio, pronouns: pronouns, subjects: subjects, stats: stats, achievements: achievements)
        case "nickname": return RevisioEngine.Visibility(name: name, nickname: value, bio: bio, pronouns: pronouns, subjects: subjects, stats: stats, achievements: achievements)
        case "bio": return RevisioEngine.Visibility(name: name, nickname: nickname, bio: value, pronouns: pronouns, subjects: subjects, stats: stats, achievements: achievements)
        case "pronouns": return RevisioEngine.Visibility(name: name, nickname: nickname, bio: bio, pronouns: value, subjects: subjects, stats: stats, achievements: achievements)
        case "subjects": return RevisioEngine.Visibility(name: name, nickname: nickname, bio: bio, pronouns: pronouns, subjects: value, stats: stats, achievements: achievements)
        case "stats": return RevisioEngine.Visibility(name: name, nickname: nickname, bio: bio, pronouns: pronouns, subjects: subjects, stats: value, achievements: achievements)
        default: return RevisioEngine.Visibility(name: name, nickname: nickname, bio: bio, pronouns: pronouns, subjects: subjects, stats: stats, achievements: value)
        }
    }
}

/// The page's notice.
///
/// The web keeps a good slot and a bad slot and clears them on the next action,
/// which is what lets a section confirm itself without a modal. The colours are
/// the stylesheet's `notice-good` / `notice-bad`, not an alert: a sheet that
/// interrupts the app and must be dismissed is a different promise from a line of
/// text that stays until the next thing happens.
struct NoticeView: View {
    @Environment(\.revisio) private var colors
    let text: String
    let good: Bool
    let onDismiss: () -> Void

    var body: some View {
        let ink = good ? colors.goodPressed : colors.destructive
        Button(action: onDismiss) {
            HStack(spacing: 10) {
                Icon(good ? "checked" : "secure", size: 16, color: ink)
                Text(text)
                    .font(Type.caption.font)
                    .foregroundStyle(colors.foreground)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(ink.opacity(0.1), in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                    .strokeBorder(ink.opacity(0.3), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

/// A labelled row with a switch, separated by hairlines rather than gaps — which
/// is how the website reads a settings list: one surface, many settings.
struct SettingsSwitchRow: View {
    @Environment(\.revisio) private var colors
    let label: String
    var hint: String?
    let checked: Bool
    var last: Bool = false
    let onChange: (Bool) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(Type.captionS.font)
                        .foregroundStyle(colors.foreground)
                    if let hint {
                        Text(hint)
                            .font(Type.caption.font)
                            .foregroundStyle(colors.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                Toggle("", isOn: Binding(get: { checked }, set: onChange))
                    .labelsHidden()
                    .tint(colors.good)
            }
            .padding(.vertical, 12)
            if !last { Hairline() }
        }
    }
}

/// The symbol picker: chips that wrap, six to a row, with Initials first.
struct SymbolPicker: View {
    @Environment(\.revisio) private var colors
    @Binding var selected: String?

    private var rows: [[String?]] {
        stride(from: 0, to: avatarEmoji.count + 1, by: 6).map { start in
            let options: [String?] = [nil] + avatarEmoji
            return Array(options[start..<min(start + 6, options.count)])
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 6) {
                    ForEach(Array(row.enumerated()), id: \.offset) { _, option in
                        Button {
                            selected = option
                        } label: {
                            ChipPill(text: option ?? "Initials", active: selected == option)
                        }
                        .buttonStyle(ScaleStyle())
                    }
                }
            }
        }
    }
}

/// The web's `whileTap`: the chip itself is the target, so the press has to be on
/// the whole pill rather than on the label inside it.
private struct ScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? Motion.pressScale : 1)
            .animation(Motion.Springs.press.animation, value: configuration.isPressed)
    }
}

/// A settings field: label above, control, hint below — and the hint turns red
/// with the border when the value is refused, which is the web's `bad` state.
struct SettingsField: View {
    @Environment(\.revisio) private var colors
    let label: String
    var placeholder: String = ""
    @Binding var value: String
    var hint: String?
    var bad: Bool = false
    var secure: Bool = false
    var keyboard: KeyboardKind = .default
    var lines: Int = 1
    var submitLabel: SubmitLabel = .next

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: label, token: Type.eyebrow, color: colors.mutedForeground)
            Spacer().frame(height: 6)
            Group {
                if lines > 1 {
                    TextEditor(text: $value)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: CGFloat(lines) * 28 + 18)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 10)
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
                } else if secure {
                    SecureField("", text: $value, prompt: prompt)
                        .padding(.horizontal, 14)
                        .frame(minHeight: Metrics.inputMinHeight)
                } else {
                    TextField("", text: $value, prompt: prompt)
                        .modifier(SettingsKeyboard(keyboard: keyboard))
                        .submitLabel(submitLabel)
                        .padding(.horizontal, 14)
                        .frame(minHeight: Metrics.inputMinHeight)
                }
            }
            .font(Type.body.font)
            .foregroundStyle(colors.foreground)
            .background(colors.card, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            .overlay {
                // The web's `bad` field is the same box with a red stroke — it does
                // not change size or weight, so the form never reflows as the
                // learner types their way into and out of a valid handle.
                RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                    .strokeBorder(bad ? colors.destructive : colors.border, lineWidth: Metrics.inputBorder)
            }
            if let hint {
                Spacer().frame(height: 6)
                Text(hint)
                    .font(Type.fine.font)
                    .foregroundStyle(bad ? colors.destructive : colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// `Text.foregroundStyle` returning a `Text` is iOS 17 only, and the platform
    /// here is 16, so the prompt is tinted the way 16 spells it.
    private var prompt: Text {
        Text(placeholder).foregroundColor(colors.mutedForeground.opacity(0.75))
    }
}

/// The software-keyboard hints, applied only where a software keyboard exists.
private struct SettingsKeyboard: ViewModifier {
    let keyboard: KeyboardKind

    @ViewBuilder func body(content: Content) -> some View {
        #if os(iOS)
        content
            .keyboardType(keyboard)
            .autocorrectionDisabled()
        #else
        content
        #endif
    }
}

/// One photo-picking upload control — `PhotosPicker` from PhotosUI, handing the
/// bytes straight to the model's upload dance. The 5 MB floor is enforced in the
/// model, so the refusal reads the same everywhere.
struct PhotoPickerButton: View {
    @ObservedObject var model: AppModel
    let kind: String
    let label: String

    var body: some View {
        PhotosPicker(selection: Binding(
            get: { nil },
            set: { selection in
                guard let selection else { return }
                model.loadAndUpload(selection: selection, kind: kind)
            }
        ), matching: .images) {
            HStack(spacing: 8) {
                Icon("upload", size: 14, color: .primary)
                Text(label)
            }
            .font(Type.captionS.font)
        }
        .disabled(model.savingProfile)
    }
}
