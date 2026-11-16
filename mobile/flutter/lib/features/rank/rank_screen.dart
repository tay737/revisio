/// Rank — the competitive hub, a screen-for-screen port of
/// `src/app/(app)/progress/page.tsx`: the shared rank strip, four tabs
/// (Rank / This week / XP / Strength), achievements and the transcript.
library revisio.features.rank.rank_screen;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../design/achievement_icons.dart';
import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/copy.dart' as copy;
import '../../engine/models.dart';
import '../../engine/ranked.dart' as ranked;
import '../../services/api_client.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import '../nav/rank_crest.dart';
import 'insights_body.dart';
import 'rank_strip.dart';
import 'season_models.dart';

Color _tierColor(BuildContext context, ranked.Tier tier) =>
    tierColorFor(tier, Theme.of(context).brightness);

class RankScreen extends ConsumerStatefulWidget {
  const RankScreen({super.key, this.initialView, this.initialScope});

  final String? initialView;
  final String? initialScope;

  @override
  ConsumerState<RankScreen> createState() => _RankScreenState();
}

class _RankScreenState extends ConsumerState<RankScreen> {
  late String _view = _viewFromParam(widget.initialView);
  late String _scope = _scopeFromParam(widget.initialScope);
  bool _optOut = false;
  String _note = '';
  String _error = '';

  static const _views = ['rank', 'lobby', 'board', 'strength'];
  static const _viewLabels = {
    'rank': 'Rank',
    'lobby': 'This week',
    'board': 'XP',
    'strength': 'Strength',
  };
  static const _scopes = ['daily', 'weekly', 'monthly'];

  static String _viewFromParam(String? v) => _views.contains(v) ? v! : 'rank';
  static String _scopeFromParam(String? v) =>
      _scopes.contains(v) ? v! : 'weekly';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final me = ref.read(meProvider).valueOrNull;
      if (me != null) setState(() => _optOut = me.leaderboardOptOut);
    });
  }

  Future<void> _toggleOptOut() async {
    final next = !_optOut;
    setState(() {
      _optOut = next;
      _error = '';
    });
    try {
      await ref.read(apiClientProvider).patchMe({'leaderboardOptOut': next});
      ref.invalidate(meProvider);
      setState(() {
        _note = next
            ? 'You are off the boards. Your rank is untouched.'
            : 'You are back on the boards.';
      });
    } catch (e) {
      setState(() {
        _optOut = !next;
        _error = e is ApiError
            ? e.message
            : 'We could not change that setting.';
      });
    }
  }

  Future<void> _export(String format) async {
    try {
      final bytes = await ref
          .read(apiClientProvider)
          .exportTranscript(format: format);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/revisio-transcript.$format');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles([
        XFile(file.path),
      ], subject: 'Revisio transcript');
    } catch (_) {
      setState(() => _error = 'We could not build your transcript.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final gam = ref.watch(gamificationProvider);
    return gam.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) =>
          _ErrorCard(onRetry: () => ref.invalidate(gamificationProvider)),
      data: (payload) => _body(payload),
    );
  }

  Widget _body(GamificationPayload payload) {
    final data = payload.ranked;
    final me = ref.watch(meProvider).valueOrNull;
    final form = me != null
        ? ranked.formFor(me.today.reviewed, me.today.correct)
        : null;
    final unlocked = payload.achievements.where((a) => a.unlocked).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Semantics(
          header: true,
          child: ExcludeSemantics(child: Text('Rank', style: TypeScale.title)),
        ),
        if (_note.isNotEmpty) ...[
          _Notice(tone: _NoticeTone.note, text: _note),
          const SizedBox(height: 12),
        ],
        if (_error.isNotEmpty) ...[
          _Notice(tone: _NoticeTone.bad, text: _error),
          const SizedBox(height: 12),
        ],
        RankStrip(ranked: data),
        const SizedBox(height: 16),
        _TabBar(
          views: _views,
          labels: _viewLabels,
          selected: _view,
          onSelect: (v) => setState(() => _view = v),
        ),
        const SizedBox(height: 16),
        if (_view == 'rank')
          _RankTab(data: data, form: form, totalXp: payload.me.totalXp),
        if (_view == 'strength') const _StrengthTab(),
        if (_view == 'lobby')
          _LobbyTab(data: data, optOut: _optOut, onToggleOptOut: _toggleOptOut),
        if (_view == 'board')
          _BoardTab(
            scope: _scope,
            scopes: _scopes,
            optOut: _optOut,
            onScope: (s) => setState(() => _scope = s),
            onToggleOptOut: _toggleOptOut,
          ),
        const SizedBox(height: 16),
        _AchievementsCard(
          achievements: payload.achievements,
          unlocked: unlocked,
        ),
        const SizedBox(height: 16),
        _TranscriptCard(onExport: _export),
      ],
    );
  }
}

// ── tab bar ─────────────────────────────────────────────────────────────────

class _TabBar extends StatelessWidget {
  const _TabBar({
    required this.views,
    required this.labels,
    required this.selected,
    required this.onSelect,
  });

  final List<String> views;
  final Map<String, String> labels;
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Row(
        children: [
          for (final v in views)
            Expanded(
              child: Semantics(
                button: true,
                selected: v == selected,
                label: labels[v]!,
                child: GestureDetector(
                  onTap: () => onSelect(v),
                  child: AnimatedContainer(
                    duration: context.reduceMotion
                        ? Duration.zero
                        : const Duration(milliseconds: 150),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: v == selected ? context.card : Colors.transparent,
                      borderRadius: BorderRadius.circular(RadiusTokens.pill),
                    ),
                    child: Text(
                      labels[v]!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TypeScale.caption.copyWith(
                        fontWeight: FontWeight.w600,
                        color: v == selected
                            ? context.foreground
                            : context.mutedForeground,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── shared bits ─────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      child: child,
    );
  }
}

class _Tagline extends StatelessWidget {
  const _Tagline(this.text, {this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(child: Text(text, style: TypeScale.tagline)),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _Caption extends StatelessWidget {
  const _Caption(this.text, {this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TypeScale.caption.copyWith(
        color: color ?? context.mutedForeground,
        height: 1.5,
      ),
    );
  }
}

class _Fine extends StatelessWidget {
  const _Fine(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TypeScale.fine.copyWith(color: context.mutedForeground),
    );
  }
}

class _Meter extends StatelessWidget {
  const _Meter({required this.percent, this.height = 8, this.color});

  final double percent;
  final double height;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: (percent / 100).clamp(0.0, 1.0),
        child: Container(
          decoration: BoxDecoration(
            color: color ?? context.foreground,
            borderRadius: BorderRadius.circular(RadiusTokens.pill),
          ),
        ),
      ),
    );
  }
}

enum _NoticeTone { note, bad }

class _Notice extends StatelessWidget {
  const _Notice({required this.tone, required this.text});

  final _NoticeTone tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    final bad = tone == _NoticeTone.bad;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bad ? context.destructive.withOpacity(0.12) : context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        border: Border.all(
          color: bad ? context.destructive.withOpacity(0.4) : context.border,
        ),
      ),
      child: Text(
        text,
        style: TypeScale.caption.copyWith(
          color: bad ? context.destructiveInk : context.foreground,
        ),
      ),
    );
  }
}

class _QuietBadge extends StatelessWidget {
  const _QuietBadge(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Text(
        text,
        style: TypeScale.fine.copyWith(color: context.mutedForeground),
      ),
    );
  }
}

// ── Rank tab (RankView port) ────────────────────────────────────────────────

class _RankTab extends ConsumerWidget {
  const _RankTab({
    required this.data,
    required this.form,
    required this.totalXp,
  });

  final Ranked data;
  final ranked.FormRead? form;
  final int totalXp;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seasons = ref.watch(seasonsProvider);
    return seasons.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Notice(
            tone: _NoticeTone.bad,
            text: 'The season could not be loaded.',
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => ref.invalidate(seasonsProvider),
              child: const Text('Try again'),
            ),
          ),
        ],
      ),
      data: (season) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SeasonClock(season: season),
          const SizedBox(height: 16),
          _TierProgress(rank: season.mine.rank, form: form),
          const SizedBox(height: 16),
          _TheLadder(
            rank: season.mine.rank,
            placement: data.placement,
            season: season.season,
          ),
          const SizedBox(height: 16),
          _SeasonBoard(season: season),
          const SizedBox(height: 16),
          _Showcase(season: season),
          const SizedBox(height: 16),
          _YourRecord(data: data, totalXp: totalXp),
          const SizedBox(height: 16),
          _SeasonRewards(rewards: season.rewards),
        ],
      ),
    );
  }
}

class _SeasonClock extends StatelessWidget {
  const _SeasonClock({required this.season});

  final SeasonPayload season;

  @override
  Widget build(BuildContext context) {
    final s = season.season;
    final mine = season.mine;
    final isLastDay = s.daysLeft <= 1;
    final placing = !mine.placed;

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Fine(s.label),
                    const SizedBox(height: 4),
                    Text(s.rangeLabel, style: TypeScale.displayMd),
                  ],
                ),
              ),
              _QuietBadge(isLastDay ? 'Last day' : '${s.daysLeft} days left'),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _Meter(percent: s.percentElapsed.toDouble(), height: 8),
              ),
              const SizedBox(width: 12),
              _Fine('Day ${s.day} of ${s.lengthDays}'),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RankCrest(rank: mine.rank, size: 92),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Fine('Your rank'),
                    const SizedBox(height: 4),
                    Text(
                      mine.placed ? mine.rank.label : 'Being placed',
                      style: TypeScale.displayMd,
                    ),
                    const SizedBox(height: 6),
                    _Caption(
                      copy.seasonLine(
                        daysLeft: s.daysLeft,
                        rankLabel: mine.rank.label,
                        placed: mine.placed,
                        isLastDay: isLastDay,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: _Meter(percent: mine.rank.percent.toDouble()),
                        ),
                        const SizedBox(width: 12),
                        _Fine('${mine.xp} RP'),
                      ],
                    ),
                    if (placing)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: _Caption(
                          '${mine.reviews} of 10 reviews this season.',
                        ),
                      ),
                    if (mine.placed && !mine.rank.isApex)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: _Caption(
                          '${mine.rank.remaining} RP to the next rung · about ${ranked.reviewsForRp(mine.rank.remaining)} more reviews.',
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: context.secondary,
              borderRadius: BorderRadius.circular(RadiusTokens.md),
              border: Border.all(color: context.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Fine('On the season board'),
                      const SizedBox(height: 4),
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: '${mine.position}',
                              style: TypeScale.leadAiry.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (mine.fieldSize > 0)
                              TextSpan(
                                text: ' of ${mine.fieldSize}',
                                style: TypeScale.caption.copyWith(
                                  color: context.mutedForeground,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const RevisioIcon('league', size: 18, color: null),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TierProgress extends StatelessWidget {
  const _TierProgress({required this.rank, required this.form});

  final ranked.Rank rank;
  final ranked.FormRead? form;

  @override
  Widget build(BuildContext context) {
    final tiers = ranked.tierOrder.map((tier) {
      final base = ranked.rankLadder.firstWhere((r) => r.tier == tier).base;
      final total = ranked.divisionSpan[tier]! * 3;
      final earned = (rank.points - base).clamp(0, total);
      return (tier: tier, base: base, total: total, earned: earned);
    }).toList();

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Tier progress', style: TypeScale.tagline),
              _Fine('${rank.points} RP this season'),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final t in tiers) ...[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Meter(
                        percent: (t.earned / t.total * 100),
                        height: 8,
                        color:
                            rank.points >= t.base + t.total ||
                                rank.tier == t.tier
                            ? _tierColor(context, t.tier)
                            : context.borderStrong,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        ranked.tierName(t.tier),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TypeScale.micro.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                          color: rank.tier == t.tier
                              ? _tierColor(context, t.tier)
                              : context.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                if (t != tiers.last) const SizedBox(width: 6),
              ],
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.only(top: 14),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: context.border)),
            ),
            child: Row(
              children: [
                const RevisioIcon('form', size: 14),
                const SizedBox(width: 6),
                _Caption('Form', color: context.mutedForeground),
                const SizedBox(width: 6),
                Text(
                  form?.label ?? '–',
                  style: TypeScale.caption.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(child: _Caption(form?.detail ?? '')),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TheLadder extends StatelessWidget {
  const _TheLadder({
    required this.rank,
    required this.placement,
    required this.season,
  });

  final ranked.Rank rank;
  final Placement placement;
  final SeasonClockInfo season;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('The ladder', style: TypeScale.tagline),
              _Fine(
                placement.placing
                    ? 'Placement ${placement.done}/${placement.target}'
                    : '${ranked.rankLadder.length} ranks',
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 150,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: ranked.rankLadder.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final rung = ranked.rankLadder[i];
                final rungRank = ranked.rankFor(rung.base);
                final isCurrent = rung.index == rank.index;
                final reached = rung.index <= rank.index;
                return Container(
                  width: 96,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: isCurrent ? context.secondary : null,
                    borderRadius: BorderRadius.circular(RadiusTokens.md),
                    border: Border.all(
                      color: isCurrent ? context.foreground : context.border,
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      RankCrest(
                        rank: rungRank,
                        size: 42,
                        showProgress: false,
                        muted: !reached,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        ranked.divisionLabel[rung.division] ?? '',
                        style: TypeScale.caption.copyWith(
                          fontWeight: FontWeight.w600,
                          color: reached
                              ? context.foreground
                              : context.mutedForeground,
                        ),
                      ),
                      Text(
                        ranked.tierName(rung.tier),
                        style: TypeScale.micro.copyWith(
                          letterSpacing: 0.6,
                          color: reached
                              ? _tierColor(context, rung.tier)
                              : context.mutedForeground,
                        ),
                      ),
                      Text(
                        '${rung.base} RP',
                        style: TypeScale.micro.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 14),
          _Caption(
            'Measured against ${season.label.toLowerCase()}. '
            '${rank.isApex
                ? 'Top of the ladder. Holding it for ninety days is the hard part.'
                : 'Next rung in ${rank.remaining} RP · about ${ranked.reviewsForRp(rank.remaining)} reviews. '
                      'The ladder resets when the season does.'}',
          ),
        ],
      ),
    );
  }
}

class _SeasonBoard extends StatelessWidget {
  const _SeasonBoard({required this.season});

  final SeasonPayload season;

  @override
  Widget build(BuildContext context) {
    final board = season.board;
    final mine = season.mine;
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _Tagline(
            'Season board',
            trailing: _Fine('Resets with the season'),
          ),
          const SizedBox(height: 4),
          _Caption(
            'Everybody on this board started ${season.season.label.toLowerCase()} on Bronze III. '
            'Ordered by XP earned inside the window.',
          ),
          const SizedBox(height: 16),
          if (board.isEmpty)
            _Caption(
              'Nobody has logged XP this season yet. One review puts you on it.',
            )
          else ...[
            for (final row in board)
              Container(
                margin: const EdgeInsets.symmetric(vertical: 5),
                padding: EdgeInsets.symmetric(
                  horizontal: row.isMe ? 8 : 0,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: row.isMe ? context.secondary : null,
                  borderRadius: BorderRadius.circular(RadiusTokens.sm),
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: 24,
                      child: Text(
                        '${row.position}',
                        textAlign: TextAlign.center,
                        style: TypeScale.caption.copyWith(
                          fontWeight: row.isMe ? FontWeight.w700 : null,
                          color: row.isMe
                              ? context.foreground
                              : context.mutedForeground,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    RankCrest(rank: row.rank, size: 30, showProgress: false),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            row.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TypeScale.body.copyWith(
                              fontWeight: row.isMe ? FontWeight.w700 : null,
                            ),
                          ),
                          Text(
                            row.rank.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TypeScale.fine.copyWith(
                              color: _tierColor(context, row.rank.tier),
                            ),
                          ),
                        ],
                      ),
                    ),
                    _Fine('${row.xp} RP'),
                  ],
                ),
              ),
            if (mine.position > board.length)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _Caption(
                  'You are ${mine.position} in the season, outside the top ${board.length} and climbing.',
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _Showcase extends ConsumerWidget {
  const _Showcase({required this.season});

  final SeasonPayload season;

  Future<void> _claim(BuildContext context, WidgetRef ref, int n) async {
    try {
      final res = await ref.read(apiClientProvider).claimSeasonReward(n);
      ref.invalidate(seasonsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              res['alreadyClaimed'] == true
                  ? 'That reward was already on your showcase.'
                  : 'Claimed. It is on your showcase from now on.',
            ),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is ApiError ? e.message : 'We could not claim that reward.',
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = season.history;
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Tagline('Your seasons', trailing: _Fine('${history.length}')),
          const SizedBox(height: 4),
          _Caption(
            'The rank you finished each season on. These do not change when the next one starts.',
          ),
          const SizedBox(height: 16),
          if (history.isEmpty)
            _Caption(
              'Nothing to show yet. No season has closed since your first ten reviews. '
              'When one does, the rank you hold on its last day is recorded here with the reward that tier earns.',
            )
          else
            for (final row in history)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(RadiusTokens.md),
                  border: Border.all(color: context.border),
                ),
                child: Row(
                  children: [
                    RankCrest(rank: row.rank, size: 56, showProgress: false),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _Fine('Season ${row.seasonNumber}'),
                          const SizedBox(height: 2),
                          Text(
                            row.rank.label,
                            style: TypeScale.strong.copyWith(
                              color: _tierColor(context, row.rank.tier),
                            ),
                          ),
                          _Fine(
                            '${row.reviews} reviews · ${row.rank.points} RP',
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              RevisioIcon(
                                row.reward.icon.isEmpty
                                    ? 'rank'
                                    : row.reward.icon,
                                size: 14,
                                color: context.goldInk,
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  row.reward.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TypeScale.caption.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          _Fine(row.reward.detail),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (row.rewardClaimedAt != null)
                      const _QuietBadge('Claimed')
                    else
                      OutlinedButton(
                        onPressed: () => _claim(context, ref, row.seasonNumber),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 36),
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          textStyle: TypeScale.caption,
                        ),
                        child: const Text('Claim'),
                      ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class _YourRecord extends StatelessWidget {
  const _YourRecord({required this.data, required this.totalXp});

  final Ranked data;
  final int totalXp;

  @override
  Widget build(BuildContext context) {
    final lifetime = data.lifetimeRank ?? data.rank;
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Your record', style: TypeScale.tagline),
              _Fine('$totalXp XP all time'),
            ],
          ),
          const SizedBox(height: 4),
          _Caption(
            'Every review you have ever done, run through the same ladder. '
            'It is not your rank, which resets each season, but it is the one number that only ever goes up.',
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(RadiusTokens.md),
              border: Border.all(color: context.border),
            ),
            child: Row(
              children: [
                RankCrest(rank: lifetime, size: 48, showProgress: false),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Caption('Peak standing'),
                      Text(
                        lifetime.label,
                        style: TypeScale.strong.copyWith(
                          color: _tierColor(context, lifetime.tier),
                        ),
                      ),
                    ],
                  ),
                ),
                _Fine('${lifetime.points} RP lifetime'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SeasonRewards extends StatelessWidget {
  const _SeasonRewards({required this.rewards});

  final List<SeasonRewardEntry> rewards;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Season rewards', style: TypeScale.tagline),
          const SizedBox(height: 4),
          _Caption(
            'Paid on the tier you finish in, not the division, so a season never ends one rung short of the next tier for nothing.',
          ),
          const SizedBox(height: 16),
          for (final row in rewards)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(RadiusTokens.md),
                border: Border.all(color: context.border),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    margin: const EdgeInsets.only(top: 5),
                    decoration: BoxDecoration(
                      color: _tierColor(context, row.tier),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [_Caption(row.name), _Fine(row.reward.detail)],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: RevisioGoodButton(
              compact: true,
              onPressed: () => context.go('/review'),
              child: const Text("Earn this season's rank"),
            ),
          ),
        ],
      ),
    );
  }
}

// ── This week tab ───────────────────────────────────────────────────────────

class _LobbyTab extends StatelessWidget {
  const _LobbyTab({
    required this.data,
    required this.optOut,
    required this.onToggleOptOut,
  });

  final Ranked data;
  final bool optOut;
  final VoidCallback onToggleOptOut;

  @override
  Widget build(BuildContext context) {
    final lobby = data.lobby;
    final smallLobby = lobby.filled < ranked.lobbyZoneMin;
    final demotionFrom = lobby.size - lobby.band + 1;
    final unclaimed = (lobby.size - lobby.rows.length).clamp(0, 1 << 30);
    final shownSeats = unclaimed < 3 ? unclaimed : 3;

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${data.rank.label} lobby', style: TypeScale.tagline),
                    _Fine(data.week.rangeLabel),
                  ],
                ),
              ),
              _QuietBadge(
                data.week.daysLeft == 1
                    ? 'Last day'
                    : '${data.week.daysLeft} days left',
              ),
            ],
          ),
          const SizedBox(height: 12),
          _Caption(
            copy.lobbyLine(
              zone: lobby.zone,
              position: lobby.position,
              size: lobby.size,
              filled: lobby.filled,
              daysLeft: data.week.daysLeft,
              rankLabel: data.rank.label,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _Meter(
                  percent: data.week.percentElapsed.toDouble(),
                  height: 6,
                ),
              ),
              const SizedBox(width: 12),
              _Fine('${100 - data.week.percentElapsed}% left'),
            ],
          ),
          const SizedBox(height: 16),
          if (optOut)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: context.secondary,
                borderRadius: BorderRadius.circular(RadiusTokens.md),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: RevisioIcon('private', size: 17),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          'You’re off every board. Your rank, XP and streak are untouched — only the comparisons stop. ',
                          style: TypeScale.caption.copyWith(height: 1.4),
                        ),
                        Semantics(
                          button: true,
                          label: 'Rejoin the boards',
                          child: GestureDetector(
                            onTap: onToggleOptOut,
                            child: Text(
                              'Rejoin',
                              style: TypeScale.caption.copyWith(
                                fontWeight: FontWeight.w700,
                                decoration: TextDecoration.underline,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            )
          else ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (smallLobby)
                  _Fine(
                    'Bands start at ${ranked.lobbyZoneMin} seated — ${lobby.filled} so far',
                  )
                else ...[
                  _ZoneBadge.up('Top ${lobby.band} promote'),
                  _ZoneBadge.down('Bottom ${lobby.band} drop a rung'),
                ],
                _Fine('${lobby.filled}/${lobby.size} seats'),
              ],
            ),
            const SizedBox(height: 10),
            for (final row in lobby.rows)
              _LobbyRow(
                row: row,
                band: lobby.band,
                demotionFrom: demotionFrom,
                showZones: !smallLobby,
              ),
            for (var i = 0; i < shownSeats; i++)
              _OpenSeat(position: lobby.rows.length + i + 1),
            if (unclaimed > shownSeats)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _Fine('+${unclaimed - shownSeats} more open seats'),
              ),
          ],
        ],
      ),
    );
  }
}

class _ZoneBadge extends StatelessWidget {
  const _ZoneBadge.up(this.text) : up = true;
  const _ZoneBadge.down(this.text) : up = false;

  final String text;
  final bool up;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: up ? context.good.withOpacity(0.15) : context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          RevisioIcon(
            up ? 'zoneUp' : 'zoneDown',
            size: 12,
            color: up ? context.goodStrong : context.mutedForeground,
          ),
          const SizedBox(width: 5),
          Text(
            text,
            style: TypeScale.fine.copyWith(
              color: up ? context.goodStrong : context.foreground,
            ),
          ),
        ],
      ),
    );
  }
}

class _LobbyRow extends StatelessWidget {
  const _LobbyRow({
    required this.row,
    required this.band,
    required this.demotionFrom,
    required this.showZones,
  });

  final LobbySeat row;
  final int band;
  final int demotionFrom;
  final bool showZones;

  @override
  Widget build(BuildContext context) {
    final promoting = showZones && row.position <= band;
    final demoting = showZones && row.position >= demotionFrom;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 5),
      padding: EdgeInsets.symmetric(horizontal: row.isMe ? 8 : 0, vertical: 10),
      decoration: BoxDecoration(
        color: row.isMe ? context.secondary : null,
        borderRadius: BorderRadius.circular(RadiusTokens.sm),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text(
              '${row.position}',
              textAlign: TextAlign.center,
              style: TypeScale.caption.copyWith(
                fontWeight: row.isMe ? FontWeight.w700 : null,
                color: row.isMe ? context.foreground : context.mutedForeground,
              ),
            ),
          ),
          if (row.isMe && row.rank != null) ...[
            const SizedBox(width: 8),
            RankCrest(rank: row.rank!, size: 30, showProgress: false),
          ],
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.isMe ? 'You' : row.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.body.copyWith(
                    fontWeight: row.isMe ? FontWeight.w700 : null,
                  ),
                ),
                if (!row.isMe && row.rank != null)
                  Text(
                    row.rank!.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TypeScale.fine.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          if (promoting)
            RevisioIcon('zoneUp', size: 14, color: context.goodStrong)
          else if (demoting)
            RevisioIcon('zoneDown', size: 14, color: context.destructiveInk),
          const SizedBox(width: 8),
          Text(
            '${row.xp} XP',
            style: TypeScale.caption.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _OpenSeat extends StatelessWidget {
  const _OpenSeat({required this.position});

  final int position;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text(
              '$position',
              textAlign: TextAlign.center,
              style: TypeScale.caption.copyWith(color: context.mutedForeground),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Open seat',
              style: TypeScale.body.copyWith(
                fontStyle: FontStyle.italic,
                color: context.mutedForeground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── XP tab ──────────────────────────────────────────────────────────────────

class _BoardTab extends ConsumerWidget {
  const _BoardTab({
    required this.scope,
    required this.scopes,
    required this.optOut,
    required this.onScope,
    required this.onToggleOptOut,
  });

  final String scope;
  final List<String> scopes;
  final bool optOut;
  final ValueChanged<String> onScope;
  final VoidCallback onToggleOptOut;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gam = ref.watch(gamificationScopedProvider(scope));
    return gam.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Notice(
            tone: _NoticeTone.bad,
            text: 'The board could not be loaded.',
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () =>
                  ref.invalidate(gamificationScopedProvider(scope)),
              child: const Text('Try again'),
            ),
          ),
        ],
      ),
      data: (payload) => _Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text('XP board', style: TypeScale.tagline),
                ),
                for (final s in scopes)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: Semantics(
                      button: true,
                      selected: s == scope,
                      label: s,
                      child: GestureDetector(
                        onTap: () => onScope(s),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: s == scope
                                ? context.foreground
                                : context.secondary,
                            borderRadius: BorderRadius.circular(
                              RadiusTokens.pill,
                            ),
                          ),
                          child: Text(
                            s,
                            style: TypeScale.fine.copyWith(
                              fontWeight: FontWeight.w600,
                              color: s == scope
                                  ? context.background
                                  : context.foreground,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (payload.board.isEmpty)
              _Caption(
                'Nobody has logged XP this $scope. One review puts you on the board.',
              )
            else
              for (final row in payload.board)
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 5),
                  padding: EdgeInsets.symmetric(
                    horizontal: row.isMe ? 8 : 0,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: row.isMe ? context.secondary : null,
                    borderRadius: BorderRadius.circular(RadiusTokens.sm),
                  ),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 24,
                        child: Text(
                          '${row.rank}',
                          textAlign: TextAlign.center,
                          style: TypeScale.caption.copyWith(
                            fontWeight: row.isMe ? FontWeight.w700 : null,
                            color: row.isMe
                                ? context.foreground
                                : context.mutedForeground,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          row.isMe ? 'You' : row.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TypeScale.body.copyWith(
                            fontWeight: row.isMe ? FontWeight.w700 : null,
                          ),
                        ),
                      ),
                      _Fine('${row.xp} XP'),
                    ],
                  ),
                ),
            const SizedBox(height: 12),
            Semantics(
              button: true,
              label: optOut ? 'Join the boards' : 'Hide me from the boards',
              child: GestureDetector(
                onTap: onToggleOptOut,
                child: Text(
                  optOut ? 'Join the boards' : 'Hide me from the boards',
                  style: TypeScale.caption.copyWith(
                    fontWeight: FontWeight.w500,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Strength tab ────────────────────────────────────────────────────────────

class _StrengthTab extends ConsumerWidget {
  const _StrengthTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final insights = ref.watch(insightsProvider);
    return insights.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, __) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Notice(
            tone: _NoticeTone.bad,
            text: e is ApiError
                ? e.message
                : 'We could not load your insights.',
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => ref.invalidate(insightsProvider),
              child: const Text('Try again'),
            ),
          ),
        ],
      ),
      data: (data) => InsightsBody(data: data, self: true),
    );
  }
}

// ── achievements + transcript ───────────────────────────────────────────────

class _AchievementsCard extends StatelessWidget {
  const _AchievementsCard({required this.achievements, required this.unlocked});

  final List<Achievement> achievements;
  final int unlocked;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Achievements', style: TypeScale.tagline),
              _Fine('$unlocked/${achievements.length}'),
            ],
          ),
          const SizedBox(height: 4),
          _Caption('Permanent. A rank can slip; these cannot.'),
          const SizedBox(height: 16),
          for (final a in achievements)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(RadiusTokens.md),
                border: Border.all(
                  color: a.unlocked
                      ? context.gold.withOpacity(0.6)
                      : context.border,
                ),
                color: a.unlocked ? context.gold.withOpacity(0.1) : null,
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: a.unlocked
                          ? context.gold.withOpacity(0.25)
                          : context.secondary,
                    ),
                    child: Center(
                      child: RevisioIcon(
                        achievementIconName(a.id, a.icon),
                        size: 17,
                        color: a.unlocked
                            ? context.foreground
                            : context.mutedForeground,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          a.name,
                          style: TypeScale.captionS.copyWith(
                            color: a.unlocked
                                ? context.foreground
                                : context.mutedForeground,
                          ),
                        ),
                        _Fine(a.description ?? ''),
                      ],
                    ),
                  ),
                  if (a.unlocked) const RevisioIcon('checked', size: 16),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _TranscriptCard extends StatelessWidget {
  const _TranscriptCard({required this.onExport});

  final Future<void> Function(String format) onExport;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Transcript', style: TypeScale.tagline),
          const SizedBox(height: 4),
          _Caption('Your full history. Share it with a teacher, or keep it.'),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: () => onExport('csv'),
                icon: const RevisioIcon('download', size: 15),
                label: const Text('CSV'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, kTouchTarget),
                ),
              ),
              TextButton.icon(
                onPressed: () => onExport('json'),
                icon: const RevisioIcon('download', size: 15),
                label: const Text('JSON'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Rank could not be loaded.',
            style: TypeScale.body.copyWith(color: context.mutedForeground),
          ),
          const SizedBox(height: 16),
          TextButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}
