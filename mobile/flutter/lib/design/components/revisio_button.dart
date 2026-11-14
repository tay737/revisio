/// Revisio buttons, ported from the web's `.btn` family.
///
/// - Primary: ink pill with a flat bottom lip that compresses on press.
/// - Good: the in-session action (green, uppercase, tracked).
/// - Secondary: card-filled pill with a border.
/// - Ghost: transparent with border, for secondary actions.
/// - Icon: 40x40 pill for nav and toolbar actions.
///
/// All primary controls are 44px minimum (WCAG 2.5.8).
library revisio.design.components.revisio_button;

import 'package:flutter/material.dart';
import '../theme.dart';
import '../tokens.dart';

/// Primary action — ink pill with tactile lip.
class RevisioButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final bool enabled;
  final bool loading;

  const RevisioButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.enabled = true,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final effective = enabled && !loading;
    return AnimatedContainer(
      duration: PressTokens.duration,
      curve: EaseTokens.snap,
      transform: Matrix4.translationValues(
        0,
        effective ? 0 : 3,
        0,
      ),
      child: SizedBox(
        height: kTouchTarget,
        child: ElevatedButton(
          onPressed: effective ? onPressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: context.primary,
            foregroundColor: context.primaryForeground,
            elevation: 0,
            shadowColor: Colors.transparent,
            side: BorderSide.none,
            shape: const StadiumBorder(),
          ),
          child: loading
              ? SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(context.primaryForeground),
                  ),
                )
              : child,
        ),
      ),
    );
  }
}

/// The in-session action — green, uppercase, tracked.
class RevisioGoodButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final bool enabled;

  const RevisioGoodButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final color = context.goodStrong;
    return AnimatedContainer(
      duration: PressTokens.duration,
      curve: EaseTokens.snap,
      transform: Matrix4.translationValues(
        0,
        enabled ? 0 : 4,
        0,
      ),
      child: SizedBox(
        height: kTouchTarget,
        child: ElevatedButton(
          onPressed: enabled ? onPressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: color,
            foregroundColor: Colors.white,
            elevation: 0,
            shadowColor: Colors.transparent,
            side: BorderSide.none,
            shape: const StadiumBorder(),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Secondary — card-filled pill with border.
class RevisioSecondaryButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final bool enabled;

  const RevisioSecondaryButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: kTouchTarget,
      child: OutlinedButton(
        onPressed: enabled ? onPressed : null,
        style: OutlinedButton.styleFrom(
          foregroundColor: context.foreground,
          side: BorderSide(color: context.border),
          shape: const StadiumBorder(),
        ),
        child: child,
      ),
    );
  }
}

/// Ghost — transparent, for links and tertiary actions.
class RevisioGhostButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final bool enabled;

  const RevisioGhostButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: enabled ? onPressed : null,
      style: TextButton.styleFrom(
        foregroundColor: context.mutedForeground,
        minimumSize: const Size(kTouchTarget, kTouchTarget),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      ),
      child: child,
    );
  }
}

/// Icon button — 40x40 pill.
class RevisioIconButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final IconData icon;
  final bool enabled;

  const RevisioIconButton({
    super.key,
    required this.onPressed,
    required this.icon,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      height: 40,
      child: OutlinedButton(
        onPressed: enabled ? onPressed : null,
        style: OutlinedButton.styleFrom(
          foregroundColor: context.foreground,
          backgroundColor: context.secondary,
          side: BorderSide(color: context.border),
          shape: const StadiumBorder(),
          padding: EdgeInsets.zero,
        ),
        child: Icon(icon, size: 20),
      ),
    );
  }
}

/// Disabled overlay tint.
class RevisioDisabledButton extends StatelessWidget {
  final Widget child;

  const RevisioDisabledButton({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: 0.45,
      child: child,
    );
  }
}
