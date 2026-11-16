import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_router.dart';
import 'design/design.dart';
import 'features/app/deep_links.dart';
import 'features/auth/auth_provider.dart';
import 'features/app/theme_mode.dart';
import 'features/app/version_gate.dart';
import 'features/notifications/local_reminders.dart';

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
  late final DeepLinkHandler _links;

  @override
  void initState() {
    super.initState();
    _links = DeepLinkHandler(ref);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _links.start();
      LocalReminders.instance.onPayload = (path) {
        ref.read(routerProvider).push(path);
      };
      unawaited(LocalReminders.instance.warmUp());
    });
  }

  @override
  void dispose() {
    _links.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authProvider, (_, next) => _links.onAuthChanged(next));
    // Re-arms (or clears) the daily local reminder whenever the signed-in
    // data changes — app open, sync, finished session, prefs save, sign-out.
    ref.watch(reminderSyncProvider);
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
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(routerProvider),
      debugShowCheckedModeBanner: false,
    );
  }
}
