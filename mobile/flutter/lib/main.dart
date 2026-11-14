import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_router.dart';
import 'design/design.dart';
import 'features/app/version_gate.dart';

void main() {
  runApp(const ProviderScope(child: RevisioApp()));
}

class RevisioApp extends ConsumerStatefulWidget {
  const RevisioApp({super.key});

  @override
  ConsumerState<RevisioApp> createState() => _RevisioAppState();
}

class _RevisioAppState extends ConsumerState<RevisioApp> {
  bool _gateChecked = false;

  @override
  Widget build(BuildContext context) {
    if (!_gateChecked) {
      _gateChecked = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = rootNavigatorKey.currentContext;
        if (ctx != null) maybeShowVersionGate(ctx, ref);
      });
    }
    return MaterialApp.router(
      title: 'Revisio',
      theme: lightTheme(),
      darkTheme: darkTheme(),
      themeMode: ThemeMode.system,
      routerConfig: ref.watch(routerProvider),
      debugShowCheckedModeBanner: false,
    );
  }
}
