/// The learner's own insights — a port of `InsightsBody.tsx` (`self` voice),
/// rendered on the Rank page's Strength tab. The staff sheet uses the same
/// sections; here the numbers are identical by construction.
library revisio.features.rank.insights_body;

import 'package:flutter/material.dart';

import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/srs.dart';

/// `when(iso)` from InsightsBody — relative under a day, a date beyond it.
String insightWhen(String? iso) {
  if (iso == null || iso.isEmpty) return '–';
  final d = DateTime.tryParse(iso);
  if (d == null) return '–';
  final diff = DateTime.now().difference(d);
  final mins = diff.inMinutes.abs();
  if (mins >= 60 * 24) {
    final sameYear = d.year == DateTime.now().year;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final base = '${d.day} ${months[d.month - 1]}';
    return sameYear ? base : '$base ${d.year}';
  }
  final label = mins < 1
      ? 'now'
      : mins < 60
      ? '${mins}m'
      : '${(mins / 60).round()}h';
  return diff.isNegative ? 'in $label' : '$label ago';
}

class InsightsBody extends StatefulWidget {
  const InsightsBody({super.key, required this.data, this.self = false});

  final Map<String, dynamic> data;
  final bool self;

  @override
  State<InsightsBody> createState() => _InsightsBodyState();
}

class _InsightsBodyState extends State<InsightsBody> {
  bool _showAllCards = false;

  Map<String, dynamic> get _overview =>
      (widget.data['overview'] as Map?)?.cast<String, dynamic>() ?? {};
  List<dynamic> get _srsLevels => widget.data['srsLevels'] as List? ?? [];
  List<dynamic> get _distribution => widget.data['distribution'] as List? ?? [];
  List<dynamic> get _struggling => widget.data['struggling'] as List? ?? [];
  List<dynamic> get _topicHealth => widget.data['topicHealth'] as List? ?? [];
  List<dynamic> get _recent => widget.data['recent'] as List? ?? [];
  List<dynamic> get _upcoming => widget.data['upcoming'] as List? ?? [];

  int _intOf(Map<String, dynamic> m, String k) => m[k] as int? ?? 0;

  @override
  Widget build(BuildContext context) {
    final maxCount = _srsLevels.fold<int>(
      1,
      (m, s) => (_intOf(s as Map<String, dynamic>, 'count') > m
          ? _intOf(s, 'count')
          : m),
    );
    final cards = _showAllCards
        ? _distribution
        : _distribution.take(8).toList();
    final who = widget.self ? 'you' : 'the learner';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Overview strip ──────────────────────────────────────────────
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.4,
          children: [
            _OverviewStat(
              label: 'Reviews',
              value: '${_intOf(_overview, 'totalReviews')}',
              note: '${_intOf(_overview, 'monthReviews')} in 30d',
            ),
            _OverviewStat(
              label: 'Accuracy',
              value: _overview['correctPct'] == null
                  ? '–'
                  : '${_overview['correctPct']}%',
              note: _overview['monthCorrectPct'] == null
                  ? 'no answers yet'
                  : '${_overview['monthCorrectPct']}% in 30d',
              alarm:
                  _overview['correctPct'] != null &&
                  (_overview['correctPct'] as int) < 60,
            ),
            _OverviewStat(
              label: 'Streak',
              value: '${_intOf(_overview, 'streak')}d',
              note: 'best ${_intOf(_overview, 'bestStreak')}d',
            ),
            _OverviewStat(
              label: 'Due now',
              value: '${_intOf(_overview, 'dueCount')}',
              note: '${_intOf(_overview, 'totalCards')} cards',
            ),
          ],
        ),
        const SizedBox(height: 24),

        // ── SRS strength ladder ─────────────────────────────────────────
        _SectionHeader(
          title: 'SRS strength',
          trailing: _FineText('levels 1–12'),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: _CaptionText(
            who == 'you'
                ? "Every card you've touched, by strength. Higher rungs mean longer intervals."
                : 'Every card the learner has touched, by strength. Higher rungs mean longer intervals.',
          ),
        ),
        const SizedBox(height: 12),
        for (final rung in srsLadder)
          Builder(
            builder: (context) {
              final count = _srsLevels
                  .where((s) => (s as Map)['level'] == rung.level)
                  .fold<int>(
                    0,
                    (n, s) => n + ((s as Map)['count'] as int? ?? 0),
                  );
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    SizedBox(
                      width: 24,
                      child: Text(
                        '${rung.level}',
                        textAlign: TextAlign.right,
                        style: TypeScale.fine.copyWith(
                          fontWeight: FontWeight.w700,
                          color: count == 0
                              ? context.mutedForeground
                              : context.foreground,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      width: 96,
                      child: Text(
                        rung.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _MiniMeter(
                        percent: count == 0 ? 0 : count / maxCount * 100,
                        dimmed: count == 0,
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      width: 32,
                      child: Text(
                        '$count',
                        textAlign: TextAlign.right,
                        style: TypeScale.fine.copyWith(
                          fontWeight: count == 0 ? null : FontWeight.w600,
                          color: count == 0
                              ? context.mutedForeground
                              : context.foreground,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        const SizedBox(height: 24),

        // ── Struggling ──────────────────────────────────────────────────
        const _SectionHeader(title: 'Struggling with'),
        if (_struggling.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: _CaptionText(
              'No misses in the last 30 days, or nothing studied yet.',
            ),
          )
        else ...[
          const SizedBox(height: 8),
          for (final s in _struggling)
            _StrugglingRow(item: (s as Map).cast<String, dynamic>()),
          if (_topicHealth.isNotEmpty) ...[
            const SizedBox(height: 12),
            const _Eyebrow('Topic health'),
            const SizedBox(height: 8),
            for (final t in _topicHealth)
              _TopicHealthRow(item: (t as Map).cast<String, dynamic>()),
          ],
        ],
        const SizedBox(height: 24),

        // ── Recent answers ──────────────────────────────────────────────
        const _SectionHeader(title: 'Recent answers'),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: _CaptionText(
            'The last twenty reviews exactly as they were graded.',
          ),
        ),
        const SizedBox(height: 8),
        if (_recent.isEmpty)
          _CaptionText('Nothing answered yet.')
        else
          for (final r in _recent)
            _RecentRow(item: (r as Map).cast<String, dynamic>()),
        const SizedBox(height: 24),

        // ── Card-level strength + upcoming ──────────────────────────────
        _SectionHeader(
          title: 'Card strengths',
          trailing: _distribution.length > 8
              ? Semantics(
                  button: true,
                  label: _showAllCards
                      ? 'Show less'
                      : 'Show all ${_distribution.length} cards',
                  child: GestureDetector(
                    onTap: () => setState(() => _showAllCards = !_showAllCards),
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      constraints: const BoxConstraints(
                        minHeight: kTouchTarget,
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          RevisioIcon(
                            _showAllCards ? 'collapse' : 'expand',
                            size: 13,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _showAllCards
                                ? 'Show less'
                                : 'Show all ${_distribution.length}',
                            style: TypeScale.caption.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              : null,
        ),
        const SizedBox(height: 8),
        if (cards.isEmpty)
          _CaptionText('No cards in rotation yet.')
        else
          for (final c in cards)
            _CardStrengthRow(item: (c as Map).cast<String, dynamic>()),
        if (_upcoming.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.secondary,
              borderRadius: BorderRadius.circular(RadiusTokens.md),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Eyebrow('Coming up next'),
                const SizedBox(height: 4),
                _CaptionText(
                  _upcoming
                      .take(3)
                      .map((u) {
                        final m = (u as Map).cast<String, dynamic>();
                        final prompt = m['prompt'] as String? ?? 'card';
                        final clipped = prompt.length > 40
                            ? '${prompt.substring(0, 40)}…'
                            : prompt;
                        return '“$clipped” (${insightWhen(m['dueAt'] as String?)})';
                      })
                      .join(' · '),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ── bits ────────────────────────────────────────────────────────────────────

class _OverviewStat extends StatelessWidget {
  const _OverviewStat({
    required this.label,
    required this.value,
    this.note,
    this.alarm = false,
  });

  final String label;
  final String value;
  final String? note;
  final bool alarm;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        border: alarm
            ? Border.all(color: context.destructive.withOpacity(0.4))
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Eyebrow(label),
          const SizedBox(height: 2),
          Text(
            value,
            style: TypeScale.displaySm.copyWith(
              fontWeight: FontWeight.w700,
              height: 1,
              color: alarm ? context.destructiveInk : context.foreground,
            ),
          ),
          if (note != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: _FineText(note!),
            ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(title, style: TypeScale.tagline)),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TypeScale.eyebrow.copyWith(color: context.mutedForeground),
    );
  }
}

class _CaptionText extends StatelessWidget {
  const _CaptionText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TypeScale.caption.copyWith(
        color: context.mutedForeground,
        height: 1.5,
      ),
    );
  }
}

class _FineText extends StatelessWidget {
  const _FineText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TypeScale.fine.copyWith(color: context.mutedForeground),
    );
  }
}

class _MiniMeter extends StatelessWidget {
  const _MiniMeter({required this.percent, this.dimmed = false});

  final double percent;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 8,
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: (percent / 100).clamp(0.0, 1.0),
        child: Container(
          decoration: BoxDecoration(
            color: context.foreground.withOpacity(dimmed ? 0.3 : 1),
            borderRadius: BorderRadius.circular(RadiusTokens.pill),
          ),
        ),
      ),
    );
  }
}

SrsTier _tierOf(int level) {
  if (level <= 3) return SrsTier.beginner;
  if (level <= 6) return SrsTier.adept;
  if (level <= 9) return SrsTier.seasoned;
  return SrsTier.mastered;
}

class _StrugglingRow extends StatelessWidget {
  const _StrugglingRow({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final misses = item['misses'] as int? ?? 0;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: context.destructive.withOpacity(0.1),
            ),
            child: Center(
              child: RevisioIcon(
                'due',
                size: 14,
                color: context.destructiveInk,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['topicName'] as String? ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.caption.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                _FineText(
                  '${item['subjectName'] ?? ''} · last miss ${insightWhen(item['lastMissedAt'] as String?)}',
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(RadiusTokens.pill),
              border: Border.all(color: context.destructive.withOpacity(0.4)),
            ),
            child: Text(
              '$misses miss${misses == 1 ? '' : 'es'}',
              style: TypeScale.fine.copyWith(color: context.destructiveInk),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopicHealthRow extends StatelessWidget {
  const _TopicHealthRow({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final mastery = (item['masteryPct'] as num?)?.toDouble() ?? 0;
    final misses = item['missCount'] as int? ?? 0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item['topicName'] as String? ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TypeScale.caption,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: '${mastery.round()}% mastered'),
                          if (misses > 0)
                            TextSpan(
                              text: ' · $misses miss${misses == 1 ? '' : 'es'}',
                              style: TextStyle(color: context.destructiveInk),
                            ),
                        ],
                      ),
                      style: TypeScale.fine.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                _MiniMeter(percent: mastery.clamp(0, 100)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RecentRow extends StatelessWidget {
  const _RecentRow({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final correct = item['correct'] as bool?;
    final answer = item['userAnswer'] as String?;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: correct == null
                  ? context.secondary
                  : correct
                  ? context.goodSoft
                  : context.destructive.withOpacity(0.1),
            ),
            child: Center(
              child: RevisioIcon(
                correct == null
                    ? 'clock'
                    : correct
                    ? 'correct'
                    : 'close',
                size: 13,
                color: correct == null
                    ? context.mutedForeground
                    : correct
                    ? context.goodStrong
                    : context.destructiveInk,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['prompt'] as String? ?? '(no text)',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.caption.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
                _FineText(
                  '${item['topicName'] ?? ''} · ${insightWhen(item['reviewedAt'] as String?)} · ${item['mode'] ?? ''}',
                ),
              ],
            ),
          ),
          if (answer != null && answer.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: context.secondary,
                borderRadius: BorderRadius.circular(RadiusTokens.sm),
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 120),
                child: Text(
                  answer,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.fine,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CardStrengthRow extends StatelessWidget {
  const _CardStrengthRow({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final level = item['srsLevel'] as int? ?? 1;
    final tier = _tierOf(level);
    final dueAt = item['dueAt'] as String?;
    final due =
        dueAt != null &&
        DateTime.tryParse(dueAt)?.isBefore(DateTime.now()) == true;
    final lapses = item['lapses'] as int? ?? 0;
    final bandColor = switch (tier) {
      SrsTier.beginner => context.destructiveInk,
      SrsTier.adept => context.foreground,
      SrsTier.seasoned => context.secondaryForeground,
      SrsTier.mastered => context.goodStrong,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: tier == SrsTier.beginner
                  ? context.destructive.withOpacity(0.15)
                  : tier == SrsTier.adept
                  ? context.gold.withOpacity(0.25)
                  : tier == SrsTier.seasoned
                  ? context.secondary
                  : context.goodSoft,
            ),
            child: Center(
              child: Text(
                '$level',
                style: TypeScale.fine.copyWith(
                  fontWeight: FontWeight.w700,
                  color: bandColor,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['prompt'] as String? ?? '(no text)',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.caption.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
                _FineText(
                  '${item['topicName'] ?? ''} · ${item['srsLabel'] ?? ''}'
                  '${lapses > 0 ? ' · $lapses lapse${lapses == 1 ? '' : 's'}' : ''}',
                ),
              ],
            ),
          ),
          _FineText(due ? 'due now' : insightWhen(dueAt)),
        ],
      ),
    );
  }
}
