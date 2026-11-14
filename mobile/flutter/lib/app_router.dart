/// App navigation with go_router.
///
/// Routes: / (landing), /login, /register. Auth gates will be added as
/// signed-in screens are built.
library revisio.app_router;

import 'package:go_router/go_router.dart';
import 'features/landing/landing_page.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_wizard.dart';

final goRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const LandingPage()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/register', builder: (context, state) => const RegisterWizard()),
  ],
);
