import Foundation

// ── the catalogue ───────────────────────────────────────────────────────────
//
// The Swift half of the same contract the Kotlin half speaks. Where a key can be
// *absent* from a payload it is Optional here on purpose: synthesised `Codable`
// does not fall back to a property's default when a key is missing, so a default
// value would look like tolerance without being it. A field that is merely
// nullable (the server sends `null`) is also Optional — that part is honest, and
// it is exactly how "the owner hides this" arrives from `/profile`.

public struct Subject: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var slug: String?
    public var description: String?
    public var enrolled: Bool
    public var mathsEnabled: Bool
    public var topicCount: Int
}

public struct SubjectList: Codable { public var subjects: [Subject] }

public struct Topic: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    /// Absent from cram's topic list, present on the content route.
    public var description: String?
    public var subjectId: String
    public var visibility: String
    /// The two routes that list topics spell the same two numbers differently:
    /// `/content` sends `cards`/`lessons`, `/cram` sends `cardCount`/`lessonCount`.
    /// Both are carried so neither route has to be the one that is wrong, and the
    /// screen reads one derived value rather than picking a spelling.
    public var cards: Int?
    public var lessons: Int?
    public var cardCount: Int?
    public var lessonCount: Int?

    /// Questions in this topic, whichever route sent it.
    public var questions: Int { cardCount ?? cards ?? 0 }

    /// Notes written for this topic, whichever route sent it.
    public var notes: Int { lessonCount ?? lessons ?? 0 }
}

public struct TopicList: Codable { public var topics: [Topic] }

public struct Lesson: Codable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var detailedMd: String?
    public var summaryMd: String?
    public var specRefs: String?
}

public struct LessonList: Codable { public var lessons: [Lesson] }

/// A patch of notes, from any of the three routes that carry them:
/// `/lessons` and `/learn` send `detailedMd`/`summaryMd`, cram sends `contentMd`,
/// and only first exposure names the topic (`topicId`).
///
/// Not `Identifiable`: the id is genuinely absent from cram's notes, so identity
/// for a list comes from `stableId` instead of a property that may not be there.
public struct Note: Codable, Equatable {
    public var id: String?
    public var topicId: String?
    public var title: String
    public var detailedMd: String?
    public var summaryMd: String?
    public var contentMd: String?
    public var specRefs: String?

    /// A stable identity for a patch of notes that may not have an id.
    public var stableId: String { id ?? "\(topicId ?? "-")/\(title)" }

    public var hasAnyBody: Bool {
        !(detailedMd ?? "").isEmpty || !(summaryMd ?? "").isEmpty || !(contentMd ?? "").isEmpty
    }

    /// The prose to show at the chosen density, falling back to what exists.
    public func body(summary: Bool) -> String {
        let preferred = summary ? summaryMd : detailedMd
        if let preferred, !preferred.isEmpty { return preferred }
        if let detailedMd, !detailedMd.isEmpty { return detailedMd }
        if let contentMd, !contentMd.isEmpty { return contentMd }
        return summaryMd ?? ""
    }
}

// ── a card you can answer ───────────────────────────────────────────────────

/// A queue card as `/queue/today`, `/learn` and `/cram` send it — no answer key.
public struct QueueCard: Codable, Equatable, Identifiable {
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
}

/// The one card the review surface renders, wherever it came from.
///
/// Only `/offline/pack` carries an answer key, deliberately — it is the one route
/// the client calls rarely. So the key is optional: with it the app can mark an
/// answer with no server; without it, the card has to be asked about.
public struct QuizCard: Equatable, Identifiable {
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
    public var key: OfflineKey?

    public var canMarkLocally: Bool { key != nil }

    public var promptText: String {
        switch kind {
        case "cloze": return textWithBlank ?? "Fill in the blank"
        case "flashcard": return prompt ?? "Recall the answer"
        default: return question ?? "Choose the best answer"
        }
    }

    public init(offline card: OfflineCard) {
        id = card.id; kind = card.kind; topicId = card.topicId; topicName = card.topicName
        subjectId = card.subjectId; subjectName = card.subjectName
        textWithBlank = card.textWithBlank; prompt = card.prompt; question = card.question
        options = card.options; stage = card.stage; key = card.key
    }

    public init(queue card: QueueCard) {
        id = card.id; kind = card.kind; topicId = card.topicId; topicName = card.topicName
        subjectId = card.subjectId; subjectName = card.subjectName
        textWithBlank = card.textWithBlank; prompt = card.prompt; question = card.question
        options = card.options; stage = card.stage; key = nil
    }
}

/// What a session is for. Sent as `mode` on every review it produces.
public enum StudyMode: String {
    case daily, learn, cram

    public var label: String {
        switch self {
        case .daily: return "Today"
        case .learn: return "Learning"
        case .cram: return "Cramming"
        }
    }
}

// ── sessions ────────────────────────────────────────────────────────────────

public struct ExposureTopic: Codable, Equatable {
    public var id: String
    public var name: String
    public var description: String?
    public var subjectId: String?
    public var subjectName: String?
}

public struct ExposureProgress: Codable, Equatable {
    public var met: Int
    public var total: Int
    public var remaining: Int
}

/// `GET /learn` — a topic's unseen cards, with the notes that explain them.
public struct FirstExposure: Codable, Equatable {
    public var topic: ExposureTopic
    public var notes: [Note]
    public var batch: [QueueCard]
    public var progress: ExposureProgress
}

public struct CramSession: Codable, Equatable {
    public var sessionId: String
    public var noteDensity: String
    public var notes: [Note]
    public var queue: [QueueCard]
}

public struct QueueList: Codable { public var queue: [QueueCard] }

// ── rank, lobby and achievements ────────────────────────────────────────────

/// The ladder's answer for a quantity of XP, from `domain/ranked.ts`.
public struct Rank: Codable, Equatable {
    public var tier: String
    public var division: Int
    public var index: Int
    public var label: String
    public var short: String
    public var points: Int
    public var intoDivision: Int
    public var forDivision: Int
    public var percent: Int
    public var remaining: Int
    public var isApex: Bool

    public init(
        tier: String,
        division: Int,
        index: Int,
        label: String,
        short: String,
        points: Int,
        intoDivision: Int,
        forDivision: Int,
        percent: Int,
        remaining: Int,
        isApex: Bool
    ) {
        self.tier = tier
        self.division = division
        self.index = index
        self.label = label
        self.short = short
        self.points = points
        self.intoDivision = intoDivision
        self.forDivision = forDivision
        self.percent = percent
        self.remaining = remaining
        self.isApex = isApex
    }
}

public struct Placement: Codable, Equatable {
    public var placing: Bool
    public var done: Int
    public var target: Int
    public var percent: Int
}

public struct WeekBounds: Codable, Equatable {
    public var weekStart: String
    public var daysLeft: Int
    public var percentElapsed: Int
    public var rangeLabel: String
}

public struct BoardRow: Codable, Equatable, Identifiable {
    public var rank: Int
    public var userId: String
    public var name: String
    public var xp: Int
    public var isMe: Bool
    public var id: String { userId }
}

public struct LobbySeat: Codable, Equatable, Identifiable {
    public var position: Int
    public var name: String
    public var xp: Int
    public var isMe: Bool
    public var rank: Rank
    public var id: Int { position }
}

/// `promotion` | `safe` | `demotion` | `pending` — decided server-side.
public struct Lobby: Codable, Equatable {
    public var position: Int
    public var size: Int
    public var filled: Int
    public var zone: String
    public var band: Int
    public var rows: [LobbySeat]

    public var zoneLabel: String {
        switch zone {
        case "promotion": return "Promotion zone"
        case "demotion": return "Demotion zone"
        case "pending": return "Placements"
        default: return "Safe"
        }
    }
}

public struct Ranked: Codable, Equatable {
    public var rank: Rank
    public var placement: Placement
    public var week: WeekBounds
    public var lobby: Lobby
    public var xpThisWeek: Int
}

public struct RankedMe: Codable, Equatable {
    public var rank: Int
    public var xpThisWeek: Int
    public var totalXp: Int
    public var level: Int
    public var seatedThisWeek: Bool
}

public struct Achievement: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
    public var icon: String?
    public var unlocked: Bool
    public var unlockedAt: String?
}

/// An achievement as `/me` and `/profile` list it: presence means unlocked.
public struct AchievementRef: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
    public var icon: String?
    public var unlockedAt: String?
}

/// `GET /gamification` — the board, the lobby and the achievements behind both.
public struct GamificationPayload: Codable, Equatable {
    public var scope: String
    public var board: [BoardRow]
    public var ranked: Ranked
    public var me: RankedMe
    public var achievements: [Achievement]
}

// ── the account ─────────────────────────────────────────────────────────────

/// The six per-field switches from `services/profile.ts`.
public struct Visibility: Codable, Equatable, Sendable {
    public var name: Bool
    public var nickname: Bool
    public var bio: Bool
    public var subjects: Bool
    public var stats: Bool
    public var achievements: Bool

    /// Public so a client can send one switch; the memberwise init is internal.
    public init(
        name: Bool, nickname: Bool, bio: Bool,
        subjects: Bool, stats: Bool, achievements: Bool
    ) {
        self.name = name
        self.nickname = nickname
        self.bio = bio
        self.subjects = subjects
        self.stats = stats
        self.achievements = achievements
    }

    public static let all = Visibility(
        name: true, nickname: true, bio: true, subjects: true, stats: true, achievements: true
    )
}

public struct Prefs: Codable, Equatable, Sendable {
    public var noteDensity: String
    public var reducedMotion: Bool

    public init(noteDensity: String, reducedMotion: Bool) {
        self.noteDensity = noteDensity
        self.reducedMotion = reducedMotion
    }

    public static let standard = Prefs(noteDensity: "detailed", reducedMotion: false)
}

public struct SubjectRef: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
}

/// `GET /me` — the whole account, including what only the owner ever sees.
public struct MeDetail: Codable, Equatable {
    public var id: String
    public var email: String
    public var name: String
    public var username: String?
    public var nickname: String?
    public var bio: String?
    public var avatarEmoji: String?
    public var avatarColor: String
    /// Set once a picture has been uploaded; it replaces the emoji.
    public var avatarUrl: String?
    public var bannerUrl: String?
    public var profileVisibility: Visibility
    public var role: String
    public var status: String?
    public var totpEnabled: Bool
    public var leaderboardOptOut: Bool
    /// The column itself can be null, in which case the key arrives as `null`.
    public var prefs: Prefs?
    public var subjects: [SubjectRef]
    public var gamification: Gamification
    public var today: TodaySummary
    public var achievements: [AchievementRef]
}

// ── the exam simulator ──────────────────────────────────────────────────────
//
// An exam is a paper, not a queue: the questions are dealt by topic, the mark
// scheme stays on the server until submission, and what comes back is a scored
// attempt rather than a rescheduled card. Nothing here touches the scheduler,
// which is the whole point of sitting a paper.

public struct ExamTopic: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
}

public struct ExamQuestion: Codable, Equatable, Identifiable {
    public var id: String
    public var kind: String
    public var topicId: String
    public var questionMd: String
    public var marks: Int
    /// Dealt only for a multiple-choice question, and only for the paper.
    public var options: [String]?
    public var board: String?
    public var sourceYear: Int?
}

public struct ExamAttempt: Codable, Equatable, Identifiable {
    public var id: String
    /// Halves, as the server stores them — `score` is doubled on write.
    public var score: Double
    public var maxScore: Double
    public var createdAt: String?
}

/// `GET /exam` — what the pool holds and how this learner has done before.
public struct ExamPool: Codable, Equatable {
    public var topics: [ExamTopic]
    public var questionsAvailable: Int
    public var attempts: [ExamAttempt]
}

/// What the screen shows while the pool is unavailable. Stated here rather than
/// spelled out at the call site so "no pool" means the same thing in both places.
public extension ExamPool {
    static let empty = ExamPool(topics: [], questionsAvailable: 0, attempts: [])
}

/// `POST /exam { topicIds }` — the paper, with the mark scheme withheld.
public struct ExamPaper: Codable, Equatable {
    public var paper: [ExamQuestion]
    public var topics: [ExamTopic]
}

/// One line of the marked script. `awarded` is half-mark granular.
public struct ExamMark: Codable, Equatable {
    public var questionId: String
    public var userAnswer: String
    public var awarded: Double
    public var marks: Int
    public var correct: Bool
    public var feedback: String
}

public struct ExamResult: Codable, Equatable {
    public var score: Double
    public var maxScore: Double
    public var percentage: Int
    public var detail: [ExamMark]
    public var xpAwarded: Int
}

// ── maths practice ──────────────────────────────────────────────────────────
//
// The generator is the server's, and this is the important part: a question is
// *derived* from its id, so the client never holds an answer key and there is no
// second implementation of the maths to drift. The phone asks for a paper, shows
// the prompt, and sends back the id and a string.

public struct MathsConcept: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
}

public struct MathsSetRef: Codable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var conceptCount: Int
    public var defaultCount: Int
    public var defaultDifficulty: String
}

public struct PracticeTopic: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
    public var sets: [MathsSetRef]
}

/// `GET /maths?subjectId=` — the concept catalogue plus what may be drilled.
public struct MathsCatalogue: Codable, Equatable {
    public var concepts: [MathsConcept]
    public var mathsEnabled: Bool
    public var topics: [PracticeTopic]
}

public extension MathsCatalogue {
    static let empty = MathsCatalogue(concepts: [], mathsEnabled: false, topics: [])
}

public struct MathsQuestion: Codable, Equatable, Identifiable {
    public var questionId: String
    public var conceptId: String
    public var conceptName: String
    public var difficulty: String
    public var marks: Int
    public var prompt: String
    public var style: String
    public var options: [String]?

    public var id: String { questionId }
}

public struct MathsSession: Codable, Equatable {
    public var topics: [ExamTopic]
    public var difficulty: String
    public var count: Int
    public var paper: [MathsQuestion]
}

public struct MathsMark: Codable, Equatable {
    public var questionId: String
    public var correct: Bool
    /// The right answer, sent back only once the question has been attempted.
    public var answer: String
    public var solution: String
    public var marks: Int
}

public struct MathsMarked: Codable, Equatable {
    public var results: [MathsMark]
}

public struct MathsXp: Codable, Equatable {
    public var xpAwarded: Int
    public var capped: Bool
}

// ── the library's own write ─────────────────────────────────────────────────

/// `PATCH /content` — who may see a topic this learner owns.
public struct TopicVisibilityResult: Codable, Equatable {
    public var cards: Int
    public var lessons: Int
}

/// `class` is a Swift keyword in a member position, so the wire name is carried.
public struct ClassJoinResult: Codable, Equatable {
    public var joined: ClassRef

    enum CodingKeys: String, CodingKey { case joined = "class" }
}

public struct ClassRef: Codable, Equatable {
    public var id: String
    public var name: String
}

/// `PATCH /me` — identity, profile and preferences through one door.
///
/// Every field is optional and omitted when nil, which is what `encodeIfPresent`
/// does: a patch that leaves a switch alone must not write `null` over it.
public struct MePatch: Encodable {
    public var name: String?
    public var nickname: String?
    public var username: String?
    public var bio: String?
    public var avatarEmoji: String?
    public var avatarColor: String?
    public var profileVisibility: Visibility?
    public var leaderboardOptOut: Bool?
    public var prefs: Prefs?

    public init(
        name: String? = nil,
        nickname: String? = nil,
        username: String? = nil,
        bio: String? = nil,
        avatarEmoji: String? = nil,
        avatarColor: String? = nil,
        profileVisibility: Visibility? = nil,
        leaderboardOptOut: Bool? = nil,
        prefs: Prefs? = nil
    ) {
        self.name = name
        self.nickname = nickname
        self.username = username
        self.bio = bio
        self.avatarEmoji = avatarEmoji
        self.avatarColor = avatarColor
        self.profileVisibility = profileVisibility
        self.leaderboardOptOut = leaderboardOptOut
        self.prefs = prefs
    }
}

public struct ProfileGamification: Codable, Equatable {
    public var totalXp: Int
    public var level: Int
    public var rankLabel: String
    public var rankTier: String
    public var rankDivision: Int
    public var streak: Int
}

/// `GET /profile/:handle`, visibility already applied server-side.
public struct PublicProfile: Codable, Equatable {
    public var id: String
    public var username: String?
    public var email: String?
    public var name: String?
    public var nickname: String?
    public var bio: String?
    public var avatarEmoji: String?
    public var avatarColor: String
    public var role: String
    public var createdAt: String
    public var visibility: Visibility
    /// Null as a whole when stats are private, which is why it is not zeroes:
    /// "private" and "no XP yet" must not look alike.
    public var gamification: ProfileGamification?
    public var subjects: [SubjectRef]
    public var achievements: [AchievementRef]
    public var reviewCount: Int
}
