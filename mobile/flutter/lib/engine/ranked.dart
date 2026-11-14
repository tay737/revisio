/// The ranked engine — a Dart port of `src/domain/ranked.ts`.
///
/// Pure. No database, no widgets, no formatting for a specific screen — the
/// same module answers "what rank is 4,200 RP" for the crest, the ladder and
/// the lobby, so those surfaces can never disagree. Proven equal to the web
/// by `test/copy_conformance_test.dart` against `mobile/shared/copy-vectors.json`.
library revisio.engine.ranked;


// ── the ladder ──────────────────────────────────────────────────────────────

enum Tier {
  bronze,
  silver,
  gold,
  platinum,
  emerald,
  sapphire,
  diamond,
  ruby,
  obsidian,
  legend,
}

const Map<int, String> divisionLabel = {3: 'III', 2: 'II', 1: 'I'};

/// RP per unit of XP. The two currencies are deliberately the same size.
const int rpPerXp = 1;

/// RP to clear one division, by tier.
const Map<Tier, int> divisionSpan = {
  Tier.bronze: 120,
  Tier.silver: 180,
  Tier.gold: 250,
  Tier.platinum: 340,
  Tier.emerald: 450,
  Tier.sapphire: 580,
  Tier.diamond: 720,
  Tier.ruby: 880,
  Tier.obsidian: 1050,
  Tier.legend: 1300,
};

const List<Tier> tierOrder = Tier.values;

Tier tierFromWire(String value) => Tier.values.firstWhere(
      (t) => t.name == value,
      orElse: () => Tier.bronze,
    );

class LadderRung {
  final Tier tier;
  final int division;
  final int index;
  final int base;
  final int span;

  const LadderRung({
    required this.tier,
    required this.division,
    required this.index,
    required this.base,
    required this.span,
  });
}

/// The thirty rungs, computed once from the tier order and the spans —
/// Bronze III → Legend I, divisions climbing III → II → I inside a tier.
final List<LadderRung> rankLadder = () {
  final rungs = <LadderRung>[];
  var base = 0;
  var index = 0;
  for (final tier in tierOrder) {
    for (final division in [3, 2, 1]) {
      rungs.add(LadderRung(
        tier: tier,
        division: division,
        index: index,
        base: base,
        span: divisionSpan[tier]!,
      ));
      base += divisionSpan[tier]!;
      index += 1;
    }
  }
  return rungs;
}();

/// Total RP needed to clear the whole ladder (hold Legend I).
final int topOfLadder = rankLadder.last.base;

/// Placements before a rank is awarded.
const int placementReviews = 10;

class Rank {
  final Tier tier;
  final int division;
  final int index;
  final String label;
  final String short;
  final int points;
  final int intoDivision;
  final int forDivision;
  final int percent;
  final int remaining;
  final bool isApex;

  const Rank({
    required this.tier,
    required this.division,
    required this.index,
    required this.label,
    required this.short,
    required this.points,
    required this.intoDivision,
    required this.forDivision,
    required this.percent,
    required this.remaining,
    required this.isApex,
  });

  factory Rank.fromJson(Map<String, dynamic> json) => Rank(
        tier: tierFromWire(json['tier'] as String? ?? 'bronze'),
        division: json['division'] as int? ?? 3,
        index: json['index'] as int? ?? 0,
        label: json['label'] as String? ?? 'Bronze III',
        short: json['short'] as String? ?? 'BRO III',
        points: json['points'] as int? ?? 0,
        intoDivision: json['intoDivision'] as int? ?? 0,
        forDivision: json['forDivision'] as int? ?? 0,
        percent: json['percent'] as int? ?? 0,
        remaining: json['remaining'] as int? ?? 0,
        isApex: json['isApex'] == true,
      );
}

int rpForXp(int totalXp) => totalXp < 0 ? 0 : totalXp * rpPerXp;

/// Which rung a quantity of RP sits on. Clamped at both ends.
Rank rankFor(int totalXp) {
  final points = rpForXp(totalXp);
  var rung = rankLadder.first;
  for (final candidate in rankLadder) {
    if (points >= candidate.base) {
      rung = candidate;
    } else {
      break;
    }
  }
  final intoDivision = points - rung.base;
  final isApex = rung.index == rankLadder.length - 1;
  final pct = ((intoDivision / rung.span) * 100).round();
  final percent = pct < 0 ? 0 : (pct > 100 ? 100 : pct);
  final divLabel = divisionLabel[rung.division] ?? '';
  final label = '${tierName(rung.tier)} $divLabel';
  return Rank(
    tier: rung.tier,
    division: rung.division,
    index: rung.index,
    label: label,
    short: '${tierName(rung.tier).substring(0, 3).toUpperCase()} $divLabel',
    points: points,
    intoDivision: intoDivision,
    forDivision: rung.span,
    percent: percent,
    remaining: rung.span - intoDivision < 0 ? 0 : rung.span - intoDivision,
    isApex: isApex,
  );
}

/// Rough reviews needed to earn an amount of RP.
int reviewsForRp(int rp, [int perReview = 10]) {
  final n = (rp / perReview).ceil();
  return n < 1 ? 1 : n;
}

/// The rung one above the current one, or null at the apex.
LadderRung? nextRung(int index) =>
    index + 1 < rankLadder.length ? rankLadder[index + 1] : null;

String tierName(Tier tier) =>
    tier.name[0].toUpperCase() + tier.name.substring(1);

/// Promotion / demotion bands inside a weekly lobby: proportional, floored at
/// one and capped at five.
int zoneBand(int size) {
  final n = (size * 0.17).round();
  return n < 1 ? 1 : (n > 5 ? 5 : n);
}

enum LobbyZone { promotion, safe, demotion, pending }

LobbyZone zoneFor(int position, int size, int totalXp) {
  if (totalXp < placementReviews) return LobbyZone.pending;
  final band = zoneBand(size);
  if (position <= band) return LobbyZone.promotion;
  if (position > size - band) return LobbyZone.demotion;
  return LobbyZone.safe;
}

class Placement {
  final bool placing;
  final int done;
  final int target;
  final int percent;

  const Placement({
    required this.placing,
    required this.done,
    required this.target,
    required this.percent,
  });
}

Placement placementFor(int totalReviews, [int target = placementReviews]) {
  final done = totalReviews < 0 ? 0 : (totalReviews > target ? target : totalReviews);
  return Placement(
    placing: totalReviews < target,
    done: done,
    target: target,
    percent: ((done / target) * 100).round(),
  );
}

/// How a session moved the ladder.
class RankChange {
  final int gained;
  final Rank before;
  final Rank after;
  final bool promoted;
  final bool demoted;
  final String fromLabel;
  final String toLabel;
  final bool tierChanged;

  const RankChange({
    required this.gained,
    required this.before,
    required this.after,
    required this.promoted,
    required this.demoted,
    required this.fromLabel,
    required this.toLabel,
    required this.tierChanged,
  });
}

RankChange rankChange(int beforeXp, int afterXp) {
  final before = rankFor(beforeXp);
  final after = rankFor(afterXp);
  return RankChange(
    gained: after.points - before.points,
    before: before,
    after: after,
    promoted: after.index > before.index,
    demoted: after.index < before.index,
    fromLabel: before.label,
    toLabel: after.label,
    tierChanged: after.tier != before.tier && after.index > before.index,
  );
}

/// Form — competitive-gaming framing for "how are you playing right now".
enum Form { sharp, steady, shaky, unknown }

class FormRead {
  final Form form;
  final String label;
  final String detail;

  const FormRead({required this.form, required this.label, required this.detail});
}

FormRead formFor(int reviewed, int correct) {
  if (reviewed < 4) {
    return const FormRead(
      form: Form.unknown,
      label: 'No read yet',
      detail: 'Four reviews is enough to call your form.',
    );
  }
  final accuracy = correct / reviewed;
  final pct = (accuracy * 100).round();
  if (accuracy >= 0.9) {
    return FormRead(
      form: Form.sharp,
      label: 'Sharp',
      detail: '$pct% today. This is your best gear.',
    );
  }
  if (accuracy >= 0.7) {
    return FormRead(
      form: Form.steady,
      label: 'Steady',
      detail: '$pct% today. Solid, unspectacular, fine.',
    );
  }
  return FormRead(
    form: Form.shaky,
    label: 'Shaky',
    detail: '$pct% today. Slow down and read the whole clue.',
  );
}

/// The lobby clock — mirrors `weekBounds()`; the DB's `week_start` is the
/// Monday in UTC.
class WeekBounds {
  final String weekStart;
  final int daysLeft;
  final int percentElapsed;
  final String rangeLabel;

  const WeekBounds({
    required this.weekStart,
    required this.daysLeft,
    required this.percentElapsed,
    required this.rangeLabel,
  });

  factory WeekBounds.fromJson(Map<String, dynamic> json) => WeekBounds(
        weekStart: json['weekStart'] as String? ?? '',
        daysLeft: json['daysLeft'] as int? ?? 0,
        percentElapsed: json['percentElapsed'] as int? ?? 0,
        rangeLabel: json['rangeLabel'] as String? ?? '',
      );
}

WeekBounds weekBounds({DateTime? now}) {
  final n = now ?? DateTime.now().toUtc();
  final day = DateTime.utc(n.year, n.month, n.day);
  final dow = (day.weekday - 1) % 7; // Monday = 0 … Sunday = 6 (weekday Mon=1)
  final start = day.subtract(Duration(days: dow));
  final end = start.add(const Duration(days: 6));

  final elapsed = n.difference(start).inMilliseconds / (7 * 86400000);
  var daysLeft =
      ((end.add(const Duration(days: 1)).difference(n).inMilliseconds) / 86400000)
          .ceil();
  if (daysLeft < 0) daysLeft = 0;

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  String fmtDay(DateTime x) => x.day.toString();
  String fmtWeekday(DateTime x) => weekdays[x.weekday - 1];
  final month = months[end.month - 1];

  return WeekBounds(
    weekStart:
        '${start.year.toString().padLeft(4, '0')}-${start.month.toString().padLeft(2, '0')}-${start.day.toString().padLeft(2, '0')}',
    daysLeft: daysLeft,
    percentElapsed: () {
      final p = (elapsed * 100).round();
      return p < 0 ? 0 : (p > 100 ? 100 : p);
    }(),
    rangeLabel:
        '${fmtWeekday(start)} ${fmtDay(start)} – ${fmtWeekday(end)} ${fmtDay(end)} $month',
  );
}

/// The crest's shape signature — geometry carries the tier alongside hue.
class CrestSpec {
  final int ridges;
  final int segments;
  final int pips;

  const CrestSpec({required this.ridges, required this.segments, required this.pips});
}

CrestSpec crestFor({required Tier tier, required int division}) {
  final band = tierOrder.indexOf(tier);
  return CrestSpec(
    ridges: 1 + band ~/ 2,
    segments: 6 + band * 2,
    pips: 4 - division,
  );
}
