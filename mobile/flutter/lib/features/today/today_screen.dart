/// Today — the home surface. Greeting, companion line, due/streak/rank strip,
/// and the way into the review loop.
library revisio.features.today.today_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/copy.dart' as copy;
import '../../engine/models.dart';
import '../app/app_data.dart';

class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keep the offline pack fresh and drain any owed reviews on arrival.
    ref.watch(offlinePackSyncProvider);
    ref.listen(offlineSyncProvider, (_, __) {});

    final me = ref.watch(meProvider);
    final queue = ref.watch(queueProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(meProvider);
            ref.invalidate(queueProvider);
            ref.invalidate(gamificationProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
            children: [
              me.when(
                loading: () => const _Skeleton(),
                error: (e, _) => _ErrorState(
                  message: 'Could not load your day.',
                  onRetry: () => ref.invalidate(meProvider),
                ),
                data: (m) => _TodayBody(me: m, queue: queue),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TodayBody extends ConsumerWidget {
  const _TodayBody({required this.me, required this.queue});

  final MeDetail me;
  final AsyncValue<List<QueueCard>> queue;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final g = me.gamification;
    final due = me.today.due;
    final companion = copy.companionFor((
      name: me.name,
      role: me.role,
      due: due,
      reviewed: me.today.reviewed,
      correct: me.today.correct,
      streak: g.streak,
      bestStreak: g.bestStreak,
      level: g.level,
      subjects: me.subjects.map((s) => s.name).toList(),
      totalXp: g.totalXp,
      rankLabel: null,
    ));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(copy.greetingFor(me.name), style: TypeScale.display),
        const SizedBox(height: 8),
        Text(companion.line, style: TypeScale.body.copyWith(color: context.mutedForeground)),
        const SizedBox(height: 24),
        _StatsStrip(me: me),
        const SizedBox(height: 24),
        _QueueCard(queue: queue),
        const SizedBox(height: 24),
        RevisioButton(
          onPressed: queue.valueOrNull?.isNotEmpty == true ? () => context.go('/review') : null,
          child: Text(due > 0 ? 'Start review · $due due' : 'Review'),
        ),
        if (queue.valueOrNull?.isEmpty == true) ...[
          const SizedBox(height: 12),
          Text(
            copy.emptyQueueLine(due, g.streak),
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
        ],
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: () => context.push('/cram'),
          icon: const RevisioIcon('cram', size: 16),
          label: const Text('Cram — extra practice before an exam'),
        ),
      ],
    );
  }
}

class _StatsStrip extends StatelessWidget {
  const _StatsStrip({required this.me});

  final MeDetail me;

  @override
  Widget build(BuildContext context) {
    final g = me.gamification;
    Widget stat(String label, String value, {Color? color}) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
            decoration: BoxDecoration(
              color: context.card,
              borderRadius: BorderRadius.circular(RadiusTokens.lg),
              border: Border.all(color: context.border),
            ),
            child: Column(
              children: [
                Text(value, style: TypeScale.title.copyWith(color: color ?? context.foreground)),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: TypeScale.micro.copyWith(
                    color: context.mutedForeground,
                    letterSpacing: 0.08,
                  ),
                ),
              ],
            ),
          ),
        );

    return Row(
      children: [
        stat('Due', '${me.today.due}'),
        const SizedBox(width: 8),
        stat('Streak', '${g.streak}d', color: context.streak),
        const SizedBox(width: 8),
        stat('Level', '${g.level}'),
        const SizedBox(width: 8),
        stat('XP', '${g.totalXp}'),
      ],
    );
  }
}

class _QueueCard extends StatelessWidget {
  const _QueueCard({required this.queue});

  final AsyncValue<List<QueueCard>> queue;

  @override
  Widget build(BuildContext context) {
    return queue.when(
      loading: () => const _Skeleton(height: 96),
      error: (_, __) => Text(
        'Your queue could not be loaded — pull to retry.',
        style: TypeScale.caption.copyWith(color: context.mutedForeground),
      ),
      data: (cards) {
        if (cards.isEmpty) return const SizedBox.shrink();
        final preview = cards.take(3).toList();
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.card,
            borderRadius: BorderRadius.circular(RadiusTokens.lg),
            border: Border.all(color: context.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${cards.length} card${cards.length == 1 ? '' : 's'} waiting',
                  style: TypeScale.strong),
              const SizedBox(height: 8),
              for (final c in preview)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '· ${c.topicName} — ${c.subjectName}',
                    style: TypeScale.caption.copyWith(color: context.mutedForeground),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton({this.height = 120});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: context.muted,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 80),
        Text(message, style: TypeScale.body.copyWith(color: context.mutedForeground)),
        const SizedBox(height: 16),
        RevisioButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    );
  }
}
