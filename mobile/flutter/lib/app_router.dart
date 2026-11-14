/// App navigation with go_router.
///
/// Routes: / (landing), /login, /register, /forgot-password, /privacy, /terms.
/// Auth gates will be added as signed-in screens are built.
library revisio.app_router;

import 'package:go_router/go_router.dart';
import 'features/landing/landing_page.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_wizard.dart';
import 'features/auth/forgot_password_screen.dart';
import 'features/legal/legal_screen.dart';

final goRouter = GoRouter(
  initialLocation: '/',
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
  ],
);
