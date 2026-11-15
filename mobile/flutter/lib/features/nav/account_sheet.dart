/// The account sheet — port of `src/components/nav/AccountSheet.tsx`.
///
/// Everything the bar cannot hold, plus who you are: identity row, the
/// companion's line, one row per overflow destination (icon, label, four-word
/// hint, chevron), and a footer with the theme toggle and Sign out.
library revisio.features.nav.account_sheet;

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
import '../app/app_data.dart';
import '../app/theme_mode.dart';
import '../auth/auth_provider.dart';
import 'nav_model.dart';
import 'rank_crest.dart';

/// Opens the sheet. Called by the TopBar crest and the BottomNav More slot.
/// [activePath] is the caller's route — the sheet itself lives in the
/// Navigator overlay where `GoRouterState.of` has no ancestor.
Future<void> showAccountSheet(BuildContext context, {String? activePath}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => AccountSheet(activePath: activePath),
  );
}

class AccountSheet extends ConsumerWidget {
  const AccountSheet({super.key, this.activePath});

  /// The route the sheet was opened from, for row highlighting.
  final String? activePath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).valueOrNull;
    final path = activePath ?? '';
    final items = overflowItems(navForRole(me?.role));
    final rank = me != null ? rankFor(me.gamification.totalXp) : null;
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(RadiusTokens.xl),
        ),
        border: Border(top: BorderSide(color: context.border)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              // Drag handle.
              Container(
                width: 44,
                height: 6,
                decoration: BoxDecoration(
                  color: context.border,
                  borderRadius: BorderRadius.circular(RadiusTokens.pill),
                ),
              ),
              const SizedBox(height: 14),
              // Identity — a menu that knows who you are.
              if (me != null && rank != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Row(
                    children: [
                      RankCrest(rank: rank, size: 52),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              (me.nickname?.trim().isNotEmpty ?? false)
                                  ? me.nickname!.trim()
                                  : me.name,
                              style: TypeScale.strong,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${rank.label} · ${rank.points} RP · ${me.gamification.streak}d',
                              style: TypeScale.fine.copyWith(
                                color: context.mutedForeground,
                              ),
                            ),
                          ],
                        ),
                      ),
                      RevisioAvatar(
                        name: me.name,
                        emoji: me.avatarEmoji,
                        color: me.avatarColor,
                        imageUrl: me.avatarUrl,
                        size: 40,
                      ),
                    ],
                  ),
                ),
              if (me != null) _CompanionLine(me: me),
              // Destination rows.
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Column(
                  children: [
                    for (final item in items)
                      _DestRow(
                        item: item,
                        active: isActivePath(path, item.path),
                        onTap: () {
                          Navigator.of(context).pop();
                          context.push(item.path);
                        },
                      ),
                  ],
                ),
              ),
              // Footer — theme toggle + sign out.
              Container(
                margin: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                padding: const EdgeInsets.only(top: 14),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: context.border)),
                ),
                child: Row(
                  children: [
                    _ThemeToggle(dark: dark),
                    const SizedBox(width: 10),
                    Expanded(
                      child: RevisioSecondaryButton(
                        onPressed: () async {
                          Navigator.of(context).pop();
                          await ref.read(authProvider.notifier).signOut();
                          if (context.mounted) context.go('/login');
                        },
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            RevisioIcon('signOut', size: 17),
                            SizedBox(width: 8),
                            Text('Sign out'),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompanionLine extends StatelessWidget {
  const _CompanionLine({required this.me});

  final MeDetail me;

  @override
  Widget build(BuildContext context) {
    final g = me.gamification;
    final companion = copy.companionFor((
      name: me.name,
      role: me.role,
      due: me.today.due,
      reviewed: me.today.reviewed,
      correct: me.today.correct,
      streak: g.streak,
      bestStreak: g.bestStreak,
      level: g.level,
      subjects: me.subjects.map((s) => s.name).toList(),
      totalXp: g.totalXp,
      rankLabel: null,
    ));
    if (companion.line.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Text(
        companion.line,
        style: TypeScale.caption.copyWith(
          color: context.mutedForeground,
          height: 1.5,
        ),
      ),
    );
  }
}

class _DestRow extends StatelessWidget {
  const _DestRow({
    required this.item,
    required this.active,
    required this.onTap,
  });

  final NavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      label: '${item.label}. ${item.hint}',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        child: Container(
          constraints: const BoxConstraints(minHeight: 52),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: active ? context.secondary : Colors.transparent,
            borderRadius: BorderRadius.circular(RadiusTokens.md),
          ),
          child: Row(
            children: [
              RevisioIcon(
                item.icon,
                size: 20,
                color: active ? context.foreground : context.mutedForeground,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.label,
                      style: TypeScale.strong.copyWith(
                        fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                      ),
                    ),
                    Text(
                      item.hint,
                      style: TypeScale.fine.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              RevisioIcon('expand', size: 16, color: context.mutedForeground),
            ],
          ),
        ),
      ),
    );
  }
}

class _ThemeToggle extends ConsumerWidget {
  const _ThemeToggle({required this.dark});

  final bool dark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      button: true,
      label: dark ? 'Switch to light appearance' : 'Switch to dark appearance',
      child: InkWell(
        onTap: () => ref.read(themeModeProvider.notifier).toggle(),
        customBorder: const CircleBorder(),
        child: Container(
          width: kTouchTarget,
          height: kTouchTarget,
          decoration: BoxDecoration(
            color: context.card.withOpacity(0.6),
            shape: BoxShape.circle,
            border: Border.all(color: context.border),
          ),
          alignment: Alignment.center,
          child: RevisioIcon(
            dark ? 'sun' : 'moon',
            size: 18,
            color: context.mutedForeground,
          ),
        ),
      ),
    );
  }
}
