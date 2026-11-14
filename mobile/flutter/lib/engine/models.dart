/// The wire models — a Dart port of the payload shapes in
/// `mobile/android/engine/.../Models.kt` + `Content.kt`, field for field.
///
/// Everything decodes defensively: a server that grows a field — or omits one
/// this build has not learned about yet — must not crash a phone in a corridor.
library revisio.engine.models;

import 'grading.dart';
import 'ranked.dart' show Rank, Tier;

// ── the offline pack ────────────────────────────────────────────────────────

class CardOption {
  final String id;
  final String text;

  const CardOption({required this.id, required this.text});

  factory CardOption.fromJson(Map<String, dynamic> json) => CardOption(
        id: json['id'] as String? ?? '',
        text: json['text'] as String? ?? '',
      );
}

/// The answer key that travels separately from the queue — only
/// `/offline/pack` cards carry one, deliberately.
class OfflineKey {
  final String kind;
  final List<AcceptedAnswer>? accepted;
  final String? correctOptionId;

  const OfflineKey({required this.kind, this.accepted, this.correctOptionId});

  factory OfflineKey.fromJson(Map<String, dynamic> json) => OfflineKey(
        kind: json['kind'] as String? ?? '',
        accepted: (json['accepted'] as List?)
            ?.map((a) => AcceptedAnswer.fromJson(a as Map<String, dynamic>))
            .toList(),
        correctOptionId: json['correctOptionId'] as String?,
      );
}

class OfflineCard {
  final String id;
  final String kind;
  final String topicId;
  final String topicName;
  final String subjectId;
  final String subjectName;
  final String? textWithBlank;
  final String? prompt;
  final String? question;
  final List<CardOption>? options;
  final String stage;
  final OfflineKey key;

  const OfflineCard({
    required this.id,
    required this.kind,
    required this.topicId,
    required this.topicName,
    required this.subjectId,
    required this.subjectName,
    this.textWithBlank,
    this.prompt,
    this.question,
    this.options,
    required this.stage,
    required this.key,
  });

  factory OfflineCard.fromJson(Map<String, dynamic> json) => OfflineCard(
        id: json['id'] as String? ?? '',
        kind: json['kind'] as String? ?? '',
        topicId: json['topicId'] as String? ?? '',
        topicName: json['topicName'] as String? ?? '',
        subjectId: json['subjectId'] as String? ?? '',
        subjectName: json['subjectName'] as String? ?? '',
        textWithBlank: json['textWithBlank'] as String?,
        prompt: json['prompt'] as String?,
        question: json['question'] as String?,
        options: (json['options'] as List?)
            ?.map((o) => CardOption.fromJson(o as Map<String, dynamic>))
            .toList(),
        stage: json['stage'] as String? ?? 'new',
        key: json['key'] is Map<String, dynamic>
            ? OfflineKey.fromJson(json['key'] as Map<String, dynamic>)
            : const OfflineKey(kind: ''),
      );

  QuizCard toQuizCard() => QuizCard(
        id: id,
        kind: kind,
        topicId: topicId,
        topicName: topicName,
        subjectId: subjectId,
        subjectName: subjectName,
        textWithBlank: textWithBlank,
        prompt: prompt,
        question: question,
        options: options,
        stage: stage,
        key: key,
      );
}

class OfflinePack {
  final List<OfflineCard> cards;
  final String builtAt;

  const OfflinePack({required this.cards, required this.builtAt});

  factory OfflinePack.fromJson(Map<String, dynamic> json) => OfflinePack(
        cards: (json['cards'] as List? ?? [])
            .map((c) => OfflineCard.fromJson(c as Map<String, dynamic>))
            .toList(),
        builtAt: json['builtAt'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'cards': cards.map((c) => c.toJson()).toList(),
        'builtAt': builtAt,
      };
}

extension on OfflineCard {
  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'topicId': topicId,
        'topicName': topicName,
        'subjectId': subjectId,
        'subjectName': subjectName,
        if (textWithBlank != null) 'textWithBlank': textWithBlank,
        if (prompt != null) 'prompt': prompt,
        if (question != null) 'question': question,
        if (options != null)
          'options': options!.map((o) => {'id': o.id, 'text': o.text}).toList(),
        'stage': stage,
        'key': {
          'kind': key.kind,
          if (key.accepted != null)
            'accepted': key.accepted!
                .map((a) => {
                      'id': a.id,
                      'text': a.text,
                      'isPrimary': a.isPrimary,
                      if (a.keywords != null)
                        'keywords': a.keywords!
                            .map((k) => {
                                  'required': k.isRequired,
                                  'phrase': k.phrase,
                                  if (k.synonyms != null) 'synonyms': k.synonyms,
                                })
                            .toList(),
                      if (a.minPoints != null) 'minPoints': a.minPoints,
                    })
                .toList(),
          if (key.correctOptionId != null) 'correctOptionId': key.correctOptionId,
        },
      };
}

/// A review the server has not seen yet. Append-only, so replaying is safe.
class PendingReview {
  final String id;
  final String cardId;
  final String? answer;
  final String? selectedOptionId;
  final int durationMs;
  final String mode;
  final String? sessionId;
  final String queuedAt;

  const PendingReview({
    required this.id,
    required this.cardId,
    this.answer,
    this.selectedOptionId,
    this.durationMs = 0,
    this.mode = 'daily',
    this.sessionId,
    required this.queuedAt,
  });

  factory PendingReview.fromJson(Map<String, dynamic> json) => PendingReview(
        id: json['id'] as String? ?? '',
        cardId: json['cardId'] as String? ?? '',
        answer: json['answer'] as String?,
        selectedOptionId: json['selectedOptionId'] as String?,
        durationMs: json['durationMs'] as int? ?? 0,
        mode: json['mode'] as String? ?? 'daily',
        sessionId: json['sessionId'] as String?,
        queuedAt: json['queuedAt'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'cardId': cardId,
        if (answer != null) 'answer': answer,
        if (selectedOptionId != null) 'selectedOptionId': selectedOptionId,
        'durationMs': durationMs,
        'mode': mode,
        if (sessionId != null) 'sessionId': sessionId,
        'queuedAt': queuedAt,
      };
}

// ── the catalogue ───────────────────────────────────────────────────────────

class Subject {
  final String id;
  final String name;
  final String? slug;
  final String? description;
  final bool enrolled;
  final bool mathsEnabled;
  final int topicCount;

  const Subject({
    required this.id,
    required this.name,
    this.slug,
    this.description,
    this.enrolled = false,
    this.mathsEnabled = false,
    this.topicCount = 0,
  });

  factory Subject.fromJson(Map<String, dynamic> json) => Subject(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String?,
        description: json['description'] as String?,
        enrolled: json['enrolled'] == true,
        mathsEnabled: json['mathsEnabled'] == true,
        topicCount: json['topicCount'] as int? ?? 0,
      );
}

class Topic {
  final String id;
  final String name;
  final String? description;
  final String? subjectId;
  final String? visibility;
  // `/content` sends cards/lessons; `/cram` sends cardCount/lessonCount.
  final int? cards;
  final int? lessons;
  final int? cardCount;
  final int? lessonCount;

  const Topic({
    required this.id,
    required this.name,
    this.description,
    this.subjectId,
    this.visibility,
    this.cards,
    this.lessons,
    this.cardCount,
    this.lessonCount,
  });

  /// Questions in this topic, whichever route sent it.
  int get questions => cardCount ?? cards ?? 0;

  /// Notes written for this topic, whichever route sent it.
  int get notes => lessonCount ?? lessons ?? 0;

  factory Topic.fromJson(Map<String, dynamic> json) => Topic(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        description: json['description'] as String?,
        subjectId: json['subjectId'] as String?,
        visibility: json['visibility'] as String?,
        cards: json['cards'] as int?,
        lessons: json['lessons'] as int?,
        cardCount: json['cardCount'] as int?,
        lessonCount: json['lessonCount'] as int?,
      );
}

class Lesson {
  final String id;
  final String title;
  final String? detailedMd;
  final String? summaryMd;
  final String? specRefs;

  const Lesson({
    required this.id,
    required this.title,
    this.detailedMd,
    this.summaryMd,
    this.specRefs,
  });

  factory Lesson.fromJson(Map<String, dynamic> json) => Lesson(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        detailedMd: json['detailedMd'] as String?,
        summaryMd: json['summaryMd'] as String?,
        specRefs: json['specRefs'] as String?,
      );
}

/// A patch of notes, from any of the three routes that carry them.
class Note {
  final String? id;
  final String? topicId;
  final String title;
  final String? detailedMd;
  final String? summaryMd;
  final String? contentMd;
  final String? specRefs;

  const Note({
    this.id,
    this.topicId,
    required this.title,
    this.detailedMd,
    this.summaryMd,
    this.contentMd,
    this.specRefs,
  });

  factory Note.fromJson(Map<String, dynamic> json) => Note(
        id: json['id'] as String?,
        topicId: json['topicId'] as String?,
        title: json['title'] as String? ?? '',
        detailedMd: json['detailedMd'] as String?,
        summaryMd: json['summaryMd'] as String?,
        contentMd: json['contentMd'] as String?,
        specRefs: json['specRefs'] as String?,
      );

  /// The prose to show at the chosen density, falling back to what exists.
  String body({bool summary = false}) {
    final preferred = summary ? summaryMd : detailedMd;
    if (preferred != null && preferred.trim().isNotEmpty) return preferred;
    if (detailedMd != null && detailedMd!.trim().isNotEmpty) return detailedMd!;
    if (contentMd != null && contentMd!.trim().isNotEmpty) return contentMd!;
    return summaryMd ?? '';
  }

  bool hasAnyBody() =>
      (detailedMd?.trim().isNotEmpty ?? false) ||
      (summaryMd?.trim().isNotEmpty ?? false) ||
      (contentMd?.trim().isNotEmpty ?? false);
}

// ── a card you can answer ───────────────────────────────────────────────────

/// A queue card as `/queue/today`, `/learn` and `/cram` send it — no answer key.
class QueueCard {
  final String id;
  final String kind;
  final String topicId;
  final String topicName;
  final String subjectId;
  final String subjectName;
  final String? textWithBlank;
  final String? prompt;
  final String? question;
  final List<CardOption>? options;
  final String stage;

  const QueueCard({
    required this.id,
    required this.kind,
    this.topicId = '',
    this.topicName = '',
    this.subjectId = '',
    this.subjectName = '',
    this.textWithBlank,
    this.prompt,
    this.question,
    this.options,
    this.stage = 'new',
  });

  factory QueueCard.fromJson(Map<String, dynamic> json) => QueueCard(
        id: json['id'] as String? ?? '',
        kind: json['kind'] as String? ?? '',
        topicId: json['topicId'] as String? ?? '',
        topicName: json['topicName'] as String? ?? '',
        subjectId: json['subjectId'] as String? ?? '',
        subjectName: json['subjectName'] as String? ?? '',
        textWithBlank: json['textWithBlank'] as String?,
        prompt: json['prompt'] as String?,
        question: json['question'] as String?,
        options: (json['options'] as List?)
            ?.map((o) => CardOption.fromJson(o as Map<String, dynamic>))
            .toList(),
        stage: json['stage'] as String? ?? 'new',
      );

  /// A cached offline card promoted back into a queue card for review.
  /// The grading `key` stays behind — the server re-grades on submit anyway.
  factory QueueCard.fromOfflineCard(OfflineCard c) => QueueCard(
        id: c.id,
        kind: c.kind,
        topicId: c.topicId,
        topicName: c.topicName,
        subjectId: c.subjectId,
        subjectName: c.subjectName,
        textWithBlank: c.textWithBlank,
        prompt: c.prompt,
        question: c.question,
        options: c.options,
        stage: c.stage,
      );

  /// The text the learner is answering, or a nothing-left-to-say fallback.
  String get promptText => switch (kind) {
        'cloze' => textWithBlank ?? 'Fill in the blank',
        'flashcard' => prompt ?? 'Recall the answer',
        _ => question ?? 'Choose the best answer',
      };

  QuizCard toQuizCard() => QuizCard(
        id: id,
        kind: kind,
        topicId: topicId,
        topicName: topicName,
        subjectId: subjectId,
        subjectName: subjectName,
        textWithBlank: textWithBlank,
        prompt: prompt,
        question: question,
        options: options,
        stage: stage,
        key: null,
      );
}

/// The one card the review surface renders, wherever it came from.
class QuizCard {
  final String id;
  final String kind;
  final String topicId;
  final String topicName;
  final String subjectId;
  final String subjectName;
  final String? textWithBlank;
  final String? prompt;
  final String? question;
  final List<CardOption>? options;
  final String stage;
  final OfflineKey? key;

  const QuizCard({
    required this.id,
    required this.kind,
    required this.topicId,
    required this.topicName,
    required this.subjectId,
    required this.subjectName,
    this.textWithBlank,
    this.prompt,
    this.question,
    this.options,
    required this.stage,
    this.key,
  });

  /// With a key the app can mark an answer with no server at all.
  bool get canMarkLocally => key != null;

  String get promptText => switch (kind) {
        'cloze' => textWithBlank ?? 'Fill in the blank',
        'flashcard' => prompt ?? 'Recall the answer',
        _ => question ?? 'Choose the best answer',
      };
}

// ── sessions ────────────────────────────────────────────────────────────────

class ExposureTopic {
  final String id;
  final String name;
  final String? description;
  final String? subjectId;
  final String? subjectName;

  const ExposureTopic({
    required this.id,
    required this.name,
    this.description,
    this.subjectId,
    this.subjectName,
  });

  factory ExposureTopic.fromJson(Map<String, dynamic> json) => ExposureTopic(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        description: json['description'] as String?,
        subjectId: json['subjectId'] as String?,
        subjectName: json['subjectName'] as String?,
      );
}

class ExposureProgress {
  final int met;
  final int total;
  final int remaining;

  const ExposureProgress({this.met = 0, this.total = 0, this.remaining = 0});

  factory ExposureProgress.fromJson(Map<String, dynamic> json) => ExposureProgress(
        met: json['met'] as int? ?? 0,
        total: json['total'] as int? ?? 0,
        remaining: json['remaining'] as int? ?? 0,
      );
}

/// `GET /learn` — a topic's unseen cards, with the notes that explain them.
class FirstExposure {
  final ExposureTopic topic;
  final List<Note> notes;
  final List<QueueCard> batch;
  final ExposureProgress progress;

  const FirstExposure({
    required this.topic,
    this.notes = const [],
    this.batch = const [],
    this.progress = const ExposureProgress(),
  });

  factory FirstExposure.fromJson(Map<String, dynamic> json) => FirstExposure(
        topic: json['topic'] is Map<String, dynamic>
            ? ExposureTopic.fromJson(json['topic'] as Map<String, dynamic>)
            : const ExposureTopic(id: '', name: ''),
        notes: (json['notes'] as List? ?? [])
            .map((n) => Note.fromJson(n as Map<String, dynamic>))
            .toList(),
        batch: (json['batch'] as List? ?? [])
            .map((c) => QueueCard.fromJson(c as Map<String, dynamic>))
            .toList(),
        progress: json['progress'] is Map<String, dynamic>
            ? ExposureProgress.fromJson(json['progress'] as Map<String, dynamic>)
            : const ExposureProgress(),
      );
}

class CramSession {
  final String sessionId;
  final String noteDensity;
  final List<Note> notes;
  final List<QueueCard> queue;

  const CramSession({
    required this.sessionId,
    this.noteDensity = 'detailed',
    this.notes = const [],
    this.queue = const [],
  });

  factory CramSession.fromJson(Map<String, dynamic> json) => CramSession(
        sessionId: json['sessionId'] as String? ?? '',
        noteDensity: json['noteDensity'] as String? ?? 'detailed',
        notes: (json['notes'] as List? ?? [])
            .map((n) => Note.fromJson(n as Map<String, dynamic>))
            .toList(),
        queue: (json['queue'] as List? ?? [])
            .map((c) => QueueCard.fromJson(c as Map<String, dynamic>))
            .toList(),
      );
}

// ── rank, lobby and achievements ────────────────────────────────────────────

class Placement {
  final bool placing;
  final int done;
  final int target;
  final int percent;

  const Placement({this.placing = true, this.done = 0, this.target = 10, this.percent = 0});

  factory Placement.fromJson(Map<String, dynamic> json) => Placement(
        placing: json['placing'] != false,
        done: json['done'] as int? ?? 0,
        target: json['target'] as int? ?? 10,
        percent: json['percent'] as int? ?? 0,
      );
}

class WeekBounds {
  final String weekStart;
  final int daysLeft;
  final int percentElapsed;
  final String rangeLabel;

  const WeekBounds({
    this.weekStart = '',
    this.daysLeft = 0,
    this.percentElapsed = 0,
    this.rangeLabel = '',
  });

  factory WeekBounds.fromJson(Map<String, dynamic> json) => WeekBounds(
        weekStart: json['weekStart'] as String? ?? '',
        daysLeft: json['daysLeft'] as int? ?? 0,
        percentElapsed: json['percentElapsed'] as int? ?? 0,
        rangeLabel: json['rangeLabel'] as String? ?? '',
      );
}

class BoardRow {
  final int rank;
  final String? userId;
  final String name;
  final int xp;
  final bool isMe;

  const BoardRow({
    this.rank = 0,
    this.userId,
    this.name = '',
    this.xp = 0,
    this.isMe = false,
  });

  factory BoardRow.fromJson(Map<String, dynamic> json) => BoardRow(
        rank: json['rank'] as int? ?? 0,
        userId: json['userId'] as String?,
        name: json['name'] as String? ?? '',
        xp: json['xp'] as int? ?? 0,
        isMe: json['isMe'] == true,
      );
}

class LobbySeat {
  final int position;
  final String? userId;
  final String name;
  final int xp;
  final bool isMe;
  final Rank? rank;

  const LobbySeat({
    this.position = 0,
    this.userId,
    this.name = '',
    this.xp = 0,
    this.isMe = false,
    this.rank,
  });

  factory LobbySeat.fromJson(Map<String, dynamic> json) => LobbySeat(
        position: json['position'] as int? ?? 0,
        userId: json['userId'] as String?,
        name: json['name'] as String? ?? '',
        xp: json['xp'] as int? ?? 0,
        isMe: json['isMe'] == true,
        rank: json['rank'] is Map<String, dynamic>
            ? Rank.fromJson(json['rank'] as Map<String, dynamic>)
            : null,
      );
}

/// `promotion` | `safe` | `demotion` | `pending` — decided server-side.
class Lobby {
  final int position;
  final int size;
  final int filled;
  final String zone;
  final int band;
  final List<LobbySeat> rows;

  const Lobby({
    this.position = 0,
    this.size = 0,
    this.filled = 0,
    this.zone = 'pending',
    this.band = 0,
    this.rows = const [],
  });

  String get zoneLabel => switch (zone) {
        'promotion' => 'Promotion zone',
        'demotion' => 'Demotion zone',
        'pending' => 'Placements',
        _ => 'Safe',
      };

  factory Lobby.fromJson(Map<String, dynamic> json) => Lobby(
        position: json['position'] as int? ?? 0,
        size: json['size'] as int? ?? 0,
        filled: json['filled'] as int? ?? 0,
        zone: json['zone'] as String? ?? 'pending',
        band: json['band'] as int? ?? 0,
        rows: (json['rows'] as List? ?? [])
            .map((r) => LobbySeat.fromJson(r as Map<String, dynamic>))
            .toList(),
      );
}

class SeasonClock {
  final int number;
  final String label;
  final String rangeLabel;
  final int daysLeft;
  final int day;
  final int lengthDays;
  final int percentElapsed;

  const SeasonClock({
    this.number = 0,
    this.label = '',
    this.rangeLabel = '',
    this.daysLeft = 0,
    this.day = 0,
    this.lengthDays = 0,
    this.percentElapsed = 0,
  });

  factory SeasonClock.fromJson(Map<String, dynamic> json) => SeasonClock(
        number: json['number'] as int? ?? 0,
        label: json['label'] as String? ?? '',
        rangeLabel: json['rangeLabel'] as String? ?? '',
        daysLeft: json['daysLeft'] as int? ?? 0,
        day: json['day'] as int? ?? 0,
        lengthDays: json['lengthDays'] as int? ?? 0,
        percentElapsed: json['percentElapsed'] as int? ?? 0,
      );
}

const _kEmptyRank = Rank(
  tier: Tier.bronze,
  division: 3,
  index: 0,
  label: 'Bronze III',
  short: 'BRO III',
  points: 0,
  intoDivision: 0,
  forDivision: 0,
  percent: 0,
  remaining: 0,
  isApex: false,
);

class Ranked {
  final Rank rank;
  final Placement placement;
  final WeekBounds week;
  final Lobby lobby;
  final int xpThisWeek;
  final SeasonClock? season;
  final int? seasonXp;
  final Rank? lifetimeRank;

  const Ranked({
    this.rank = _kEmptyRank,
    this.placement = const Placement(),
    this.week = const WeekBounds(),
    this.lobby = const Lobby(),
    this.xpThisWeek = 0,
    this.season,
    this.seasonXp,
    this.lifetimeRank,
  });

  factory Ranked.fromJson(Map<String, dynamic> json) => Ranked(
        rank: json['rank'] is Map<String, dynamic>
            ? Rank.fromJson(json['rank'] as Map<String, dynamic>)
            : _kEmptyRank,
        placement: json['placement'] is Map<String, dynamic>
            ? Placement.fromJson(json['placement'] as Map<String, dynamic>)
            : const Placement(),
        week: json['week'] is Map<String, dynamic>
            ? WeekBounds.fromJson(json['week'] as Map<String, dynamic>)
            : const WeekBounds(),
        lobby: json['lobby'] is Map<String, dynamic>
            ? Lobby.fromJson(json['lobby'] as Map<String, dynamic>)
            : const Lobby(),
        xpThisWeek: json['xpThisWeek'] as int? ?? 0,
        season: json['season'] is Map<String, dynamic>
            ? SeasonClock.fromJson(json['season'] as Map<String, dynamic>)
            : null,
        seasonXp: json['seasonXp'] as int?,
        lifetimeRank: json['lifetimeRank'] is Map<String, dynamic>
            ? Rank.fromJson(json['lifetimeRank'] as Map<String, dynamic>)
            : null,
      );
}

class RankedMe {
  final int rank;
  final int xpThisWeek;
  final int totalXp;
  final int level;
  final bool seatedThisWeek;
  final int? seasonXp;

  const RankedMe({
    this.rank = 0,
    this.xpThisWeek = 0,
    this.totalXp = 0,
    this.level = 0,
    this.seatedThisWeek = false,
    this.seasonXp,
  });

  factory RankedMe.fromJson(Map<String, dynamic> json) => RankedMe(
        rank: json['rank'] as int? ?? 0,
        xpThisWeek: json['xpThisWeek'] as int? ?? 0,
        totalXp: json['totalXp'] as int? ?? 0,
        level: json['level'] as int? ?? 0,
        seatedThisWeek: json['seatedThisWeek'] == true,
        seasonXp: json['seasonXp'] as int?,
      );
}

class Achievement {
  final String id;
  final String name;
  final String? description;
  final String? icon;
  final bool unlocked;
  final String? unlockedAt;

  const Achievement({
    required this.id,
    required this.name,
    this.description,
    this.icon,
    this.unlocked = false,
    this.unlockedAt,
  });

  factory Achievement.fromJson(Map<String, dynamic> json) => Achievement(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        description: json['description'] as String?,
        icon: json['icon'] as String?,
        unlocked: json['unlocked'] == true,
        unlockedAt: json['unlockedAt'] as String?,
      );
}

class AchievementRef {
  final String id;
  final String name;
  final String? description;
  final String? icon;
  final String? unlockedAt;

  const AchievementRef({
    required this.id,
    required this.name,
    this.description,
    this.icon,
    this.unlockedAt,
  });

  factory AchievementRef.fromJson(Map<String, dynamic> json) => AchievementRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        description: json['description'] as String?,
        icon: json['icon'] as String?,
        unlockedAt: json['unlockedAt'] as String?,
      );
}

/// `GET /gamification` — the board, the lobby and the achievements behind both.
class GamificationPayload {
  final String scope;
  final List<BoardRow> board;
  final Ranked ranked;
  final RankedMe me;
  final List<Achievement> achievements;

  const GamificationPayload({
    this.scope = 'weekly',
    this.board = const [],
    this.ranked = const Ranked(),
    this.me = const RankedMe(),
    this.achievements = const [],
  });

  factory GamificationPayload.fromJson(Map<String, dynamic> json) => GamificationPayload(
        scope: json['scope'] as String? ?? 'weekly',
        board: (json['board'] as List? ?? [])
            .map((r) => BoardRow.fromJson(r as Map<String, dynamic>))
            .toList(),
        ranked: json['ranked'] is Map<String, dynamic>
            ? Ranked.fromJson(json['ranked'] as Map<String, dynamic>)
            : const Ranked(),
        me: json['me'] is Map<String, dynamic>
            ? RankedMe.fromJson(json['me'] as Map<String, dynamic>)
            : const RankedMe(),
        achievements: (json['achievements'] as List? ?? [])
            .map((a) => Achievement.fromJson(a as Map<String, dynamic>))
            .toList(),
      );
}

// ── the account ─────────────────────────────────────────────────────────────

/// The seven per-field switches from `services/profile.ts`.
class Visibility {
  final bool name;
  final bool nickname;
  final bool bio;
  final bool pronouns;
  final bool subjects;
  final bool stats;
  final bool achievements;

  const Visibility({
    this.name = true,
    this.nickname = true,
    this.bio = true,
    this.pronouns = true,
    this.subjects = true,
    this.stats = true,
    this.achievements = true,
  });

  factory Visibility.fromJson(Map<String, dynamic> json) => Visibility(
        name: json['name'] != false,
        nickname: json['nickname'] != false,
        bio: json['bio'] != false,
        pronouns: json['pronouns'] != false,
        subjects: json['subjects'] != false,
        stats: json['stats'] != false,
        achievements: json['achievements'] != false,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'nickname': nickname,
        'bio': bio,
        'pronouns': pronouns,
        'subjects': subjects,
        'stats': stats,
        'achievements': achievements,
      };
}

class Prefs {
  final String noteDensity;
  final bool reducedMotion;

  const Prefs({this.noteDensity = 'detailed', this.reducedMotion = false});

  factory Prefs.fromJson(Map<String, dynamic> json) => Prefs(
        noteDensity: json['noteDensity'] as String? ?? 'detailed',
        reducedMotion: json['reducedMotion'] == true,
      );

  Map<String, dynamic> toJson() => {
        'noteDensity': noteDensity,
        'reducedMotion': reducedMotion,
      };
}

class SubjectRef {
  final String id;
  final String name;

  const SubjectRef({required this.id, required this.name});

  factory SubjectRef.fromJson(Map<String, dynamic> json) => SubjectRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
      );
}

class Gamification {
  final int totalXp;
  final int level;
  final int intoLevel;
  final int forNext;
  final int streak;
  final int bestStreak;

  const Gamification({
    this.totalXp = 0,
    this.level = 0,
    this.intoLevel = 0,
    this.forNext = 0,
    this.streak = 0,
    this.bestStreak = 0,
  });

  factory Gamification.fromJson(Map<String, dynamic> json) => Gamification(
        totalXp: json['totalXp'] as int? ?? 0,
        level: json['level'] as int? ?? 0,
        intoLevel: json['intoLevel'] as int? ?? 0,
        forNext: json['forNext'] as int? ?? 0,
        streak: json['streak'] as int? ?? 0,
        bestStreak: json['bestStreak'] as int? ?? 0,
      );
}

class TodaySummary {
  final int due;
  final int reviewed;
  final int correct;

  const TodaySummary({this.due = 0, this.reviewed = 0, this.correct = 0});

  factory TodaySummary.fromJson(Map<String, dynamic> json) => TodaySummary(
        due: json['due'] as int? ?? 0,
        reviewed: json['reviewed'] as int? ?? 0,
        correct: json['correct'] as int? ?? 0,
      );
}

/// `GET /me` — the whole account, including the parts only the owner sees.
class MeDetail {
  final String id;
  final String email;
  final String name;
  final String? username;
  final String? nickname;
  final String? bio;
  final String? pronouns;
  final String? avatarEmoji;
  final String avatarColor;
  final String? avatarUrl;
  final String? bannerUrl;
  final Visibility profileVisibility;
  final String role;
  final String? status;
  final bool totpEnabled;
  final bool leaderboardOptOut;
  final Prefs prefs;
  final List<SubjectRef> subjects;
  final Gamification gamification;
  final TodaySummary today;
  final List<AchievementRef> achievements;
  final String bannerColor;

  const MeDetail({
    this.id = '',
    this.email = '',
    this.name = '',
    this.username,
    this.nickname,
    this.bio,
    this.pronouns,
    this.avatarEmoji,
    this.avatarColor = 'ink',
    this.avatarUrl,
    this.bannerUrl,
    this.profileVisibility = const Visibility(),
    this.role = 'student',
    this.status,
    this.totpEnabled = false,
    this.leaderboardOptOut = false,
    this.prefs = const Prefs(),
    this.subjects = const [],
    this.gamification = const Gamification(),
    this.today = const TodaySummary(),
    this.achievements = const [],
    this.bannerColor = 'dusk',
  });

  factory MeDetail.fromJson(Map<String, dynamic> json) => MeDetail(
        id: json['id'] as String? ?? '',
        email: json['email'] as String? ?? '',
        name: json['name'] as String? ?? '',
        username: json['username'] as String?,
        nickname: json['nickname'] as String?,
        bio: json['bio'] as String?,
        pronouns: json['pronouns'] as String?,
        avatarEmoji: json['avatarEmoji'] as String?,
        avatarColor: json['avatarColor'] as String? ?? 'ink',
        avatarUrl: json['avatarUrl'] as String?,
        bannerUrl: json['bannerUrl'] as String?,
        profileVisibility: json['profileVisibility'] is Map<String, dynamic>
            ? Visibility.fromJson(json['profileVisibility'] as Map<String, dynamic>)
            : const Visibility(),
        role: json['role'] as String? ?? 'student',
        status: json['status'] as String?,
        totpEnabled: json['totpEnabled'] == true,
        leaderboardOptOut: json['leaderboardOptOut'] == true,
        prefs: json['prefs'] is Map<String, dynamic>
            ? Prefs.fromJson(json['prefs'] as Map<String, dynamic>)
            : const Prefs(),
        subjects: (json['subjects'] as List? ?? [])
            .map((s) => SubjectRef.fromJson(s as Map<String, dynamic>))
            .toList(),
        gamification: json['gamification'] is Map<String, dynamic>
            ? Gamification.fromJson(json['gamification'] as Map<String, dynamic>)
            : const Gamification(),
        today: json['today'] is Map<String, dynamic>
            ? TodaySummary.fromJson(json['today'] as Map<String, dynamic>)
            : const TodaySummary(),
        achievements: (json['achievements'] as List? ?? [])
            .map((a) => AchievementRef.fromJson(a as Map<String, dynamic>))
            .toList(),
        bannerColor: json['bannerColor'] as String? ?? 'dusk',
      );
}
