/// Light and dark ThemeData built from `design/tokens.dart`.
///
/// One component theme is shared across both schemes; colours come from the
/// scheme's ColorScheme. No phone-only styling — every value traces back to
/// `src/app/globals.css`.
library revisio.design.theme;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'tokens.dart';

/// The shared Inter font family.
final TextTheme _kTextTheme = const TextTheme(
  displayLarge: TypeScale.display,
  displayMedium: TypeScale.displayMd,
  displaySmall: TypeScale.displaySm,
  headlineLarge: TypeScale.title,
  titleLarge: TypeScale.strong,
  titleMedium: TypeScale.captionS,
  bodyLarge: TypeScale.body,
  bodyMedium: TypeScale.caption,
  bodySmall: TypeScale.fine,
  labelLarge: TypeScale.label,
  labelMedium: TypeScale.captionS,
  labelSmall: TypeScale.micro,
);

/// Builds a ThemeData from a colour scheme + typography.
ThemeData _buildTheme({
  required ColorScheme colorScheme,
  required Brightness brightness,
}) {
  final base = GoogleFonts.interTextTheme(_kTextTheme);
  final good = brightness == Brightness.light
      ? const Color(0xFF58CC02)
      : const Color(0xFF58CC02);

  return ThemeData(
    useMaterial3: false,
    brightness: brightness,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: colorScheme.surfaceContainerLowest,
    cardColor: colorScheme.surface,
    dividerColor: colorScheme.outline,
    textTheme: base.copyWith(
      bodyLarge: base.bodyLarge!.copyWith(color: colorScheme.onBackground),
      bodyMedium: base.bodyMedium!.copyWith(color: colorScheme.onBackground),
      bodySmall: base.bodySmall!.copyWith(color: colorScheme.onSurfaceVariant),
      labelLarge: base.labelLarge!.copyWith(color: colorScheme.onBackground),
      labelMedium: base.labelMedium!.copyWith(color: colorScheme.onSurfaceVariant),
      labelSmall: base.labelSmall!.copyWith(color: colorScheme.onSurfaceVariant),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        minimumSize: const Size(double.infinity, kTouchTarget),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        shape: const StadiumBorder(),
        elevation: 0,
        shadowColor: Colors.transparent,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          letterSpacing: 0,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: colorScheme.onSurface,
        side: BorderSide(color: colorScheme.outline),
        minimumSize: const Size(double.infinity, kTouchTarget),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          letterSpacing: 0,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: colorScheme.onSurfaceVariant,
        minimumSize: const Size(kTouchTarget, kTouchTarget),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        textStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          letterSpacing: 0,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: colorScheme.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.sm),
        borderSide: BorderSide(color: colorScheme.outline, width: 2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.sm),
        borderSide: BorderSide(color: colorScheme.outline, width: 2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.sm),
        borderSide: BorderSide(color: colorScheme.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.sm),
        borderSide: BorderSide(color: colorScheme.error, width: 2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.sm),
        borderSide: BorderSide(color: colorScheme.error, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      hintStyle: TextStyle(
        color: colorScheme.onSurfaceVariant.withOpacity(0.75),
        fontSize: 16,
      ),
      labelStyle: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.04,
      ),
    ),
    cardTheme: CardThemeData(
      color: colorScheme.surface,
      elevation: 0,
      shadowColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        side: BorderSide(color: colorScheme.outline),
      ),
      margin: EdgeInsets.zero,
    ),
    checkboxTheme: CheckboxThemeData(
      checkColor: WidgetStateProperty.resolveWith<Color>((states) {
        if (states.contains(WidgetState.selected)) {
          return colorScheme.surfaceContainerLowest;
        }
        return colorScheme.onSurface;
      }),
      fillColor: WidgetStateProperty.resolveWith<Color>((states) {
        if (states.contains(WidgetState.selected)) {
          return colorScheme.onSurface;
        }
        return Colors.transparent;
      }),
      side: BorderSide(color: colorScheme.outline),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(RadiusTokens.sm)),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith<Color>((states) {
        if (states.contains(WidgetState.selected)) {
          return colorScheme.onSurface;
        }
        return colorScheme.onSurfaceVariant;
      }),
      trackColor: WidgetStateProperty.resolveWith<Color>((states) {
        if (states.contains(WidgetState.selected)) {
          return colorScheme.onSurface.withOpacity(0.5);
        }
        return colorScheme.surfaceContainerLow;
      }),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: good,
      linearTrackColor: colorScheme.surfaceContainerHighest,
      linearMinHeight: 10,
    ),
    dividerTheme: DividerThemeData(
      color: colorScheme.outline,
      space: 1,
      thickness: 1,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(color: colorScheme.outline),
        borderRadius: BorderRadius.circular(RadiusTokens.sm),
      ),
      textStyle: TextStyle(
        color: colorScheme.onSurface,
        fontSize: 12,
      ),
    ),
  );
}

/// Light theme.
ThemeData lightTheme() {
  return _buildTheme(
    brightness: Brightness.light,
    colorScheme: lightColorScheme(),
  );
}

/// Dark theme.
ThemeData darkTheme() {
  return _buildTheme(
    brightness: Brightness.dark,
    colorScheme: darkColorScheme(),
  );
}

/// Convenience color getters so components never import the palettes directly.
/// The active scheme is resolved from `Theme.of(context).colorScheme`.
extension SchemeColors on BuildContext {
  /// The OS "reduce motion" accessibility setting. Server-side
  /// `prefs.reducedMotion` is a separate preference layered on top by callers.
  bool get reduceMotion => MediaQuery.disableAnimationsOf(this);
  Brightness get brightness => Theme.of(this).brightness;
  Color get background => Theme.of(this).colorScheme.surfaceContainerLowest;
  Color get foreground => Theme.of(this).colorScheme.onBackground;
  Color get card => Theme.of(this).colorScheme.surface;
  Color get cardForeground => Theme.of(this).colorScheme.onSurface;
  Color get popover => Theme.of(this).colorScheme.surface;
  Color get popoverForeground => Theme.of(this).colorScheme.onSurface;
  Color get primary => Theme.of(this).colorScheme.primary;
  Color get primaryForeground => Theme.of(this).colorScheme.onPrimary;
  Color get secondary => Theme.of(this).colorScheme.secondary;
  Color get secondaryForeground => Theme.of(this).colorScheme.onSecondary;
  Color get muted => Theme.of(this).colorScheme.surfaceContainerLow;
  Color get mutedForeground => Theme.of(this).colorScheme.onSurfaceVariant;
  Color get destructive => Theme.of(this).colorScheme.error;
  Color get destructiveInk => brightness == Brightness.light
      ? const Color(0xFFC01A28)
      : const Color(0xFFFF8A8A);
  Color get destructiveForeground => Theme.of(this).colorScheme.onError;
  Color get border => Theme.of(this).colorScheme.outline;
  Color get borderStrong => Theme.of(this).colorScheme.outlineVariant;
  Color get input => Theme.of(this).colorScheme.surfaceContainerHighest;
  Color get ring => Theme.of(this).colorScheme.primary;

  // Game state
  Color get good => brightness == Brightness.light
      ? const Color(0xFF58CC02)
      : const Color(0xFF58CC02);
  Color get goodPressed => brightness == Brightness.light
      ? const Color(0xFF58A700)
      : const Color(0xFF3F9400);
  Color get goodStrong => brightness == Brightness.light
      ? const Color(0xFF3D7D00)
      : const Color(0xFF7AD63F);
  Color get goodSoft => brightness == Brightness.light
      ? const Color(0xFFD7FFB8)
      : const Color(0xFF1F3608);
  Color get streak => brightness == Brightness.light
      ? const Color(0xFFFF9600)
      : const Color(0xFFFFA53D);
  Color get streakPressed => brightness == Brightness.light
      ? const Color(0xFFC96A00)
      : const Color(0xFFFFBE6B);
  Color get gold => brightness == Brightness.light
      ? const Color(0xFFFFC800)
      : const Color(0xFFFFD23F);
  Color get goldInk => brightness == Brightness.light
      ? const Color(0xFF8A6200)
      : const Color(0xFFFFD23F);
  Color get info => brightness == Brightness.light
      ? const Color(0xFF1CB0F6)
      : const Color(0xFF1CB0F6);
  Color get infoInk => brightness == Brightness.light
      ? const Color(0xFF0071B8)
      : const Color(0xFF1CB0F6);

  // Band (polarity-flip surfaces)
  Color get band => brightness == Brightness.light
      ? const Color(0xFF000000)
      : const Color(0xFF141414);
  Color get bandForeground => Theme.of(this).colorScheme.onBackground;
  Color get bandCard => brightness == Brightness.light
      ? const Color(0xFF1A1A1A)
      : const Color(0xFF1F1F1F);
  Color get bandBorder => brightness == Brightness.light
      ? const Color(0xFF333333)
      : const Color(0xFF2E2E2E);
  Color get bandMuted => brightness == Brightness.light
      ? const Color(0xFFAFAFAF)
      : const Color(0xFF9A9A9A);
  Color get bandSecondary => brightness == Brightness.light
      ? const Color(0xFF242424)
      : const Color(0xFF262626);
}
