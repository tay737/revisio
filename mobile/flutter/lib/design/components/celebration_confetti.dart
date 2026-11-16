/// A small, dependency-free confetti burst for reward moments.
///
/// Mirrors the web's `Confetti`/`canvas-confetti` contract closely enough for
/// parity: a correct answer fires a short burst low on the screen, a promotion
/// fires a wider one higher up. The caller passes `trigger` (an int that
/// increments per celebration), `particleCount`, `originY` and the combined
/// reduce-motion flag; nothing renders when motion is reduced.
library revisio.design.components.celebration_confetti;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Confetti burst overlay. Place inside a `Positioned.fill` in a `Stack`.
class CelebrationConfetti extends StatefulWidget {
  const CelebrationConfetti({
    super.key,
    required this.trigger,
    this.particleCount = 140,
    this.originY = 0.30,
    this.reduceMotion = false,
  });

  /// Increment to fire a new burst. `0` means idle.
  final int trigger;
  final int particleCount;
  final double originY;
  final bool reduceMotion;

  @override
  State<CelebrationConfetti> createState() => _CelebrationConfettiState();
}

class _CelebrationConfettiState extends State<CelebrationConfetti>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  );

  List<_ConfettiPiece> _pieces = const [];

  @override
  void initState() {
    super.initState();
    _launch();
  }

  @override
  void didUpdateWidget(covariant CelebrationConfetti oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.trigger != oldWidget.trigger ||
        widget.reduceMotion != oldWidget.reduceMotion ||
        widget.particleCount != oldWidget.particleCount ||
        widget.originY != oldWidget.originY) {
      _launch();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _launch() {
    if (widget.reduceMotion || widget.trigger <= 0) {
      _pieces = const [];
      _controller.stop();
      return;
    }
    final random = math.Random(widget.trigger);
    _pieces = List.generate(widget.particleCount, (_) {
      return _ConfettiPiece(
        x: 0.5 + (random.nextDouble() - 0.5) * 0.55,
        vx: (random.nextDouble() - 0.5) * 0.9,
        vy: -(0.35 + random.nextDouble() * 0.6),
        spin: (random.nextDouble() - 0.5) * 8,
        size: 4 + random.nextDouble() * 5,
        delay: random.nextDouble() * 0.25,
        colorIndex: random.nextInt(4),
      );
    });
    _controller.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.reduceMotion) return const SizedBox.shrink();
    final palette = [context.good, context.gold, context.info, context.streak];
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return CustomPaint(
            painter: _ConfettiPainter(
              pieces: _pieces,
              progress: _controller.value,
              palette: palette,
              originY: widget.originY,
            ),
            child: const SizedBox.expand(),
          );
        },
      ),
    );
  }
}

class _ConfettiPiece {
  const _ConfettiPiece({
    required this.x,
    required this.vx,
    required this.vy,
    required this.spin,
    required this.size,
    required this.delay,
    required this.colorIndex,
  });

  final double x;
  final double vx;
  final double vy;
  final double spin;
  final double size;
  final double delay;
  final int colorIndex;
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter({
    required this.pieces,
    required this.progress,
    required this.palette,
    required this.originY,
  });

  final List<_ConfettiPiece> pieces;
  final double progress;
  final List<Color> palette;
  final double originY;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty || pieces.isEmpty) return;
    final startY = size.height * originY;
    final paint = Paint()..style = PaintingStyle.fill;
    for (final piece in pieces) {
      final local = (progress - piece.delay) / (1 - piece.delay);
      if (local < 0 || local > 1) continue;
      final x = size.width * (piece.x + piece.vx * local);
      final y = startY +
          (piece.vy * local + 1.6 * local * local) * size.height;
      final alpha = (1 - local * local).clamp(0.0, 1.0);
      paint.color =
          palette[piece.colorIndex % palette.length].withOpacity(alpha);
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(piece.spin * local);
      canvas.drawRect(
        Rect.fromCenter(
          center: Offset.zero,
          width: 6 * piece.size,
          height: 4 * piece.size,
        ),
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter oldDelegate) => true;
}
