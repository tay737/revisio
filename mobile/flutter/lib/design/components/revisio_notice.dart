/// Revisio notice — the web's `Notice`: a persistent line at the top of the
/// card that stays until the next action. Not a snackbar timer.
library revisio.design.components.revisio_notice;

import 'package:flutter/material.dart';
import '../theme.dart';
import '../tokens.dart';

enum NoticeTone { note, bad }

class RevisioNotice extends StatelessWidget {
  final NoticeTone tone;
  final bool show;
  final Widget child;

  const RevisioNotice({
    super.key,
    required this.tone,
    required this.show,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    if (!show) return const SizedBox.shrink();

    final Color background;
    final Color text;
    switch (tone) {
      case NoticeTone.bad:
        background = context.destructive;
        text = context.destructiveForeground;
      case NoticeTone.note:
        background = context.secondary;
        text = context.foreground;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: text, fontSize: 14, height: 1.43),
        child: child,
      ),
    );
  }
}
