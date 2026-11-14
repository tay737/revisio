/// Design tokens ported from `src/app/globals.css` (the single source of truth).
///
/// Uber owns the chrome: ink/canvas duet, grayscale ramp, 4px spacing base,
/// 16px card radius, pill as the only interactive shape. Duolingo owns the
/// state: game colours only where the game needs them (streak, correct, gold).
///
/// Colours are listed for both schemes. The dark scheme is a polarity flip of
/// the light one — black becomes canvas, white becomes ink.
library revisio.design.tokens;

import 'package:flutter/material.dart';

/// Light scheme colours.
class LightColors {
  static const Color background = Color(0xFFFFFFFF); // canvas
  static const Color foreground = Color(0xFF000000); // ink
  static const Color card = Color(0xFFFFFFFF);
  static const Color cardForeground = Color(0xFF000000);
  static const Color popover = Color(0xFFFFFFFF);
  static const Color popoverForeground = Color(0xFF000000);
  static const Color primary = Color(0xFF000000); // conversion pill — ink
  static const Color primaryForeground = Color(0xFFFFFFFF);
  static const Color secondary = Color(0xFFEFEFEF); // canvas-soft
  static const Color secondaryForeground = Color(0xFF000000);
  static const Color muted = Color(0xFFF3F3F3); // canvas-softer
  static const Color mutedForeground = Color(0xFF5E5E5E); // body
  static const Color accent = Color(0xFFEFEFEF);
  static const Color accentForeground = Color(0xFF000000);
  static const Color destructive = Color(0xFFFF4B4B); // cardinal
  static const Color destructiveInk = Color(0xFFC01A28);
  static const Color destructiveForeground = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFE2E2E2); // surface-pressed
  static const Color borderStrong = Color(0xFFD0D0D0); // 2px input stroke
  static const Color input = Color(0xFFEFEFEF);
  static const Color ring = Color(0xFF000000);

  // Game state (Duolingo)
  static const Color good = Color(0xFF58CC02); // owl green
  static const Color goodPressed = Color(0xFF58A700);
  static const Color goodStrong = Color(0xFF3D7D00);
  static const Color goodSoft = Color(0xFFD7FFB8);
  static const Color streak = Color(0xFFFF9600); // fox
  static const Color streakPressed = Color(0xFFC96A00);
  static const Color gold = Color(0xFFFFC800); // bee
  static const Color goldInk = Color(0xFF8A6200);
  static const Color info = Color(0xFF1CB0F6); // macaw
  static const Color infoInk = Color(0xFF0071B8);

  // Ten metals (rank ladder)
  static const Color tierBronze = Color(0xFF7D4C1F);
  static const Color tierSilver = Color(0xFF64707F);
  static const Color tierGold = Color(0xFF8A6A00);
  static const Color tierPlatinum = Color(0xFF5A6B7D);
  static const Color tierEmerald = Color(0xFF0F9A63);
  static const Color tierSapphire = Color(0xFF2F5FD0);
  static const Color tierDiamond = Color(0xFF0FA9C8);
  static const Color tierRuby = Color(0xFFD0354E);
  static const Color tierObsidian = Color(0xFF6D5BD0);
  static const Color tierLegend = Color(0xFFD94F96);

  // Polarity band
  static const Color band = Color(0xFF000000);
  static const Color bandForeground = Color(0xFFFFFFFF);
  static const Color bandCard = Color(0xFF1A1A1A);
  static const Color bandBorder = Color(0xFF333333);
  static const Color bandMuted = Color(0xFFAFAFAF);
  static const Color bandSecondary = Color(0xFF242424);

  // Tactile lip
  static const Color lip = Color.fromRGBO(0, 0, 0, 0.28);
  static const Color lipSoft = Color(0xFFDCDCDC);
  static const Color scrim = Color.fromRGBO(0, 0, 0, 0.4);
}

/// Dark scheme colours — polarity flip of light.
class DarkColors {
  static const Color background = Color(0xFF000000);
  static const Color foreground = Color(0xFFFFFFFF);
  static const Color card = Color(0xFF141414);
  static const Color cardForeground = Color(0xFFFFFFFF);
  static const Color popover = Color(0xFF1A1A1A);
  static const Color popoverForeground = Color(0xFFFFFFFF);
  static const Color primary = Color(0xFFFFFFFF);
  static const Color primaryForeground = Color(0xFF000000);
  static const Color secondary = Color(0xFF282828);
  static const Color secondaryForeground = Color(0xFFFFFFFF);
  static const Color muted = Color(0xFF1C1C1C);
  static const Color mutedForeground = Color(0xFFAFAFAF);
  static const Color accent = Color(0xFF282828);
  static const Color accentForeground = Color(0xFFFFFFFF);
  static const Color destructive = Color(0xFFFF6B6B);
  static const Color destructiveInk = Color(0xFFFF8A8A);
  static const Color destructiveForeground = Color(0xFF000000);
  static const Color border = Color(0xFF2E2E2E);
  static const Color borderStrong = Color(0xFF4B4B4B);
  static const Color input = Color(0xFF282828);
  static const Color ring = Color(0xFFFFFFFF);

  static const Color good = Color(0xFF58CC02);
  static const Color goodPressed = Color(0xFF3F9400);
  static const Color goodStrong = Color(0xFF7AD63F);
  static const Color goodSoft = Color(0xFF1F3608);
  static const Color streak = Color(0xFFFFA53D);
  static const Color streakPressed = Color(0xFFFFBE6B);
  static const Color gold = Color(0xFFFFD23F);
  static const Color goldInk = Color(0xFFFFD23F);
  static const Color info = Color(0xFF1CB0F6);
  static const Color infoInk = Color(0xFF1CB0F6);

  static const Color tierBronze = Color(0xFFD9905A);
  static const Color tierSilver = Color(0xFFB7C1CD);
  static const Color tierGold = Color(0xFFFFC800);
  static const Color tierPlatinum = Color(0xFFE8EFF7);
  static const Color tierEmerald = Color(0xFF35D295);
  static const Color tierSapphire = Color(0xFF7AA2FF);
  static const Color tierDiamond = Color(0xFF3FD6EF);
  static const Color tierRuby = Color(0xFFFF6D80);
  static const Color tierObsidian = Color(0xFFA294FF);
  static const Color tierLegend = Color(0xFFFF8EC4);

  static const Color band = Color(0xFF141414);
  static const Color bandForeground = Color(0xFFFFFFFF);
  static const Color bandCard = Color(0xFF1F1F1F);
  static const Color bandBorder = Color(0xFF2E2E2E);
  static const Color bandMuted = Color(0xFF9A9A9A);
  static const Color bandSecondary = Color(0xFF262626);

  static const Color lip = Color(0xFFC9C9C9);
  static const Color lipSoft = Color(0xFF1F1F1F);
  static const Color scrim = Color.fromRGBO(0, 0, 0, 0.66);
}

/// Material [ColorScheme] for the light tokens.
ColorScheme lightColorScheme() => ColorScheme(
      brightness: Brightness.light,
      primary: LightColors.primary,
      onPrimary: LightColors.primaryForeground,
      secondary: LightColors.secondary,
      onSecondary: LightColors.secondaryForeground,
      surface: LightColors.card,
      onSurface: LightColors.cardForeground,
      error: LightColors.destructive,
      onError: LightColors.destructiveForeground,
      surfaceContainerLowest: LightColors.background,
      surfaceContainerLow: LightColors.muted,
      surfaceContainer: LightColors.card,
      surfaceContainerHigh: LightColors.secondary,
      surfaceContainerHighest: LightColors.accent,
      onSurfaceVariant: LightColors.mutedForeground,
      outline: LightColors.border,
      outlineVariant: LightColors.borderStrong,
      inverseSurface: LightColors.card,
      onInverseSurface: LightColors.cardForeground,
      inversePrimary: LightColors.foreground,
      scrim: LightColors.scrim,
      surfaceTint: Colors.transparent,
    );

/// Material [ColorScheme] for the dark tokens.
ColorScheme darkColorScheme() => ColorScheme(
      brightness: Brightness.dark,
      primary: DarkColors.primary,
      onPrimary: DarkColors.primaryForeground,
      secondary: DarkColors.secondary,
      onSecondary: DarkColors.secondaryForeground,
      surface: DarkColors.card,
      onSurface: DarkColors.cardForeground,
      error: DarkColors.destructive,
      onError: DarkColors.destructiveForeground,
      surfaceContainerLowest: DarkColors.background,
      surfaceContainerLow: DarkColors.muted,
      surfaceContainer: DarkColors.card,
      surfaceContainerHigh: DarkColors.secondary,
      surfaceContainerHighest: DarkColors.accent,
      onSurfaceVariant: DarkColors.mutedForeground,
      outline: DarkColors.border,
      outlineVariant: DarkColors.borderStrong,
      inverseSurface: DarkColors.card,
      onInverseSurface: DarkColors.cardForeground,
      inversePrimary: DarkColors.foreground,
      scrim: DarkColors.scrim,
      surfaceTint: Colors.transparent,
    );

/// Radius ladder (Uber): 8 input · 12 small card · 16 canonical card · pill.
class RadiusTokens {
  static const double xs = 6;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double pill = 999;
}

/// Shadows (Uber's three documented drops; cards stay flat at Level 0).
class ShadowTokens {
  static const double floatZ = 2;
  static const double cardZ = 4;
  static const double overlayZ = 16;
}

/// Minimum touch target (WCAG 2.5.8): 44x44.
const double kTouchTarget = 44.0;

/// 4px spacing base.
const double kGrid = 4.0;

/// Easings from the web token set.
class EaseTokens {
  static const Curve snap = Cubic(0.22, 1, 0.36, 1);
  static const Curve out = Cubic(0.22, 1, 0.36, 1);
}

/// Press animations: the flat bottom lip compresses on press.
class PressTokens {
  static const double scale = 0.95;
  static const Duration duration = Duration(milliseconds: 90);
}

/// Entrance animation: fade-up with capped stagger.
class EntranceTokens {
  static const Duration duration = Duration(milliseconds: 300);
  static const Duration stagger = Duration(milliseconds: 60);
}

/// Pop animation: underdamped crest/badge arrival.
class PopTokens {
  static const double scale = 0.7;
  static const Duration duration = Duration(milliseconds: 250);
}

/// Meter animation: fill travels on the meter spring.
class MeterTokens {
  static const Duration duration = Duration(milliseconds: 500);
}

/// Type scale — Uber's ladder with mobile step folded into each size.
class TypeScale {
  static const TextStyle hero = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
    height: 1.08,
  );
  static const TextStyle display = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
    height: 1.15,
  );
  static const TextStyle displayMd = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
    height: 1.25,
  );
  static const TextStyle displaySm = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
    height: 1.3,
  );
  static const TextStyle title = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
    height: 1.25,
  );
  static const TextStyle lead = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w500,
    height: 1.4,
  );
  static const TextStyle leadAiry = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w400,
    height: 1.45,
  );
  static const TextStyle tagline = TextStyle(
    fontSize: 19,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
    height: 1.35,
  );
  static const TextStyle strong = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    height: 1.3,
  );
  static const TextStyle body = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );
  static const TextStyle caption = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.43,
  );
  static const TextStyle captionS = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    height: 1.3,
  );
  static const TextStyle fine = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.35,
  );
  static const TextStyle micro = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w500,
    height: 1.3,
  );

  // Duolingo label: stamped, uppercased, letter-spaced. Controls only.
  static const TextStyle label = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.08,
  );
  static const TextStyle eyebrow = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.1,
  );

  static const TextStyle numSm = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    height: 1.15,
  );
}

/// Font family used throughout (Inter, same as web).
const String kFontFamily = 'Inter';
