import Foundation

/// Mirrors `FeedbackKind` in `src/domain/grading.ts`, string-for-string.
public enum FeedbackKind: String, Codable, Equatable {
    case correct
    case caseOnly = "case_only"
    case punctuationOnly = "punctuation_only"
    case caseAndPunctuation = "case_and_punctuation"
    case nearMiss = "near_miss"
    case wrong
}

/// Optional fields are omitted when nil: Swift's synthesised `Codable` writes
/// them with `encodeIfPresent`, which is exactly the TypeScript engine's
/// treatment of `undefined`, so the conformance test compares like for like.
public struct Verdict: Codable, Equatable {
    public var correct: Bool
    public var feedbackKind: FeedbackKind
    public var matchedAnswerId: String?
    public var note: String?
    public var matchedPhrases: [String]?
    public var missedPhrases: [String]?

    public init(
        correct: Bool,
        feedbackKind: FeedbackKind,
        matchedAnswerId: String? = nil,
        note: String? = nil,
        matchedPhrases: [String]? = nil,
        missedPhrases: [String]? = nil
    ) {
        self.correct = correct
        self.feedbackKind = feedbackKind
        self.matchedAnswerId = matchedAnswerId
        self.note = note
        self.matchedPhrases = matchedPhrases
        self.missedPhrases = missedPhrases
    }
}

public struct Keyword: Codable, Equatable {
    public var required: Bool?
    public var phrase: String
    public var synonyms: [String]?
}

public struct AcceptedAnswer: Codable, Equatable {
    public var id: String
    public var text: String
    public var isPrimary: Bool?
    public var keywords: [Keyword]?
    public var minPoints: Int?
}

public struct CardOption: Codable, Equatable {
    public var id: String
    public var text: String
}

/// The answer key that travels separately from the queue (`OfflineKey` on web).
public struct OfflineKey: Codable, Equatable {
    public var kind: String
    public var accepted: [AcceptedAnswer]?
    public var correctOptionId: String?
}

public struct OfflineCard: Codable, Equatable {
    public var id: String
    public var kind: String
    public var topicId: String
    public var topicName: String
    public var subjectId: String
    public var subjectName: String
    public var textWithBlank: String?
    public var prompt: String?
    public var question: String?
    public var options: [CardOption]?
    public var stage: String
    public var key: OfflineKey
}

public struct OfflinePack: Codable, Equatable {
    public var cards: [OfflineCard]
    public var builtAt: String
}

/// A review the server has not seen yet. Append-only, so replaying it is safe.
public struct PendingReview: Codable, Equatable {
    public var id: String
    public var cardId: String
    public var answer: String?
    public var selectedOptionId: String?
    public var durationMs: Int
    public var mode: String
    public var queuedAt: String
}

// ── API DTOs ────────────────────────────────────────────────────────────────

public struct ApiUser: Codable, Equatable {
    public var id: String
    public var email: String
    public var name: String
    public var role: String
    public var status: String?
}

public struct LoginResponse: Codable {
    public var accessToken: String?
    public var user: ApiUser?
    public var mfaRequired: Bool?
}

public struct RefreshResponse: Codable {
    public var accessToken: String
    public var user: ApiUser?
}

public struct Gamification: Codable, Equatable {
    public var totalXp: Int?
    public var level: Int?
    public var streak: Int?
    public var bestStreak: Int?
}

public struct TodaySummary: Codable, Equatable {
    public var due: Int?
    public var reviewed: Int?
    public var correct: Int?
}

public struct MeResponse: Codable {
    public var id: String?
    public var email: String?
    public var name: String?
    public var role: String?
    public var gamification: Gamification?
    public var today: TodaySummary?
}

public struct ReviewResult: Codable {
    public var verdict: Verdict
    public var primaryAnswer: String?
    public var modelAnswer: String?
    public var explanation: String?
    public var xpAwarded: Int?
    public var totalXp: Int?
    public var level: Int?
    public var streak: Int?
    public var nextDueAt: String?
}
