/// The mobile bottom bar — port of `src/components/nav/BottomNav.tsx`.
///
/// Full-bleed glass strip, five equal 64px slots (four primary tabs + More),
/// a 3px ink bar that *travels* between slots, and the due count as a green
/// badge on Review — the bar answers what to do as well as where to go.
library revisio.features.nav.bottom_nav;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../app/app_data.dart';
import 'nav_model.dart';

class BottomNav extends ConsumerWidget {
  const BottomNav({super.key, required this.role, required this.onMore});

  final String? role;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final path = GoRouterState.of(context).matchedLocation;
    final items = navForRole(role);
    final tabs = primaryTabs(items);
    final due = ref.watch(meProvider).valueOrNull?.today.due ?? 0;
    final moreActive =
        overflowActive(path, items) ||
        !tabs.any((t) => isActivePath(path, t.path));

    // Active slot index: a primary tab, or 4 (More) for overflow routes.
    var activeIndex = -1;
    for (var i = 0; i < tabs.length; i++) {
      if (isActivePath(path, tabs[i].path)) activeIndex = i;
    }
    if (activeIndex < 0 && moreActive) activeIndex = tabs.length;

    return Container(
      decoration: BoxDecoration(
        color: context.background.withOpacity(0.95),
        border: Border(top: BorderSide(color: context.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final slot = constraints.maxWidth / (tabs.length + 1);
              return Stack(
                children: [
                  // The travelling 3px ink bar.
                  if (activeIndex >= 0)
                    AnimatedPositioned(
                      duration: context.reduceMotion
                          ? Duration.zero
                          : const Duration(milliseconds: 350),
                      curve: Curves.easeOutBack,
                      left: activeIndex * slot + (slot - 36) / 2,
                      top: 0,
                      child: Container(
                        width: 36,
                        height: 3,
                        decoration: BoxDecoration(
                          color: context.foreground,
                          borderRadius: const BorderRadius.vertical(
                            bottom: Radius.circular(3),
                          ),
                        ),
                      ),
                    ),
                  Row(
                    children: [
                      for (var i = 0; i < tabs.length; i++)
                        Expanded(
                          child: _Slot(
                            item: tabs[i],
                            active: i == activeIndex,
                            badge: tabs[i].path == '/review' && due > 0
                                ? due
                                : 0,
                            onTap: () => context.go(tabs[i].path),
                          ),
                        ),
                      Expanded(
                        child: _MoreSlot(
                          active: activeIndex == tabs.length,
                          onTap: onMore,
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _Slot extends StatelessWidget {
  const _Slot({
    required this.item,
    required this.active,
    required this.badge,
    required this.onTap,
  });

  final NavItem item;
  final bool active;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? context.foreground : context.mutedForeground;
    return Semantics(
      button: true,
      selected: active,
      label: badge > 0 ? '${item.label}, $badge due' : item.label,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                RevisioIcon(
                  item.icon,
                  size: 22,
                  strokeWidth: active ? 2.3 : 1.9,
                  color: color,
                ),
                if (badge > 0)
                  Positioned(
                    right: -12,
                    top: -6,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 17),
                      height: 17,
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: context.good,
                        borderRadius: BorderRadius.circular(RadiusTokens.pill),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        badge > 99 ? '99+' : '$badge',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item.label,
              style: TypeScale.fine.copyWith(
                color: color,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                height: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MoreSlot extends StatelessWidget {
  const _MoreSlot({required this.active, required this.onTap});

  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? context.foreground : context.mutedForeground;
    return Semantics(
      button: true,
      label: 'More destinations',
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            RevisioIcon(
              'more',
              size: 22,
              strokeWidth: active ? 2.3 : 1.9,
              color: color,
            ),
            const SizedBox(height: 4),
            Text(
              'More',
              style: TypeScale.fine.copyWith(
                color: color,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                height: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
