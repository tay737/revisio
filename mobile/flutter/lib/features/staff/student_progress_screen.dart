/// Student progress — one learner's progress, read as a whole. Staff only.
///
/// The web's `StudentProgressPanel`, shared by the teacher roster and the
/// admin users table. It answers the three questions a teacher actually
/// brings to the data: are they working (the overview strip), what is
/// struggling (the miss list and the ladder), and what have they answered
/// (the recent ledger, verbatim). Ink meters instead of tier colours, one
/// column instead of a sheet — the design law this port follows everywhere.
library revisio.features.staff.student_progress_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/staff_models.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';
import 'staff_bits.dart';

class StudentProgressScreen extends ConsumerStatefulWidget {
  const StudentProgressScreen({
    super.key,
    required this.userId,
    required this.name,
  });

  final String userId;
  final String name;

  @override
  ConsumerState<StudentProgressScreen> createState() =>
      _StudentProgressScreenState();
}

class _StudentProgressScreenState extends ConsumerState<StudentProgressScreen> {
  StudentProgress? _data;
  bool _busy = true;
  String? _error;
  bool _showAllCards = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await ref
          .read(apiClientProvider)
          .studentProgress(userId: widget.userId);
      if (!mounted) return;
      setState(() {
        _data = data;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ApiError ? e.message : 'Progress could not be loaded.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: Text(widget.name)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            const StaffLabel('Progress'),
            const SizedBox(height: 4),
            if (data != null)
              Text(
                data.subjects.isEmpty
                    ? 'No subjects studied yet'
                    : data.subjects.map((s) => s.name).join(' · '),
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
              ),
            const SizedBox(height: 14),
            if (_error != null) ...[
              StaffSoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_error!, style: TypeScale.caption),
                    const SizedBox(height: 10),
                    RevisioSecondaryButton(
                      onPressed: _load,
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
            ] else if (data == null) ...[
              StaffSoftCard(
                child: Text(
                  _busy ? 'Loading progress…' : 'No progress to show yet.',
                  style: TypeScale.caption.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
              ),
              const SizedBox(height: 14),
            ] else ...[
              _OverviewCard(data: data),
              const SizedBox(height: 20),
              _StrengthCard(data: data),
              const SizedBox(height: 20),
              _StrugglingCard(data: data),
              const SizedBox(height: 20),
              _RecentCard(data: data),
              const SizedBox(height: 20),
              _CardStrengthsCard(
                data: data,
                showAll: _showAllCards,
                onToggle: () => setState(() => _showAllCards = !_showAllCards),
              ),
              const SizedBox(height: 20),
            ],
            Align(
              alignment: Alignment.centerLeft,
              child: RevisioGhostButton(
                onPressed: () => context.pop(),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    RevisioIcon('collapse', size: 14),
                    SizedBox(width: 6),
                    Text('Close'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 28),
          ],
        ),
      ),
    );
  }
}

/// The overview strip: reviews, accuracy, streak, due now — two rows of two.
class _OverviewCard extends StatelessWidget {
  const _OverviewCard({required this.data});

  final StudentProgress data;

  @override
  Widget build(BuildContext context) {
    final o = data.overview;
    return StaffCard(
      title: '',
      children: [
        Row(
          children: [
            Expanded(
              child: _ProgressStat(
                'Reviews',
                '${o.totalReviews}',
                '${o.monthReviews} in 30d',
              ),
            ),
            Expanded(
              child: _ProgressStat(
                'Accuracy',
                o.correctPct != null ? '${o.correctPct}%' : '–',
                o.monthCorrectPct != null
                    ? '${o.monthCorrectPct}% in 30d'
                    : 'no answers yet',
                tint: (o.correctPct ?? 100) < 60
                    ? context.destructiveInk
                    : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        const StaffHairline(),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _ProgressStat(
                'Streak',
                '${o.streak}d',
                'best ${o.bestStreak}d',
              ),
            ),
            Expanded(
              child: _ProgressStat(
                'Due now',
                '${o.dueCount}',
                '${o.totalCards} cards',
                tint: o.dueCount > 0 ? context.streak : null,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// A label-over-number pair with its explanatory line — the web's OverviewStat.
class _ProgressStat extends StatelessWidget {
  const _ProgressStat(this.label, this.value, this.note, {this.tint});

  final String label;
  final String value;
  final String note;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        StaffLabel(label),
        const SizedBox(height: 2),
        Text(
          value,
          style: TypeScale.displaySm.copyWith(
            color: tint ?? context.foreground,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          note,
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
      ],
    );
  }
}

/// The twelve rungs, every one of them — including the ones this learner holds
/// no cards on, because an empty rung is information too: it is what "strong"
/// would have to look like.
class _StrengthCard extends StatelessWidget {
  const _StrengthCard({required this.data});

  final StudentProgress data;

  @override
  Widget build(BuildContext context) {
    var maxCount = 1;
    for (final r in data.srsLevels) {
      if (r.count > maxCount) maxCount = r.count;
    }
    return StaffCard(
      title: 'SRS strength',
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Every card the learner has touched, by strength. Higher rungs mean longer intervals.',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
            ),
            const SizedBox(width: 8),
            StaffChip('levels 1–12'),
          ],
        ),
        const SizedBox(height: 12),
        for (final rung in kSrsLadder) ...[
          Builder(
            builder: (context) {
              var count = 0;
              for (final r in data.srsLevels) {
                if (r.level == rung.level) count = r.count;
              }
              final empty = count == 0;
              final ink = empty ? context.mutedForeground : context.foreground;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    SizedBox(
                      width: 22,
                      child: Text(
                        '${rung.level}',
                        style: TypeScale.fine.copyWith(color: ink),
                      ),
                    ),
                    SizedBox(
                      width: 92,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rung.label,
                            style: TypeScale.fine.copyWith(color: ink),
                          ),
                          if (rung.interval != null)
                            Text(
                              rung.interval!,
                              style: TypeScale.micro.copyWith(
                                color: context.mutedForeground,
                              ),
                            ),
                        ],
                      ),
                    ),
                    Expanded(child: StaffMeter((count * 100) ~/ maxCount)),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 24,
                      child: Text(
                        '$count',
                        textAlign: TextAlign.right,
                        style: TypeScale.fine.copyWith(color: ink),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ],
    );
  }
}

/// The miss list, most-missed first, with the per-topic roll-up under it.
class _StrugglingCard extends StatelessWidget {
  const _StrugglingCard({required this.data});

  final StudentProgress data;

  @override
  Widget build(BuildContext context) {
    return StaffCard(
      title: 'Struggling with',
      children: [
        if (data.struggling.isEmpty)
          Text(
            'No misses in the last 30 days, or nothing studied yet.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          )
        else ...[
          for (var i = 0; i < data.struggling.length; i++) ...[
            if (i > 0) const StaffHairline(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          data.struggling[i].topicName,
                          style: TypeScale.captionS,
                        ),
                        Text(
                          '${data.struggling[i].subjectName} · last miss ${staffWhenLabel(data.struggling[i].lastMissedAt)}',
                          style: TypeScale.fine.copyWith(
                            color: context.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StaffChip(
                    '${data.struggling[i].misses} miss${data.struggling[i].misses == 1 ? '' : 'es'}',
                    tint: context.destructiveInk,
                  ),
                ],
              ),
            ),
          ],
          if (data.topicHealth.isNotEmpty) ...[
            const SizedBox(height: 10),
            const StaffHairline(),
            const SizedBox(height: 10),
            const StaffLabel('Topic health'),
            const SizedBox(height: 8),
            for (final topic in data.topicHealth)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            topic.topicName,
                            style: TypeScale.caption,
                          ),
                        ),
                        Text(
                          '${topic.masteryPct}% mastered'
                          '${topic.missCount > 0 ? ' · ${topic.missCount} miss${topic.missCount == 1 ? '' : 'es'}' : ''}',
                          style: TypeScale.fine.copyWith(
                            color: context.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    StaffMeter(topic.masteryPct, height: 4),
                  ],
                ),
              ),
          ],
        ],
      ],
    );
  }
}

/// The last twenty answers, exactly as they were graded.
class _RecentCard extends StatelessWidget {
  const _RecentCard({required this.data});

  final StudentProgress data;

  @override
  Widget build(BuildContext context) {
    return StaffCard(
      title: 'Recent answers',
      children: [
        Text(
          'The last twenty reviews exactly as they were graded.',
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 10),
        if (data.recent.isEmpty)
          Text(
            'Nothing answered yet.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          )
        else
          for (var i = 0; i < data.recent.length; i++) ...[
            if (i > 0) const StaffHairline(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  RevisioIcon(
                    data.recent[i].correct == null
                        ? 'clock'
                        : data.recent[i].correct == true
                        ? 'correct'
                        : 'close',
                    size: 13,
                    color: data.recent[i].correct == null
                        ? context.mutedForeground
                        : data.recent[i].correct == true
                        ? context.goodStrong
                        : context.destructiveInk,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          data.recent[i].prompt ?? '(no text)',
                          style: TypeScale.caption,
                        ),
                        Text(
                          '${data.recent[i].topicName} · ${staffWhenLabel(data.recent[i].reviewedAt)} · ${data.recent[i].mode}',
                          style: TypeScale.fine.copyWith(
                            color: context.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if ((data.recent[i].userAnswer ?? '').isNotEmpty) ...[
                    const SizedBox(width: 8),
                    StaffChip(
                      data.recent[i].userAnswer!,
                      tint: context.mutedForeground,
                    ),
                  ],
                ],
              ),
            ),
          ],
      ],
    );
  }
}

/// Card-level strength, eight at a time, with the soonest due dates underneath.
class _CardStrengthsCard extends StatelessWidget {
  const _CardStrengthsCard({
    required this.data,
    required this.showAll,
    required this.onToggle,
  });

  final StudentProgress data;
  final bool showAll;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final cards = showAll
        ? data.distribution
        : data.distribution.take(8).toList();
    return StaffCard(
      title: 'Card strengths',
      trailing: data.distribution.length > 8
          ? RevisioGhostButton(
              onPressed: onToggle,
              child: Text(
                showAll ? 'Show less' : 'Show all ${data.distribution.length}',
              ),
            )
          : null,
      children: [
        if (cards.isEmpty)
          Text(
            'No cards in rotation yet.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          )
        else ...[
          for (var i = 0; i < cards.length; i++) ...[
            if (i > 0) const StaffHairline(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  SizedBox(
                    width: 24,
                    child: Text('${cards[i].srsLevel}', style: TypeScale.fine),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          cards[i].prompt ?? '(no text)',
                          style: TypeScale.caption,
                        ),
                        Text(
                          '${cards[i].topicName} · ${cards[i].srsLabel}'
                          '${cards[i].lapses > 0 ? ' · ${cards[i].lapses} lapse${cards[i].lapses == 1 ? '' : 's'}' : ''}',
                          style: TypeScale.fine.copyWith(
                            color: context.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    cards[i].dueAt != null &&
                            cards[i].dueAt!.isNotEmpty &&
                            staffIsDue(cards[i].dueAt!)
                        ? 'due now'
                        : staffWhenLabel(
                            cards[i].dueAt == null || cards[i].dueAt!.isEmpty
                                ? null
                                : cards[i].dueAt,
                          ),
                    style: TypeScale.fine.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (data.upcoming.isNotEmpty) ...[
            const SizedBox(height: 10),
            const StaffHairline(),
            const SizedBox(height: 10),
            const StaffLabel('Coming up next'),
            const SizedBox(height: 4),
            Text(
              data.upcoming
                  .take(3)
                  .map((u) {
                    final prompt = u.prompt ?? 'card';
                    final clipped = prompt.length > 40
                        ? '${prompt.substring(0, 40)}…'
                        : prompt;
                    return '“$clipped” (${staffWhenLabel(u.dueAt)})';
                  })
                  .join(' · '),
              style: TypeScale.caption.copyWith(color: context.mutedForeground),
            ),
          ],
        ],
      ],
    );
  }
}
