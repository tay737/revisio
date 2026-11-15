/// The SRS strength ladder — port of `src/domain/srs.ts`'s SRS_LADDER.
/// Twelve rungs in four tiers; the review verdict and the dashboard's
/// strength chart both read these labels, so they must not drift.
library revisio.engine.srs;

enum SrsTier { beginner, adept, seasoned, mastered }

class SrsLevel {
  final int level;
  final SrsTier tier;
  final String label;
  final int? hours;
  final String? interval;

  const SrsLevel({
    required this.level,
    required this.tier,
    required this.label,
    this.hours,
    this.interval,
  });
}

const srsLadder = <SrsLevel>[
  SrsLevel(
    level: 1,
    tier: SrsTier.beginner,
    label: 'Beginner I',
    hours: 4,
    interval: '4h',
  ),
  SrsLevel(
    level: 2,
    tier: SrsTier.beginner,
    label: 'Beginner II',
    hours: 8,
    interval: '8h',
  ),
  SrsLevel(
    level: 3,
    tier: SrsTier.beginner,
    label: 'Beginner III',
    hours: 24,
    interval: '1d',
  ),
  SrsLevel(
    level: 4,
    tier: SrsTier.adept,
    label: 'Adept I',
    hours: 48,
    interval: '2d',
  ),
  SrsLevel(
    level: 5,
    tier: SrsTier.adept,
    label: 'Adept II',
    hours: 96,
    interval: '4d',
  ),
  SrsLevel(
    level: 6,
    tier: SrsTier.adept,
    label: 'Adept III',
    hours: 192,
    interval: '8d',
  ),
  SrsLevel(
    level: 7,
    tier: SrsTier.seasoned,
    label: 'Seasoned I',
    hours: 336,
    interval: '2w',
  ),
  SrsLevel(
    level: 8,
    tier: SrsTier.seasoned,
    label: 'Seasoned II',
    hours: 720,
    interval: '1mo',
  ),
  SrsLevel(
    level: 9,
    tier: SrsTier.seasoned,
    label: 'Seasoned III',
    hours: 1440,
    interval: '2mo',
  ),
  SrsLevel(
    level: 10,
    tier: SrsTier.mastered,
    label: 'Mastered I',
    hours: 2880,
    interval: '4mo',
  ),
  SrsLevel(
    level: 11,
    tier: SrsTier.mastered,
    label: 'Mastered II',
    hours: 4320,
    interval: '6mo',
  ),
  SrsLevel(level: 12, tier: SrsTier.mastered, label: 'Mastered'),
];

SrsTier srsTierOf(int level) {
  if (level <= 3) return SrsTier.beginner;
  if (level <= 6) return SrsTier.adept;
  if (level <= 9) return SrsTier.seasoned;
  return SrsTier.mastered;
}

/// Tier display names, in ladder order.
const srsTierNames = {
  SrsTier.beginner: 'Beginner',
  SrsTier.adept: 'Adept',
  SrsTier.seasoned: 'Seasoned',
  SrsTier.mastered: 'Mastered',
};
