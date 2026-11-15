/// Models for `GET /api/v1/seasons` — the seasonal rank payload the web's
/// RankView renders (clock, mine, rewards, board, history).
library revisio.features.rank.season_models;

import '../../engine/ranked.dart';

class SeasonClockInfo {
  final int number;
  final String label;
  final String name;
  final String state;
  final String rangeLabel;
  final String startIso;
  final int daysLeft;
  final int day;
  final int lengthDays;
  final int percentElapsed;
  final int grandfathered;

  const SeasonClockInfo({
    this.number = 0,
    this.label = '',
    this.name = '',
    this.state = '',
    this.rangeLabel = '',
    this.startIso = '',
    this.daysLeft = 0,
    this.day = 0,
    this.lengthDays = 1,
    this.percentElapsed = 0,
    this.grandfathered = 0,
  });

  factory SeasonClockInfo.fromJson(Map<String, dynamic> json) =>
      SeasonClockInfo(
        number: json['number'] as int? ?? 0,
        label: json['label'] as String? ?? '',
        name: json['name'] as String? ?? '',
        state: json['state'] as String? ?? '',
        rangeLabel: json['rangeLabel'] as String? ?? '',
        startIso: json['startIso'] as String? ?? '',
        daysLeft: json['daysLeft'] as int? ?? 0,
        day: json['day'] as int? ?? 0,
        lengthDays: json['lengthDays'] as int? ?? 1,
        percentElapsed: json['percentElapsed'] as int? ?? 0,
        grandfathered: json['grandfathered'] as int? ?? 0,
      );
}

class SeasonMine {
  final int xp;
  final int reviews;
  final bool placed;
  final Rank rank;
  final int position;
  final int fieldSize;

  const SeasonMine({
    this.xp = 0,
    this.reviews = 0,
    this.placed = false,
    this.rank = _emptyRank,
    this.position = 0,
    this.fieldSize = 0,
  });

  factory SeasonMine.fromJson(Map<String, dynamic> json) => SeasonMine(
    xp: json['xp'] as int? ?? 0,
    reviews: json['reviews'] as int? ?? 0,
    placed: json['placed'] == true,
    rank: json['rank'] is Map<String, dynamic>
        ? Rank.fromJson(json['rank'] as Map<String, dynamic>)
        : _emptyRank,
    position: json['position'] as int? ?? 0,
    fieldSize: json['fieldSize'] as int? ?? 0,
  );
}

class SeasonRewardEntry {
  final Tier tier;
  final String name;
  final SeasonReward reward;

  const SeasonRewardEntry({
    required this.tier,
    required this.name,
    required this.reward,
  });

  factory SeasonRewardEntry.fromJson(Map<String, dynamic> json) =>
      SeasonRewardEntry(
        tier: tierFromWire(json['tier'] as String? ?? 'bronze'),
        name: json['name'] as String? ?? '',
        reward: json['reward'] is Map<String, dynamic>
            ? SeasonReward.fromJson(json['reward'] as Map<String, dynamic>)
            : const SeasonReward(),
      );
}

class SeasonBoardRow {
  final int position;
  final String? userId;
  final String name;
  final int xp;
  final bool isMe;
  final Rank rank;

  const SeasonBoardRow({
    this.position = 0,
    this.userId,
    this.name = '',
    this.xp = 0,
    this.isMe = false,
    this.rank = _emptyRank,
  });

  factory SeasonBoardRow.fromJson(Map<String, dynamic> json) => SeasonBoardRow(
    position: json['position'] as int? ?? 0,
    userId: json['userId'] as String?,
    name: json['name'] as String? ?? '',
    xp: json['xp'] as int? ?? 0,
    isMe: json['isMe'] == true,
    rank: json['rank'] is Map<String, dynamic>
        ? Rank.fromJson(json['rank'] as Map<String, dynamic>)
        : _emptyRank,
  );
}

class SeasonHistoryRow {
  final int seasonNumber;
  final Rank rank;
  final int reviews;
  final SeasonReward reward;
  final String? rewardClaimedAt;
  final String endedAt;

  const SeasonHistoryRow({
    this.seasonNumber = 0,
    this.rank = _emptyRank,
    this.reviews = 0,
    this.reward = const SeasonReward(),
    this.rewardClaimedAt,
    this.endedAt = '',
  });

  factory SeasonHistoryRow.fromJson(Map<String, dynamic> json) =>
      SeasonHistoryRow(
        seasonNumber: json['seasonNumber'] as int? ?? 0,
        rank: json['rank'] is Map<String, dynamic>
            ? Rank.fromJson(json['rank'] as Map<String, dynamic>)
            : _emptyRank,
        reviews: json['reviews'] as int? ?? 0,
        reward: json['reward'] is Map<String, dynamic>
            ? SeasonReward.fromJson(json['reward'] as Map<String, dynamic>)
            : const SeasonReward(),
        rewardClaimedAt: json['rewardClaimedAt'] as String?,
        endedAt: json['endedAt'] as String? ?? '',
      );
}

class SeasonReward {
  final String id;
  final String name;
  final String icon;
  final String detail;

  const SeasonReward({
    this.id = '',
    this.name = '',
    this.icon = '',
    this.detail = '',
  });

  factory SeasonReward.fromJson(Map<String, dynamic> json) => SeasonReward(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    icon: json['icon'] as String? ?? '',
    detail: json['detail'] as String? ?? '',
  );
}

class SeasonPayload {
  final SeasonClockInfo season;
  final SeasonMine mine;
  final List<SeasonRewardEntry> rewards;
  final List<SeasonBoardRow> board;
  final List<SeasonHistoryRow> history;

  const SeasonPayload({
    this.season = const SeasonClockInfo(),
    this.mine = const SeasonMine(),
    this.rewards = const [],
    this.board = const [],
    this.history = const [],
  });

  factory SeasonPayload.fromJson(Map<String, dynamic> json) => SeasonPayload(
    season: json['season'] is Map<String, dynamic>
        ? SeasonClockInfo.fromJson(json['season'] as Map<String, dynamic>)
        : const SeasonClockInfo(),
    mine: json['mine'] is Map<String, dynamic>
        ? SeasonMine.fromJson(json['mine'] as Map<String, dynamic>)
        : const SeasonMine(),
    rewards: (json['rewards'] as List? ?? [])
        .map((r) => SeasonRewardEntry.fromJson(r as Map<String, dynamic>))
        .toList(),
    board: (json['board'] as List? ?? [])
        .map((r) => SeasonBoardRow.fromJson(r as Map<String, dynamic>))
        .toList(),
    history: (json['history'] as List? ?? [])
        .map((r) => SeasonHistoryRow.fromJson(r as Map<String, dynamic>))
        .toList(),
  );
}

const _emptyRank = Rank(
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
