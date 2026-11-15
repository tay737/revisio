/// Shared pieces for the staff consoles — the Flutter counterparts of the
/// native `SurfaceCard`/`SoftCard`/`Chip`/`Meter`/`Label`/`Hairline` helpers,
/// written against the same tokens the rest of the app uses.
library revisio.features.staff.staff_bits;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../app/app_data.dart';
import 'staff_controller.dart';

/// A titled surface card — the web's panel, one column on a phone.
class StaffCard extends StatelessWidget {
  const StaffCard({
    super.key,
    required this.title,
    this.trailing,
    required this.children,
  });

  final String title;
  final Widget? trailing;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: TypeScale.strong)),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }
}

/// A quiet filled card for one-line states ("Loading…", empty roster).
class StaffSoftCard extends StatelessWidget {
  const StaffSoftCard({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.muted,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: child,
    );
  }
}

/// A small status chip — role, flag state, miss counts.
class StaffChip extends StatelessWidget {
  const StaffChip(this.label, {super.key, this.tint});

  final String label;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final color = tint ?? context.mutedForeground;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: context.muted,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
        border: Border.all(color: context.border),
      ),
      child: Text(label, style: TypeScale.micro.copyWith(color: color)),
    );
  }
}

/// A tappable chip pill — the web's class-membership chips.
class StaffChipPill extends StatelessWidget {
  const StaffChipPill({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RadiusTokens.pill),
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: context.secondary,
          borderRadius: BorderRadius.circular(RadiusTokens.pill),
          border: Border.all(color: context.border),
        ),
        child: Text(label, style: TypeScale.fine),
      ),
    );
  }
}

/// The thin divider between roster rows.
class StaffHairline extends StatelessWidget {
  const StaffHairline({super.key});

  @override
  Widget build(BuildContext context) =>
      Divider(height: 1, color: context.border);
}

/// A small uppercase label over a value — the web's `Label`.
class StaffLabel extends StatelessWidget {
  const StaffLabel(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TypeScale.micro.copyWith(color: color ?? context.mutedForeground),
    );
  }
}

/// The meter — a thin fill bar. `value` is 0–100.
class StaffMeter extends StatelessWidget {
  const StaffMeter(this.value, {super.key, this.tint, this.height = 5});

  final int value;
  final Color? tint;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(RadiusTokens.pill),
      child: LinearProgressIndicator(
        value: (value.clamp(0, 100)) / 100,
        minHeight: height,
        backgroundColor: context.muted,
        valueColor: AlwaysStoppedAnimation(tint ?? context.foreground),
      ),
    );
  }
}

/// A labelled dropdown over the subject list — the web's `<select>`.
class StaffSubjectPicker extends StatelessWidget {
  const StaffSubjectPicker({
    super.key,
    required this.label,
    required this.current,
    required this.subjects,
    required this.onPick,
  });

  final String label;
  final String current;
  final List<SubjectRef> subjects;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    String currentName = 'No subject';
    for (final s in subjects) {
      if (s.id == current) currentName = s.name;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        StaffLabel(label),
        const SizedBox(height: 4),
        DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: subjects.any((s) => s.id == current) ? current : null,
            isExpanded: true,
            hint: Text(currentName, style: TypeScale.caption),
            icon: const Icon(Icons.expand_more, size: 18),
            style: TypeScale.caption.copyWith(color: context.foreground),
            dropdownColor: context.card,
            items: [
              for (final s in subjects)
                DropdownMenuItem(value: s.id, child: Text(s.name)),
            ],
            onChanged: (id) {
              if (id != null) onPick(id);
            },
          ),
        ),
      ],
    );
  }
}

/// The role gate every staff route sits behind — the same rule the native
/// `Destination.visibleTo` draws: staff areas are for staff accounts, and a
/// learner who lands here is told so rather than shown a console that 403s.
class StaffGate extends ConsumerWidget {
  const StaffGate({super.key, required this.admin, required this.child});

  /// True for the developer console; false for Teaching.
  final bool admin;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    return me.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Your account could not be loaded.')),
      ),
      data: (m) {
        final allowed = admin ? staffCanAdmin(m.role) : staffCanTeach(m.role);
        if (allowed) return child;
        return Scaffold(
          appBar: AppBar(),
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'That area is for staff accounts.',
                style: TypeScale.body.copyWith(color: context.mutedForeground),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// The web's relative-time line: "5m ago", "in 2h", "–" when there is nothing.
String staffWhenLabel(String? iso) {
  if (iso == null || iso.isEmpty) return '–';
  final then = DateTime.tryParse(iso);
  if (then == null) return '–';
  final diff = DateTime.now().difference(then);
  final mins = diff.inMinutes.abs();
  final String label;
  if (mins < 60) {
    label = '${mins}m';
  } else if (mins < 60 * 24) {
    label = '${mins ~/ 60}h';
  } else if (mins < 60 * 24 * 30) {
    label = '${mins ~/ (60 * 24)}d';
  } else {
    label = '${mins ~/ (60 * 24 * 30)}mo';
  }
  return diff.isNegative ? 'in $label' : '$label ago';
}

/// A confirm before a write that cannot be quietly undone — delete, suspend,
/// revoke, rotate. The web reaches for InlineConfirm/dialogs on the same
/// actions; recoverable writes (publish, withdraw, rename) stay one tap.
Future<bool> staffConfirm(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Whether an ISO timestamp is already due.
bool staffIsDue(String iso) {
  final then = DateTime.tryParse(iso);
  return then != null && !then.isAfter(DateTime.now());
}
