import Foundation

// ── exam fidelity: stored papers and assessment objectives ──────────────────
//
// The web's exam simulator grew a second half: real board documents served
// beside the generated papers, and marking that reports *what kind* of mark was
// lost, not just how many. These models mirror `exam/route.ts` and
// `services/study.ts` field for field, optional as everywhere else so an older
// server (or a newer one with more fields) still decodes.

/// One assessment objective line — `{ao:'AO1', marks:2}` on the wire.
public struct AoSplit: Codable, Equatable {
    public var ao: String
    public var marks: Int
}

/// One assessment objective in the marked result's profile.
public struct AoRow: Codable, Equatable {
    public var ao: String
    public var awarded: Int
    public var available: Int
    public var percentage: Int
}

/// 'question_paper' | 'mark_scheme' | 'formulae_sheet' | 'other'.
public struct StoredPaper: Codable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var kind: String
    public var board: String?
    public var series: String?
    public var paperCode: String?
    public var totalMarks: Int?
    public var durationMinutes: Int?
}

/// One stored paper fetched verbatim — `GET /exam?paperId=`.
public struct PaperDoc: Codable, Equatable {
    public var id: String
    public var title: String
    public var kind: String
    public var contentMd: String
    public var board: String?
    public var series: String?
    public var paperCode: String?
    public var totalMarks: Int?
    public var durationMinutes: Int?
}

struct PaperEnvelope: Codable {
    var paper: PaperDoc
}

// ── the update check ────────────────────────────────────────────────────────

/// `GET /api/v1/version` — the server's idea of the newest client.
public struct VersionInfo: Codable, Equatable {
    public var latest: String
    public var build: Int
    public var minBuild: Int
}

/// The comparison an update prompt is made of.
///
/// The apps compare *build numbers* (the same monotonic integer the release
/// stamps), so `1.0.0-alpha.10` cannot sort below `1.0.0-alpha.9` the way a
/// string compare would. A build at or below `minBuild` is *required* — the
/// server is telling it that continuing is not safe — while anything newer than
/// the running build but above the floor is merely available.
public enum UpdateKind: Equatable {
    case none
    case available
    case required
}

public struct UpdateStatus: Equatable {
    public var kind: UpdateKind
    public var latest: String

    public static let none = UpdateStatus(kind: .none, latest: "")
}

public func checkForUpdate(mine: Int, latestBuild: Int, minBuild: Int) -> UpdateStatus {
    if mine >= latestBuild { return .none }
    if mine < minBuild { return UpdateStatus(kind: .required, latest: "") }
    return UpdateStatus(kind: .available, latest: "")
}

// ── teaching: classes and rosters ───────────────────────────────────────────

/// One student on a class roster, with the week's activity as `/teacher` sends it.
public struct RosterEntry: Codable, Equatable, Identifiable {
    public var classId: String
    public var userId: String
    public var name: String
    public var email: String
    public var reviews7d: Int
    public var xp7d: Int
    public var streak: Int
    public var masteryPct: Int

    public var id: String { userId }
}

public struct TeacherClass: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var joinCode: String
    public var subjectId: String
    public var roster: [RosterEntry]
}

public struct TeacherPayload: Codable, Equatable {
    public var classes: [TeacherClass]
    public var subjects: [SubjectRef]
}

/// A topic this account may edit, as `/content?mine=1` sends it.
public struct MyTopic: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var visibility: String
    public var cardCount: Int?
    public var lessonCount: Int?
}

public struct MyTopicsPayload: Codable, Equatable {
    public var topics: [MyTopic]
}

// ── admin: users, approvals, flags, badges, classes ─────────────────────────

public struct AdminUser: Codable, Equatable, Identifiable {
    public var id: String
    public var email: String
    public var name: String
    public var role: String
    public var status: String
    public var emailVerifiedAt: String?
    public var totpEnabled: Bool?
    public var createdAt: String?
}

public struct ApprovalRequest: Codable, Equatable, Identifiable {
    public var id: String
    public var userId: String
    public var email: String
    public var name: String
    public var roleRequested: String
    public var note: String
    public var status: String
    public var createdAt: String?
}

public struct FeatureFlag: Codable, Equatable, Identifiable {
    public var key: String
    public var description: String
    public var enabled: Bool

    public var id: String { key }
}

public struct PendingTopic: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var subjectId: String?
    public var createdAt: String?
}

public struct AuditRow: Codable, Equatable, Identifiable {
    public var id: String
    public var action: String
    public var target: String
    public var createdAt: String?
}

public struct AdminBadge: Codable, Equatable, Identifiable {
    public var id: String
    public var slug: String
    public var label: String
    public var icon: String
    public var color: String
}

public struct AdminAchievement: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
}

public struct AdminClassMember: Codable, Equatable, Identifiable {
    public var classId: String
    public var userId: String
    public var name: String
    public var email: String

    public var id: String { userId }
}

public struct AdminClass: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var joinCode: String
    public var teacherId: String
    public var teacherName: String
    public var subjectId: String
    public var members: [AdminClassMember]
}

public struct ContentStats: Codable, Equatable {
    public var topics: Int
    public var publicTopics: Int
    public var lessons: Int
    public var cards: Int
    public var publicCards: Int
    public var emptyTopics: Int
}

/// `GET /admin` — the whole console in one payload, developers only.
public struct AdminPayload: Codable, Equatable {
    public var approvals: [ApprovalRequest]
    public var flags: [FeatureFlag]
    public var users: [AdminUser]
    public var pendingTopics: [PendingTopic]
    public var audit: [AuditRow]
    public var contentStats: ContentStats
    public var subjects: [SubjectRef]
    public var badges: [AdminBadge]?
    public var manualAchievements: [AdminAchievement]?
    public var classes: [AdminClass]
}

// ── media: avatar and banner uploads ────────────────────────────────────────

/// `POST /media {action:'presign'}` — where to PUT the bytes.
public struct MediaPresign: Codable {
    public var url: String
    public var key: String
    public var publicUrl: String?
}

/// `POST /media {action:'confirm'}` — the pointer now reads the new object.
public struct MediaConfirm: Codable {
    public var url: String
}

struct MediaPresignBody: Encodable {
    var action: String
    var kind: String
    var contentType: String
    var sizeBytes: Int
}

struct MediaConfirmBody: Encodable {
    var action: String
    var kind: String
    var key: String
    var contentType: String
    var sizeBytes: Int
}

struct MediaRemoveBody: Encodable {
    var action: String
    var kind: String
}

/// A badge chip on a profile — granted by staff, shown beside the role.
public struct ProfileBadgeChip: Codable, Equatable, Identifiable {
    public var id: String
    public var label: String
    public var icon: String
    public var color: String
}

/// The banner's token wash names, as `BANNER_WASH` in `avatar.tsx` owns them.
public let BANNER_COLORS: [String] = ["dusk", "rose", "sea", "moss", "bee", "ember"]
