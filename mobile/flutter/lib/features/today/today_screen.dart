/// Today — the dashboard, a screen-for-screen port of
/// `src/app/(app)/dashboard/page.tsx`: dark hero tile, 2×2 stats, the
/// strength ladder, the dark rank band, four action cards and the subjects
/// card — in that order, with the web's copy.
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
import '../../engine/ranked.dart';
import '../../engine/srs.dart';
import '../app/app_data.dart';
import '../nav/rank_crest.dart';
import '../rank/rank_strip.dart';
import 'retention_cards.dart';

class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keep the offline pack fresh and drain any owed reviews on arrival.
    ref.watch(offlinePackSyncProvider);
    ref.listen(offlineSyncProvider, (_, __) {});

    final me = ref.watch(meProvider);
    final gamification = ref.watch(gamificationProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(meProvider);
            ref.invalidate(gamificationProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              me.when(
                loading: () => const _Skeleton(),
                error: (e, _) => _ErrorState(
                  message: 'We couldn’t load your dashboard.',
                  detail: 'Check your connection and try again.',
                  onRetry: () => ref.invalidate(meProvider),
                ),
                data: (m) => _TodayBody(me: m, gamification: gamification),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TodayBody extends StatelessWidget {
  const _TodayBody({required this.me, required this.gamification});

  final MeDetail me;
  final AsyncValue<GamificationPayload> gamification;

  @override
  Widget build(BuildContext context) {
    final g = me.gamification;
    final today = me.today;
    final started = (
      due: today.due,
      streak: g.streak,
      level: g.level,
      subjects: me.subjects.map((s) => s.name).toList(),
    );
    final accuracy = today.reviewed > 0
        ? ((today.correct / today.reviewed) * 100).round()
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── 1. The hero: greeting, one line, one green button ──────────
        _HeroTile(me: me, headline: copy.openers(started)[0]),
        const SizedBox(height: 16),

        // ── 2. Four numbers ────────────────────────────────────────────
        _StatGrid(me: me),
        const SizedBox(height: 16),

        // ── 2½. Strength ───────────────────────────────────────────────
        _StrengthCard(srs: me.srs),
        const SizedBox(height: 16),

        // ── 2¾. Student cards: challenges + goals (#13). Staff accounts
        // have no review queue to pace; each card also self-gates and
        // fails quiet like the web. ──────────────────────────────────
        if (me.role == 'student') ...[
          const ChallengesCard(),
          const SizedBox(height: 16),
          const GoalsCard(),
          const SizedBox(height: 16),
        ],

        // ── 3. Rank band ───────────────────────────────────────────────
        gamification.when(
          data: (payload) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: RankStrip(ranked: payload.ranked),
          ),
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),

        // ── 4. Four ways in ────────────────────────────────────────────
        const _ActionGrid(),
        const SizedBox(height: 16),

        // ── Subjects ───────────────────────────────────────────────────
        _SubjectsCard(me: me, accuracy: accuracy),
      ],
    );
  }
}

// ── 1. Hero ─────────────────────────────────────────────────────────────────

class _HeroTile extends StatelessWidget {
  const _HeroTile({required this.me, required this.headline});

  final MeDetail me;
  final String headline;

  @override
  Widget build(BuildContext context) {
    final due = me.today.due;
    final g = me.gamification;
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
      rankLabel: rankFor(g.totalXp).label,
    ));

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.band,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            copy.greetingFor(me.name),
            style: TypeScale.micro.copyWith(
              color: context.bandMuted,
              letterSpacing: 0.08,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            headline,
            style: TypeScale.display.copyWith(color: context.bandForeground),
          ),
          const SizedBox(height: 20),
          if (due > 0)
            RevisioGoodButton(
              onPressed: () => context.go('/review'),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const RevisioIcon('review', size: 18, color: Colors.white),
                  const SizedBox(width: 10),
                  const Text('Start review'),
                  const SizedBox(width: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(RadiusTokens.pill),
                    ),
                    child: Text(
                      '$due',
                      style: TypeScale.caption.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            RevisioGoodButton(
              onPressed: () => context.go('/learn'),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  RevisioIcon('learn', size: 18, color: Colors.white),
                  SizedBox(width: 10),
                  Text('Get ahead'),
                ],
              ),
            ),
          const SizedBox(height: 10),
          RevisioSecondaryButton(
            onPressed: () => context.push('/cram'),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                RevisioIcon('cram', size: 18),
                SizedBox(width: 10),
                Text('Cram instead'),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.only(top: 16),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: context.bandBorder)),
            ),
            child: _Companion(
              me: me,
              line: companion.line,
              actionLabel: companion.actionLabel,
              actionPath: companion.actionPath,
            ),
          ),
        ],
      ),
    );
  }
}

/// The companion inside the hero — crest avatar, its line, and the one
/// underlined action `companionFor` chose.
class _Companion extends StatelessWidget {
  const _Companion({
    required this.me,
    required this.line,
    required this.actionLabel,
    required this.actionPath,
  });

  final MeDetail me;
  final String line;
  final String actionLabel;
  final String actionPath;

  @override
  Widget build(BuildContext context) {
    final rank = rankFor(me.gamification.totalXp);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: context.bandSecondary,
            shape: BoxShape.circle,
            border: Border.all(color: context.bandBorder),
          ),
          alignment: Alignment.center,
          child: RankCrest(rank: rank, size: 28, showProgress: false),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                line,
                style: TypeScale.caption.copyWith(
                  color: context.bandMuted,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 8),
              InkWell(
                onTap: () => _go(context, actionPath),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        actionLabel,
                        style: TypeScale.caption.copyWith(
                          color: context.bandForeground,
                          fontWeight: FontWeight.w600,
                          decoration: TextDecoration.underline,
                          decorationColor: context.bandForeground,
                        ),
                      ),
                      const SizedBox(width: 6),
                      RevisioIcon('next', size: 14, color: context.bandMuted),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _go(BuildContext context, String path) {
    // Branch paths switch tabs; pushed routes (cram/exam/library) push.
    const branches = {'/today', '/review', '/learn', '/rank'};
    if (branches.contains(path)) {
      context.go(path);
    } else {
      context.push(path);
    }
  }
}

// ── 2. Four numbers ─────────────────────────────────────────────────────────

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.me});

  final MeDetail me;

  @override
  Widget build(BuildContext context) {
    final g = me.gamification;
    final today = me.today;
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _Stat(
                icon: 'review',
                label: 'Due',
                value: today.due,
                tone: today.due > 0 ? _StatTone.good : null,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Stat(
                icon: 'reviewed',
                label: 'Done today',
                value: today.reviewed,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _Stat(
                icon: 'streak',
                label: 'Streak',
                value: g.streak,
                suffix: g.streak == 1 ? ' day' : ' days',
                tone: g.streak > 0 ? _StatTone.streak : null,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Stat(icon: 'xp', label: 'Total XP', value: g.totalXp),
            ),
          ],
        ),
      ],
    );
  }
}

enum _StatTone { good, streak }

class _Stat extends StatelessWidget {
  const _Stat({
    required this.icon,
    required this.label,
    required this.value,
    this.suffix,
    this.tone,
  });

  final String icon;
  final String label;
  final int value;
  final String? suffix;
  final _StatTone? tone;

  @override
  Widget build(BuildContext context) {
    final tint = switch (tone) {
      _StatTone.good => context.goodStrong,
      _StatTone.streak => context.streak,
      null => context.mutedForeground,
    };
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
          Row(
            children: [
              RevisioIcon(icon, size: 15, color: tint),
              const SizedBox(width: 6),
              Text(label, style: TypeScale.fine.copyWith(color: tint)),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '$value',
                style: TypeScale.numSm.copyWith(color: context.foreground),
              ),
              if (suffix != null)
                Text(
                  suffix!,
                  style: TypeScale.fine.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── 2½. Strength ────────────────────────────────────────────────────────────

class _StrengthCard extends StatelessWidget {
  const _StrengthCard({required this.srs});

  final SrsSummary srs;

  @override
  Widget build(BuildContext context) {
    final levels = srs.levels;
    final max = levels.fold<int>(1, (a, b) => b > a ? b : a);
    final tiers = SrsTier.values;

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
          Row(
            children: [
              Expanded(child: Text('Your strength', style: TypeScale.strong)),
              Text(
                srs.totalCards == 0
                    ? 'no cards yet'
                    : 'avg level ${srs.avgLevel ?? '–'} of 12',
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (srs.totalCards == 0)
            Text(
              'Answer a few questions and your cards will line up here by strength.',
              style: TypeScale.caption.copyWith(color: context.mutedForeground),
            )
          else ...[
            const SizedBox(height: 16),
            SizedBox(
              height: 64,
              child: Semantics(
                label: _strengthSemantics(levels),
                child: ExcludeSemantics(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final tier in tiers)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 3),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                for (final rung in srsLadder.where(
                                  (r) => r.tier == tier,
                                ))
                                  Expanded(
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 2,
                                      ),
                                      child: _StrengthBar(
                                        count: rung.level <= levels.length
                                            ? levels[rung.level - 1]
                                            : 0,
                                        max: max,
                                        tier: tier,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                for (final tier in tiers)
                  Expanded(
                    child: Center(
                      child: Text(
                        srsTierNames[tier]!,
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.only(top: 12),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: context.border)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'What you keep missing, and every answer as it was graded.',
                    style: TypeScale.caption.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => context.push('/rank'),
                  style: TextButton.styleFrom(
                    foregroundColor: context.foreground,
                    minimumSize: const Size(0, kTouchTarget),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Insights'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _strengthSemantics(List<int> levels) {
    final parts = <String>[
      for (final rung in srsLadder)
        'Level ${rung.level}, ${rung.label}: '
            '${rung.level <= levels.length ? levels[rung.level - 1] : 0} cards',
    ];
    return parts.join('. ');
  }
}

class _StrengthBar extends StatelessWidget {
  const _StrengthBar({
    required this.count,
    required this.max,
    required this.tier,
  });

  final int count;
  final int max;
  final SrsTier tier;

  static const _fillOpacity = {
    SrsTier.beginner: 0.25,
    SrsTier.adept: 0.45,
    SrsTier.seasoned: 0.70,
    SrsTier.mastered: 1.0,
  };

  @override
  Widget build(BuildContext context) {
    final fraction = count == 0
        ? 0.04
        : ((count / max) * 100).clamp(4, 100) / 100;
    return Align(
      alignment: Alignment.bottomCenter,
      child: FractionallySizedBox(
        heightFactor: fraction,
        widthFactor: 1,
        child: Container(
          decoration: BoxDecoration(
            color: count == 0
                ? context.secondary
                : context.primary.withOpacity(_fillOpacity[tier]!),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
          ),
        ),
      ),
    );
  }
}

// ── 4. Four ways in ─────────────────────────────────────────────────────────

class _ActionGrid extends StatelessWidget {
  const _ActionGrid();

  static const _actions = [
    (path: '/cram', icon: 'cram', title: 'Cram', hint: 'Before an exam'),
    (path: '/learn', icon: 'learn', title: 'Notes', hint: 'The full topic'),
    (path: '/exam', icon: 'exam', title: 'Exam', hint: 'A marked paper'),
    (path: '/rank', icon: 'rank', title: 'Rank', hint: 'Ladder and lobby'),
  ];

  @override
  Widget build(BuildContext context) {
    Widget row(int i, int j) {
      final a = _actions[i * 2 + j];
      return Expanded(
        child: _ActionCard(
          path: a.path,
          icon: a.icon,
          title: a.title,
          hint: a.hint,
        ),
      );
    }

    return Column(
      children: [
        Row(children: [row(0, 0), const SizedBox(width: 12), row(0, 1)]),
        const SizedBox(height: 12),
        Row(children: [row(1, 0), const SizedBox(width: 12), row(1, 1)]),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.path,
    required this.icon,
    required this.title,
    required this.hint,
  });

  final String path;
  final String icon;
  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$title. $hint',
      child: InkWell(
        onTap: () {
          const branches = {'/today', '/review', '/learn', '/rank'};
          if (branches.contains(path)) {
            context.go(path);
          } else {
            context.push(path);
          }
        },
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        child: Container(
          constraints: const BoxConstraints(minHeight: 96),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.card,
            borderRadius: BorderRadius.circular(RadiusTokens.lg),
            border: Border.all(color: context.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: context.secondary,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: RevisioIcon(icon, size: 18, color: context.foreground),
              ),
              const SizedBox(height: 10),
              Text(title, style: TypeScale.strong),
              Text(
                hint,
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Subjects ────────────────────────────────────────────────────────────────

class _SubjectsCard extends StatelessWidget {
  const _SubjectsCard({required this.me, required this.accuracy});

  final MeDetail me;
  final int? accuracy;

  @override
  Widget build(BuildContext context) {
    final g = me.gamification;
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
          Row(
            children: [
              Expanded(child: Text('Your subjects', style: TypeScale.strong)),
              InkWell(
                onTap: () => context.push('/library'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 8,
                  ),
                  child: Text(
                    'Manage',
                    style: TypeScale.caption.copyWith(
                      color: context.foreground,
                      fontWeight: FontWeight.w500,
                      decoration: TextDecoration.underline,
                      decorationColor: context.foreground,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (me.subjects.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in me.subjects) _SubjectBadge(name: s.name),
              ],
            )
          else
            Text.rich(
              TextSpan(
                text: 'Follow a subject and your queue fills itself. ',
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
                children: [
                  WidgetSpan(
                    alignment: PlaceholderAlignment.baseline,
                    baseline: TextBaseline.alphabetic,
                    child: InkWell(
                      onTap: () => context.go('/learn'),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          'Find one',
                          style: TypeScale.caption.copyWith(
                            color: context.foreground,
                            decoration: TextDecoration.underline,
                            decorationColor: context.foreground,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.only(top: 12),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: context.border)),
            ),
            child: Row(
              children: [
                _SubjectStat(
                  label: 'Best streak',
                  value:
                      '${g.bestStreak}${g.bestStreak == 1 ? ' day' : ' days'}',
                ),
                const SizedBox(width: 24),
                _SubjectStat(
                  label: 'Accuracy today',
                  value: accuracy == null ? '–' : '$accuracy%',
                ),
                // Same conditional third stat the web dashboard prints —
                // freezes only appear once one is banked.
                if (g.streakFreezes > 0) ...[
                  const SizedBox(width: 24),
                  _SubjectStat(
                    label: 'Streak freezes',
                    value: '${g.streakFreezes}',
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SubjectBadge extends StatelessWidget {
  const _SubjectBadge({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Text(
        name,
        style: TypeScale.caption.copyWith(
          color: context.foreground,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _SubjectStat extends StatelessWidget {
  const _SubjectStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 2),
        Text(value, style: TypeScale.strong),
      ],
    );
  }
}

// ── States ──────────────────────────────────────────────────────────────────

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 120,
      decoration: BoxDecoration(
        color: context.muted,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({
    required this.message,
    required this.detail,
    required this.onRetry,
  });

  final String message;
  final String detail;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      child: Column(
        children: [
          RevisioIcon('due', size: 20, color: context.destructiveInk),
          const SizedBox(height: 8),
          Text(message, style: TypeScale.strong, textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(
            detail,
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          RevisioButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}
