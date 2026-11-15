/// The rank crest — Dart port of `src/components/ui/rank-crest.tsx`.
///
/// Hue is the metal (the tier colour); geometry is the belt-and-braces half:
/// chevrons in the shield (1 Bronze → 5 Legend), division dots beneath them,
/// dial ticks around the ring, and the ring filling with division progress.
library revisio.features.nav.rank_crest;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/ranked.dart';

/// The tier's metal for crest fills — the light/dark token pair.
Color tierColorFor(Tier tier, Brightness brightness) {
  final light = brightness == Brightness.light;
  return switch (tier) {
    Tier.bronze => light ? LightColors.tierBronze : DarkColors.tierBronze,
    Tier.silver => light ? LightColors.tierSilver : DarkColors.tierSilver,
    Tier.gold => light ? LightColors.tierGold : DarkColors.tierGold,
    Tier.platinum => light ? LightColors.tierPlatinum : DarkColors.tierPlatinum,
    Tier.emerald => light ? LightColors.tierEmerald : DarkColors.tierEmerald,
    Tier.sapphire => light ? LightColors.tierSapphire : DarkColors.tierSapphire,
    Tier.diamond => light ? LightColors.tierDiamond : DarkColors.tierDiamond,
    Tier.ruby => light ? LightColors.tierRuby : DarkColors.tierRuby,
    Tier.obsidian => light ? LightColors.tierObsidian : DarkColors.tierObsidian,
    Tier.legend => light ? LightColors.tierLegend : DarkColors.tierLegend,
  };
}

class RankCrest extends StatelessWidget {
  const RankCrest({
    super.key,
    required this.rank,
    this.size = 88,
    this.showProgress = true,
    this.muted = false,
    this.semanticLabel,
  });

  final Rank rank;
  final double size;
  final bool showProgress;
  final bool muted;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel ?? 'Rank ${rank.label}',
      image: true,
      child: ExcludeSemantics(
        child: CustomPaint(
          size: Size.square(size),
          painter: _RankCrestPainter(
            spec: crestFor(tier: rank.tier, division: rank.division),
            percent: rank.percent,
            metal: tierColorFor(rank.tier, Theme.of(context).brightness),
            card: context.card,
            foreground: context.foreground,
            border: context.border,
            mutedColor: context.mutedForeground,
            muted: muted,
            showProgress: showProgress,
          ),
        ),
      ),
    );
  }
}

class _RankCrestPainter extends CustomPainter {
  _RankCrestPainter({
    required this.spec,
    required this.percent,
    required this.metal,
    required this.card,
    required this.foreground,
    required this.border,
    required this.mutedColor,
    required this.muted,
    required this.showProgress,
  });

  final CrestSpec spec;
  final int percent;
  final Color metal;
  final Color card;
  final Color foreground;
  final Color border;
  final Color mutedColor;
  final bool muted;
  final bool showProgress;

  static const double _r = 45.5;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 100; // viewBox 100×100 → px
    canvas.save();
    canvas.scale(s);

    final markColor = muted ? mutedColor.withOpacity(0.45) : metal;

    // Dial ticks — the mechanism. r 40→44, 1.5px round caps.
    final tickPaint = Paint()
      ..color = (muted ? mutedColor.withOpacity(0.30) : metal.withOpacity(0.32))
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < spec.segments; i++) {
      final angle = (i / spec.segments) * math.pi * 2 - math.pi / 2;
      canvas.drawLine(
        Offset(50 + math.cos(angle) * 40, 50 + math.sin(angle) * 40),
        Offset(50 + math.cos(angle) * 44, 50 + math.sin(angle) * 44),
        tickPaint,
      );
    }

    // Progress ring — division progress, the only accent sweep.
    if (showProgress) {
      final ringPaint = Paint()
        ..color = border.withOpacity(0.6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3;
      canvas.drawCircle(const Offset(50, 50), _r, ringPaint);
      final progressPaint = Paint()
        ..color = markColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(
        Rect.fromCircle(center: const Offset(50, 50), radius: _r),
        -math.pi / 2,
        2 * math.pi * (percent.clamp(0, 100) / 100),
        false,
        progressPaint,
      );
    }

    // The shield — ink outline on the card surface.
    final shield = Path()
      ..moveTo(22, 26)
      ..lineTo(78, 26)
      ..lineTo(78, 50)
      ..cubicTo(78, 67, 65, 79, 50, 85)
      ..cubicTo(35, 79, 22, 67, 22, 50)
      ..close();
    canvas.drawPath(
      shield,
      Paint()
        ..color = card
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      shield,
      Paint()
        ..color = foreground
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round,
    );

    // Chevrons — the tier band.
    final ridgeGap = 7.5;
    final ridgeTop = 48 - ((spec.ridges - 1) * ridgeGap) / 2;
    final chevronPaint = Paint()
      ..color = markColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.75
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (var i = 0; i < spec.ridges; i++) {
      final y = ridgeTop + i * ridgeGap;
      canvas.drawPath(
        Path()
          ..moveTo(37, y)
          ..lineTo(50, y - 6)
          ..lineTo(63, y),
        chevronPaint,
      );
    }

    // Division pips.
    final pipPaint = Paint()..color = markColor;
    const spread = 5.0;
    for (var i = 0; i < spec.pips; i++) {
      final x = 50 + (i - (spec.pips - 1) / 2) * spread;
      canvas.drawCircle(Offset(x, 72), 2.4, pipPaint);
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(_RankCrestPainter old) =>
      old.spec.ridges != spec.ridges ||
      old.spec.segments != spec.segments ||
      old.spec.pips != spec.pips ||
      old.percent != percent ||
      old.metal != metal ||
      old.muted != muted ||
      old.showProgress != showProgress;
}
