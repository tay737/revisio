import SwiftUI
import Network
import RevisioEngine

/// The deployment the app talks to. A native client owns this, rather than
/// loading a website that owns it.
private let apiBase = "https://revisio-srs.vercel.app"

/// The five places the app can be.
enum Tab: String, CaseIterable {
    case today, learn, cram, rank, you

    var label: String {
        switch self {
        case .today: return "Today"
        case .learn: return "Learn"
        case .cram: return "Cram"
        case .rank: return "Rank"
        case .you: return "You"
        }
    }

    /// Glyphs rather than an icon font this build does not ship.
    var glyph: String {
        switch self {
        case .today: return "◎"
        case .learn: return "▤"
        case .cram: return "⚡"
        case .rank: return "★"
        case .you: return "☺"
        }
    }
}

struct Home {
    var totalXp = 0
    var level = 0
    var streak = 0
    var due = 0
    var reviewedToday = 0
    var correctToday = 0
    var packCards = 0
    var fromCache = false
}

struct Feedback {
    /// Nil when the answer was queued and this build had no key to mark it.
    var verdict: Verdict?
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
/// the outbox, the queue the server picked — is the engine's job.
@MainActor
final class AppModel: ObservableObject {
    @Published var loading = true
    @Published var signedIn = false
    @Published var name = ""
    @Published var online = true
    @Published var tab: Tab = .today
    @Published var home: Home?
    @Published var pending = 0
    @Published var message: String?

    // the review loop, in whichever mode it was started
    @Published var cards: [QuizCard] = []
    @Published var index = 0
    @Published var answer = ""
    @Published var selection: String?
    @Published var feedback: Feedback?
    @Published var answered = 0
    @Published var correct = 0
    @Published var finished = false
    @Published var inReview = false
    @Published var mode: StudyMode = .daily
    @Published var sessionTitle = ""
    @Published var sessionNotes: [Note] = []
    @Published var sessionId: String?
    @Published var notesOpen = true
    @Published var met = 0
    @Published var total = 0

    // the catalogue
    @Published var subjects: [Subject] = []
    @Published var subjectsLoaded = false
    @Published var openSubject: String?
    @Published var topicsBySubject: [String: [Topic]] = [:]
    @Published var openTopic: String?
    @Published var lessonsByTopic: [String: [Lesson]] = [:]
    @Published var density = "detailed"

    // cram
    @Published var cramTopics: [Topic] = []
    @Published var cramSelected: Set<String> = []
    @Published var maxPerTopic = 20

    // rank
    @Published var ranked: GamificationPayload?
    @Published var boardScope = "weekly"

    // the account
    @Published var me: MeDetail?
    @Published var busy = false

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
        // Signed in *even offline*: the app opens to the learner's own screen, not
        // a sign-in wall, which is the point of an app that works without a network.
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
                loadSubjects()
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
        subjects = []
        subjectsLoaded = false
        ranked = nil
        me = nil
    }

    private func ensureToken() async -> String? {
        if let token = accessToken { return token }
        guard let stored = sessionStore.load(),
              let session = try? await api.refresh(refreshToken: stored.refreshToken) else { return nil }
        accessToken = session.accessToken
        sessionStore.save(session)
        return session.accessToken
    }

    /// Run a call if there is a token, reporting failures as a banner rather than
    /// a crash: the app is offline-first, so "no network" is an ordinary state.
    private func withToken<T>(
        _ work: @escaping (String) async throws -> T,
        then: @escaping (T) -> Void
    ) {
        Task {
            guard let token = await ensureToken() else {
                busy = false
                // A token we could not renew while offline is not a signed-out
                // user, so do not tell them to sign in: the session on the device
                // is still good and will renew by itself once the network is back.
                message = online
                    ? "Sign in again to reach the server."
                    : "You're offline — this needs a connection."
                return
            }
            do {
                let result = try await work(token)
                then(result)
            } catch {
                busy = false
                message = (error as? LocalizedError)?.errorDescription ?? "That did not work."
            }
        }
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
                    snapshot.reviewedToday = me?.today?.reviewed ?? 0
                    snapshot.correctToday = me?.today?.correct ?? 0
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

    // ── navigation ──────────────────────────────────────────────────────────

    func selectTab(_ next: Tab) {
        tab = next
        message = nil
        switch next {
        case .learn: if !subjectsLoaded { loadSubjects() }
        case .cram: if cramTopics.isEmpty { loadCramTopics() }
        case .rank: loadProgress()
        case .you: loadMe()
        case .today: refreshHome()
        }
    }

    func dismissMessage() { message = nil }
    func toggleNotes() { notesOpen.toggle() }
    func setDensity(_ value: String) { density = value }
    func setMaxPerTopic(_ value: Int) { maxPerTopic = min(max(value, 1), 50) }

    // ── the catalogue: subjects → topics → notes ─────────────────────────────

    func loadSubjects() {
        busy = true
        withToken({ try await self.api.subjects(token: $0) }) { subjects in
            self.subjects = subjects
            self.subjectsLoaded = true
            self.busy = false
        }
    }

    func toggleSubject(_ subjectId: String) {
        let wasOpen = openSubject == subjectId
        openSubject = wasOpen ? nil : subjectId
        openTopic = nil
        if wasOpen || topicsBySubject[subjectId] != nil { return }
        withToken({ try await self.api.topics(token: $0, subjectId: subjectId) }) { topics in
            self.topicsBySubject[subjectId] = topics
            self.busy = false
        }
    }

    func toggleTopic(_ topicId: String) {
        let wasOpen = openTopic == topicId
        openTopic = wasOpen ? nil : topicId
        if wasOpen || lessonsByTopic[topicId] != nil { return }
        withToken({ try await self.api.lessons(token: $0, topicId: topicId) }) { lessons in
            self.lessonsByTopic[topicId] = lessons
            self.busy = false
        }
    }

    func enroll(_ subjectId: String) {
        withToken({ try await self.api.enroll(token: $0, subjectId: subjectId) }) { _ in
            self.subjects = self.subjects.map { subject in
                var copy = subject
                if copy.id == subjectId { copy.enrolled = true }
                return copy
            }
            self.busy = false
        }
    }

    // ── cram ────────────────────────────────────────────────────────────────

    func loadCramTopics() {
        busy = true
        withToken({ try await self.api.cramTopics(token: $0) }) { topics in
            self.cramTopics = topics
            self.busy = false
        }
    }

    func toggleCramTopic(_ topicId: String) {
        if cramSelected.contains(topicId) { cramSelected.remove(topicId) } else { cramSelected.insert(topicId) }
    }

    // ── rank ────────────────────────────────────────────────────────────────

    func loadProgress(scope: String? = nil) {
        let wanted = scope ?? boardScope
        boardScope = wanted
        busy = true
        withToken({ try await self.api.gamification(token: $0, scope: wanted) }) { payload in
            self.ranked = payload
            self.busy = false
        }
    }

    // ── the account ─────────────────────────────────────────────────────────

    func loadMe() {
        withToken({ try await self.api.meDetail(token: $0) }) { me in
            self.me = me
            self.busy = false
        }
    }

    func saveProfile(name: String, username: String, nickname: String, bio: String, emoji: String, color: String) {
        let patch = MePatch(
            name: name.trimmed.isEmpty ? nil : name.trimmed,
            nickname: nickname.trimmed.isEmpty ? nil : nickname.trimmed,
            username: username.trimmed.isEmpty ? nil : username.trimmed,
            bio: bio.trimmed.isEmpty ? nil : bio.trimmed,
            avatarEmoji: emoji.trimmed.isEmpty ? nil : emoji.trimmed,
            avatarColor: color
        )
        patchMe(patch, okMessage: "Saved.")
    }

    func setVisibility(_ visibility: RevisioEngine.Visibility) {
        patchMe(MePatch(profileVisibility: visibility), okMessage: nil)
    }

    func setLeaderboardOptOut(_ optOut: Bool) {
        patchMe(MePatch(leaderboardOptOut: optOut), okMessage: nil)
    }

    func setNoteDensity(_ value: String) {
        density = value
        patchMe(MePatch(prefs: Prefs(noteDensity: value, reducedMotion: false)), okMessage: nil)
    }

    private func patchMe(_ patch: MePatch, okMessage: String?) {
        busy = true
        withToken({ token -> MeDetail in
            try await self.api.patchMe(token: token, patch: patch)
            return try await self.api.meDetail(token: token)
        }) { me in
            self.me = me
            self.busy = false
            self.message = okMessage
        }
    }

    // ── the review loop, in any mode ────────────────────────────────────────

    /// Today's queue: the session the app carries offline, keys and all.
    func startTodayReview() {
        Task {
            if online, let token = await ensureToken(), let fresh = try? await api.fetchPack(token: token) {
                store.savePack(fresh)
            }
            guard let pack = store.cachedPack(), !pack.cards.isEmpty else {
                message = "No cards saved on this device yet. Connect once to download today's session."
                return
            }
            begin(
                cards: pack.cards.map { QuizCard(offline: $0) },
                mode: .daily, notes: [], title: "Today", sessionId: nil, met: 0, total: 0
            )
        }
    }

    /// First exposure: the server picks the *unseen* cards and sends the notes
    /// with them, because a first attempt at unread material is a guess.
    func startLearn(_ topicId: String) {
        busy = true
        withToken({ try await self.api.firstExposure(token: $0, topicId: topicId, batch: 4) }) { exposure in
            self.busy = false
            let cards = exposure.batch.map { QuizCard(queue: $0) }
            guard !cards.isEmpty else {
                self.message = "Every card in \(exposure.topic.name) has been met. Try cramming it instead."
                return
            }
            self.begin(
                cards: cards,
                mode: .learn,
                notes: exposure.notes.map { note in
                    var copy = note
                    if copy.topicId == nil { copy.topicId = topicId }
                    return copy
                },
                title: exposure.topic.name,
                sessionId: nil,
                met: exposure.progress.met,
                total: exposure.progress.total
            )
        }
    }

    /// Cram: a fixed number per topic, notes at the chosen density, and nothing
    /// here touches the scheduler — that is what cramming means.
    func startCram() {
        let selected = Array(cramSelected)
        guard !selected.isEmpty else {
            message = "Pick at least one topic to cram."
            return
        }
        let density = self.density
        let max = maxPerTopic
        busy = true
        withToken({ try await self.api.cram(token: $0, topicIds: selected, maxPerTopic: max, noteDensity: density) }) { session in
            self.busy = false
            let cards = session.queue.map { QuizCard(queue: $0) }
            guard !cards.isEmpty else {
                self.message = "Those topics have no questions to cram yet."
                return
            }
            let names = self.cramTopics.filter { selected.contains($0.id) }.map(\.name)
            self.begin(
                cards: cards,
                mode: .cram,
                notes: session.notes,
                title: names.count == 1 ? (names.first ?? "Cram") : "\(names.count) topics",
                sessionId: session.sessionId,
                met: 0,
                total: cards.count
            )
        }
    }

    private func begin(
        cards: [QuizCard],
        mode: StudyMode,
        notes: [Note],
        title: String,
        sessionId: String?,
        met: Int,
        total: Int
    ) {
        self.cards = cards
        index = 0
        answer = ""
        selection = nil
        feedback = nil
        answered = 0
        correct = 0
        finished = false
        inReview = true
        self.mode = mode
        sessionNotes = notes
        sessionTitle = title
        self.sessionId = sessionId
        notesOpen = true
        self.met = met
        self.total = total
        message = nil
        cardStartedAt = Date()
    }

    func setAnswer(_ value: String) { answer = value }
    func setSelection(_ value: String) { selection = value }

    func submit() {
        guard let card = cards[safe: index], feedback == nil else { return }
        let trimmed = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        let given = trimmed.isEmpty ? nil : trimmed
        if card.kind == "mcq" && selection == nil { return }
        if card.kind != "mcq" && given == nil { return }

        let duration = Int(Date().timeIntervalSince(cardStartedAt) * 1000)
        let wasOnline = online
        let mode = self.mode.rawValue
        let sessionId = self.sessionId
        Task {
            if wasOnline, let token = await ensureToken() {
                if let result = try? await api.submit(
                    token: token,
                    cardId: card.id,
                    answer: given,
                    selectedOptionId: selection,
                    durationMs: duration,
                    mode: mode,
                    sessionId: sessionId
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
            // No server: owe it the review. With a key we can still mark it here;
            // without one, say the mark is coming rather than invent a verdict the
            // server may disagree with.
            store.enqueueReview(cardId: card.id, answer: given, selectedOptionId: selection, durationMs: duration, mode: mode)
            apply(
                Grading.previewVerdict(card, answer: given, selectedOptionId: selection),
                Grading.primaryAnswer(card),
                nil,
                0,
                provisional: true
            )
        }
    }

    private func apply(_ verdict: Verdict?, _ correctAnswer: String?, _ explanation: String?, _ xp: Int, provisional: Bool) {
        feedback = Feedback(verdict: verdict, correctAnswer: correctAnswer, explanation: explanation, xpAwarded: xp, provisional: provisional)
        answered += 1
        if verdict?.correct == true { correct += 1 }
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
        sessionNotes = []
        sessionId = nil
        met = 0
        total = 0
        refreshHome()
        if ranked != nil { loadProgress() }
    }

    /// The notes for the card on screen, if this session carried any.
    func notesFor(_ card: QuizCard?) -> [Note] {
        guard let card else { return [] }
        guard !sessionNotes.isEmpty else { return [] }
        let mine = sessionNotes.filter { $0.topicId == nil || $0.topicId == card.topicId }
        return mine.isEmpty ? sessionNotes : mine
    }

    // ── connectivity ────────────────────────────────────────────────────────

    private func observeConnectivity() {
        online = monitor.currentPath.status != .unsatisfied
        monitor.pathUpdateHandler = { [weak self] path in
            let reachable = path.status == .satisfied
            // Unwrap the weak self out here, before the Task. The handler runs off
            // the main actor, so it cannot touch `online` itself; but referring to
            // a captured `self` *inside* a concurrently-executing closure is
            // rejected outright by some toolchains. Binding it to a local first
            // leaves the Task capturing a plain value.
            guard let model = self else { return }
            Task { @MainActor in
                let was = model.online
                model.online = reachable
                if reachable && !was {
                    model.refreshHome()
                    if model.signedIn { model.loadSubjects() }
                }
            }
        }
        monitor.start(queue: DispatchQueue(label: "app.revisio.network"))
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

// ── root ────────────────────────────────────────────────────────────────────

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
                Banner(message: message) { model.dismissMessage() }
            }
        }
    }

    @ViewBuilder private var content: some View {
        if model.loading {
            ProgressView().tint(accent)
        } else if !model.signedIn {
            AuthView(model: model)
        } else if model.inReview {
            SessionView(model: model)
        } else {
            VStack(spacing: 0) {
                Group {
                    switch model.tab {
                    case .today: TodayView(model: model)
                    case .learn: LearnView(model: model)
                    case .cram: CramView(model: model)
                    case .rank: RankView(model: model)
                    case .you: YouView(model: model)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                TabBar(current: model.tab) { model.selectTab($0) }
            }
        }
    }
}

private struct TabBar: View {
    let current: Tab
    let onSelect: (Tab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { tab in
                Button { onSelect(tab) } label: {
                    VStack(spacing: 3) {
                        Text(tab.glyph).font(.system(size: 15))
                        Text(tab.label).font(.system(size: 11))
                    }
                    .frame(maxWidth: .infinity)
                    .foregroundColor(current == tab ? accent : muted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(Color(red: 19 / 255, green: 19 / 255, blue: 21 / 255))
    }
}

private struct Banner: View {
    let message: String
    let dismiss: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(message).font(.footnote)
            Button("Dismiss", action: dismiss).font(.footnote)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(surface2)
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
