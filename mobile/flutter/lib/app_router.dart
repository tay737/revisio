/// App navigation with go_router.
///
/// Public routes: /, /login, /register, /forgot-password, /privacy, /terms.
/// Signed-in routes: a four-branch shell (/today /review /learn /rank) plus
/// pushed routes that share the same AppChrome — /settings /cram /exam
/// /practice /library and the staff consoles. The redirect sends guests to
/// /login and members into the app.
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
import 'features/learn/learn_drilldown.dart';
import 'features/learn/learn_screen.dart';
import 'features/legal/legal_screen.dart';
import 'features/library/library_screen.dart';
import 'features/exam/exam_screen.dart';
import 'features/practice/practice_screen.dart';
import 'features/rank/rank_screen.dart';
import 'features/cram/cram_screen.dart';
import 'features/review/review_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/staff/admin_screen.dart';
import 'features/staff/staff_bits.dart';
import 'features/staff/student_progress_screen.dart';
import 'features/staff/teaching_screen.dart';
import 'features/today/today_screen.dart';

const _publicPaths = {
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/privacy',
  '/terms',
};

/// Every signed-in path — shell branches and pushed routes alike.
const _appPaths = {
  '/today',
  '/review',
  '/learn',
  '/rank',
  '/settings',
  '/cram',
  '/exam',
  '/practice',
  '/library',
  '/review/session',
  '/teacher',
  '/admin',
  '/staff/student',
};

/// The path a `revisio://` link names, or null when it names none. Shared by
/// the app_links handler and the redirect below — the engine also pushes raw
/// VIEW-intent URIs into the router, so both paths must resolve identically.
String? deepLinkPath(Uri uri) {
  if (uri.scheme.toLowerCase() != 'revisio') return null;
  final host = uri.host.isNotEmpty
      ? uri.host
      : (uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '');
  return switch (host.toLowerCase()) {
    'today' => '/today',
    'review' => '/review',
    'learn' => '/learn',
    'rank' => '/rank',
    'cram' => '/cram',
    'exam' => '/exam',
    'practice' => '/practice',
    'library' => '/library',
    'settings' || 'you' => '/settings',
    'teacher' || 'teaching' => '/teacher',
    'admin' => '/admin',
    _ => null,
  };
}

/// Root navigator key — the version gate shows its dialog above the router.
final rootNavigatorKey = GlobalKey<NavigatorState>();

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
      // The Android engine forwards VIEW-intent data into the router as a
      // route update (`uri=revisio://rank/`). Resolve it here so the raw URI
      // can never win over the path app_links already navigated to.
      final linkPath = deepLinkPath(state.uri);
      if (linkPath != null) {
        // Session unresolved: same policy as any unknown path — send home;
        // the pending-link holder in DeepLinkHandler opens it after auth.
        if (auth is AuthInitial || auth is AuthLoading) return '/';
        if (auth is! AuthAuthenticated) return '/login';
        return linkPath;
      }
      final loc = state.matchedLocation;
      // While the stored session is being read — or a submit is in flight —
      // hold the current screen: bouncing to '/' mid-submit would destroy the
      // wizard/login state. Only unknown deep links are sent home.
      if (auth is AuthInitial || auth is AuthLoading) {
        return _publicPaths.contains(loc) || _appPaths.contains(loc)
            ? null
            : '/';
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
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterWizard(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/privacy',
        builder: (context, state) => const LegalScreen(
          title: 'Privacy Policy',
          path: '/privacy',
          summary: 'What Revisio collects, why, who processes it and how long it is kept. The full policy is published on the web and is the version that applies.',
        ),
      ),
      GoRoute(
        path: '/terms',
        builder: (context, state) => const LegalScreen(
          title: 'Terms of Service',
          path: '/terms',
          summary: 'The terms that govern your use of Revisio. The full terms are published on the web and are the version that applies.',
        ),
      ),
      // Pushed signed-in routes — each sits inside the same AppChrome as the
      // shell, the way every web `(app)` page carries TopBar + BottomNav.
      GoRoute(
        path: '/settings',
        builder: (context, state) => const AppChrome(child: SettingsScreen()),
      ),
      GoRoute(
        path: '/cram',
        builder: (context, state) => AppChrome(
          child: CramScreen(
            preselectedTopicId: state.uri.queryParameters['topic'],
          ),
        ),
      ),
      GoRoute(
        path: '/exam',
        builder: (context, state) => const AppChrome(child: ExamScreen()),
      ),
      GoRoute(
        path: '/practice',
        builder: (context, state) => const AppChrome(child: PracticeScreen()),
      ),
      GoRoute(
        path: '/library',
        builder: (context, state) => const AppChrome(child: LibraryScreen()),
      ),
      // Session runner pushed by Learn/Cram — a shell-branch route cannot be
      // pushed (it would land on the root navigator with nothing beneath), so
      // sessions get their own pushed route carrying the ReviewSession extra.
      GoRoute(
        path: '/review/session',
        builder: (context, state) => const AppChrome(child: ReviewScreen()),
      ),
      // Staff consoles — the role gate lives in StaffGate (teacher+developer
      // for Teaching, developer for Admin), the same split the native
      // `Destination.visibleTo` draws.
      GoRoute(
        path: '/teacher',
        builder: (context, state) => const AppChrome(
          child: StaffGate(admin: false, child: TeachingScreen()),
        ),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AppChrome(
          child: StaffGate(admin: true, child: AdminScreen()),
        ),
      ),
      GoRoute(
        path: '/staff/student',
        builder: (context, state) => AppChrome(
          child: StaffGate(
            admin: false,
            child: StudentProgressScreen(
              userId: state.uri.queryParameters['userId'] ?? '',
              name: state.uri.queryParameters['name'] ?? 'Student',
            ),
          ),
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/today',
                builder: (context, state) => const TodayScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/review',
                builder: (context, state) => const ReviewScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/learn',
                builder: (context, state) => const LearnScreen(),
              ),
              GoRoute(
                path: '/learn/:subjectId',
                builder: (context, state) => LearnSubjectScreen(
                  subjectId: state.pathParameters['subjectId']!,
                ),
              ),
              GoRoute(
                path: '/learn/:subjectId/:topicId',
                builder: (context, state) => LearnTopicScreen(
                  subjectId: state.pathParameters['subjectId']!,
                  topicId: state.pathParameters['topicId']!,
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/rank',
                builder: (context, state) => RankScreen(
                  initialView: state.uri.queryParameters['view'],
                  initialScope: state.uri.queryParameters['scope'],
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
