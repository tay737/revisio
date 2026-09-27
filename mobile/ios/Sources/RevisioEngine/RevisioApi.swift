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

private struct LoginBody: Encodable { let email: String; let password: String }
private struct RefreshBody: Encodable { let refreshToken: String }
private struct SubmitBody: Encodable {
    let cardId: String
    let answer: String?
    let selectedOptionId: String?
    let durationMs: Int
    let mode: String
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

    public func login(email: String, password: String) async throws -> AuthSession {
        let body = try encoder.encode(LoginBody(email: email, password: password))
        let (parsed, http) = try await send("/api/v1/auth/login", method: "POST", body: body, as: LoginResponse.self)
        if parsed.mfaRequired == true {
            throw ApiError(status: 409, code: "mfa_required", message: "This account needs a 2FA code.")
        }
        guard let token = parsed.accessToken, let user = parsed.user else {
            throw ApiError(status: 500, code: "no_session", message: "The server did not return a session.")
        }
        return AuthSession(accessToken: token, refreshToken: Self.refreshToken(from: http), user: user)
    }

    public func refresh(refreshToken: String) async throws -> AuthSession? {
        let body = try encoder.encode(RefreshBody(refreshToken: refreshToken))
        guard let (parsed, http) = try? await send("/api/v1/auth/refresh", method: "POST", body: body, as: RefreshResponse.self) else {
            return nil
        }
        let user = parsed.user ?? ApiUser(id: "", email: "", name: "", role: "student", status: nil)
        return AuthSession(accessToken: parsed.accessToken, refreshToken: Self.refreshToken(from: http) ?? refreshToken, user: user)
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

    // ── the account ─────────────────────────────────────────────────────────

    public func meDetail(token: String) async throws -> MeDetail {
        let (parsed, _) = try await send("/api/v1/me", token: token, as: MeDetail.self)
        return parsed
    }

    public func patchMe(token: String, patch: MePatch) async throws {
        let body = try encoder.encode(patch)
        _ = try await send("/api/v1/me", method: "PATCH", token: token, body: body, as: WroteResult.self)
    }

    /// A public profile. Deliberately unauthenticated: a shared link has to open
    /// for someone who is not signed in, and privacy is applied server-side.
    public func profile(handle: String, token: String? = nil) async throws -> PublicProfile {
        let (parsed, _) = try await send("/api/v1/profile/\(escaped(handle))", token: token, as: PublicProfile.self)
        return parsed
    }

    /// Pull `srs_refresh` out of the login response's Set-Cookie header.
    private static func refreshToken(from response: HTTPURLResponse) -> String? {
        let header = response.value(forHTTPHeaderField: "Set-Cookie") ?? ""
        guard let range = header.range(of: "srs_refresh=") else { return nil }
        let value = header[range.upperBound...].prefix(while: { $0 != ";" })
        return value.isEmpty ? nil : String(value)
    }
}
