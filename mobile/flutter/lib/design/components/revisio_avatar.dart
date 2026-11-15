/// The one avatar treatment — port of `src/components/ui/avatar.tsx`.
///
/// Priority: uploaded image → chosen emoji on a token colour → initials.
/// Every colour pair meets AA contrast in both schemes.
library revisio.design.components.revisio_avatar;

import 'package:flutter/material.dart';

import '../theme.dart';
import '../../engine/copy.dart' as copy;

class RevisioAvatar extends StatelessWidget {
  const RevisioAvatar({
    super.key,
    required this.name,
    this.emoji,
    this.color,
    this.imageUrl,
    this.size = 36,
  });

  final String name;
  final String? emoji;
  final String? color;
  final String? imageUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _surface(context, color);
    final showImage = imageUrl != null && imageUrl!.isNotEmpty;
    final glyph = emoji != null && emoji!.isNotEmpty
        ? emoji!
        : copy.initials(name);
    final fontSize =
        size * (emoji != null && emoji!.isNotEmpty && !showImage ? 0.5 : 0.38);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: showImage
          ? Image.network(
              imageUrl!,
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Text(
                glyph,
                style: TextStyle(
                  color: fg,
                  fontSize: fontSize,
                  fontWeight: FontWeight.w600,
                  height: 1,
                ),
              ),
            )
          : Text(
              glyph,
              style: TextStyle(
                color: fg,
                fontSize: fontSize,
                fontWeight: FontWeight.w600,
                height: 1,
              ),
            ),
    );
  }

  /// The web `SURFACE` map, resolved against the active scheme.
  (Color, Color) _surface(BuildContext context, String? color) {
    switch (color ?? 'ink') {
      case 'moss':
        return (context.goodSoft, context.goodStrong);
      case 'bee':
        return (context.gold.withOpacity(0.3), context.foreground);
      case 'dawn':
        return (context.destructive.withOpacity(0.15), context.destructiveInk);
      case 'sky':
        return (context.secondary, context.foreground);
      case 'ink':
      default:
        return (context.foreground, context.background);
    }
  }
}
