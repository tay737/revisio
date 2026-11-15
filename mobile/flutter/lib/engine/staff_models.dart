/// Staff console models — `GET /teacher`, `GET /admin`,
/// `GET /teacher/student`, `GET /content?mine=1`.
///
/// Field-for-field port of the native `StaffModels.kt` teacher/admin half
/// (itself a mirror of the web routes), defaulted the same way so an older
/// server still decodes. Authoring payloads (cards, lessons, seasons) are
/// web-only and deliberately absent.
library revisio.engine.staff_models;

import 'models.dart';

// ── teaching: classes and rosters ───────────────────────────────────────────

/// One student on a class roster, with the week's activity as `/teacher` sends it.
class RosterEntry {
  final String classId;
  final String userId;
  final String name;
  final String email;
  final int reviews7d;
  final int xp7d;
  final int streak;
  final int masteryPct;

  const RosterEntry({
    this.classId = '',
    this.userId = '',
    this.name = '',
    this.email = '',
    this.reviews7d = 0,
    this.xp7d = 0,
    this.streak = 0,
    this.masteryPct = 0,
  });

  factory RosterEntry.fromJson(Map<String, dynamic> json) => RosterEntry(
    classId: json['classId'] as String? ?? '',
    userId: json['userId'] as String? ?? '',
    name: json['name'] as String? ?? '',
    email: json['email'] as String? ?? '',
    reviews7d: (json['reviews7d'] as num?)?.toInt() ?? 0,
    xp7d: (json['xp7d'] as num?)?.toInt() ?? 0,
    streak: (json['streak'] as num?)?.toInt() ?? 0,
    masteryPct: (json['masteryPct'] as num?)?.toInt() ?? 0,
  );
}

class TeacherClass {
  final String id;
  final String name;
  final String joinCode;
  final String subjectId;
  final List<RosterEntry> roster;

  const TeacherClass({
    this.id = '',
    this.name = '',
    this.joinCode = '',
    this.subjectId = '',
    this.roster = const [],
  });

  factory TeacherClass.fromJson(Map<String, dynamic> json) => TeacherClass(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    joinCode: json['joinCode'] as String? ?? '',
    subjectId: json['subjectId'] as String? ?? '',
    roster: ((json['roster'] as List?) ?? [])
        .map((r) => RosterEntry.fromJson(r as Map<String, dynamic>))
        .toList(),
  );
}

/// `GET /teacher` — my classes with per-student rosters, plus the subject list.
class TeacherPayload {
  final List<TeacherClass> classes;
  final List<SubjectRef> subjects;

  const TeacherPayload({this.classes = const [], this.subjects = const []});

  factory TeacherPayload.fromJson(Map<String, dynamic> json) => TeacherPayload(
    classes: ((json['classes'] as List?) ?? [])
        .map((c) => TeacherClass.fromJson(c as Map<String, dynamic>))
        .toList(),
    subjects: ((json['subjects'] as List?) ?? [])
        .map((s) => SubjectRef.fromJson(s as Map<String, dynamic>))
        .toList(),
  );
}

/// A topic this account may edit, as `/content?mine=1` sends it.
class MyTopic {
  final String id;
  final String name;
  final String visibility;
  final String subjectId;
  final String? subjectName;
  final String description;
  final int? cardCount;
  final int? lessonCount;

  const MyTopic({
    this.id = '',
    this.name = '',
    this.visibility = 'private',
    this.subjectId = '',
    this.subjectName,
    this.description = '',
    this.cardCount,
    this.lessonCount,
  });

  factory MyTopic.fromJson(Map<String, dynamic> json) => MyTopic(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    visibility: json['visibility'] as String? ?? 'private',
    subjectId: json['subjectId'] as String? ?? '',
    subjectName: json['subjectName'] as String?,
    description: json['description'] as String? ?? '',
    cardCount: (json['cardCount'] as num?)?.toInt(),
    lessonCount: (json['lessonCount'] as num?)?.toInt(),
  );
}

class MyTopicsPayload {
  final List<MyTopic> topics;

  const MyTopicsPayload({this.topics = const []});

  factory MyTopicsPayload.fromJson(Map<String, dynamic> json) =>
      MyTopicsPayload(
        topics: ((json['topics'] as List?) ?? [])
            .map((t) => MyTopic.fromJson(t as Map<String, dynamic>))
            .toList(),
      );
}

// ── teaching: one learner's progress (the staff progress sheet) ─────────────
//
// `GET /teacher/student` — the web's StudentProgressPanel payload, mirrored
// field for field. The sheet answers the three questions a teacher brings to
// the data: are they working, what is struggling, what have they answered.

/// One rung of the twelve-level ladder with the number of cards sitting on it.
class SrsLevelCount {
  final int level;
  final int count;

  const SrsLevelCount({this.level = 1, this.count = 0});

  factory SrsLevelCount.fromJson(Map<String, dynamic> json) => SrsLevelCount(
    level: (json['level'] as num?)?.toInt() ?? 1,
    count: (json['count'] as num?)?.toInt() ?? 0,
  );
}

/// The overview strip: reviews, accuracy, streak, and what is due right now.
class StudentOverview {
  final int totalReviews;
  final int totalCards;
  final int? correctPct;
  final int? monthCorrectPct;
  final int monthReviews;
  final int xp;
  final int streak;
  final int bestStreak;
  final int dueCount;

  const StudentOverview({
    this.totalReviews = 0,
    this.totalCards = 0,
    this.correctPct,
    this.monthCorrectPct,
    this.monthReviews = 0,
    this.xp = 0,
    this.streak = 0,
    this.bestStreak = 0,
    this.dueCount = 0,
  });

  factory StudentOverview.fromJson(Map<String, dynamic> json) =>
      StudentOverview(
        totalReviews: (json['totalReviews'] as num?)?.toInt() ?? 0,
        totalCards: (json['totalCards'] as num?)?.toInt() ?? 0,
        correctPct: (json['correctPct'] as num?)?.toInt(),
        monthCorrectPct: (json['monthCorrectPct'] as num?)?.toInt(),
        monthReviews: (json['monthReviews'] as num?)?.toInt() ?? 0,
        xp: (json['xp'] as num?)?.toInt() ?? 0,
        streak: (json['streak'] as num?)?.toInt() ?? 0,
        bestStreak: (json['bestStreak'] as num?)?.toInt() ?? 0,
        dueCount: (json['dueCount'] as num?)?.toInt() ?? 0,
      );
}

/// One card the learner has touched, with the rung the server graded it onto.
class StudentCardStrength {
  final String cardId;
  final String kind;
  final String? prompt;
  final String topicId;
  final String topicName;
  final String subjectName;
  final String stage;
  final int srsLevel;
  final String srsLabel;
  final String? dueAt;
  final int lapses;
  final int reps;
  final String? lastReviewedAt;

  const StudentCardStrength({
    this.cardId = '',
    this.kind = '',
    this.prompt,
    this.topicId = '',
    this.topicName = '',
    this.subjectName = '',
    this.stage = '',
    this.srsLevel = 1,
    this.srsLabel = '',
    this.dueAt,
    this.lapses = 0,
    this.reps = 0,
    this.lastReviewedAt,
  });

  factory StudentCardStrength.fromJson(Map<String, dynamic> json) =>
      StudentCardStrength(
        cardId: json['cardId'] as String? ?? '',
        kind: json['kind'] as String? ?? '',
        prompt: json['prompt'] as String?,
        topicId: json['topicId'] as String? ?? '',
        topicName: json['topicName'] as String? ?? '',
        subjectName: json['subjectName'] as String? ?? '',
        stage: json['stage'] as String? ?? '',
        srsLevel: (json['srsLevel'] as num?)?.toInt() ?? 1,
        srsLabel: json['srsLabel'] as String? ?? '',
        dueAt: json['dueAt'] as String?,
        lapses: (json['lapses'] as num?)?.toInt() ?? 0,
        reps: (json['reps'] as num?)?.toInt() ?? 0,
        lastReviewedAt: json['lastReviewedAt'] as String?,
      );
}

/// A topic the learner is missing answers in, most-missed first.
class StrugglingTopic {
  final String topicId;
  final String topicName;
  final String subjectName;
  final int misses;
  final String? lastMissedAt;

  const StrugglingTopic({
    this.topicId = '',
    this.topicName = '',
    this.subjectName = '',
    this.misses = 0,
    this.lastMissedAt,
  });

  factory StrugglingTopic.fromJson(Map<String, dynamic> json) =>
      StrugglingTopic(
        topicId: json['topicId'] as String? ?? '',
        topicName: json['topicName'] as String? ?? '',
        subjectName: json['subjectName'] as String? ?? '',
        misses: (json['misses'] as num?)?.toInt() ?? 0,
        lastMissedAt: json['lastMissedAt'] as String?,
      );
}

/// Per-topic roll-up: how much is mastered and where the lapses pile up.
class TopicHealth {
  final String topicId;
  final String topicName;
  final String subjectName;
  final int states;
  final int mastered;
  final int lapses;
  final int masteryPct;
  final int missCount;

  const TopicHealth({
    this.topicId = '',
    this.topicName = '',
    this.subjectName = '',
    this.states = 0,
    this.mastered = 0,
    this.lapses = 0,
    this.masteryPct = 0,
    this.missCount = 0,
  });

  factory TopicHealth.fromJson(Map<String, dynamic> json) => TopicHealth(
    topicId: json['topicId'] as String? ?? '',
    topicName: json['topicName'] as String? ?? '',
    subjectName: json['subjectName'] as String? ?? '',
    states: (json['states'] as num?)?.toInt() ?? 0,
    mastered: (json['mastered'] as num?)?.toInt() ?? 0,
    lapses: (json['lapses'] as num?)?.toInt() ?? 0,
    masteryPct: (json['masteryPct'] as num?)?.toInt() ?? 0,
    missCount: (json['missCount'] as num?)?.toInt() ?? 0,
  );
}

/// One of the last twenty answers, exactly as it was graded.
class RecentAnswer {
  final String id;
  final String cardId;
  final String mode;
  final String rating;
  final bool? correct;
  final String? userAnswer;
  final String? prompt;
  final String cardKind;
  final String topicName;
  final String subjectName;
  final int xpAwarded;
  final int durationMs;
  final String? reviewedAt;

  const RecentAnswer({
    this.id = '',
    this.cardId = '',
    this.mode = '',
    this.rating = '',
    this.correct,
    this.userAnswer,
    this.prompt,
    this.cardKind = '',
    this.topicName = '',
    this.subjectName = '',
    this.xpAwarded = 0,
    this.durationMs = 0,
    this.reviewedAt,
  });

  factory RecentAnswer.fromJson(Map<String, dynamic> json) => RecentAnswer(
    id: json['id'] as String? ?? '',
    cardId: json['cardId'] as String? ?? '',
    mode: json['mode'] as String? ?? '',
    rating: json['rating'] as String? ?? '',
    correct: json['correct'] as bool?,
    userAnswer: json['userAnswer'] as String?,
    prompt: json['prompt'] as String?,
    cardKind: json['cardKind'] as String? ?? '',
    topicName: json['topicName'] as String? ?? '',
    subjectName: json['subjectName'] as String? ?? '',
    xpAwarded: (json['xpAwarded'] as num?)?.toInt() ?? 0,
    durationMs: (json['durationMs'] as num?)?.toInt() ?? 0,
    reviewedAt: json['reviewedAt'] as String?,
  );
}

/// A card with the soonest due date — "coming up next".
class UpcomingCard {
  final String cardId;
  final String? prompt;
  final String cardKind;
  final String topicName;
  final int srsLevel;
  final String srsLabel;
  final String dueAt;

  const UpcomingCard({
    this.cardId = '',
    this.prompt,
    this.cardKind = '',
    this.topicName = '',
    this.srsLevel = 1,
    this.srsLabel = '',
    this.dueAt = '',
  });

  factory UpcomingCard.fromJson(Map<String, dynamic> json) => UpcomingCard(
    cardId: json['cardId'] as String? ?? '',
    prompt: json['prompt'] as String?,
    cardKind: json['cardKind'] as String? ?? '',
    topicName: json['topicName'] as String? ?? '',
    srsLevel: (json['srsLevel'] as num?)?.toInt() ?? 1,
    srsLabel: json['srsLabel'] as String? ?? '',
    dueAt: json['dueAt'] as String? ?? '',
  );
}

/// The learner the sheet is about.
class StudentProgressStudent {
  final String id;
  final String name;
  final String email;
  final String? createdAt;

  const StudentProgressStudent({
    this.id = '',
    this.name = '',
    this.email = '',
    this.createdAt,
  });

  factory StudentProgressStudent.fromJson(Map<String, dynamic> json) =>
      StudentProgressStudent(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        email: json['email'] as String? ?? '',
        createdAt: json['createdAt'] as String?,
      );
}

/// `GET /teacher/student` — one learner, read as a whole. Staff only.
class StudentProgress {
  final StudentProgressStudent student;
  final StudentOverview overview;
  final List<SrsLevelCount> srsLevels;
  final List<StudentCardStrength> distribution;
  final List<StrugglingTopic> struggling;
  final List<TopicHealth> topicHealth;
  final List<RecentAnswer> recent;
  final List<UpcomingCard> upcoming;
  final List<SubjectRef> subjects;

  const StudentProgress({
    this.student = const StudentProgressStudent(),
    this.overview = const StudentOverview(),
    this.srsLevels = const [],
    this.distribution = const [],
    this.struggling = const [],
    this.topicHealth = const [],
    this.recent = const [],
    this.upcoming = const [],
    this.subjects = const [],
  });

  factory StudentProgress.fromJson(Map<String, dynamic> json) =>
      StudentProgress(
        student: StudentProgressStudent.fromJson(
          (json['student'] as Map?)?.cast<String, dynamic>() ?? const {},
        ),
        overview: StudentOverview.fromJson(
          (json['overview'] as Map?)?.cast<String, dynamic>() ?? const {},
        ),
        srsLevels: ((json['srsLevels'] as List?) ?? [])
            .map((r) => SrsLevelCount.fromJson(r as Map<String, dynamic>))
            .toList(),
        distribution: ((json['distribution'] as List?) ?? [])
            .map((r) => StudentCardStrength.fromJson(r as Map<String, dynamic>))
            .toList(),
        struggling: ((json['struggling'] as List?) ?? [])
            .map((r) => StrugglingTopic.fromJson(r as Map<String, dynamic>))
            .toList(),
        topicHealth: ((json['topicHealth'] as List?) ?? [])
            .map((r) => TopicHealth.fromJson(r as Map<String, dynamic>))
            .toList(),
        recent: ((json['recent'] as List?) ?? [])
            .map((r) => RecentAnswer.fromJson(r as Map<String, dynamic>))
            .toList(),
        upcoming: ((json['upcoming'] as List?) ?? [])
            .map((r) => UpcomingCard.fromJson(r as Map<String, dynamic>))
            .toList(),
        subjects: ((json['subjects'] as List?) ?? [])
            .map((s) => SubjectRef.fromJson(s as Map<String, dynamic>))
            .toList(),
      );
}

// ── admin: users, approvals, flags, classes ────────────────────────────────

class AdminUser {
  final String id;
  final String email;
  final String name;
  final String role;
  final String status;
  final String? emailVerifiedAt;
  final bool totpEnabled;
  final String? createdAt;

  const AdminUser({
    this.id = '',
    this.email = '',
    this.name = '',
    this.role = 'student',
    this.status = 'active',
    this.emailVerifiedAt,
    this.totpEnabled = false,
    this.createdAt,
  });

  factory AdminUser.fromJson(Map<String, dynamic> json) => AdminUser(
    id: json['id'] as String? ?? '',
    email: json['email'] as String? ?? '',
    name: json['name'] as String? ?? '',
    role: json['role'] as String? ?? 'student',
    status: json['status'] as String? ?? 'active',
    emailVerifiedAt: json['emailVerifiedAt'] as String?,
    totpEnabled: json['totpEnabled'] as bool? ?? false,
    createdAt: json['createdAt'] as String?,
  );
}

class ApprovalRequest {
  final String id;
  final String userId;
  final String email;
  final String name;
  final String roleRequested;
  final String note;
  final String status;
  final String? createdAt;

  const ApprovalRequest({
    this.id = '',
    this.userId = '',
    this.email = '',
    this.name = '',
    this.roleRequested = 'teacher',
    this.note = '',
    this.status = 'pending',
    this.createdAt,
  });

  factory ApprovalRequest.fromJson(Map<String, dynamic> json) =>
      ApprovalRequest(
        id: json['id'] as String? ?? '',
        userId: json['userId'] as String? ?? '',
        email: json['email'] as String? ?? '',
        name: json['name'] as String? ?? '',
        roleRequested: json['roleRequested'] as String? ?? 'teacher',
        note: json['note'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
        createdAt: json['createdAt'] as String?,
      );
}

class FeatureFlag {
  final String key;
  final String description;
  final bool enabled;

  const FeatureFlag({
    this.key = '',
    this.description = '',
    this.enabled = false,
  });

  factory FeatureFlag.fromJson(Map<String, dynamic> json) => FeatureFlag(
    key: json['key'] as String? ?? '',
    description: json['description'] as String? ?? '',
    enabled: json['enabled'] as bool? ?? false,
  );
}

class PendingTopic {
  final String id;
  final String name;
  final String subjectId;
  final String? createdAt;

  const PendingTopic({
    this.id = '',
    this.name = '',
    this.subjectId = '',
    this.createdAt,
  });

  factory PendingTopic.fromJson(Map<String, dynamic> json) => PendingTopic(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    subjectId: json['subjectId'] as String? ?? '',
    createdAt: json['createdAt'] as String?,
  );
}

class AuditRow {
  final String id;
  final String action;
  final String target;
  final String? createdAt;

  const AuditRow({
    this.id = '',
    this.action = '',
    this.target = '',
    this.createdAt,
  });

  factory AuditRow.fromJson(Map<String, dynamic> json) => AuditRow(
    id: json['id'] as String? ?? '',
    action: json['action'] as String? ?? '',
    target: json['target'] as String? ?? '',
    createdAt: json['createdAt'] as String?,
  );
}

class AdminBadge {
  final String id;
  final String slug;
  final String label;
  final String icon;
  final String color;

  const AdminBadge({
    this.id = '',
    this.slug = '',
    this.label = '',
    this.icon = '',
    this.color = 'gold',
  });

  factory AdminBadge.fromJson(Map<String, dynamic> json) => AdminBadge(
    id: json['id'] as String? ?? '',
    slug: json['slug'] as String? ?? '',
    label: json['label'] as String? ?? '',
    icon: json['icon'] as String? ?? '',
    color: json['color'] as String? ?? 'gold',
  );
}

class AdminAchievement {
  final String id;
  final String name;
  final String? description;

  const AdminAchievement({this.id = '', this.name = '', this.description});

  factory AdminAchievement.fromJson(Map<String, dynamic> json) =>
      AdminAchievement(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        description: json['description'] as String?,
      );
}

class AdminClassMember {
  final String classId;
  final String userId;
  final String name;
  final String email;

  const AdminClassMember({
    this.classId = '',
    this.userId = '',
    this.name = '',
    this.email = '',
  });

  factory AdminClassMember.fromJson(Map<String, dynamic> json) =>
      AdminClassMember(
        classId: json['classId'] as String? ?? '',
        userId: json['userId'] as String? ?? '',
        name: json['name'] as String? ?? '',
        email: json['email'] as String? ?? '',
      );
}

class AdminClass {
  final String id;
  final String name;
  final String joinCode;
  final String teacherId;
  final String teacherName;
  final String subjectId;
  final List<AdminClassMember> members;

  const AdminClass({
    this.id = '',
    this.name = '',
    this.joinCode = '',
    this.teacherId = '',
    this.teacherName = '',
    this.subjectId = '',
    this.members = const [],
  });

  factory AdminClass.fromJson(Map<String, dynamic> json) => AdminClass(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    joinCode: json['joinCode'] as String? ?? '',
    teacherId: json['teacherId'] as String? ?? '',
    teacherName: json['teacherName'] as String? ?? '',
    subjectId: json['subjectId'] as String? ?? '',
    members: ((json['members'] as List?) ?? [])
        .map((m) => AdminClassMember.fromJson(m as Map<String, dynamic>))
        .toList(),
  );
}

class ContentStats {
  final int topics;
  final int publicTopics;
  final int lessons;
  final int cards;
  final int publicCards;
  final int emptyTopics;

  const ContentStats({
    this.topics = 0,
    this.publicTopics = 0,
    this.lessons = 0,
    this.cards = 0,
    this.publicCards = 0,
    this.emptyTopics = 0,
  });

  factory ContentStats.fromJson(Map<String, dynamic> json) => ContentStats(
    topics: (json['topics'] as num?)?.toInt() ?? 0,
    publicTopics: (json['publicTopics'] as num?)?.toInt() ?? 0,
    lessons: (json['lessons'] as num?)?.toInt() ?? 0,
    cards: (json['cards'] as num?)?.toInt() ?? 0,
    publicCards: (json['publicCards'] as num?)?.toInt() ?? 0,
    emptyTopics: (json['emptyTopics'] as num?)?.toInt() ?? 0,
  );
}

/// `GET /admin` — the whole console in one payload, developers only.
class AdminPayload {
  final List<ApprovalRequest> approvals;
  final List<FeatureFlag> flags;
  final List<AdminUser> users;
  final List<PendingTopic> pendingTopics;
  final List<AuditRow> audit;
  final ContentStats contentStats;
  final List<SubjectRef> subjects;
  final List<AdminBadge> badges;
  final List<AdminAchievement> manualAchievements;
  final List<AdminClass> classes;

  const AdminPayload({
    this.approvals = const [],
    this.flags = const [],
    this.users = const [],
    this.pendingTopics = const [],
    this.audit = const [],
    this.contentStats = const ContentStats(),
    this.subjects = const [],
    this.badges = const [],
    this.manualAchievements = const [],
    this.classes = const [],
  });

  factory AdminPayload.fromJson(Map<String, dynamic> json) => AdminPayload(
    approvals: ((json['approvals'] as List?) ?? [])
        .map((r) => ApprovalRequest.fromJson(r as Map<String, dynamic>))
        .toList(),
    flags: ((json['flags'] as List?) ?? [])
        .map((r) => FeatureFlag.fromJson(r as Map<String, dynamic>))
        .toList(),
    users: ((json['users'] as List?) ?? [])
        .map((r) => AdminUser.fromJson(r as Map<String, dynamic>))
        .toList(),
    pendingTopics: ((json['pendingTopics'] as List?) ?? [])
        .map((r) => PendingTopic.fromJson(r as Map<String, dynamic>))
        .toList(),
    audit: ((json['audit'] as List?) ?? [])
        .map((r) => AuditRow.fromJson(r as Map<String, dynamic>))
        .toList(),
    contentStats: ContentStats.fromJson(
      (json['contentStats'] as Map?)?.cast<String, dynamic>() ?? const {},
    ),
    subjects: ((json['subjects'] as List?) ?? [])
        .map((s) => SubjectRef.fromJson(s as Map<String, dynamic>))
        .toList(),
    badges: ((json['badges'] as List?) ?? [])
        .map((r) => AdminBadge.fromJson(r as Map<String, dynamic>))
        .toList(),
    manualAchievements: ((json['manualAchievements'] as List?) ?? [])
        .map((r) => AdminAchievement.fromJson(r as Map<String, dynamic>))
        .toList(),
    classes: ((json['classes'] as List?) ?? [])
        .map((r) => AdminClass.fromJson(r as Map<String, dynamic>))
        .toList(),
  );
}

// ── the SRS ladder, for the strength card ───────────────────────────────────
//
// Mirrors `SRS_LADDER` in src/domain/srs.ts — the same twelve rungs the
// generated Kotlin/Swift ladders carry. Flutter has no generator for it yet;
// if the web ladder changes, this list and the native ports move together.

class SrsRung {
  final int level;
  final String label;
  final String? interval;

  const SrsRung({required this.level, required this.label, this.interval});
}

const List<SrsRung> kSrsLadder = [
  SrsRung(level: 1, label: 'Beginner I', interval: '4h'),
  SrsRung(level: 2, label: 'Beginner II', interval: '8h'),
  SrsRung(level: 3, label: 'Beginner III', interval: '1d'),
  SrsRung(level: 4, label: 'Adept I', interval: '2d'),
  SrsRung(level: 5, label: 'Adept II', interval: '4d'),
  SrsRung(level: 6, label: 'Adept III', interval: '8d'),
  SrsRung(level: 7, label: 'Seasoned I', interval: '2w'),
  SrsRung(level: 8, label: 'Seasoned II', interval: '1mo'),
  SrsRung(level: 9, label: 'Seasoned III', interval: '2mo'),
  SrsRung(level: 10, label: 'Mastered I', interval: '4mo'),
  SrsRung(level: 11, label: 'Mastered II', interval: '6mo'),
  SrsRung(level: 12, label: 'Mastered'),
];
