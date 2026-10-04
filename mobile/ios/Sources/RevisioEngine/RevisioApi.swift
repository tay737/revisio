import Foundation

/// A signed-in session, with the refresh token the server handed us at login.
public struct AuthSession {
    public var accessToken: String
    public var refreshToken: String?
    public var user: ApiUser
}

public struct ApiError: Error, LocalizedError {
    public let status: Int
    public let code: String
    public let message: String
    public var errorDescription: String? { message }
}

private struct LoginBody: Encodable {
    let email: String
    let password: String
    /// The 2FA stage: the first call goes out without it, the server answers
    /// `mfaRequired`, and the retry carries the code. The same field also
    /// accepts a recovery code — the server decides which it got, so the app
    /// sends it verbatim (`recoveryCode` mirrors it for enrolments that use
    /// the named field).
    var totp: String? = nil
    var recoveryCode: String? = nil
}
private struct RefreshBody: Encodable { let refreshToken: String }
private struct RegisterBody: Encodable {
    let email: String
    let password: String
    let name: String
    var role: String? = nil
    var note: String? = nil
    var subjectIds: [String]? = nil
    var classCode: String? = nil
}
private struct RegisterResponse: Decodable {
    public var id: String?
    public var email: String?
    public var name: String?
    public var verifyUrl: String?
}
private struct ResendVerificationBody: Encodable { let email: String }
private struct SubmitBody: Encodable {
    let cardId: String
    let answer: String?
    let selectedOptionId: String?
    let durationMs: Int
    let mode: String
}
/// What a sign-in attempt actually told us. `mfaRequired` is a first-class
/// outcome, not a throw: the 2FA stage follows it in the same form.
public enum LoginOutcome {
    case signedIn(AuthSession)
    /// The server wants the six digits — or a recovery code — before it decides.
    case mfaRequired
}

/// What a refresh attempt actually told us.
///
/// A `nil` used to stand for two opposite things — "the server rejected this
/// token" and "we never reached the server" — and the app treated both as "could
/// not load", which is how a signed-out learner ended up looking at an account
/// screen claiming to load. Mirrors `RefreshOutcome` in `src/lib/api.ts`.
public enum RefreshOutcome {
    case renewed(AuthSession)

    /// The server said no. Only signing in again can fix it.
    case rejected

    /// We could not find out. The session stays exactly as it was.
    case unavailable
}

private struct ApiErrorEnvelope: Decodable {
    struct Body: Decodable { let code: String?; let message: String? }
    let error: Body?
}

private struct EnrollBody: Encodable { let subjectId: String }
private struct EnrollResult: Decodable { let enrolled: Bool }
private struct CramBody: Encodable {
    let topicIds: [String]
    let maxPerTopic: Int
    let noteDensity: String
}
private struct WroteResult: Decodable { let updated: Bool? }
private struct SubmitRequest: Encodable {
    let cardId: String
    let answer: String?
    let selectedOptionId: String?
    let durationMs: Int
    let mode: String
    let sessionId: String?
}

/// Percent-encode a path segment or query value.
private func escaped(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? value
}

/// The native client's one door to the backend — same `/api/v1` contract as web.
public final class RevisioApi: ReviewApi {
    private let base: String
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(baseUrl: String, session: URLSession = .shared) {
        self.base = baseUrl.hasSuffix("/") ? String(baseUrl.dropLast()) : baseUrl
        self.session = session
    }

    private func send<T: Decodable>(
        _ path: String,
        method: String = "GET",
        token: String? = nil,
        body: Data? = nil,
        as type: T.Type
    ) async throws -> (T, HTTPURLResponse) {
        var request = URLRequest(url: URL(string: base + path)!)
        request.httpMethod = method
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = body
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ApiError(status: 0, code: "error", message: "No response from the server.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? decoder.decode(ApiErrorEnvelope.self, from: data)
            throw ApiError(
                status: http.statusCode,
                code: envelope?.error?.code ?? "error",
                message: envelope?.error?.message ?? "Request failed (\(http.statusCode))."
            )
        }
        return (try decoder.decode(T.self, from: data), http)
    }

    /// The transport without a decoder, for the calls whose body the caller does
    /// not need — an action envelope's `{ok:true}` says nothing worth typing.
    private func sendRaw(
        _ path: String,
        method: String = "GET",
        token: String? = nil,
        body: Data? = nil
    ) async throws -> Data {
        var request = URLRequest(url: URL(string: base + path)!)
        request.httpMethod = method
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = body
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ApiError(status: 0, code: "error", message: "No response from the server.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? decoder.decode(ApiErrorEnvelope.self, from: data)
            throw ApiError(
                status: http.statusCode,
                code: envelope?.error?.code ?? "error",
                message: envelope?.error?.message ?? "Request failed (\(http.statusCode))."
            )
        }
        return data
    }

    ///
    /// Sign in. A 2FA-enabled account is not an error: the first attempt
    /// answers `mfaRequired` as a **typed outcome** — the caller shows the
    /// code field and retries with it — rather than the dead end this used to
    /// throw. The retry sends the same credentials plus the six-digit code,
    /// or a recovery code, and the server decides which it got.
    ///
    public func login(email: String, password: String, totp: String? = nil) async throws -> LoginOutcome {
        let body = try encoder.encode(LoginBody(email: email, password: password, totp: totp, recoveryCode: nil))
        let (parsed, http) = try await send("/api/v1/auth/login", method: "POST", body: body, as: LoginResponse.self)
        if parsed.mfaRequired == true || (parsed.accessToken == nil && totp == nil) {
            return .mfaRequired
        }
        guard let token = parsed.accessToken, let user = parsed.user else {
            throw ApiError(status: 500, code: "no_session", message: "The server did not return a session.")
        }
        return .signedIn(AuthSession(accessToken: token, refreshToken: Self.refreshToken(from: http), user: user))
    }

    /// `POST /auth/register` — create an account. Registration never signs in:
    /// the address must be verified first, so the outcome is the copy's problem.
    public func register(
        email: String,
        password: String,
        name: String,
        role: String? = nil,
        note: String? = nil,
        subjectIds: [String]? = nil,
        classCode: String? = nil
    ) async throws -> String? {
        let body = try encoder.encode(RegisterBody(
            email: email, password: password, name: name,
            role: role, note: note, subjectIds: subjectIds, classCode: classCode
        ))
        let (parsed, _) = try await send("/api/v1/auth/register", method: "POST", body: body, as: RegisterResponse.self)
        return parsed.verifyUrl
    }

    /// `GET /auth/subjects-public` — the registration form's subject list.
    public func publicSubjects() async throws -> [PublicSubject] {
        try await send("/api/v1/auth/subjects-public", as: PublicSubjects.self).0.subjects
    }

    /// `PUT /auth/verify-email` — re-send a verification email.
    public func resendVerification(email: String) async throws -> Bool {
        let body = try encoder.encode(ResendVerificationBody(email: email))
        _ = try await sendRaw("/api/v1/auth/verify-email", method: "PUT", body: body)
        return true
    }

    ///
    /// Trade the stored refresh token for a new session.
    ///
    /// The three answers are kept apart on purpose, because the app has to treat
    /// them differently and used to collapse them into one `nil`:
    ///
    ///   • `.rejected` — the server said no. The session is over and the only
    ///     honest thing left is the sign-in screen. Leaving a learner on a cached
    ///     screen here is what made the account page look "stuck": it could
    ///     never load, because nothing was ever going to answer.
    ///   • `.unavailable` — we could not find out (offline, a 5xx, a capacity
    ///     refusal). The session is still good and must survive it.
    ///
    /// This is the distinction `RefreshOutcome` makes in `src/lib/api.ts`, where
    /// the comment records what conflating them cost: people signed out
    /// mid-session whenever the database was merely busy.
    public func refresh(refreshToken: String) async -> RefreshOutcome {
        guard let body = try? encoder.encode(RefreshBody(refreshToken: refreshToken)) else {
            return .unavailable
        }
        do {
            let (parsed, http) = try await send("/api/v1/auth/refresh", method: "POST", body: body, as: RefreshResponse.self)
            let user = parsed.user ?? ApiUser(id: "", email: "", name: "", role: "student", status: nil)
            return .renewed(
                AuthSession(
                    accessToken: parsed.accessToken,
                    refreshToken: Self.refreshToken(from: http) ?? refreshToken,
                    user: user
                )
            )
        } catch let error as ApiError where error.status == 401 || error.status == 403 {
            return .rejected
        } catch {
            // A dropped socket, a DNS failure or a busy server is not a rejection.
            return .unavailable
        }
    }

    public func me(token: String) async throws -> MeResponse {
        let (me, _) = try await send("/api/v1/me", token: token, as: MeResponse.self)
        return me
    }

    /// The session the app takes with it when it loses the network — the only
    /// route that hands back an answer key, which is why it is separate on the
    /// server from the daily queue.
    public func fetchPack(token: String, limit: Int = 20) async throws -> OfflinePack {
        let (pack, _) = try await send("/api/v1/offline/pack?limit=\(limit)", token: token, as: OfflinePack.self)
        return pack
    }

    /// Submit one review right now. The app calls this when it is online, so a
    /// card never has to be invented as a queued entry just to reach the server.
    public func submitDirect(
        token: String,
        cardId: String,
        answer: String?,
        selectedOptionId: String?,
        durationMs: Int,
        mode: String = "daily"
    ) async throws -> ReviewResult {
        let body = try encoder.encode(
            SubmitBody(
                cardId: cardId,
                answer: answer,
                selectedOptionId: selectedOptionId,
                durationMs: durationMs,
                mode: mode
            )
        )
        let (result, _) = try await send("/api/v1/reviews", method: "POST", token: token, body: body, as: ReviewResult.self)
        return result
    }

    public func submitReview(token: String, review: PendingReview) async throws -> ReviewResult {
        try await submitDirect(
            token: token,
            cardId: review.cardId,
            answer: review.answer,
            selectedOptionId: review.selectedOptionId,
            durationMs: review.durationMs,
            mode: review.mode
        )
    }

    /// One review, in any mode.
    ///
    /// `mode` is how the same grading path serves today's queue (`daily`), first
    /// exposure (`learn`), cram (`cram`) and the exam simulator: a card met in any
    /// of them is graded, scheduled and rewarded exactly like any other.
    public func submit(
        token: String,
        cardId: String,
        answer: String?,
        selectedOptionId: String?,
        durationMs: Int,
        mode: String = "daily",
        sessionId: String? = nil
    ) async throws -> ReviewResult {
        let body = try encoder.encode(
            SubmitRequest(
                cardId: cardId,
                answer: answer,
                selectedOptionId: selectedOptionId,
                durationMs: durationMs,
                mode: mode,
                sessionId: sessionId
            )
        )
        let (result, _) = try await send("/api/v1/reviews", method: "POST", token: token, body: body, as: ReviewResult.self)
        return result
    }

    // ── the catalogue ───────────────────────────────────────────────────────

    /// Every public subject, flagged with whether this learner follows it.
    public func subjects(token: String) async throws -> [Subject] {
        let (parsed, _) = try await send("/api/v1/subjects", token: token, as: SubjectList.self)
        return parsed.subjects
    }

    public func enroll(token: String, subjectId: String) async throws -> Bool {
        let body = try encoder.encode(EnrollBody(subjectId: subjectId))
        let (parsed, _) = try await send("/api/v1/subjects", method: "POST", token: token, body: body, as: EnrollResult.self)
        return parsed.enrolled
    }

    /// The topics under a subject that this learner may actually study.
    public func topics(token: String, subjectId: String) async throws -> [Topic] {
        let (parsed, _) = try await send("/api/v1/content?subjectId=\(escaped(subjectId))", token: token, as: TopicList.self)
        return parsed.topics
    }

    /// A topic's notes, in both densities.
    public func lessons(token: String, topicId: String) async throws -> [Lesson] {
        let (parsed, _) = try await send("/api/v1/lessons?topicId=\(escaped(topicId))", token: token, as: LessonList.self)
        return parsed.lessons
    }

    /// A topic's unseen cards, with the notes that explain them.
    public func firstExposure(token: String, topicId: String, batch: Int = 4) async throws -> FirstExposure {
        let (parsed, _) = try await send(
            "/api/v1/learn?topicId=\(escaped(topicId))&batch=\(batch)",
            token: token,
            as: FirstExposure.self
        )
        return parsed
    }

    /// Today's queue, without answer keys — the client asks the server to mark.
    public func todayQueue(token: String, limit: Int = 20) async throws -> [QueueCard] {
        let (parsed, _) = try await send("/api/v1/queue/today?limit=\(limit)", token: token, as: QueueList.self)
        return parsed.queue
    }

    /// Topics available to cram, with counts that match the queue it will deal.
    public func cramTopics(token: String) async throws -> [Topic] {
        let (parsed, _) = try await send("/api/v1/cram", token: token, as: TopicList.self)
        return parsed.topics
    }

    /// Start a cram session: the notes at the chosen density, plus the queue.
    public func cram(
        token: String,
        topicIds: [String],
        maxPerTopic: Int = 20,
        noteDensity: String = "detailed"
    ) async throws -> CramSession {
        let body = try encoder.encode(CramBody(topicIds: topicIds, maxPerTopic: maxPerTopic, noteDensity: noteDensity))
        let (parsed, _) = try await send("/api/v1/cram", method: "POST", token: token, body: body, as: CramSession.self)
        return parsed
    }

    // ── rank, lobby, achievements ───────────────────────────────────────────

    public func gamification(token: String, scope: String = "weekly") async throws -> GamificationPayload {
        let (parsed, _) = try await send("/api/v1/gamification?scope=\(escaped(scope))", token: token, as: GamificationPayload.self)
        return parsed
    }

    // ── the library's own write ─────────────────────────────────────────────

    /// Who may see a public topic this learner owns. Learners only ever see their own.
    public func setTopicVisibility(token: String, topicId: String, visibility: String) async throws -> TopicVisibilityResult {
        let body = try encoder.encode(TopicVisibilityBody(topicId: topicId, visibility: visibility))
        let (parsed, _) = try await send("/api/v1/content", method: "PATCH", token: token, body: body, as: TopicVisibilityResult.self)
        return parsed
    }

    /// Join a class by its code. The teacher's own door, entered from the library.
    public func joinClass(token: String, code: String) async throws -> ClassJoinResult {
        let body = try encoder.encode(ClassJoinBody(code: code))
        let (parsed, _) = try await send("/api/v1/classes/join", method: "POST", token: token, body: body, as: ClassJoinResult.self)
        return parsed
    }

    // ── the exam simulator ──────────────────────────────────────────────────

    /// What the question pool holds for this learner, and how they have done.
    public func examPool(token: String, subjectId: String? = nil) async throws -> ExamPool {
        let query = subjectId.map { "?subjectId=\(escaped($0))" } ?? ""
        let (parsed, _) = try await send("/api/v1/exam\(query)", token: token, as: ExamPool.self)
        return parsed
    }

    ///
    /// Deal a paper.
    ///
    /// There is no separate submit endpoint: the same route either builds a paper
    /// or marks one, and which it does is decided by whether answers came with the
    /// request. That is deliberate on the server — the paper and the marking have
    /// to agree about which questions were dealt, and one route is the only way to
    /// guarantee it.
    ///
    public func examPaper(token: String, topicIds: [String], questionCount: Int = 5) async throws -> ExamPaper {
        let body = try encoder.encode(ExamBody(topicIds: topicIds, questionCount: questionCount, answers: nil))
        let (parsed, _) = try await send("/api/v1/exam", method: "POST", token: token, body: body, as: ExamPaper.self)
        return parsed
    }

    public func markExam(token: String, topicIds: [String], answers: [ExamAnswerBody]) async throws -> ExamResult {
        let body = try encoder.encode(ExamBody(topicIds: topicIds, questionCount: nil, answers: answers))
        let (parsed, _) = try await send("/api/v1/exam", method: "POST", token: token, body: body, as: ExamResult.self)
        return parsed
    }

    // ── maths practice ──────────────────────────────────────────────────────

    ///
    /// What may be drilled in a subject.
    ///
    /// The concept catalogue and the topics arrive together because a practice
    /// session picks from both, and two round trips would let a learner choose a
    /// concept from a catalogue the chosen subject no longer offers.
    ///
    public func mathsCatalogue(token: String, subjectId: String) async throws -> MathsCatalogue {
        let (parsed, _) = try await send("/api/v1/maths?subjectId=\(escaped(subjectId))", token: token, as: MathsCatalogue.self)
        return parsed
    }

    public func startPractice(
        token: String,
        topicIds: [String],
        conceptIds: [String] = [],
        difficulty: String = "mixed",
        count: Int = 10
    ) async throws -> MathsSession {
        let body = try encoder.encode(MathsBody(
            action: "start",
            topicIds: topicIds,
            conceptIds: conceptIds.isEmpty ? nil : conceptIds,
            difficulty: difficulty,
            count: count,
            answers: nil,
            marks: nil,
            maxMarks: nil,
            correct: nil,
            total: nil
        ))
        let (parsed, _) = try await send("/api/v1/maths", method: "POST", token: token, body: body, as: MathsSession.self)
        return parsed
    }

    public func markPractice(token: String, answers: [MathsAnswerBody]) async throws -> [MathsMark] {
        let body = try encoder.encode(MathsBody(
            action: "mark", topicIds: nil, conceptIds: nil, difficulty: nil, count: nil,
            answers: answers, marks: nil, maxMarks: nil, correct: nil, total: nil
        ))
        let (parsed, _) = try await send("/api/v1/maths", method: "POST", token: token, body: body, as: MathsMarked.self)
        return parsed.results
    }

    ///
    /// Claim the session's XP, once, at the end.
    ///
    /// Practice deliberately writes no review log and moves no schedule, so this
    /// is the only thing a finished drill changes — which is why it is a separate
    /// call rather than part of marking each question.
    ///
    public func awardPracticeXp(token: String, marks: Int, maxMarks: Int, correct: Int, total: Int) async throws -> MathsXp {
        let body = try encoder.encode(MathsBody(
            action: "award_xp", topicIds: nil, conceptIds: nil, difficulty: nil, count: nil,
            answers: nil, marks: marks, maxMarks: maxMarks, correct: correct, total: total
        ))
        let (parsed, _) = try await send("/api/v1/maths", method: "POST", token: token, body: body, as: MathsXp.self)
        return parsed
    }

    // ── the account ─────────────────────────────────────────────────────────

    public func meDetail(token: String) async throws -> MeDetail {
        let (parsed, _) = try await send("/api/v1/me", token: token, as: MeDetail.self)
        return parsed
    }

    public func patchMe(token: String, patch: MePatch) async throws {
        let body = try encoder.encode(patch)
        _ = try await send("/api/v1/me", method: "PATCH", token: token, body: body, as: WroteResult.self)
    }

    /// `POST /me/email` — start an email change.
    ///
    /// The address is not swapped here. The server stores it as pending and mails
    /// a one-hour link to the *new* address; only the click moves it. So this is a
    /// request, not a write, and the screen confirms "check your inbox" rather
    /// than "email changed".
    public func requestEmailChange(token: String, password: String, newEmail: String) async throws {
        let body = try encoder.encode(EmailChangeRequest(password: password, newEmail: newEmail))
        _ = try await send("/api/v1/me/email", method: "POST", token: token, body: body, as: WroteResult.self)
    }

    /// `POST /me/password` — change the password.
    ///
    /// Every refresh token is revoked server-side, the caller's included, so the
    /// session is dead the moment this returns. The caller must mint a fresh one
    /// immediately or the next request is answered 401 and the app looks signed
    /// out for no visible reason.
    public func changePassword(token: String, currentPassword: String, newPassword: String) async throws {
        let body = try encoder.encode(PasswordChangeRequest(currentPassword: currentPassword, newPassword: newPassword))
        _ = try await send("/api/v1/me/password", method: "POST", token: token, body: body, as: WroteResult.self)
    }

    /// A public profile. Deliberately unauthenticated: a shared link has to open
    /// for someone who is not signed in, and privacy is applied server-side.
    public func profile(handle: String, token: String? = nil) async throws -> PublicProfile {
        let (parsed, _) = try await send("/api/v1/profile/\(escaped(handle))", token: token, as: PublicProfile.self)
        return parsed
    }

    // ── the update check ────────────────────────────────────────────────

    /// `GET /version` — the newest client the server knows about.
    ///
    /// Deliberately unauthenticated and the first thing the app asks on launch:
    /// an install that is behind deserves to know before it does anything else,
    /// and the endpoint has to work even for a session the server has since
    /// refused.
    public func version() async throws -> VersionInfo {
        try await send("/api/v1/version", as: VersionInfo.self).0
    }

    // ── teaching and admin consoles ─────────────────────────────────────

    /// `GET /teacher` — my classes with per-student rosters.
    public func teacher(token: String) async throws -> TeacherPayload {
        try await send("/api/v1/teacher", token: token, as: TeacherPayload.self).0
    }

    /// `GET /teacher/student?userId=…` — one learner's progress, for the staff
    /// sheet. A teacher may open anyone in their own classes; a developer may
    /// open anyone. The userId is a server-generated id, so it interpolates
    /// into the query verbatim, exactly as `profile(handle)` does.
    public func studentProgress(token: String, userId: String) async throws -> StudentProgress {
        try await send("/api/v1/teacher/student?userId=\(userId)", token: token, as: StudentProgress.self).0
    }

    /// `GET /content?mine=1` — the topics this account may edit, with counts.
    public func myTopics(token: String) async throws -> MyTopicsPayload {
        try await send("/api/v1/content?mine=1", token: token, as: MyTopicsPayload.self).0
    }

    /// `GET /admin` — the whole console in one payload, developers only.
    public func admin(token: String) async throws -> AdminPayload {
        try await send("/api/v1/admin", token: token, as: AdminPayload.self).0
    }

    /// `POST /teacher` — an action envelope, exactly as the web sends it.
    public func teacherAction(token: String, body: [String: Any]) async throws {
        _ = try await postAction("/api/v1/teacher", token: token, body: body)
    }

    /// `POST /admin` — an action envelope, exactly as the web sends it.
    public func adminAction(token: String, body: [String: Any]) async throws {
        _ = try await postAction("/api/v1/admin", token: token, body: body)
    }

    private func postAction(_ path: String, token: String, body: [String: Any]) async throws -> Data {
        guard JSONSerialization.isValidJSONObject(body),
              let payload = try? JSONSerialization.data(withJSONObject: body) else {
            throw ApiError(status: 0, code: "bad_request", message: "That action could not be built.")
        }
        return try await sendRaw(path, method: "POST", token: token, body: payload)
    }

    // ── media: avatar and banner uploads ────────────────────────────────

    /// The web's upload dance, driven from a phone.
    ///
    /// 1. `presign` — the server names where the bytes go;
    /// 2. the client PUTs the bytes straight to that URL, no auth header — the
    ///    presigned URL carries its own;
    /// 3. `confirm` — only now does the pointer swap, so an abandoned upload
    ///    never half-lands. This mirrors `settings/page.tsx` exactly.
    public func uploadProfileImage(token: String, kind: String, contentType: String, bytes: Data) async throws -> String {
        let presignBody = try encoder.encode(
            MediaPresignBody(action: "presign", kind: kind, contentType: contentType, sizeBytes: bytes.count)
        )
        let presigned = try await send(
            "/api/v1/media",
            method: "POST",
            token: token,
            body: presignBody,
            as: MediaPresign.self
        ).0

        guard let url = URL(string: presigned.url) else {
            throw ApiError(status: 0, code: "bad_presign", message: "The upload location was not usable.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (_, putResponse) = try await session.data(for: request)
        guard let putHttp = putResponse as? HTTPURLResponse, (200..<300).contains(putHttp.statusCode) else {
            throw ApiError(status: 0, code: "upload_failed", message: "The image upload was rejected. Try a smaller file.")
        }

        let confirmBody = try encoder.encode(
            MediaConfirmBody(action: "confirm", kind: kind, key: presigned.key, contentType: contentType, sizeBytes: bytes.count)
        )
        return try await send(
            "/api/v1/media",
            method: "POST",
            token: token,
            body: confirmBody,
            as: MediaConfirm.self
        ).0.url
    }

    public func removeProfileImage(token: String, kind: String) async throws {
        let body = try encoder.encode(MediaRemoveBody(action: "remove", kind: kind))
        _ = try await send("/api/v1/media", method: "POST", token: token, body: body, as: Data.self)
    }

    /// `GET /exam?paperId=` — one stored paper, verbatim.
    public func examPaperDoc(token: String, paperId: String) async throws -> PaperDoc {
        try await send("/api/v1/exam?paperId=\(escaped(paperId))", token: token, as: PaperEnvelope.self).0.paper
    }
}

/// One question's answer, as the exam route reads it.
///
/// Both shapes travel: a multiple-choice question sends the chosen option, a free
/// response sends prose, and whichever is set decides which the server reads.
public struct ExamAnswerBody: Encodable {
    public let questionId: String
    public let answer: String?
    public let selectedOptionId: String?

    public init(questionId: String, answer: String? = nil, selectedOptionId: String? = nil) {
        self.questionId = questionId
        self.answer = answer
        self.selectedOptionId = selectedOptionId
    }
}

/// One door for the exam route: the presence of `answers` decides its job.
private struct ExamBody: Encodable {
    let topicIds: [String]
    let questionCount: Int?
    let answers: [ExamAnswerBody]?
}

public struct MathsAnswerBody: Encodable {
    public let questionId: String
    public let answer: String?

    public init(questionId: String, answer: String? = nil) {
        self.questionId = questionId
        self.answer = answer
    }
}

/// The maths route's actions share one body shape, as the server's switch expects.
private struct MathsBody: Encodable {
    let action: String
    let topicIds: [String]?
    let conceptIds: [String]?
    let difficulty: String?
    let count: Int?
    let answers: [MathsAnswerBody]?
    let marks: Int?
    let maxMarks: Int?
    let correct: Int?
    let total: Int?
}

private struct TopicVisibilityBody: Encodable {
    let topicId: String
    let visibility: String
}

private struct ClassJoinBody: Encodable {
    let code: String
}

private struct EmailChangeRequest: Encodable {
    let password: String
    let newEmail: String
}

private struct PasswordChangeRequest: Encodable {
    let currentPassword: String
    let newPassword: String
}

/// The parts that are not routes: cookie handling, which the class keeps private
/// so no screen can reach past the contract to the transport.
extension RevisioApi {
    /// Pull `srs_refresh` out of the login response's Set-Cookie header.
    private static func refreshToken(from response: HTTPURLResponse) -> String? {
        let header = response.value(forHTTPHeaderField: "Set-Cookie") ?? ""
        guard let range = header.range(of: "srs_refresh=") else { return nil }
        let value = header[range.upperBound...].prefix(while: { $0 != ";" })
        return value.isEmpty ? nil : String(value)
    }
}
