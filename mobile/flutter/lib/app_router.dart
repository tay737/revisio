/// App navigation with go_router.
///
/// Public routes: /, /login, /register, /forgot-password, /privacy, /terms.
/// Signed-in routes live in a five-branch shell: /today /review /learn /rank
/// /settings. The redirect sends guests to /login and members into the app.
library revisio.app_router;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show GlobalKey, NavigatorState;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/app/app_shell.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/forgot_password_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_wizard.dart';
import 'features/landing/landing_page.dart';
import 'features/learn/learn_screen.dart';
import 'features/legal/legal_screen.dart';
import 'features/rank/rank_screen.dart';
import 'features/cram/cram_screen.dart';
import 'features/review/review_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/today/today_screen.dart';

const _publicPaths = {
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/privacy',
  '/terms',
};

/// Root navigator key — the version gate shows its dialog above the router.
final rootNavigatorKey = GlobalKey<NavigatorState>();

const _shellPaths = {'/today', '/review', '/learn', '/rank', '/settings'};

/// The router is built ONCE. Auth changes notify `refreshListenable`, which
/// re-runs `redirect` — rebuilding the router on every AuthLoading/AuthError
/// would restart navigation at '/' and destroy in-progress screens.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.onDispose(refresh.dispose);
  ref.listen(authProvider, (_, __) => refresh.value++);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final loc = state.matchedLocation;
      // While the stored session is being read — or a submit is in flight —
      // hold the current screen: bouncing to '/' mid-submit would destroy the
      // wizard/login state. Only unknown deep links are sent home.
      if (auth is AuthInitial || auth is AuthLoading) {
        return _publicPaths.contains(loc) || _shellPaths.contains(loc) ? null : '/';
      }
      final authed = auth is AuthAuthenticated;
      if (!authed && !_publicPaths.contains(loc)) return '/login';
      if (authed && (loc == '/' || loc == '/login' || loc == '/register')) {
        return '/today';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const LandingPage()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterWizard()),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/privacy',
        builder: (context, state) => const LegalScreen(
          title: 'Privacy Policy',
          path: '/privacy',
          summary:
              'What Revisio collects, why, who processes it and how long it is kept. The full policy is published on the web and is the version that applies.',
        ),
      ),
      GoRoute(
        path: '/terms',
        builder: (context, state) => const LegalScreen(
          title: 'Terms of Service',
          path: '/terms',
          summary:
              'The terms that govern your use of Revisio. The full terms are published on the web and are the version that applies.',
        ),
      ),
      GoRoute(
        path: '/cram',
        builder: (context, state) => CramScreen(
          preselectedTopicId: state.uri.queryParameters['topic'],
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/today', builder: (context, state) => const TodayScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/review', builder: (context, state) => const ReviewScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/learn', builder: (context, state) => const LearnScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/rank', builder: (context, state) => const RankScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/settings', builder: (context, state) => const SettingsScreen()),
            ],
          ),
        ],
      ),
    ],
  );
});
