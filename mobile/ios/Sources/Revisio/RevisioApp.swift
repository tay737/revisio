import PhotosUI
import SwiftUI
import Network
import RevisioEngine

/// The deployment the app talks to. A native client owns this, rather than
/// loading a website that owns it.
///
/// Internal, not private: `resolveAssetUrl(_:)` in Common.swift resolves the
/// server's relative asset URLs against it, and a file-private constant cannot
/// be read across files. One owner still — this declaration.
let apiBase = "https://revisio-srs.vercel.app"

///
/// The copy for a lost session, a lost connection and a busy server.
///
/// These are the web's strings for the same three conditions (`src/lib/api.ts`,
/// `BUSY_MESSAGE`), because the same failure should read the same way in both
/// places — and because "Your session has ended" is the sentence that explains
/// why a learner is suddenly signing in again.
///
private let sessionEndedCopy = "Your session has ended. Sign in again."
private let offlineCopy = "You're offline — this needs a connection."
private let serverBusyCopy = "We could not reach the server just now. Try that again in a moment."

///
/// Every place the app can be — `src/components/nav/routes.ts`, ported.
///
/// That file is the single owner of what the app's destinations are: the sidebar,
/// the bottom bar, the account sheet and the page titles all read it, so a screen
/// can never appear in one surface and be missing from another. This enum is the
/// same list with the same four-word hints, and `onBar` marks the four a thumb
/// reaches without a second tap.
///
/// The previous five fixed slots truncated the app: Cram was on the bar while
/// Review — "clear the cards due", the one thing a learner opens the app to do —
/// had no destination of its own at all, and exam, practice and library were
/// unreachable on a phone entirely. Four + More is the web's answer, and it is the
/// first time every destination has been reachable here.
///
enum Destination: String, CaseIterable, Identifiable {
    case today, review, learn, rank, cram, exam, practice, library, settings, teaching, admin

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Today"
        case .review: return "Review"
        case .learn: return "Learn"
        case .rank: return "Rank"
        case .cram: return "Cram"
        case .exam: return "Exam"
        case .practice: return "Practice"
        case .library: return "Library"
        case .settings: return "Settings"
        case .teaching: return "Teaching"
        case .admin: return "Admin"
        }
    }

    var hint: String {
        switch self {
        case .today: return "Your queue and streak"
        case .review: return "Clear the cards due"
        case .learn: return "Notes behind the cards"
        case .rank: return "Ladder and weekly lobby"
        case .cram: return "Sprint before an exam"
        case .exam: return "Sit a marked paper"
        case .practice: return "Generated maths drills"
        case .library: return "Subjects and topics"
        case .settings: return "Profile and account"
        case .teaching: return "Classes and students"
        case .admin: return "Users and content"
        }
    }

    /// The four the bar carries. No more, and no fewer.
    var onBar: Bool {
        switch self {
        case .today, .review, .learn, .rank: return true
        default: return false
        }
    }

    /// Who may see it at all; nil means everyone.
    var roles: [String]? {
        switch self {
        case .teaching: return ["teacher", "developer"]
        case .admin: return ["developer"]
        default: return nil
        }
    }

    /// `navForRole` — a learner never sees a console they cannot open.
    func visibleTo(_ role: String?) -> Bool {
        guard let roles else { return true }
        guard let role else { return false }
        return roles.contains(role)
    }

    /// The website's registry name for each destination, so the bar draws the same
    /// glyphs the browser's does rather than a font the platform happens to ship.
    /// `RevisioIcons` is generated out of that registry.
    var icon: String {
        switch self {
        case .today: return "dashboard"
        case .review: return "review"
        case .learn: return "learn"
        case .rank: return "rank"
        case .cram: return "cram"
        case .exam: return "exam"
        case .practice: return "practice"
        case .library: return "library"
        case .settings: return "person"
        case .teaching: return "teacher"
        case .admin: return "admin"
        }
    }

    /// The bar, in the web's `PRIMARY_TABS` order.
    static func bar(_ role: String?) -> [Destination] {
        allCases.filter { $0.onBar && $0.visibleTo(role) }
    }

    /// Everything one tap behind More, in `NAV` order.
    static func overflow(_ role: String?) -> [Destination] {
        allCases.filter { !$0.onBar && $0.visibleTo(role) }
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

/// The student a staff member is looking at — the roster and the admin users
/// table both open the progress sheet by id and display name, and neither
/// needs more than that.
struct StaffStudentRef: Equatable {
    let userId: String
    let name: String
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
    @Published var destination: Destination = .today
    /// Whether the More sheet is open. The shell's one piece of UI state.
    @Published var moreOpen = false
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
    @Published var notesOpen = false
    @Published var met = 0
    @Published var total = 0
    // the reward moment
    /// Bumped on every correct mark (small burst) and on a promotion at session
    /// end (full burst) — the two celebrations the web fires. Reduced motion
    /// reads none (the gate lives in the overlay).
    @Published var confettiTrigger = 0
    /// The session just moved the learner up a rung — the summary's flourish.
    @Published var promoted = false

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
    /// The account screen's own load state: loading, failed, or loaded.
    @Published var meLoading = false
    @Published var meError: String?
    @Published var busy = false
    // maths practice
    ///
    /// Only the subjects that can actually deal a paper.
    ///
    /// `mathsEnabled` is a per-subject flag on the server, so a picker that
    /// listed every subject would offer drills that cannot exist.
    ///
    @Published var mathsSubjects: [Subject] = []
    @Published var practiceSubject: String?
    @Published var mathsCatalogue: MathsCatalogue?
    @Published var practiceTopics: Set<String> = []
    @Published var practiceConcepts: Set<String> = []
    @Published var practiceDifficulty = "mixed"
    @Published var practiceCount = 10
    @Published var practicePaper: [MathsQuestion] = []
    @Published var practiceIndex = 0
    @Published var practiceAnswer = ""
    @Published var practiceMark: MathsMark?
    @Published var practiceCorrect = 0
    @Published var practiceMarks = 0
    @Published var practiceMaxMarks = 0
    @Published var practiceDone = false
    @Published var practiceXp: MathsXp?
    // the exam simulator
    @Published var examPool: ExamPool?
    @Published var examPicked: Set<String> = []
    @Published var examPaper: [ExamQuestion] = []
    @Published var examAnswers: [String: String] = [:]
    @Published var examResult: ExamResult?
    @Published var examBusy = false
    /// A public profile someone shared, and why it could not be opened.
    @Published var profile: PublicProfile?
    @Published var profileError: String?
    @Published var profileHandle: String?
    /// Settings confirmations and refusals, kept apart from the global banner.
    ///
    /// The website confirms each section in its own place rather than through one
    /// toast: a save in Profile must never answer for a save in Security. Two
    /// fields rather than one, because "Saved." and "That did not work." are
    /// different claims and a single slot would have to decide which it means.
    @Published var settingsNote: String?
    @Published var settingsError: String?
    /// Whose save is in flight — so only that button says "Saving…".
    @Published var savingProfile = false
    @Published var savingPassword = false
    @Published var savingEmail = false
    // ── the update check ─────────────────────────────────────────────────
    /// Set once the server has been asked what the newest client is.
    @Published var update = UpdateStatus.none
    /// The update card is dismissed for this run of the app.
    @Published var updateDismissed = false
    // ── teaching and admin consoles ──────────────────────────────────────
    @Published var teacherData: TeacherPayload?
    @Published var myTopics: [MyTopic] = []
    @Published var adminData: AdminPayload?
    @Published var staffBusy = false
    @Published var staffNote: String?
    @Published var staffError: String?
    // ── the per-student progress sheet ──────────────────────────────────
    /// Whose progress is open — opened from a roster or a users row.
    @Published var studentProgressFor: StaffStudentRef?
    @Published var studentProgress: StudentProgress?
    @Published var studentProgressBusy = false
    @Published var studentProgressError: String?
    // exam fidelity
    /// A stored board paper opened verbatim.
    @Published var paperDoc: PaperDoc?
    // review session, ended early
    /// The learner ended the session early — the summary says "ended", not "complete".
    @Published var ended = false

    private let store: OfflineStore
    private let sessionStore: SessionStore
    private let api: RevisioApi
    private let sync: SyncEngine
    private let monitor = NWPathMonitor()
    private var accessToken: String?
    private var cardStartedAt = Date()
    /// Total XP when the session began, so its ladder movement can be judged.
    private var xpAtSessionStart: Int?
    /// XP the session has earned so far — the promotion check at session end.
    private var xpThisSession = 0

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
        checkUpdate()
    }

    // ── the update check ───────────────────────────────────────────────────

    /// Ask the server what the newest client is, once on launch.
    ///
    /// The comparison is by build number (see `checkForUpdate`), and the result
    /// is only ever shown — an old build that ignores it keeps working, which is
    /// exactly the point: an update notice must never be the thing that stops a
    /// learner from doing their reviews.
    private func checkUpdate() {
        Task {
            guard let info = try? await api.version() else { return }
            let mine = Self.buildNumber
            update = checkForUpdate(mine: mine, latestBuild: info.build, minBuild: info.minBuild)
            updateDismissed = false
        }
    }

    /// CFBundleVersion, the monotonic integer the release stamps.
    static var buildNumber: Int {
        let value = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return Int(value ?? "") ?? 0
    }

    func dismissUpdate() { updateDismissed = true }

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

    ///
    /// Sign in. `mfaRequired` is an answer, not a refusal: the auth view opens
    /// its 2FA stage and the same submit retries with the code.
    ///
    func signIn(email: String, password: String, totp: String? = nil) {
        loading = true
        message = nil
        Task {
            do {
                switch try await api.login(email: email, password: password, totp: totp) {
                case .mfaRequired:
                    loading = false
                    mfaStage = true
                case .signedIn(let session):
                    accessToken = session.accessToken
                    sessionStore.save(session)
                    name = session.user.name
                    signedIn = true
                    loading = false
                    mfaStage = false
                    refreshHome()
                    loadSubjects()
                }
            } catch {
                loading = false
                message = (error as? LocalizedError)?.errorDescription ?? "Sign in failed."
            }
        }
    }

    /// The 2FA stage is showing — the server asked for the six digits.
    @Published var mfaStage = false

    /// Create an account. Registration never signs in; the view owns the copy
    /// that answers (check your inbox, or the verification link when the
    /// deployment mails nothing).
    func register(
        email: String,
        password: String,
        name: String,
        role: String? = nil,
        note: String? = nil,
        subjectIds: [String]? = nil,
        classCode: String? = nil
    ) async throws -> String? {
        try await api.register(
            email: email, password: password, name: name,
            role: role, note: note, subjectIds: subjectIds, classCode: classCode
        )
    }

    /// The subjects the registration form offers; empty when unreachable.
    func publicSubjects() async -> [PublicSubject] {
        (try? await api.publicSubjects()) ?? []
    }

    /// Re-send a verification email; `false` when the server would not take it.
    func resendVerification(email: String) async -> Bool {
        (try? await api.resendVerification(email: email)) ?? false
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

    /// The three answers a token request can have.
    private enum Token {
        case ready(String)
        /// The server rejected the session; the learner is already at sign-in.
        case ended
        /// We could not reach the server. The session is still good.
        case unavailable
    }

    ///
    /// The token to call with, or why we cannot call at all.
    ///
    /// A refresh the server *rejects* ends the session here and now: the learner
    /// goes back to sign in with a reason, instead of staying on a cached screen
    /// that can never answer. A refresh we could not *complete* leaves the
    /// session exactly as it was — being unable to ask is not being told no.
    ///
    private func tokenOrReason() async -> Token {
        if let token = accessToken { return .ready(token) }
        guard let stored = sessionStore.load() else { return .ended }
        switch await api.refresh(refreshToken: stored.refreshToken) {
        case .renewed(let session):
            accessToken = session.accessToken
            sessionStore.save(session)
            return .ready(session.accessToken)
        case .rejected:
            endSession(sessionEndedCopy)
            return .ended
        case .unavailable:
            return .unavailable
        }
    }

    ///
    /// The token, for the callers that only need "can I call now?".
    ///
    /// The same three-way decision as `tokenOrReason` — a rejected refresh still
    /// ends the session — collapsed to an optional token, because each of these
    /// callers has a cached answer to fall back on (`Today` shows the stored
    /// pack). Screens that must say *why* they cannot load go through `withToken`.
    ///
    private func ensureToken() async -> String? {
        switch await tokenOrReason() {
        case .ready(let token): return token
        case .ended, .unavailable: return nil
        }
    }

    ///
    /// End the session on this device.
    ///
    /// The cached pack deliberately stays: it is the queue the learner was given,
    /// and a round trip to fetch it again is a worse experience than a sign-in
    /// prompt with their cards still behind it. What goes is the credential that
    /// no longer opens anything.
    ///
    private func endSession(_ note: String) {
        accessToken = nil
        sessionStore.clear()
        signedIn = false
        me = nil
        meLoading = false
        meError = nil
        busy = false
        message = note
    }

    /// Run a call if there is a token, reporting failures as a banner rather than
    /// a crash: the app is offline-first, so "no network" is an ordinary state.
    ///
    /// `onFailure` is for screens that own their own error state — the account
    /// screen shows the reason with a retry, because a page whose only other
    /// state is a spinner cannot say that the request failed.
    private func withToken<T>(
        _ work: @escaping (String) async throws -> T,
        onFailure: ((String) -> Void)? = nil,
        then: @escaping (T) -> Void
    ) {
        Task {
            switch await tokenOrReason() {
            case .ended:
                // endSession() has already surfaced the reason at sign-in.
                return
            case .unavailable:
                let note = online ? serverBusyCopy : offlineCopy
                busy = false
                message = note
                onFailure?(note)
            case .ready(let token):
                do {
                    let result = try await work(token)
                    then(result)
                } catch {
                    busy = false
                    let note = (error as? LocalizedError)?.errorDescription ?? "That did not work."
                    message = note
                    onFailure?(note)
                }
            }
        }
    }

    // ── home ────────────────────────────────────────────────────────────────

    func refreshHome() {
        Task {
            if online, case let .ready(token) = await tokenOrReason() {
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

    ///
    /// Go somewhere, and load whatever that destination needs to be useful.
    ///
    /// A screen that opened onto an empty state it had not asked the server for
    /// would look broken, so the fetch travels with the navigation — and the More
    /// sheet closes in the same update, because a sheet left open across a
    /// navigation would sit on top of the page it just opened.
    ///
    func go(_ next: Destination) {
        destination = next
        moreOpen = false
        message = nil
        switch next {
        case .learn: if !subjectsLoaded { loadSubjects() }
        case .cram: if cramTopics.isEmpty { loadCramTopics() }
        case .rank: loadProgress()
        case .settings: loadMe()
        case .today: refreshHome()
        case .review: if home == nil { refreshHome() }
        case .library: loadSubjects()
        case .practice: loadMathsSubjects()
        case .exam: loadExamPool()
        case .teaching: if teacherData == nil { loadTeaching() }
        case .admin: if adminData == nil { loadAdmin() }
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

    /// Who may see a topic this learner owns.
    ///
    /// The server applies this to the topic's cards and lessons together, and it is
    /// the only knob a learner has over their own content — so the screen writes it
    /// and reads back the counts that changed, rather than assuming a number.
    func setTopicVisibility(_ topicId: String, visibility: String) {
        busy = true
        withToken({ try await self.api.setTopicVisibility(token: $0, topicId: topicId, visibility: visibility) }) { counts in
            self.busy = false
            self.message = "Visibility saved · \(counts.cards) cards, \(counts.lessons) lessons."
            // Re-read the open subject so the counts on screen are the ones the
            // server just reported, not the ones from before the write.
            guard let open = self.openSubject else { return }
            self.topicsBySubject[open] = nil
            self.openSubject = nil
            self.toggleSubject(open)
        }
    }

    func joinClass(_ code: String) {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        busy = true
        withToken({ try await self.api.joinClass(token: $0, code: trimmed) }) { result in
            self.busy = false
            self.message = "Joined \(result.joined.name)."
            self.loadSubjects()
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

    // ── maths practice ──────────────────────────────────────────────────────

    ///
    /// The subjects that can deal a paper — `mathsEnabled` decides.
    ///
    /// A picker that listed every subject would offer drills that cannot exist,
    /// and the learner would find out from a 404 rather than from the list.
    ///
    func loadMathsSubjects() {
        busy = true
        withToken({ try await self.api.subjects(token: $0) }) { subjects in
            let playable = subjects.filter(\.mathsEnabled)
            self.mathsSubjects = playable
            self.busy = false
            // One playable subject is not a choice, so it is made for them — the
            // same shortcut the web takes.
            if playable.count == 1, self.practiceSubject != playable[0].id {
                self.selectPracticeSubject(playable[0].id)
            }
        }
    }

    func selectPracticeSubject(_ subjectId: String) {
        practiceSubject = subjectId
        mathsCatalogue = nil
        practiceTopics = []
        practiceConcepts = []
        withToken(
            { try await self.api.mathsCatalogue(token: $0, subjectId: subjectId) },
            onFailure: { _ in self.mathsCatalogue = .empty }
        ) { catalogue in
            self.mathsCatalogue = catalogue
        }
    }

    func togglePracticeTopic(_ id: String) {
        if practiceTopics.contains(id) { practiceTopics.remove(id) } else { practiceTopics.insert(id) }
    }

    func togglePracticeConcept(_ id: String) {
        if practiceConcepts.contains(id) { practiceConcepts.remove(id) } else { practiceConcepts.insert(id) }
    }

    func setPracticeCount(_ value: Int) { practiceCount = min(max(value, 1), 30) }

    func setPracticeAnswer(_ value: String) { practiceAnswer = value }

    func startPractice() {
        guard let subject = practiceSubject else {
            message = "Pick a subject to practise."
            return
        }
        _ = subject
        busy = true
        withToken(
            { try await self.api.startPractice(
                token: $0,
                topicIds: Array(self.practiceTopics),
                conceptIds: Array(self.practiceConcepts),
                difficulty: self.practiceDifficulty,
                count: self.practiceCount
            ) },
            onFailure: { _ in self.busy = false }
        ) { session in
            self.busy = false
            self.practicePaper = session.paper
            self.practiceIndex = 0
            self.practiceAnswer = ""
            self.practiceMark = nil
            self.practiceCorrect = 0
            self.practiceMarks = 0
            self.practiceMaxMarks = 0
            self.practiceDone = false
            self.practiceXp = nil
        }
    }

    ///
    /// Mark one question.
    ///
    /// Per question rather than the whole paper at the end, because the server's
    /// marking returns the worked solution for a wrong answer and the whole point
    /// of practice is to read that while the attempt is still in your head.
    ///
    func markPractice() {
        guard let question = practicePaper[safe: practiceIndex], practiceMark == nil, !busy else { return }
        busy = true
        withToken(
            {
                try await self.api.markPractice(
                    token: $0,
                    answers: [MathsAnswerBody(questionId: question.questionId, answer: self.practiceAnswer)]
                )
            },
            onFailure: { _ in self.busy = false }
        ) { results in
            self.busy = false
            guard let mark = results.first else { return }
            self.practiceMark = mark
            if mark.correct {
                self.practiceCorrect += 1
                self.practiceMarks += mark.marks
            }
            self.practiceMaxMarks += mark.marks
        }
    }

    func nextPracticeQuestion() {
        if practiceIndex + 1 >= practicePaper.count {
            practiceDone = true
            practiceMark = nil
            // One call per finished session: practice writes no review log and
            // moves no schedule, so the XP is the only thing it changes.
            withToken(
                {
                    try await self.api.awardPracticeXp(
                        token: $0,
                        marks: self.practiceMarks,
                        maxMarks: max(self.practiceMaxMarks, 1),
                        correct: self.practiceCorrect,
                        total: max(self.practicePaper.count, 1)
                    )
                }
            ) { xp in self.practiceXp = xp }
        } else {
            practiceIndex += 1
            practiceAnswer = ""
            practiceMark = nil
        }
    }

    func endPractice() {
        practicePaper = []
        practiceIndex = 0
        practiceAnswer = ""
        practiceMark = nil
        practiceDone = false
        practiceXp = nil
    }

    // ── the exam simulator ──────────────────────────────────────────────────

    func loadExamPool() {
        busy = true
        withToken(
            { try await self.api.examPool(token: $0) },
            onFailure: { _ in
                self.examPool = .empty
                self.busy = false
            }
        ) { pool in
            self.examPool = pool
            self.busy = false
        }
    }

    func toggleExamTopic(_ id: String) {
        if examPicked.contains(id) { examPicked.remove(id) } else { examPicked.insert(id) }
    }

    func startExam(questionCount: Int = 5) {
        guard !examPicked.isEmpty else {
            message = "Pick at least one topic to sit a paper on."
            return
        }
        examBusy = true
        let picked = Array(examPicked)
        withToken(
            { try await self.api.examPaper(token: $0, topicIds: picked, questionCount: questionCount) },
            onFailure: { _ in self.examBusy = false }
        ) { paper in
            self.examBusy = false
            self.examPaper = paper.paper
            self.examAnswers = [:]
            self.examResult = nil
        }
    }

    /// One answer, kept by question id until the whole script is handed in.
    func setExamAnswer(_ questionId: String, _ value: String) {
        examAnswers[questionId] = value
    }

    func submitExam() {
        guard !examPaper.isEmpty else { return }
        examBusy = true
        let picked = Array(examPicked)
        // A multiple-choice question sends the chosen option; a free response
        // sends prose. Which one it is comes from the paper, not from whether the
        // string happens to look like an option.
        let answers = examPaper.map { question -> ExamAnswerBody in
            let given = examAnswers[question.id] ?? ""
            if question.kind == "mcq" {
                return ExamAnswerBody(questionId: question.id, selectedOptionId: given.isEmpty ? nil : given)
            }
            return ExamAnswerBody(questionId: question.id, answer: given)
        }
        withToken(
            { try await self.api.markExam(token: $0, topicIds: picked, answers: answers) },
            onFailure: { _ in self.examBusy = false }
        ) { result in
            self.examBusy = false
            self.examResult = result
            self.refreshHome()
        }
    }

    func endExam() {
        examPaper = []
        examAnswers = [:]
        examResult = nil
    }

    /// One stored paper, verbatim — opened from the pool's papers list.
    func loadPaperDoc(_ paperId: String) {
        examBusy = true
        withToken(
            { try await self.api.examPaperDoc(token: $0, paperId: paperId) },
            onFailure: { note in self.examBusy = false; self.message = note }
        ) { doc in
            self.examBusy = false
            self.paperDoc = doc
        }
    }

    func closePaperDoc() { paperDoc = nil }

    // ── teaching and admin consoles ─────────────────────────────────────────

    /// Everything the Teaching screen reads, in one go — as the web's page does.
    func loadTeaching() {
        staffBusy = true
        staffNote = nil
        staffError = nil
        withToken(
            { token in
                let classes = try await self.api.teacher(token: token)
                let topics = try? await self.api.myTopics(token: token)
                return (classes, topics?.topics ?? [])
            },
            onFailure: { note in self.staffBusy = false; self.staffError = note }
        ) { payload in
            self.teacherData = payload.0
            self.myTopics = payload.1
            self.staffBusy = false
        }
    }

    func loadAdmin() {
        staffBusy = true
        staffNote = nil
        staffError = nil
        withToken(
            { try await self.api.admin(token: $0) },
            onFailure: { note in self.staffBusy = false; self.staffError = note }
        ) { data in
            self.adminData = data
            self.staffBusy = false
        }
    }

    /// One staff action, then re-read whatever it changed.
    ///
    /// The web's `post()` confirms in a `Notice` and reloads; this is the same
    /// shape — the note lands in `staffNote`, the error in `staffError`, and the
    /// console's data is refreshed so the screen never shows a state the server
    /// has already moved past.
    func staffAction(admin: Bool, _ body: [String: Any], okMsg: String) {
        staffBusy = true
        staffNote = nil
        staffError = nil
        withToken(
            { token in
                if admin { try await self.api.adminAction(token: token, body: body) }
                else { try await self.api.teacherAction(token: token, body: body) }
            },
            onFailure: { note in self.staffBusy = false; self.staffError = note }
        ) { _ in
            self.staffBusy = false
            self.staffNote = okMsg
            if admin { self.loadAdmin() } else { self.loadTeaching() }
        }
    }

    func clearStaffNote() {
        staffNote = nil
        staffError = nil
    }

    // ── the per-student progress sheet ────────────────────────────────────

    /// Open one learner's progress, the web's `StudentProgressPanel`.
    ///
    /// The sheet is its own read, not a slice of the console: the roster's
    /// weekly numbers cannot answer "what are they actually answering?", and
    /// this payload can. Loading, error and empty each state themselves, since
    /// a teacher who taps a silent student deserves to know whether the silence
    /// is theirs or the network's.
    func openStudentProgress(_ student: StaffStudentRef) {
        studentProgressFor = student
        studentProgress = nil
        studentProgressBusy = true
        studentProgressError = nil
        withToken(
            { try await self.api.studentProgress(token: $0, userId: student.userId) },
            onFailure: { note in
                self.studentProgressBusy = false
                self.studentProgressError = note
            }
        ) { data in
            self.studentProgress = data
            self.studentProgressBusy = false
        }
    }

    func closeStudentProgress() {
        studentProgressFor = nil
        studentProgress = nil
        studentProgressError = nil
    }

    /// The banner's wash, saved through the same `/me` door as the avatar's.
    func saveBannerColor(_ color: String) {
        savingProfile = true
        settingsError = nil
        settingsNote = nil
        withToken(
            { try await self.api.patchMe(token: $0, patch: MePatch(bannerColor: color)) },
            onFailure: { note in self.savingProfile = false; self.settingsError = note }
        ) { _ in
            self.refreshMe(after: "Banner saved.")
        }
    }

    /// Upload a profile image — the web's presign → PUT → confirm dance.
    func uploadImage(kind: String, bytes: Data, contentType: String) {
        guard bytes.count <= 5 * 1024 * 1024 else {
            settingsError = "That image is over 5 MB — pick a smaller one."
            settingsNote = nil
            return
        }
        savingProfile = true
        settingsError = nil
        settingsNote = nil
        withToken(
            { try await self.api.uploadProfileImage(token: $0, kind: kind, contentType: contentType, bytes: bytes) },
            onFailure: { note in self.savingProfile = false; self.settingsError = note }
        ) { _ in
            self.refreshMe(after: "Image updated.")
        }
    }

    func removeImage(kind: String) {
        savingProfile = true
        settingsError = nil
        settingsNote = nil
        withToken(
            { try await self.api.removeProfileImage(token: $0, kind: kind) },
            onFailure: { note in self.savingProfile = false; self.settingsError = note }
        ) { _ in
            self.refreshMe(after: "Image removed.")
        }
    }

    /// Read the picked photo into bytes and hand it to the upload dance.
    ///
    /// Kept off the view so the picker control stays a control: it selects, the
    /// model decides what an upload is. Content type comes from the data itself
    /// where possible — the server rejects mismatches at the bucket.
    func loadAndUpload(selection: PhotosPickerItem, kind: String) {
        savingProfile = true
        Task {
            guard let data = try? await selection.loadTransferable(type: Data.self), !data.isEmpty else {
                savingProfile = false
                settingsError = "That photo could not be read. Try another."
                return
            }
            let type = Self.imageContentType(data)
            uploadImage(kind: kind, bytes: data, contentType: type)
        }
    }

    /// Sniff the two content types the bucket accepts, defaulting to JPEG —
    /// the same practical set the web's `accept="image/*"` funnels to.
    static func imageContentType(_ data: Data) -> String {
        if data.starts(with: Data([0x89, 0x50, 0x4E, 0x47])) { return "image/png" }
        return "image/jpeg"
    }

    /// Re-read the account after a media write, and confirm in the page's slot.
    private func refreshMe(after note: String) {
        withToken(
            { try await self.api.meDetail(token: $0) },
            onFailure: { _ in self.savingProfile = false }
        ) { me in
            self.me = me
            self.savingProfile = false
            self.settingsNote = note
        }
    }

    // ── a public profile ────────────────────────────────────────────────────

    ///
    /// Open someone's shared profile.
    ///
    /// Deliberately unauthenticated on the server: a shared link has to open for
    /// someone who is not signed in, and privacy is applied server-side, so a
    /// hidden field arrives absent rather than hidden here.
    ///
    func openProfile(_ handle: String) {
        let clean = handle.trimmed
            .trimmingCharacters(in: CharacterSet(charactersIn: "@"))
            .replacingOccurrences(of: "u/", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !clean.isEmpty else { return }
        profileHandle = clean
        profile = nil
        profileError = nil
        Task {
            do {
                let loaded = try await api.profile(handle: clean)
                self.profile = loaded
            } catch {
                self.profileError = (error as? LocalizedError)?.errorDescription ?? "We could not open that profile."
            }
        }
    }

    func closeProfile() {
        profile = nil
        profileError = nil
        profileHandle = nil
    }

    // ── the account ─────────────────────────────────────────────────────────

    ///
    /// The account, with its own load state.
    ///
    /// Loading, failed and not-yet-attempted are three different things, and a
    /// page that can only render a spinner cannot tell a learner which one they
    /// are in — which is exactly how this screen used to look stuck.
    ///
    func loadMe() {
        meLoading = true
        meError = nil
        withToken(
            { try await self.api.meDetail(token: $0) },
            onFailure: { note in
                self.meLoading = false
                self.meError = note
            }
        ) { me in
            self.me = me
            self.meLoading = false
            self.meError = nil
            self.busy = false
        }
    }

    func saveProfile(name: String, username: String, nickname: String, bio: String, emoji: String, color: String) {
        if let problem = usernameProblem(username) {
            settingsError = problem
            settingsNote = nil
            return
        }
        let patch = MePatch(
            name: name.trimmed.isEmpty ? nil : name.trimmed,
            nickname: nickname.trimmed.isEmpty ? nil : nickname.trimmed,
            username: username.trimmed.isEmpty ? nil : username.trimmed.lowercased(),
            bio: bio.trimmed.isEmpty ? nil : bio.trimmed,
            avatarEmoji: emoji.trimmed.isEmpty ? nil : emoji.trimmed,
            avatarColor: color
        )
        savingProfile = true
        patchMe(patch, okMessage: "Profile saved.") { self.savingProfile = false }
    }

    ///
    /// A privacy toggle.
    ///
    /// The web writes the switch optimistically and then puts it *back* if the
    /// save does not land, so the control never shows a state the server does not
    /// have. This does the same, and reloads the account on failure so the switch
    /// returns to the stored value rather than to a guess.
    ///
    func setVisibility(_ visibility: RevisioEngine.Visibility) {
        me = me.map { current in
            var copy = current
            copy.profileVisibility = visibility
            return copy
        }
        patchMe(MePatch(profileVisibility: visibility), okMessage: "Privacy updated.") {}
    }

    func setLeaderboardOptOut(_ optOut: Bool) {
        me = me.map { current in
            var copy = current
            copy.leaderboardOptOut = optOut
            return copy
        }
        patchMe(MePatch(leaderboardOptOut: optOut), okMessage: "Saved.") {}
    }

    func setNoteDensity(_ value: String) {
        density = value
        savePrefs(Prefs(noteDensity: value, reducedMotion: me?.prefs?.reducedMotion ?? false))
    }

    func setReducedMotion(_ reduced: Bool) {
        savePrefs(Prefs(noteDensity: me?.prefs?.noteDensity ?? density, reducedMotion: reduced))
    }

    private func savePrefs(_ prefs: Prefs) {
        me = me.map { current in
            var copy = current
            copy.prefs = prefs
            return copy
        }
        patchMe(MePatch(prefs: prefs), okMessage: "Saved.") {}
    }

    ///
    /// Start an email change.
    ///
    /// Nothing about `me` changes on success — the address is pending until the
    /// link is clicked — so the confirmation has to say where to look rather than
    /// claim the change happened.
    ///
    func requestEmailChange(password: String, newEmail: String) {
        let address = newEmail.trimmed.lowercased()
        let shaped = address.range(of: emailPattern, options: .regularExpression) != nil
        if password.isEmpty || !shaped {
            settingsError = "Enter your password and a valid new email address."
            settingsNote = nil
            return
        }
        savingEmail = true
        settingsError = nil
        settingsNote = nil
        withTokenSettings(
            { try await self.api.requestEmailChange(token: $0, password: password, newEmail: address) },
            onFailure: { self.savingEmail = false }
        ) { _ in
            self.savingEmail = false
            self.settingsNote = "Check \(address) — the link to confirm arrives by email."
        }
    }

    ///
    /// Change the password, then re-mint this device's session.
    ///
    /// The server revokes *every* refresh token as part of the change, so the
    /// credential this app holds is dead the instant the call returns. The web
    /// re-signs in quietly for exactly this reason; the phone refreshes with the
    /// token it still has, and only falls back to the sign-in screen if that
    /// refresh is refused.
    ///
    func changePassword(current: String, next: String, confirm: String) {
        if next != confirm {
            settingsError = "The two new passwords do not match."
            settingsNote = nil
            return
        }
        if next.count < 8 {
            settingsError = "New password must be at least 8 characters."
            settingsNote = nil
            return
        }
        savingPassword = true
        settingsError = nil
        settingsNote = nil
        let stored = sessionStore.load()
        withTokenSettings(
            { try await self.api.changePassword(token: $0, currentPassword: current, newPassword: next) },
            onFailure: { self.savingPassword = false }
        ) { _ in
            if let refresh = stored?.refreshToken, case let .renewed(session) = await self.api.refresh(refreshToken: refresh) {
                self.sessionStore.save(session)
                self.savingPassword = false
                self.settingsNote = "Password changed. Other devices have been signed out."
            } else {
                // The old refresh token died with the change and the new one never
                // arrived: there is nothing left to hold.
                self.savingPassword = false
                self.endSession("Password changed. Sign in again on this device.")
            }
        }
    }

    func dismissSettingsNotice() {
        settingsNote = nil
        settingsError = nil
    }

    ///
    /// Like `withToken`, but a failure lands in the page's own notice instead of
    /// as a banner over the top of the app.
    ///
    /// A failed save is about the form: it belongs next to the field that failed,
    /// and it should stay until the next action rather than sliding away on a
    /// timer. That is the difference between the web's `Notice` and a toast, and
    /// the difference this page is built on.
    private func withTokenSettings<T>(
        _ work: @escaping (String) async throws -> T,
        onFailure: @escaping () -> Void = {},
        then: @escaping (T) async -> Void
    ) {
        Task {
            switch await tokenOrReason() {
            case .ended:
                onFailure()
            case .unavailable:
                settingsError = online ? serverBusyCopy : offlineCopy
                onFailure()
            case .ready(let token):
                do {
                    let result = try await work(token)
                    await then(result)
                } catch {
                    let note = (error as? LocalizedError)?.errorDescription ?? "That did not work."
                    settingsError = note
                    onFailure()
                }
            }
        }
    }

    private func patchMe(_ patch: MePatch, okMessage: String?, onFinish: @escaping () -> Void) {
        busy = true
        meError = nil
        withToken(
            { token -> MeDetail in
                try await self.api.patchMe(token: token, patch: patch)
                return try await self.api.meDetail(token: token)
            },
            onFailure: { note in
                self.busy = false
                self.meError = note
                // A refused toggle has to go back to the stored value, or the
                // switch would show a state the server does not have.
                self.settingsError = note
                self.loadMe()
                onFinish()
            }
        ) { me in
            self.me = me
            self.busy = false
            self.settingsNote = okMessage
            onFinish()
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
        notesOpen = false
        self.met = met
        self.total = total
        message = nil
        cardStartedAt = Date()
        confettiTrigger = 0
        promoted = false
        xpThisSession = 0
        xpAtSessionStart = home?.totalXp
    }

    func setAnswer(_ value: String) { answer = value }
    func setSelection(_ value: String) { selection = value }

    func submit() { submit(advanceOnCorrect: false) }

    ///
    /// Grade the card on screen.
    ///
    /// `advanceOnCorrect` is the web's "one Enter does the whole loop" on an
    /// already-green cloze: the verdict that comes back — the server's or the
    /// pack-key preview offline — decides whether the same press moves straight
    /// on. The check happens where the verdict lands, so there is no race
    /// between grading and advancing.
    ///
    func submit(advanceOnCorrect: Bool) {
        guard let card = cards[safe: index], feedback == nil else { return }
        let trimmed = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        let given = trimmed.isEmpty ? nil : trimmed
        if card.kind == "mcq" && selection == nil { return }
        if card.kind != "mcq" && given == nil { return }

        let duration = Int(Date().timeIntervalSince(cardStartedAt) * 1000)
        let wasOnline = online
        let mode = self.mode.rawValue
        let sessionId = self.sessionId
        Task { @MainActor in
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
                    if advanceOnCorrect && card.kind == "cloze" && result.verdict.correct { next() }
                    return
                }
            }
            // No server: owe it the review. With a key we can still mark it here;
            // without one, say the mark is coming rather than invent a verdict the
            // server may disagree with.
            store.enqueueReview(cardId: card.id, answer: given, selectedOptionId: selection, durationMs: duration, mode: mode)
            let preview = Grading.previewVerdict(card, answer: given, selectedOptionId: selection)
            apply(
                preview,
                Grading.primaryAnswer(card),
                nil,
                0,
                provisional: true
            )
            if advanceOnCorrect && card.kind == "cloze" && preview?.correct == true { next() }
        }
    }

    private func apply(_ verdict: Verdict?, _ correctAnswer: String?, _ explanation: String?, _ xp: Int, provisional: Bool) {
        feedback = Feedback(verdict: verdict, correctAnswer: correctAnswer, explanation: explanation, xpAwarded: xp, provisional: provisional)
        answered += 1
        xpThisSession += xp
        if verdict?.correct == true {
            correct += 1
            // The reward moment: a correct mark fires the small burst, the same
            // instant the web's `burst(46, 0.46)` does.
            confettiTrigger += 1
        }
        pending = store.pendingCount()
    }

    func next() {
        if index + 1 >= cards.count {
            // The queue is empty — the moment the ladder visibly lands. Compare
            // where the session started with where the fresh ladder puts us: a
            // higher rung earns the full burst, exactly the web's
            // `change?.promoted` celebration.
            if let start = xpAtSessionStart {
                promoted = RankLadder.rankFor(start + xpThisSession).index
                    > RankLadder.rankFor(start).index
            }
            if promoted { confettiTrigger += 1 }
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
        ended = false
        promoted = false
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

    /// The learner ends the session early — the web's "End session".
    ///
    /// Every answered card's XP and count is already banked, so nothing is lost;
    /// the summary still opens (titled "Session ended", not "complete") and the
    /// remaining cards simply stay due.
    func endSessionEarly() {
        finished = true
        ended = true
        feedback = nil
        Task { if let token = await ensureToken() { await drainOutbox(token: token) } }
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
            RootView()
        }
    }
}

/// The root is the design language, not a black rectangle with views in it: the
/// theme decides both palettes and the app follows the system the way the
/// website follows the OS preference.
private struct RootView: View {
    @Environment(\.revisio) private var colors
    @StateObject private var model = AppModel()

    var body: some View {
        RevisioTheme {
            ZStack(alignment: .top) {
                content
                if let message = model.message {
                    Banner(message: message) { model.dismissMessage() }
                }
                if model.moreOpen {
                    MoreSheet(
                        role: model.me?.role,
                        current: model.destination,
                        name: model.me?.name ?? model.name,
                        rank: model.ranked?.ranked.rank,
                        onPick: { model.go($0) },
                        onClose: { model.moreOpen = false },
                        onSignOut: { model.moreOpen = false; model.signOut() },
                        onProfile: model.me?.username.map { handle in { model.openProfile(handle) } }
                    )
                    .transition(.opacity)
                }
            }
            .animation(Motion.Exit.quick, value: model.moreOpen)
            // The account's own calm preference joins the system's: either one
            // settles the springs, whichever switch the learner used to ask.
            .environment(\.revisioReduceMotion, model.me?.prefs?.reducedMotion ?? false)
        }
    }

    @ViewBuilder private var content: some View {
        if model.loading {
            // A shape, not a bare spinner: the wordmark and one honest line —
            // the web's skeleton, reduced to what a phone needs.
            VStack(spacing: 10) {
                Wordmark(token: Type.display)
                Text("Loading your queue…")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !model.signedIn {
            AuthView(model: model)
        } else if model.inReview {
            SessionView(model: model)
        } else if model.profileHandle != nil {
            // A shared profile is a page, not a destination: it opens over whatever
            // the learner was looking at and closes back to it, which is what a
            // link out of a chat window should do.
            ProfileView(model: model)
        } else {
            VStack(spacing: 0) {
                // The update notice rides above every destination: asked once at
                // launch, shown until dismissed, and never in the way of the
                // screens themselves.
                UpdateBanner(model: model)
                Group {
                    switch model.destination {
                    case .today: TodayView(model: model)
                    case .review: ReviewView(model: model)
                    case .learn: LearnView(model: model)
                    case .cram: CramView(model: model)
                    case .rank: RankView(model: model, onOpenProfile: { model.openProfile($0) })
                    case .exam: ExamView(model: model)
                    case .practice: PracticeView(model: model)
                    case .library: LibraryView(model: model)
                    case .settings: SettingsView(model: model)
                    case .teaching: TeachingView(model: model)
                    case .admin: AdminView(model: model)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                TabBar(
                    current: model.destination,
                    role: model.me?.role,
                    due: model.home?.due ?? 0,
                    onSelect: { model.go($0) },
                    onMore: { model.moreOpen = true }
                )
            }
        }
    }
}

///
/// The update notice, shown over every destination until dismissed.
///
/// The server was asked once at launch what the newest client is; this renders
/// the answer. "Available" is a sentence, "required" is a sentence and a
/// different weight — the server's `minBuild` floor is what makes the
/// difference, and the copy does not pretend otherwise. Either way the app
/// keeps working: an update notice must never be the thing that stops a learner
/// from doing their reviews.
///
struct UpdateBanner: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel

    var body: some View {
        if !model.updateDismissed && model.update.kind != .none {
            let required = model.update.kind == .required
            SurfaceCard {
                HStack(spacing: 12) {
                    BoxedGlyph(icon: required ? "rocket" : "download", tint: required ? colors.streak : nil)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(required ? "This version must be updated" : "An update is available")
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        Text(
                            required
                                ? "Version \(model.update.latest) is required — older builds can no longer be guaranteed to work."
                                : "Version \(model.update.latest) is out. You can keep studying either way."
                        )
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    IconPill(icon: "close") { model.dismissUpdate() }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }
}

/// The website's `BottomNav`, not a UIKit tab bar.
///
/// A hairline instead of a shadow, a 3px ink bar over the current slot that
/// travels between slots rather than blinking, the due count on the slot that
/// clears it, and each glyph at the registry's own weight.
private struct TabBar: View {
    @Environment(\.revisio) private var colors

    let current: Destination
    let role: String?
    let due: Int
    let onSelect: (Destination) -> Void
    let onMore: () -> Void

    private static let indicatorWidth: CGFloat = 36

    var body: some View {
        let tabs = Destination.bar(role)
        // More is a real slot, so the indicator has five positions to travel
        // between even though only four of them are destinations — and it parks
        // under More while any page behind it is open, which is what tells the
        // learner where they are when the page itself cannot say so.
        let slots = tabs.count + 1
        let index = tabs.firstIndex(of: current).map { CGFloat($0) } ?? CGFloat(slots - 1)

        return VStack(spacing: 0) {
            Hairline()
            GeometryReader { geo in
                let travel = geo.size.width / CGFloat(slots) * (index + 0.5) - Self.indicatorWidth / 2

                ZStack(alignment: .topLeading) {
                    HStack(spacing: 0) {
                        ForEach(tabs) { tab in
                            TabSlot(
                                label: tab.label,
                                icon: tab.icon,
                                active: tab == current,
                                due: tab == .review ? due : 0,
                                action: { onSelect(tab) }
                            )
                        }
                        TabSlot(
                            label: "More",
                            icon: "more",
                            active: Destination.overflow(role).contains(current),
                            due: 0,
                            action: onMore
                        )
                    }
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(colors.foreground)
                        .frame(width: Self.indicatorWidth, height: 3)
                        .offset(x: travel)
                        // The web's shared-layout spring, not a curve: the
                        // indicator travels between slots with velocity, which is
                        // what makes the bar read as one control.
                        .animation(Motion.Springs.layout.animation, value: current)
                }
            }
            .frame(height: Metrics.navHeight)
            // `glass-bar`: translucent enough that the page is visibly passing
            // underneath it. A hair less opaque than the stylesheet's 82%, since
            // a native bar cannot blur a backdrop the way `backdrop-filter` can.
            .background(colors.background.opacity(0.94))
        }
    }
}

private struct TabSlot: View {
    @Environment(\.revisio) private var colors

    let label: String
    let icon: String
    let active: Bool
    let due: Int
    let action: () -> Void

    var body: some View {
        let ink = active ? colors.foreground : colors.mutedForeground
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack(alignment: .topTrailing) {
                    Icon(icon, size: 22, strokeWidth: active ? 2.3 : 1.9, color: ink)
                    if due > 0 {
                        // "There is something here for you" — the one badge colour.
                        Text(due > 99 ? "99+" : "\(due)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(colors.good, in: Capsule())
                            .offset(x: 12, y: -6)
                    }
                }
                Text(label)
                    .font(.system(size: 11, weight: active ? .semibold : .medium))
                    .foregroundColor(ink)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 14)
        }
        .buttonStyle(PressScaleStyle())
    }
}

///
/// The overflow sheet — the web's `AccountSheet`, minus the drawer it is not.
///
/// Every destination the bar cannot hold lives here as a card: label, the web's
/// own four-word hint, and a chevron. The sheet rides the `soft` spring up from
/// below its own height, because that is what the web does with it; the scrim
/// fades over the quick duration on the way in and the instant one on the way out.
/// Sign out sits at the bottom, where a decision belongs after the list of places
/// rather than among them.
///
private struct MoreSheet: View {
    @Environment(\.revisio) private var colors

    let role: String?
    let current: Destination
    let name: String
    let rank: RevisioEngine.Rank?
    let onPick: (Destination) -> Void
    let onClose: () -> Void
    let onSignOut: () -> Void
    let onProfile: (() -> Void)?

    @State private var shown = false

    var body: some View {
        ZStack(alignment: .bottom) {
            // The scrim. It takes the tap that dismisses, so the sheet never has
            // to catch a gesture meant for the page underneath.
            colors.scrim.opacity(shown ? 0.5 : 0)
                .ignoresSafeArea()
                .onTapGesture { onClose() }

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name.isEmpty ? "Your account" : name)
                            .font(Type.strong.font)
                            .foregroundStyle(colors.foreground)
                        if let rank {
                            Text("\(rank.label) · \(rank.points) RP")
                                .font(Type.fine.font)
                                .foregroundStyle(colors.mutedForeground)
                        }
                    }
                    Spacer(minLength: 0)
                    IconPill(icon: "close", action: onClose)
                }

                Spacer().frame(height: 14)
                Hairline()

                ForEach(Destination.overflow(role)) { item in
                    Button {
                        onPick(item)
                    } label: {
                        HStack(spacing: 14) {
                            BoxedGlyph(icon: item.icon, tint: item == current ? colors.foreground : colors.mutedForeground)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.label)
                                    .font(Type.strong.font)
                                    .foregroundStyle(colors.foreground)
                                Text(item.hint)
                                    .font(Type.fine.font)
                                    .foregroundStyle(colors.mutedForeground)
                            }
                            Spacer(minLength: 0)
                            Icon("expand", size: 16, color: colors.mutedForeground)
                        }
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Hairline()
                }

                if let onProfile {
                    Spacer().frame(height: 14)
                    PillButton(text: "View my public profile", tone: .secondary, icon: "visible") {
                        onClose()
                        onProfile()
                    }
                }
                Spacer().frame(height: 10)
                PillButton(text: "Sign out", tone: .ghost, icon: "signOut") { onSignOut() }
                Spacer().frame(height: 8)
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(colors.background, in: UnevenRoundedRectangle(
                topLeadingRadius: Radius.xl,
                topTrailingRadius: Radius.xl,
                style: .continuous
            ))
            .offset(y: shown ? 0 : 600)
            .onAppear { shown = true }
            .animation(Motion.Springs.soft.animation, value: shown)
        }
    }
}

/// A banner rather than a dialog: the app is offline-first, so "that did not
/// work" is information, not an interruption.
private struct Banner: View {
    @Environment(\.revisio) private var colors
    let message: String
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(message)
                .font(Type.caption.font)
                .foregroundStyle(colors.primaryForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            LabelText(text: "Dismiss", token: Type.micro, color: colors.primaryForeground.opacity(0.7))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(colors.foreground, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .padding(16)
        .onTapGesture(perform: dismiss)
    }
}

///
/// The web's auth pages, ported: a compact ink band as the header — wordmark
/// tile, tagline, eyebrow and display line — with the form card overlapping its
/// lower edge by a fixed 32px, exactly as `AuthShell.tsx` composes them. One
/// screen carries login and register, as `AuthForm.tsx` does: the MFA stage
/// appears in place, registration offers the student/teacher choice with
/// subject chips and a class code, and every response lands in a Notice.
///
private struct AuthView: View {
    @Environment(\.revisio) private var colors
    @ObservedObject var model: AppModel
    @State private var mode: AuthMode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var role = "student"
    @State private var subjectIds: Set<String> = []
    @State private var classCode = ""
    @State private var note = ""
    @State private var totp = ""
    @State private var unverifiedEmail: String?
    @State private var error = ""
    @State private var info = ""
    @State private var busy = false
    @State private var subjects: [PublicSubject] = []

    private enum AuthMode { case login, register }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                band
                card
                footer
            }
            .padding(.horizontal, 20)
        }
        .background(colors.background)
        .task {
            // The registration form's subject list — fetched once, like the
            // web's `/auth/subjects-public` read, and quietly absent when the
            // network is not there: an offline register was never going to land.
            subjects = await model.publicSubjects()
        }
    }

    /// The ink band: wordmark tile, tagline, eyebrow, display line — and 64pt
    /// of pad below the display line, the last 32 of which the card overlaps.
    /// Written once against the band palette, the way `TilePanel` does it:
    /// remap the roles, not the colours.
    private var band: some View {
        TilePanel(tone: .dark) {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 0)
                HStack(spacing: 10) {
                    BandWordmark()
                    Text("Revisio")
                        .font(Type.tagline.font)
                        .foregroundStyle(colors.bandScoped.foreground)
                }
                Spacer().frame(height: 40)
                LabelText(text: "Spaced repetition", token: Type.eyebrow, color: colors.bandScoped.mutedForeground)
                Spacer().frame(height: 8)
                Text("Ten minutes a day.")
                    .font(Type.display.font)
                    .foregroundStyle(colors.bandScoped.foreground)
                Spacer().frame(height: 64)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }
    }

    /// The form card, pulled up over the band's lower edge by a fixed 32pt —
    /// the web's `-mt-8`, which is what makes the card look placed.
    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(mode == .login ? "Welcome back" : "Create your account")
                .font(Type.tagline.font)
                .foregroundStyle(colors.foreground)
            Spacer().frame(height: 6)
            Text(mode == .login ? "Your queue is where you left it." : "Choose your subjects now — you can change them later.")
                .font(Type.caption.font)
                .foregroundStyle(colors.mutedForeground)
            Spacer().frame(height: 24)

            if mode == .register {
                AuthLabeledField(icon: "person", label: "Full name", placeholder: "Ada Lovelace", text: $name)
                Spacer().frame(height: 16)
            }
            AuthLabeledField(icon: "mail", label: "Email", placeholder: "you@school.edu", text: $email, keyboard: .emailAddress)
            Spacer().frame(height: 16)
            AuthLabeledField(
                icon: "secure", label: "Password",
                placeholder: mode == .login ? "Your password" : "At least 8 characters",
                text: $password, secure: true
            )

            if mode == .register {
                registerSection
            }

            // The 2FA stage: the server has asked for the six digits. It arrives
            // in place with the sheet spring, as the web's AnimatePresence height
            // animation does — the form grows rather than a second page landing.
            if model.mfaStage {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 16)
                    AuthLabeledField(
                        icon: "private", label: "Two-factor code", placeholder: "000000",
                        text: $totp, keyboard: .numberPad
                    )
                    Text("From your authenticator app — or one of your recovery codes.")
                        .font(Type.fine.font)
                        .foregroundStyle(colors.mutedForeground)
                        .padding(.top, 6)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if !error.isEmpty {
                AuthNoticeView(text: error, good: false) { error = "" }
                    .padding(.top, 12)
            }
            if !info.isEmpty {
                AuthNoticeView(text: info, good: true) { info = "" }
                    .padding(.top, 12)
            }

            if let address = unverifiedEmail {
                Spacer().frame(height: 12)
                PillButton(
                    text: "Re-send the verification email", tone: .secondary, icon: "rotate"
                ) {
                    busy = true
                    Task {
                        let sent = await model.resendVerification(email: address)
                        busy = false
                        error = ""
                        info = sent
                            ? "Sent again to \(address). It can take a minute to arrive."
                            : "We could not re-send that right now. Try again shortly."
                    }
                }
            }

            Spacer().frame(height: 16)
            PillButton(text: submitLabel, enabled: canSubmit, large: true) { submit() }

            Spacer().frame(height: 20)
            Text(mode == .login ? "No account yet? Create one" : "Already registered? Sign in")
                .font(Type.caption.font)
                .foregroundStyle(colors.foreground)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .onTapGesture {
                    error = ""
                    info = ""
                    model.mfaStage = false
                    totp = ""
                    mode = mode == .login ? .register : .login
                }
        }
        .padding(20)
        .background(colors.card, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .strokeBorder(colors.border, lineWidth: 1)
        )
        .offset(y: -32)
        .entrance(scale: true)
        .animation(Motion.Springs.soft.animation, value: model.mfaStage)
    }

    @ViewBuilder
    private var registerSection: some View {
        Spacer().frame(height: 20)
        LabelText(text: "I am joining as", token: Type.label)
        Spacer().frame(height: 8)
        HStack(spacing: 8) {
            RoleOptionCard(
                label: "Student", hint: "Study my own subjects", icon: "start",
                selected: role == "student"
            ) { role = "student" }
            RoleOptionCard(
                label: "Teacher", hint: "Run classes and share content", icon: "teacher",
                selected: role == "teacher"
            ) { role = "teacher" }
        }

        if role == "student" && !subjects.isEmpty {
            Spacer().frame(height: 16)
            LabelText(text: "Subjects", token: Type.label)
            Spacer().frame(height: 8)
            SubjectChipGrid(subjects: subjects, selected: subjectIds) { id in
                if subjectIds.contains(id) { subjectIds.remove(id) } else { subjectIds.insert(id) }
            }
        }

        Spacer().frame(height: 16)
        AuthLabeledField(
            icon: "join", label: "Class code (optional)", placeholder: "e.g. 7HKQ2M",
            text: $classCode
        )
        .onChange(of: classCode) { next in
            // The web's shaping: uppercase, six characters, no prompts.
            let shaped = next.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(6)
            if shaped != next { classCode = String(shaped) }
        }

        if role == "teacher" {
            Spacer().frame(height: 16)
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Tell us about your teaching", token: Type.label)
                TextField(
                    "", text: $note,
                    prompt: Text("School, role, subjects you teach…").foregroundColor(colors.mutedForeground.opacity(0.75)),
                    axis: .vertical
                )
                .lineLimit(3...6)
                .font(Type.body.font)
                .foregroundStyle(colors.foreground)
                .padding(12)
                .background(colors.card, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .strokeBorder(colors.border, lineWidth: Metrics.inputBorder)
                }
                Text("A developer reads this before activating the account.")
                    .font(Type.caption.font)
                    .foregroundStyle(colors.mutedForeground)
            }
        }
    }

    private var submitLabel: String {
        if busy { return "Just a moment…" }
        if mode == .login { return model.mfaStage ? "Verify and sign in" : "Sign in" }
        return "Create account"
    }

    private var canSubmit: Bool {
        if busy { return false }
        if mode == .login {
            return !email.trimmed.isEmpty && !password.isEmpty && (!model.mfaStage || !totp.trimmed.isEmpty)
        }
        return !email.trimmed.isEmpty && password.count >= 8 && !name.trimmed.isEmpty
    }

    /// The one submit path, shared by the button — the keyboard's action key
    /// routes through the same call, so the two can never disagree.
    private func submit() {
        if busy { return }
        error = ""
        info = ""
        busy = true
        if mode == .login {
            // The code goes through whole: a six-digit TOTP or a recovery code —
            // the server decides which it got, so nothing here strips characters.
            let code = model.mfaStage ? totp.trimmed.isEmpty ? nil : totp.trimmed : nil
            model.signIn(email: email.trimmed, password: password, totp: code)
            // signIn sets its own loading state; reflect the outcome from there.
            Task {
                while model.loading { try? await Task.sleep(nanoseconds: 100_000_000) }
                busy = false
                if model.signedIn {
                    // Signed in — nothing else to say.
                } else if model.mfaStage {
                    info = "Enter the six-digit code from your authenticator app — or one of your recovery codes."
                } else if model.message != nil {
                    unverifiedEmail = nil
                    error = model.message ?? "Sign in failed."
                }
            }
        } else {
            Task {
                do {
                    let verifyUrl = try await model.register(
                        email: email.trimmed,
                        password: password,
                        name: name.trimmed,
                        role: role,
                        note: note.trimmed.isEmpty ? nil : note.trimmed,
                        subjectIds: subjectIds.isEmpty ? nil : Array(subjectIds),
                        classCode: classCode.trimmed.isEmpty ? nil : classCode.trimmed
                    )
                    busy = false
                    info = verifyUrl != nil
                        ? "Email delivery is not configured on this deployment, so here is your verification link."
                        : "Account created. Check your inbox for the verification link, then sign in."
                } catch {
                    busy = false
                    self.error = (error as? LocalizedError)?.errorDescription ?? "Registration failed."
                }
            }
        }
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Text(
                mode == .login
                    ? "No account yet? Create one — or study offline; your session and today's cards are kept on this device."
                    : "Already registered? Sign in — then keep studying offline."
            )
            .font(Type.caption.font)
            .foregroundStyle(colors.mutedForeground)
            .multilineTextAlignment(.center)
            // Password reset lives on the web for now; a stated path beats a
            // missing affordance (the phones' share of the reset fix).
            if mode == .login {
                Spacer().frame(height: 6)
                Text("Forgot your password? Reset it on the web at \(apiBase).")
                    .font(Type.fine.font)
                    .foregroundStyle(colors.mutedForeground)
                    .multilineTextAlignment(.center)
            }
            Spacer().frame(height: 24)
        }
        .padding(.horizontal, 4)
    }
}

private enum AuthModeMarker {}

/// The "R" tile on the auth band: primary on primary — ink-on-ink in light
/// mode — reads through the band's own remapped roles.
private struct BandWordmark: View {
    @Environment(\.revisio) private var colors

    var body: some View {
        let band = colors.bandScoped
        Text("R")
            .font(Type.tagline.font.weight(.bold))
            .foregroundStyle(band.primaryForeground)
            .frame(width: 34, height: 34)
            .background(band.primary, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    }
}

/// Label + leading glyph + control — the web's `Field`, glyph against the pill.
private struct AuthLabeledField: View {
    @Environment(\.revisio) private var colors
    let icon: String
    let label: String
    let placeholder: String
    @Binding var text: String
    var secure: Bool = false
    var keyboard: KeyboardKind = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: label, token: Type.label)
            HStack(spacing: 10) {
                Icon(icon, size: 17, color: colors.mutedForeground)
                if secure {
                    SecureField("", text: $text, prompt: Text(placeholder).foregroundColor(colors.mutedForeground.opacity(0.75)))
                        .autocorrectionDisabled()
                } else {
                    TextField("", text: $text, prompt: Text(placeholder).foregroundColor(colors.mutedForeground.opacity(0.75)))
                        .modifier(KeyboardHints(keyboard: keyboard))
                        .autocorrectionDisabled()
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: Metrics.inputMinHeight)
            .background(colors.card, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                    .strokeBorder(colors.border, lineWidth: Metrics.inputBorder)
            }
        }
    }
}

/// The student/teacher choice: two labelled options with meaning, not a pair of
/// bare buttons that require guessing — the web's `option` cards.
private struct RoleOptionCard: View {
    @Environment(\.revisio) private var colors
    let label: String
    let hint: String
    let icon: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Icon(icon, size: 17, color: colors.foreground)
                Text(label)
                    .font(Type.body.font.weight(.semibold))
                    .foregroundStyle(colors.foreground)
            }
            Text(hint)
                .font(Type.caption.font)
                .foregroundStyle(colors.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(selected ? colors.secondary : colors.card, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .strokeBorder(selected ? colors.foreground : colors.border, lineWidth: 2)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
    }
}

/// Subject chips that wrap — the web's `flex flex-wrap gap-2` row.
private struct SubjectChipGrid: View {
    let subjects: [PublicSubject]
    let selected: Set<String>
    let onToggle: (String) -> Void

    var body: some View {
        FlowGrid(subjects) { subject in
            ChipPill(
                text: subject.name,
                active: selected.contains(subject.id),
                action: { onToggle(subject.id) }
            )
        }
    }
}

/// The auth screen's inline notice, in the Settings `NoticeView`'s image —
/// the web's two-slot confirm/refuse pattern, cleared on the next action.
/// (Named locally: `NoticeView` itself is Settings' shared notice component.)
private struct AuthNoticeView: View {
    @Environment(\.revisio) private var colors
    let text: String
    let good: Bool
    let dismiss: () -> Void

    var body: some View {
        Button(action: dismiss) {
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

    private var ink: Color { good ? colors.goodPressed : colors.destructive }
}

/// A wrapping grid of identifiable items, three across — the fixed-count row
/// layout the Android port's `chunked(3)` uses, so both phones wrap identically.
private struct FlowGrid<Element: Identifiable, Content: View>: View {
    private let items: [Element]
    private let content: (Element) -> Content

    init(_ items: [Element], @ViewBuilder content: @escaping (Element) -> Content) {
        self.items = items
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(0..<rowCount, id: \.self) { row in
                HStack(spacing: 6) {
                    ForEach(0..<columnCount(row), id: \.self) { column in
                        content(items[row * 3 + column])
                    }
                }
            }
        }
    }

    private var rowCount: Int { (items.count + 2) / 3 }

    private func columnCount(_ row: Int) -> Int {
        let remaining = items.count - row * 3
        return min(3, remaining)
    }
}
