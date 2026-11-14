/// Rank — weekly board, lobby position, season clock and form read.
library revisio.features.rank.rank_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/copy.dart' as copy;
import '../../engine/models.dart';
import '../../engine/ranked.dart' as ranked;
import '../app/app_data.dart';

class RankScreen extends ConsumerWidget {
  const RankScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gam = ref.watch(gamificationProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Rank')),
      body: SafeArea(
        child: gam.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Rank could not be loaded.',
                    style: TypeScale.body.copyWith(color: context.mutedForeground)),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => ref.invalidate(gamificationProvider),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
          data: (p) => _RankBody(payload: p),
        ),
      ),
    );
  }
}

class _RankBody extends StatelessWidget {
  const _RankBody({required this.payload});

  final GamificationPayload payload;

  @override
  Widget build(BuildContext context) {
    final r = payload.ranked;
    final rank = r.rank;
    final lobbyLine = copy.lobbyLine(
      zone: r.lobby.zone,
      position: r.lobby.position,
      size: r.lobby.size,
      daysLeft: r.week.daysLeft,
      rankLabel: rank.label,
    );

    return ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          // The crest card: rank, progress through the rung, week XP.
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: context.card,
              borderRadius: BorderRadius.circular(RadiusTokens.xl),
              border: Border.all(color: context.border),
            ),
            child: Column(
              children: [
                Text(rank.label, style: TypeScale.display),
                const SizedBox(height: 4),
                Text(
                  '${r.xpThisWeek} XP this week · ${payload.me.totalXp} lifetime',
                  style: TypeScale.caption.copyWith(color: context.mutedForeground),
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(RadiusTokens.pill),
                  child: LinearProgressIndicator(
                    value: rank.forDivision > 0 ? rank.intoDivision / rank.forDivision : 0,
                    minHeight: 8,
                    backgroundColor: context.muted,
                    valueColor: AlwaysStoppedAnimation(context.primary),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  rank.isApex ? '' : '${rank.remaining} RP to ${_nextLabel(rank)}',
                  style: TypeScale.fine.copyWith(color: context.mutedForeground),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.muted,
              borderRadius: BorderRadius.circular(RadiusTokens.lg),
            ),
            child: Text(lobbyLine, style: TypeScale.caption.copyWith(height: 1.5)),
          ),
          if (r.season != null) ...[
            const SizedBox(height: 16),
            _SeasonRow(season: r.season!, seasonXp: r.seasonXp),
          ],
          const SizedBox(height: 24),
          Text('This week', style: TypeScale.strong),
          const SizedBox(height: 8),
          if (payload.board.isEmpty)
            Text('No one on the board yet.',
                style: TypeScale.caption.copyWith(color: context.mutedForeground))
          else
            for (final row in payload.board.take(10)) _BoardRow(row: row),
        ],
    );
  }
}

String _nextLabel(ranked.Rank rank) {
  final next = ranked.nextRung(rank.index);
  if (next == null) return 'the top';
  return ranked.rankFor(next.base).label;
}

class _SeasonRow extends StatelessWidget {
  const _SeasonRow({required this.season, required this.seasonXp});

  final SeasonClock season;
  final int? seasonXp;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Season ${season.number} · ${season.label}', style: TypeScale.strong),
                const SizedBox(height: 2),
                Text(
                  '${season.rangeLabel} · ${season.daysLeft} days left',
                  style: TypeScale.fine.copyWith(color: context.mutedForeground),
                ),
              ],
            ),
          ),
          if (seasonXp != null)
            Text('$seasonXp XP', style: TypeScale.strong.copyWith(color: context.goldInk)),
        ],
      ),
    );
  }
}

class _BoardRow extends StatelessWidget {
  const _BoardRow({required this.row});

  final BoardRow row;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: row.isMe ? context.secondary : Colors.transparent,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text('${row.rank}',
                style: TypeScale.captionS.copyWith(color: context.mutedForeground)),
          ),
          Expanded(
            child: Text(
              row.isMe ? '${row.name} (you)' : row.name,
              style: TypeScale.body.copyWith(
                fontWeight: row.isMe ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
          ),
          Text('${row.xp} XP', style: TypeScale.caption.copyWith(color: context.mutedForeground)),
        ],
      ),
    );
  }
}
