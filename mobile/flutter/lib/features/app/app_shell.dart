/// Signed-in chrome — the five-tab shell (Today / Review / Learn / Rank /
/// Settings) shared by every authenticated route.
library revisio.features.app.shell;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../design/revisio_icons.dart';


class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _go(int index) => navigationShell.goBranch(
        index,
        initialLocation: index == navigationShell.currentIndex,
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: _go,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(icon: RevisioIcon('dashboard'), label: 'Today'),
          NavigationDestination(icon: RevisioIcon('review'), label: 'Review'),
          NavigationDestination(icon: RevisioIcon('learn'), label: 'Learn'),
          NavigationDestination(icon: RevisioIcon('rank'), label: 'Rank'),
          NavigationDestination(icon: RevisioIcon('person'), label: 'Settings'),
        ],
      ),
    );
  }
}
