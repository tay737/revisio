/// `revisio://` deep links — the same destination map and role gate the native
/// clients implement (`DeepLinks.kt`, `RevisioApp.swift`).
///
/// The host is the web's own path word: `revisio://teacher` is `/teacher`,
/// `revisio://you` is `/settings`. A link that arrives signed-out is held until
/// the session answers who is asking; a learner who follows a staff link is
/// told the area is for staff rather than shown a console that cannot load.
library revisio.features.app.deep_links;

import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app_router.dart';
import '../auth/auth_provider.dart';
import '../staff/staff_controller.dart';
import 'app_data.dart';

/// Owns the link stream and the one held link. Newest wins, like the native
/// `DeepLinkBus`/`pendingDeepLink` pair.
class DeepLinkHandler {
  DeepLinkHandler(this._ref);

  final WidgetRef _ref;
  StreamSubscription<Uri>? _sub;
  String? _pending;

  void start() {
    final links = AppLinks();
    _sub = links.uriLinkStream.listen(_onLink, onError: (_) {});
    unawaited(
      links.getInitialLink().then((uri) {
        if (uri != null) _onLink(uri);
      }),
    );
  }

  void dispose() => _sub?.cancel();

  /// Called on every auth transition — the held link opens once a session
  /// exists to gate it by, and is dropped if the session ends instead.
  void onAuthChanged(AuthState state) {
    if (state is! AuthAuthenticated) {
      if (state is AuthUnauthenticated) _pending = null;
      return;
    }
    final path = _pending;
    if (path == null) return;
    _pending = null;
    _open(path);
  }

  void _onLink(Uri uri) {
    final path = deepLinkPath(uri);
    if (path == null) return;
    if (_ref.read(authProvider) is AuthAuthenticated) {
      _open(path);
    } else {
      _pending = path;
    }
  }

  void _open(String path) {
    final role =
        _ref.read(meProvider).valueOrNull?.role ??
        (_ref.read(authProvider) as AuthAuthenticated).session.user['role']
            as String?;
    final allowed = switch (path) {
      '/teacher' => staffCanTeach(role),
      '/admin' => staffCanAdmin(role),
      _ => true,
    };
    if (!allowed) {
      final ctx = rootNavigatorKey.currentContext;
      if (ctx != null) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('That area is for staff accounts.')),
        );
      }
      return;
    }
    _ref.read(routerProvider).go(path);
  }
}
