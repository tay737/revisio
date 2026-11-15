/// The mobile app bar — port of `src/components/nav/TopBar.tsx` (phone half).
///
/// One word of navigation state and three numbers: [crest] opens the account
/// sheet, the centre carries the screen's one-word title, and the right side
/// shows the streak and due-count chips. A 2px ink hairline restarts on every
/// navigation — continuity without a curtain over the page.
library revisio.features.nav.top_bar;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/ranked.dart';
import '../app/app_data.dart';
import 'nav_model.dart';
import 'rank_crest.dart';

class TopBar extends ConsumerWidget implements PreferredSizeWidget {
  const TopBar({super.key, required this.onOpenAccount});

  final VoidCallback onOpenAccount;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final path = GoRouterState.of(context).matchedLocation;
    final title = labelForPath(path);
    final me = ref.watch(meProvider).valueOrNull;
    final rank = me != null ? rankFor(me.gamification.totalXp) : null;
    final streak = me?.gamification.streak ?? 0;
    final due = me?.today.due ?? 0;

    return Container(
      height: 56,
      decoration: BoxDecoration(
        // glass-bar: background at 95%, content scrolls visibly underneath.
        color: context.background.withOpacity(0.95),
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                // The crest is the account button — 44px circular, rank inside.
                Semantics(
                  button: true,
                  label: 'Your account and menu',
                  child: InkWell(
                    onTap: onOpenAccount,
                    customBorder: const CircleBorder(),
                    child: Container(
                      width: kTouchTarget,
                      height: kTouchTarget,
                      decoration: BoxDecoration(
                        color: context.card,
                        shape: BoxShape.circle,
                        border: Border.all(color: context.border),
                      ),
                      alignment: Alignment.center,
                      child: rank != null
                          ? RankCrest(
                              rank: rank,
                              size: 22,
                              showProgress: false,
                              semanticLabel: null,
                            )
                          : const SizedBox(width: 22, height: 22),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    title,
                    style: TypeScale.strong,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                _Chip(
                  icon: 'streak',
                  value: '$streak',
                  activeColor: streak > 0 ? context.streakPressed : null,
                  label: '$streak-day streak',
                ),
                const SizedBox(width: 6),
                _DueChip(due: due),
              ],
            ),
          ),
          // The restarting hairline — keyed by path so it replays per nav.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _NavHairline(key: ValueKey(path)),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.icon,
    required this.value,
    required this.label,
    this.activeColor,
  });

  final String icon;
  final String value;
  final String label;
  final Color? activeColor;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      child: Container(
        height: kTouchTarget,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: context.card,
          borderRadius: BorderRadius.circular(RadiusTokens.pill),
          border: Border.all(color: context.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            RevisioIcon(
              icon,
              size: 14,
              color: activeColor ?? context.mutedForeground,
            ),
            const SizedBox(width: 4),
            Text(
              value,
              style: TypeScale.fine.copyWith(
                fontWeight: FontWeight.w600,
                color: context.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DueChip extends StatelessWidget {
  const _DueChip({required this.due});

  final int due;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$due cards due today',
      child: InkWell(
        onTap: () => context.go('/review'),
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
        child: Container(
          height: kTouchTarget,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: context.card,
            borderRadius: BorderRadius.circular(RadiusTokens.pill),
            border: Border.all(color: context.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              RevisioIcon(
                'review',
                size: 14,
                color: due > 0 ? context.goodStrong : context.mutedForeground,
              ),
              const SizedBox(width: 4),
              Text(
                '$due',
                style: TypeScale.fine.copyWith(
                  fontWeight: FontWeight.w600,
                  color: context.foreground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 2px ink hairline that restarts (scaleX 0→1, then fades) per navigation.
class _NavHairline extends StatelessWidget {
  const _NavHairline({super.key});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: context.reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 600),
      curve: EaseTokens.snap,
      builder: (context, t, _) {
        // scaleX runs the full duration; opacity fades across the last third.
        final opacity = t < 0.66
            ? 1.0
            : (1 - (t - 0.66) / 0.34).clamp(0.0, 1.0);
        return Align(
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: t,
            child: Opacity(
              opacity: opacity,
              child: Container(height: 2, color: context.foreground),
            ),
          ),
        );
      },
    );
  }
}
