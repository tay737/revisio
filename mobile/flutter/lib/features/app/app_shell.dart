/// Signed-in chrome — the web's mobile frame: glass TopBar on top, content,
/// full-bleed BottomNav below. Wraps the four-tab shell AND every pushed
/// signed-in route, so Settings/Cram/staff/overflow screens all sit inside the
/// same chrome, exactly like the web's `(app)` layout.
library revisio.features.app.shell;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/app_data.dart';
import '../nav/account_sheet.dart';
import '../nav/bottom_nav.dart';
import '../nav/top_bar.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return AppChrome(child: navigationShell);
  }
}

/// The chrome frame. [child] is the screen (or the shell's IndexedStack).
class AppChrome extends ConsumerWidget {
  const AppChrome({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(meProvider).valueOrNull?.role;
    void openSheet() =>
        showAccountSheet(context, activePath: GoRouterState.of(context).matchedLocation);

    // The chrome sits outside every screen's Scaffold, so it has no Material
    // ancestor of its own — InkWell needs one for its ink (and its tap path).
    return Material(
      type: MaterialType.transparency,
      child: Column(
        children: [
          // TopBar sits below the status bar; its own height is 56.
          SafeArea(bottom: false, child: TopBar(onOpenAccount: openSheet)),
          // Screens keep their own SafeArea — strip the insets the chrome now
          // owns so bodies don't double-pad.
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              removeBottom: true,
              child: child,
            ),
          ),
          BottomNav(role: role, onMore: openSheet),
        ],
      ),
    );
  }
}
