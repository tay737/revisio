import SwiftUI
import Network
import RevisioEngine

/// The deployment the app talks to. A native client owns this, rather than
/// loading a website that owns it.
private let apiBase = "https://revisio-srs.vercel.app"
private let accent = Color(red: 28 / 255, green: 100 / 255, blue: 242 / 255)
private let surface1 = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255)
private let muted = Color(red: 152 / 255, green: 152 / 255, blue: 157 / 255)
private let good = Color(red: 48 / 255, green: 209 / 255, blue: 88 / 255)
private let near = Color(red: 255 / 255, green: 214 / 255, blue: 10 / 255)

/// iOS-only keyboard hints, applied only where they exist.
///
/// The package also builds on macOS (that is how the engine is verified), and
/// these modifiers do not exist there — so the hints are attached through this
/// one guarded seam instead of forcing an iOS-only build.
private extension View {
    @ViewBuilder func revisioTextInput() -> some View {
        #if os(iOS)
        self.textInputAutocapitalization(.never)
        #else
        self
        #endif
    }

    @ViewBuilder func revisioEmailInput() -> some View {
        #if os(iOS)
        self.textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never)
        #else
        self
        #endif
    }
}

struct Home {
    var totalXp = 0
    var level = 0
    var streak = 0
    var due = 0
    var packCards = 0
    var fromCache = false
}

struct Feedback {
    var verdict: Verdict
    var correctAnswer: String?
    var explanation: String?
    var xpAwarded: Int
    /// True when the server has not seen this answer yet.
    var provisional: Bool
}

/// The app's single state owner, mirroring the Android view model.
///
/// It decides one thing on the user's behalf: whether an answer goes to the
/// server now or into the outbox for later. Everything else — grading, the pack,
/// the outbox — is the engine's job.
@MainActor
final class AppModel: ObservableObject {
    @Published var loading = true
    @Published var signedIn = false
    @Published var name = ""
    @Published var online = true
    @Published var home: Home?
    @Published var pending = 0
    @Published var message: String?
    @Published var cards: [OfflineCard] = []
    @Published var index = 0
    @Published var answer = ""
    @Published var selection: String?
    @Published var feedback: Feedback?
    @Published var answered = 0
    @Published var correct = 0
    @Published var finished = false
    @Published var inReview = false

    private let store: OfflineStore
    private let sessionStore: SessionStore
    private let api: RevisioApi
    private let sync: SyncEngine
    private let monitor = NWPathMonitor()
    private var accessToken: String?
    private var cardStartedAt = Date()

    init() {
        let directory = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("revisio")
        let kv = FileKeyValueStore(directory: directory)
        store = OfflineStore(kv)
        sessionStore = SessionStore(kv)
        api = RevisioApi(baseUrl: apiBase)
        sync = SyncEngine(store: store, api: api)
        observeConnectivity()
        bootstrap()
    }

    // ── session ─────────────────────────────────────────────────────────────

    private func bootstrap() {
        guard let stored = sessionStore.load() else {
            loading = false
            signedIn = false
            return
        }
        // Signed in *even offline*: the app opens to the learner's home, not a
        // sign-in wall, which is the point of an app that works without a network.
        loading = false
        signedIn = true
        name = stored.user.name
        pending = store.pendingCount()
        refreshHome()
    }

    func signIn(email: String, password: String) {
        loading = true
        message = nil
        Task {
            do {
                let session = try await api.login(email: email, password: password)
                accessToken = session.accessToken
                sessionStore.save(session)
                name = session.user.name
                signedIn = true
                loading = false
                refreshHome()
            } catch {
                loading = false
                message = (error as? LocalizedError)?.errorDescription ?? "Sign in failed."
            }
        }
    }

    func signOut() {
        accessToken = nil
        sessionStore.clear()
        store.clearPack()
        signedIn = false
        name = ""
        home = nil
        pending = 0
    }

    private func ensureToken() async -> String? {
        if let token = accessToken { return token }
        guard let stored = sessionStore.load(),
              let session = try? await api.refresh(refreshToken: stored.refreshToken) else { return nil }
        accessToken = session.accessToken
        sessionStore.save(session)
        return session.accessToken
    }

    // ── home ────────────────────────────────────────────────────────────────

    func refreshHome() {
        Task {
            if online, let token = await ensureToken() {
                let me = try? await api.me(token: token)
                let fresh = try? await api.fetchPack(token: token)
                if let fresh { store.savePack(fresh) }
                if me != nil || store.cachedPack() != nil {
                    let pack = fresh ?? store.cachedPack()
                    var snapshot = Home()
                    snapshot.totalXp = me?.gamification?.totalXp ?? 0
                    snapshot.level = me?.gamification?.level ?? 0
                    snapshot.streak = me?.gamification?.streak ?? 0
                    snapshot.due = me?.today?.due ?? (pack?.cards.count ?? 0)
                    snapshot.packCards = pack?.cards.count ?? 0
                    snapshot.fromCache = false
                    if let serverName = me?.name, !serverName.isEmpty { name = serverName }
                    home = snapshot
                    pending = store.pendingCount()
                    await drainOutbox(token: token)
                    return
                }
            }
            // Offline (or the server was unreachable): show what we already have.
            let pack = store.cachedPack()
            var snapshot = home ?? Home()
            snapshot.due = pack?.cards.count ?? 0
            snapshot.packCards = pack?.cards.count ?? 0
            snapshot.fromCache = true
            home = snapshot
            pending = store.pendingCount()
        }
    }

    private func drainOutbox(token: String) async {
        let outcome = await sync.syncOutbox(token: token)
        pending = outcome.remaining
    }

    // ── the review loop ─────────────────────────────────────────────────────

    func startReview() {
        Task {
            if online, let token = await ensureToken(), let fresh = try? await api.fetchPack(token: token) {
                store.savePack(fresh)
            }
            guard let pack = store.cachedPack(), !pack.cards.isEmpty else {
                message = "No cards saved on this device yet. Connect once to download today's session."
                return
            }
            cards = pack.cards
            index = 0
            answer = ""
            selection = nil
            feedback = nil
            answered = 0
            correct = 0
            finished = false
            inReview = true
            cardStartedAt = Date()
        }
    }

    func submit() {
        guard let card = cards[safe: index], feedback == nil else { return }
        let trimmed = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        let given = trimmed.isEmpty ? nil : trimmed
        if card.kind == "mcq" && selection == nil { return }
        if card.kind != "mcq" && given == nil { return }

        let duration = Int(Date().timeIntervalSince(cardStartedAt) * 1000)
        let wasOnline = online
        Task {
            if wasOnline, let token = await ensureToken() {
                if let result = try? await api.submitDirect(
                    token: token,
                    cardId: card.id,
                    answer: given,
                    selectedOptionId: selection,
                    durationMs: duration
                ) {
                    store.dropCardFromPack(card.id)
                    apply(
                        result.verdict,
                        result.primaryAnswer ?? result.modelAnswer ?? Grading.primaryAnswer(card),
                        result.explanation,
                        result.xpAwarded ?? 0,
                        provisional: false
                    )
                    return
                }
            }
            // No server: grade it here, and owe the server the review.
            store.enqueueReview(cardId: card.id, answer: given, selectedOptionId: selection, durationMs: duration)
            let verdict = Grading.previewVerdict(card, answer: given, selectedOptionId: selection)
            apply(verdict, Grading.primaryAnswer(card), nil, 0, provisional: true)
        }
    }

    private func apply(_ verdict: Verdict, _ correctAnswer: String?, _ explanation: String?, _ xp: Int, provisional: Bool) {
        feedback = Feedback(verdict: verdict, correctAnswer: correctAnswer, explanation: explanation, xpAwarded: xp, provisional: provisional)
        answered += 1
        if verdict.correct { correct += 1 }
        pending = store.pendingCount()
    }

    func next() {
        if index + 1 >= cards.count {
            finished = true
            feedback = nil
            Task { if let token = await ensureToken() { await drainOutbox(token: token) } }
        } else {
            index += 1
            answer = ""
            selection = nil
            feedback = nil
            cardStartedAt = Date()
        }
    }

    func endReview() {
        cards = []
        index = 0
        inReview = false
        finished = false
        answered = 0
        correct = 0
        feedback = nil
        refreshHome()
    }

    // ── connectivity ────────────────────────────────────────────────────────

    private func observeConnectivity() {
        online = monitor.currentPath.status != .unsatisfied
        monitor.pathUpdateHandler = { [weak self] path in
            let reachable = path.status == .satisfied
            Task { @MainActor in
                guard let self else { return }
                let was = self.online
                self.online = reachable
                if reachable && !was { self.refreshHome() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "app.revisio.network"))
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

// ── views ───────────────────────────────────────────────────────────────────

@main
struct RevisioApp: App {
    var body: some Scene {
        WindowGroup {
            RootView().preferredColorScheme(.dark)
        }
    }
}

private struct RootView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            content
            if let message = model.message {
                Banner(message: message) { model.message = nil }
            }
        }
    }

    @ViewBuilder private var content: some View {
        if model.loading {
            ProgressView().tint(accent)
        } else if !model.signedIn {
            AuthView(model: model)
        } else if model.inReview {
            ReviewView(model: model)
        } else {
            HomeView(model: model)
        }
    }
}

private struct Crest: View {
    var size: CGFloat = 64
    var body: some View {
        RoundedRectangle(cornerRadius: size / 4)
            .fill(accent)
            .frame(width: size, height: size)
            .overlay(Text("R").font(.system(size: size * 0.55, weight: .heavy)).foregroundColor(.white))
    }
}

private struct Banner: View {
    let message: String
    let dismiss: () -> Void
    var body: some View {
        HStack {
            Text(message).font(.footnote)
            Spacer()
            Button("Dismiss", action: dismiss).font(.footnote)
        }
        .padding(14)
        .background(surface1)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding()
    }
}

private struct AuthView: View {
    @ObservedObject var model: AppModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Spacer().frame(height: 60)
                Crest()
                Text("Revisio").font(.title).bold()
                Text("Sign in to study — then keep studying offline.")
                    .font(.subheadline).foregroundColor(muted).multilineTextAlignment(.center)
                Spacer().frame(height: 18)
                TextField("Email", text: $email).revisioEmailInput().textFieldStyle(.roundedBorder)
                SecureField("Password", text: $password).textFieldStyle(.roundedBorder)
                Button {
                    model.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
                } label: {
                    Text("Sign in").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(accent)
                .disabled(email.isEmpty || password.isEmpty || model.loading)
                Text("Your session and today's cards are kept on this device, so a lost connection never signs you out.")
                    .font(.caption).foregroundColor(muted).multilineTextAlignment(.center)
            }
            .padding(28)
        }
    }
}

private struct HomeView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 14) {
                    Crest(size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.name.isEmpty ? "Welcome back" : "Hi, \(model.name)").font(.title3).bold()
                        Text(model.online ? "Online" : "Offline — your saved session still works")
                            .font(.caption).foregroundColor(model.online ? good : near)
                    }
                    Spacer()
                }

                if let home = model.home {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Today").font(.caption).foregroundColor(muted)
                        Text("\(home.due) cards ready").font(.title2).bold()
                        HStack(spacing: 22) {
                            Stat("Level", "\(home.level)")
                            Stat("XP", "\(home.totalXp)")
                            Stat("Streak", "\(home.streak)d")
                        }
                        if home.fromCache {
                            Text("Showing the session saved on this device.").font(.caption).foregroundColor(near)
                        }
                    }
                    .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                    .background(surface1).clipShape(RoundedRectangle(cornerRadius: 18))

                    Button {
                        model.startReview()
                    } label: {
                        Text(home.packCards > 0 ? "Start review" : "Connect once to download cards")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(accent)
                    .disabled(home.packCards == 0)

                    if model.pending > 0 {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(model.pending) review\(model.pending == 1 ? "" : "s") waiting to sync").font(.subheadline)
                                Text("They'll be graded by the server once you're back online.")
                                    .font(.caption).foregroundColor(muted)
                            }
                            Spacer()
                            if model.online { Button("Sync") { model.refreshHome() } }
                        }
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .background(surface1).clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                } else {
                    ProgressView().tint(accent)
                }

                HStack {
                    Button("Refresh") { model.refreshHome() }
                    Spacer()
                    Button("Sign out") { model.signOut() }.foregroundColor(muted)
                }
                Spacer()
            }
            .padding(24)
        }
    }

    private func Stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundColor(muted)
            Text(value).font(.headline)
        }
    }
}

private struct ReviewView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        if model.finished {
            SummaryView(model: model)
        } else if let card = model.cards[safe: model.index] {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ProgressView(value: Double(model.index + 1), total: Double(model.cards.count))
                        .tint(accent)
                    HStack {
                        Text("\(card.subjectName) · \(card.topicName)").font(.caption).foregroundColor(muted)
                        Spacer()
                        Text("\(model.index + 1) / \(model.cards.count)").font(.caption).foregroundColor(muted)
                    }
                    Text(prompt(card)).font(.title3).bold()

                    if card.kind == "mcq" {
                        VStack(spacing: 10) {
                            ForEach(card.options ?? [], id: \.id) { option in
                                if model.selection == option.id {
                                    Button {
                                        if model.feedback == nil { model.selection = option.id }
                                    } label: {
                                        Text(option.text).frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(accent)
                                    .disabled(model.feedback != nil)
                                } else {
                                    Button {
                                        if model.feedback == nil { model.selection = option.id }
                                    } label: {
                                        Text(option.text).frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .buttonStyle(.bordered)
                                    .disabled(model.feedback != nil)
                                }
                            }
                        }
                    } else {
                        TextField(
                            card.kind == "flashcard" ? "Say it in your own words" : "Your answer",
                            text: $model.answer
                        )
                        .revisioTextInput()
                        .textFieldStyle(.roundedBorder)
                        .disabled(model.feedback != nil)
                    }

                    if let feedback = model.feedback {
                        FeedbackPanel(feedback: feedback)
                        Button {
                            model.next()
                        } label: {
                            Text(model.index + 1 >= model.cards.count ? "Finish" : "Next card").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent).tint(accent)
                    } else {
                        Button {
                            model.submit()
                        } label: {
                            Text("Check").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent).tint(accent)
                        .disabled(!inputReady(card))
                    }
                    Spacer()
                }
                .padding(24)
            }
        }
    }

    private func inputReady(_ card: OfflineCard) -> Bool {
        card.kind == "mcq" ? model.selection != nil : !model.answer.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

private struct FeedbackPanel: View {
    let feedback: Feedback

    private var label: (String, Color) {
        switch feedback.verdict.feedbackKind {
        case .correct: return ("Correct", good)
        case .caseOnly, .punctuationOnly, .caseAndPunctuation: return ("Correct — check your spelling", good)
        case .nearMiss: return ("Nearly there", near)
        case .wrong: return ("Not quite", Color(red: 1, green: 0.27, blue: 0.23))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label.0).font(.headline).foregroundColor(label.1)
                Spacer()
                if feedback.xpAwarded > 0 {
                    Text("+\(feedback.xpAwarded) XP").font(.subheadline).foregroundColor(good)
                }
            }
            if let note = feedback.verdict.note, !note.isEmpty {
                Text(note).font(.subheadline)
            }
            if let answer = feedback.correctAnswer, !answer.isEmpty {
                Text("Answer: \(answer)").font(.subheadline).bold()
            }
            if let missed = feedback.verdict.missedPhrases, !missed.isEmpty {
                Text("Missing: \(missed.joined(separator: ", "))").font(.caption).foregroundColor(muted)
            }
            if let explanation = feedback.explanation, !explanation.isEmpty {
                Text(explanation).font(.caption)
            }
            if feedback.provisional {
                Text("Saved on this device. The server will confirm this mark when you reconnect.")
                    .font(.caption).foregroundColor(near)
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(surface1).clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct SummaryView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            Crest(size: 72)
            Text("Session complete").font(.title).bold()
            Text("\(model.correct) of \(model.answered) correct").foregroundColor(muted)
            if model.pending > 0 {
                Text("\(model.pending) review\(model.pending == 1 ? "" : "s") will sync when you're online.")
                    .font(.footnote).foregroundColor(near).multilineTextAlignment(.center)
            }
            Button {
                model.endReview()
            } label: {
                Text("Done").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(accent)
            Spacer()
        }
        .padding(32)
    }
}

private func prompt(_ card: OfflineCard) -> String {
    switch card.kind {
    case "cloze": return card.textWithBlank ?? "Fill in the blank"
    case "flashcard": return card.prompt ?? "Recall the answer"
    default: return card.question ?? "Choose the best answer"
    }
}
