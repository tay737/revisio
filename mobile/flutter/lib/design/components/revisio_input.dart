/// Revisio input fields, ported from the web's `.input` and `.Field`.
///
/// Duolingo's 48px field with a 2px stroke, filled by canvas-soft. Leading
/// glyph sits inside the field, centred vertically.
library revisio.design.components.revisio_input;

import 'package:flutter/material.dart';
import '../theme.dart';

/// A labelled field with a leading glyph, mirroring AuthForm's `Field`.
///
/// Errors render beneath the field, tied to the control via `errorText`.
class RevisioField extends StatelessWidget {
  final String label;
  final Widget child;
  final String? errorText;
  final IconData? icon;

  const RevisioField({
    super.key,
    required this.label,
    required this.child,
    this.errorText,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label.isNotEmpty) ...[
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.04,
            ).copyWith(color: context.mutedForeground),
          ),
          const SizedBox(height: 6),
        ],
        Stack(
          clipBehavior: Clip.none,
          children: [
            child,
            if (icon != null)
              Positioned(
                left: 14,
                top: 12,
                child: Icon(icon, size: 17, color: context.mutedForeground),
              ),
          ],
        ),
        if (errorText != null && errorText!.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            errorText!,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              height: 1.35,
            ).copyWith(color: context.destructiveInk),
          ),
        ],
      ],
    );
  }
}

/// Standard text input with 48px height, 2px stroke, leading icon padding.
class RevisioTextInput extends StatelessWidget {
  final TextEditingController controller;
  final String? placeholder;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final bool enabled;
  final bool readOnly;
  final int? maxLength;
  final int? maxLines;
  final FocusNode? focusNode;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final String? autofillHints;
  final TextCapitalization textCapitalization;
  final InputDecoration? decoration;

  const RevisioTextInput({
    super.key,
    required this.controller,
    this.placeholder,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.enabled = true,
    this.readOnly = false,
    this.maxLength,
    this.maxLines,
    this.focusNode,
    this.validator,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.autofillHints,
    this.textCapitalization = TextCapitalization.none,
    this.decoration,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      obscureText: obscureText,
      enabled: enabled,
      readOnly: readOnly,
      maxLength: maxLength,
      maxLines: maxLines,
      focusNode: focusNode,
      validator: validator,
      onChanged: onChanged,
      onFieldSubmitted: onSubmitted,
      onTap: onTap,
      autofillHints: autofillHints == null ? null : [autofillHints!],
      textCapitalization: textCapitalization,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w400),
      cursorColor: context.foreground,
      decoration: decoration ?? InputDecoration(
        hintText: placeholder,
        hintStyle: TextStyle(
          color: context.mutedForeground.withOpacity(0.75),
          fontSize: 16,
        ),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        filled: true,
        fillColor: context.card,
      ),
    );
  }
}

/// Password input with toggle visibility.
class RevisioPasswordInput extends StatefulWidget {
  final TextEditingController controller;
  final String? placeholder;
  final bool enabled;
  final FocusNode? focusNode;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final String? Function(String?)? validator;

  const RevisioPasswordInput({
    super.key,
    required this.controller,
    this.placeholder,
    this.enabled = true,
    this.focusNode,
    this.onChanged,
    this.onSubmitted,
    this.validator,
  });

  @override
  State<RevisioPasswordInput> createState() => _RevisioPasswordInputState();
}

class _RevisioPasswordInputState extends State<RevisioPasswordInput> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        RevisioTextInput(
          controller: widget.controller,
          placeholder: widget.placeholder,
          obscureText: _obscure,
          enabled: widget.enabled,
          focusNode: widget.focusNode,
          onChanged: widget.onChanged,
          onSubmitted: widget.onSubmitted,
          validator: widget.validator,
          textCapitalization: TextCapitalization.none,
          autofillHints: AutofillHints.password,
          decoration: InputDecoration(
            hintText: widget.placeholder,
            hintStyle: TextStyle(
              color: context.mutedForeground.withOpacity(0.75),
              fontSize: 16,
            ),
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            filled: true,
            fillColor: context.card,
            suffixIcon: IconButton(
              icon: Icon(
                _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                size: 20,
                color: context.mutedForeground,
              ),
              onPressed: widget.enabled ? () => setState(() => _obscure = !_obscure) : null,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          ),
        ),
        Positioned(
          left: 14,
          top: 12,
          child: Icon(Icons.lock_outline, size: 17, color: context.mutedForeground),
        ),
      ],
    );
  }
}
