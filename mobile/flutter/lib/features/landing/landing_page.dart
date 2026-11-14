/// Pre-login landing: simplified composition per `docs/MOBILE-UX-PLAN.md` §5.
///
/// Not pixel-parity with the web marketing page. One screen: hero line,
/// one-sentence promise, sign in + create account, privacy/terms links.
library revisio.features.landing.landing_page;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../design/design.dart';

class LandingPage extends StatelessWidget {
  const LandingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 40),
            // Hero line + promise
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Spaced repetition for GCSE, A-level and university.',
                        style: TypeScale.display.copyWith(
                          color: context.foreground,
                          fontSize: 28,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Learn a card once and it comes back the day before you would forget it.',
                        style: TypeScale.body.copyWith(
                          color: context.mutedForeground,
                          height: 1.5,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // CTAs
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              child: Column(
                children: [
                  RevisioButton(
                    onPressed: () => context.push('/register'),
                    child: const Text(
                      'Create account',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                    ),
                  ),
                  const SizedBox(height: 12),
                  RevisioSecondaryButton(
                    onPressed: () => context.push('/login'),
                    child: const Text(
                      'I have an account',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            // Privacy / terms links
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  RevisioGhostButton(
                    onPressed: () => context.push('/privacy'),
                    child: const Text('Privacy'),
                  ),
                  const SizedBox(width: 16),
                  RevisioGhostButton(
                    onPressed: () => context.push('/terms'),
                    child: const Text('Terms'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
