/// Light/dark choice — the Flutter counterpart of `src/lib/theme.ts`.
///
/// The web stores an explicit 'light'|'dark' in localStorage and falls back to
/// the OS scheme when unset. Same here: `null`-equivalent is [ThemeMode.system],
/// and the toggle always lands on an explicit scheme, persisted in secure
/// storage so it survives restarts.
library revisio.features.app.theme_mode;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController() : super(ThemeMode.system) {
    _restore();
  }

  static const _key = 'revisio_theme';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<void> _restore() async {
    try {
      final saved = await _storage.read(key: _key);
      if (!mounted) return;
      state = switch (saved) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
    } catch (_) {}
  }

  /// Flip the resolved scheme — the web toggle never cycles through system.
  Future<void> toggle() async {
    final brightness =
        WidgetsBinding.instance.platformDispatcher.platformBrightness ==
            Brightness.dark
        ? Brightness.dark
        : Brightness.light;
    final effective = state == ThemeMode.system
        ? (brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light)
        : state;
    final next = effective == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    state = next;
    try {
      await _storage.write(
        key: _key,
        value: next == ThemeMode.light ? 'light' : 'dark',
      );
    } catch (_) {}
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) {
    return ThemeModeController();
  },
);
