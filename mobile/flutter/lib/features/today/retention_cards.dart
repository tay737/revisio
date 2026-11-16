/// Student retention cards (#13) — ports of the web dashboard's
/// `ChallengesCard` and `GoalsCard`. Both are student-only surfaces that
/// fetch their own data and render nothing on error: a missing strip must
/// never look like a broken dashboard.
library revisio.features.today.retention_cards;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/design.dart';
import '../../design/revisio_icons.dart';
import '../../engine/models.dart';
import '../../services/api_client.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';

/// The shared card chrome — same surface treatment as the other Today tiles.
class _Card extends StatelessWidget {
  const _Card({required this.title, required this.trailing, this.children});

  final String title;
  final Widget? trailing;
  final List<Widget>? children;

  @override
  Widget build(BuildContext context) {
    return Container(
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
          if (children != null) ...[
            const SizedBox(height: 12),
            ...children!,
          ],
        ],
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.done});

  final bool done;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done ? context.goodSoft : context.secondary,
      ),
      child: Center(
        child: RevisioIcon(
          done ? 'correct' : 'target',
          size: 14,
          color: done ? context.goodStrong : context.mutedForeground,
        ),
      ),
    );
  }
}

class _ThinProgress extends StatelessWidget {
  const _ThinProgress({required this.fraction});

  final double fraction;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(RadiusTokens.pill),
      child: SizedBox(
        height: 4,
        child: Stack(
          children: [
            Container(color: context.secondary),
            FractionallySizedBox(
              widthFactor: fraction.clamp(0.0, 1.0),
              child: Container(color: context.primary),
            ),
          ],
        ),
      ),
    );
  }
}

// ── challenges ──────────────────────────────────────────────────────────────

/// `ChallengesCard` — read-only: the server already paid XP + notified the
/// moment a metric crossed the line.
class ChallengesCard extends ConsumerStatefulWidget {
  const ChallengesCard({super.key});

  @override
  ConsumerState<ChallengesCard> createState() => _ChallengesCardState();
}

class _ChallengesCardState extends ConsumerState<ChallengesCard> {
  List<Challenge>? _items;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await ref.read(apiClientProvider).challenges();
      if (mounted) setState(() => _items = items);
    } catch (_) {
      if (mounted) setState(() => _items = const []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    if (items == null || items.isEmpty) return const SizedBox.shrink();

    final daily = items.where((c) => c.period == 'daily').toList();
    final weekly = items.where((c) => c.period == 'weekly').toList();
    final done = items.where((c) => c.completed).length;

    return _Card(
      title: 'Challenges',
      trailing: Text(
        '$done of ${items.length} done',
        style: TypeScale.fine.copyWith(color: context.mutedForeground),
      ),
      children: [
        for (final (label, rows) in [('Today', daily), ('This week', weekly)])
          if (rows.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                label,
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
            ),
            for (final c in rows) _ChallengeRow(challenge: c),
            const SizedBox(height: 8),
          ],
        Text(
          'Finished challenges pay out XP and a note in your notifications.',
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
      ],
    );
  }
}

class _ChallengeRow extends StatelessWidget {
  const _ChallengeRow({required this.challenge});

  final Challenge challenge;

  @override
  Widget build(BuildContext context) {
    final c = challenge;
    final shown = c.progress.clamp(0, c.target);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StatusDot(done: c.completed),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        c.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TypeScale.caption.copyWith(
                          color: c.completed
                              ? context.mutedForeground
                              : context.foreground,
                          decoration: c.completed
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '$shown/${c.target}',
                      style: TypeScale.fine.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                _ThinProgress(
                  fraction: c.target > 0 ? c.progress / c.target : 0,
                ),
              ],
            ),
          ),
          if (!c.completed) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 8,
                vertical: 2,
              ),
              decoration: BoxDecoration(
                color: context.secondary,
                borderRadius: BorderRadius.circular(RadiusTokens.pill),
              ),
              child: Text(
                '+${c.rewardXp} XP',
                style: TypeScale.fine.copyWith(color: context.foreground),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── goals ───────────────────────────────────────────────────────────────────

const _goalKinds = [
  ('reviews', 'Reviews', 'cards reviewed'),
  ('correct', 'Correct answers', 'correct answers'),
  ('xp', 'XP', 'XP earned'),
  ('streak', 'Day streak', 'days in a row'),
  ('topics_mastered', 'Topics mastered', 'topics fully mastered'),
  ('exam_score', 'Exam score', 'best exam score, %'),
];

(String, String) _kindMeta(String kind) {
  for (final k in _goalKinds) {
    if (k.$1 == kind) return (k.$2, k.$3);
  }
  return (kind, '');
}

/// Deadline is a plain calendar date — render the day only, no timezone slide.
String _deadlineLabel(String iso) {
  final d = DateTime.tryParse('${iso.length >= 10 ? iso.substring(0, 10) : iso}T12:00:00Z');
  if (d == null) return iso;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final sameYear = d.year == DateTime.now().year;
  return '${d.day} ${months[d.month - 1]}${sameYear ? '' : ' ${d.year}'}';
}

/// `GoalsCard` — the student's own targets. Create/edit/delete; completion is
/// automatic server-side, so there is deliberately no "mark done".
class GoalsCard extends ConsumerStatefulWidget {
  const GoalsCard({super.key});

  @override
  ConsumerState<GoalsCard> createState() => _GoalsCardState();
}

class _GoalsCardState extends ConsumerState<GoalsCard> {
  List<Goal>? _goals;
  bool _loadError = false;
  bool _busy = false;
  String? _error;

  // Form state — `_formOpen` false means the list is showing.
  bool _formOpen = false;
  String? _editingId;
  final _title = TextEditingController();
  String _kind = 'reviews';
  final _target = TextEditingController();
  String? _deadline; // YYYY-MM-DD
  String? _confirmId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _target.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final goals = await ref.read(apiClientProvider).goals();
      if (mounted) {
        setState(() {
          _goals = goals;
          _loadError = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadError = true);
    }
  }

  void _openForm({Goal? edit}) {
    setState(() {
      _formOpen = true;
      _editingId = edit?.id;
      _title.text = edit?.title ?? '';
      _kind = edit?.kind ?? 'reviews';
      _target.text = edit == null ? '' : '${edit.target}';
      _deadline = edit?.deadline;
      _error = null;
      _confirmId = null;
    });
  }

  void _closeForm() => setState(() {
    _formOpen = false;
    _editingId = null;
    _title.clear();
    _target.clear();
    _deadline = null;
    _error = null;
  });

  Future<void> _save() async {
    final title = _title.text.trim();
    final target = int.tryParse(_target.text.trim());
    if (title.isEmpty || target == null || target <= 0) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = <String, dynamic>{
      'title': title,
      'target': target,
      'deadline': _deadline,
    };
    try {
      final api = ref.read(apiClientProvider);
      final goals = _editingId == null
          ? await api.createGoal({...body, 'kind': _kind})
          : await api.updateGoal(_editingId!, body);
      if (!mounted) return;
      setState(() {
        _goals = goals;
        _busy = false;
      });
      _closeForm();
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e is ApiError ? e.message : 'Could not save the goal.';
        });
      }
    }
  }

  Future<void> _remove(String id) async {
    setState(() => _busy = true);
    try {
      final goals = await ref.read(apiClientProvider).deleteGoal(id);
      if (!mounted) return;
      setState(() {
        _goals = goals;
        _busy = false;
        _confirmId = null;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not delete the goal.';
        });
      }
    }
  }

  Future<void> _pickDeadline() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _deadline != null
          ? DateTime.tryParse(_deadline!) ?? now
          : now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 10),
    );
    if (picked != null && mounted) {
      setState(
        () => _deadline =
            '${picked.year.toString().padLeft(4, '0')}-'
            '${picked.month.toString().padLeft(2, '0')}-'
            '${picked.day.toString().padLeft(2, '0')}',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Student-only, like the web card — goals are a learner object.
    final role = ref.watch(meProvider).valueOrNull?.role;
    final goals = _goals;
    if (role != 'student' || goals == null || _loadError) {
      return const SizedBox.shrink();
    }

    final open = goals.where((g) => !g.completed).toList();
    final done = goals.where((g) => g.completed).toList();

    return _Card(
      title: 'Goals',
      trailing: goals.isNotEmpty
          ? Text(
              '${done.length} of ${goals.length} done',
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            )
          : null,
      children: [
        if (_formOpen) _buildForm() else ..._buildList(open, done),
      ],
    );
  }

  List<Widget> _buildList(List<Goal> open, List<Goal> done) {
    if (open.isEmpty && done.isEmpty) {
      return [
        Text(
          'Set something to aim at — Revisio counts it live and pays out '
          'when you land it.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 12),
        _newGoalButton(),
      ];
    }
    return [
      for (final g in open) _goalRow(g),
      if (done.isNotEmpty) ...[
        if (open.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 4),
            child: Text(
              'Done',
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
          ),
        for (final g in done) _goalRow(g),
      ],
      const SizedBox(height: 12),
      _newGoalButton(),
    ];
  }

  Widget _newGoalButton() => RevisioSecondaryButton(
    compact: true,
    onPressed: _openForm,
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        RevisioIcon('add', size: 14),
        SizedBox(width: 6),
        Text('New goal'),
      ],
    ),
  );

  Widget _goalRow(Goal g) {
    final (label, unit) = _kindMeta(g.kind);
    final pct = g.target > 0
        ? (g.progress / g.target).clamp(0.0, 1.0)
        : 0.0;
    final shown = g.progress.clamp(0, g.target);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StatusDot(done: g.completed),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        g.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TypeScale.caption.copyWith(
                          color: g.completed
                              ? context.mutedForeground
                              : context.foreground,
                          decoration: g.completed
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '$shown/${g.target}',
                      style: TypeScale.fine.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                _ThinProgress(fraction: pct),
                const SizedBox(height: 4),
                Text(
                  '$unit${g.deadline != null ? ' · by ${_deadlineLabel(g.deadline!)}' : ''}',
                  style: TypeScale.fine.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          if (!g.completed) ...[
            if (_confirmId == g.id)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextButton(
                    onPressed: _busy ? null : () => _remove(g.id),
                    child: Text(
                      'Delete',
                      style: TypeScale.fine.copyWith(
                        color: context.destructiveInk,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _confirmId = null),
                    child: const Text('Keep'),
                  ),
                ],
              )
            else
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Edit ${g.title}',
                    icon: RevisioIcon(
                      'edit',
                      size: 16,
                      color: context.mutedForeground,
                    ),
                    onPressed: () => _openForm(edit: g),
                  ),
                  IconButton(
                    tooltip: 'Delete ${g.title}',
                    icon: RevisioIcon(
                      'remove',
                      size: 16,
                      color: context.mutedForeground,
                    ),
                    onPressed: () => setState(() => _confirmId = g.id),
                  ),
                ],
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildForm() {
    final canSave =
        _title.text.trim().isNotEmpty &&
        (int.tryParse(_target.text.trim()) ?? 0) > 0 &&
        !_busy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RevisioField(
          label: 'Goal',
          child: RevisioTextInput(
            controller: _title,
            placeholder: '100 reviews this month',
            onChanged: (_) => setState(() {}),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Counts',
                    style: TypeScale.fine.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 4),
                  DropdownButtonFormField<String>(
                    initialValue: _kind,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final k in _goalKinds)
                        DropdownMenuItem(value: k.$1, child: Text(k.$2)),
                    ],
                    onChanged: _editingId != null
                        ? null
                        : (v) => setState(() => _kind = v ?? _kind),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: RevisioField(
                label: 'Target',
                child: RevisioTextInput(
                  controller: _target,
                  placeholder: '100',
                  keyboardType: TextInputType.number,
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _pickDeadline,
            icon: RevisioIcon(
              'clock',
              size: 14,
              color: context.mutedForeground,
            ),
            label: Text(
              _deadline != null
                  ? 'By ${_deadlineLabel(_deadline!)}'
                  : 'Deadline (optional)',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            ),
          ),
        ),
        Text(
          '${_kindMeta(_kind).$2}${_editingId != null ? ' · the kind cannot change once set' : ''}',
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              _error!,
              style: TypeScale.fine.copyWith(color: context.destructive),
            ),
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            RevisioButton(
              compact: true,
              enabled: canSave,
              loading: _busy,
              onPressed: _save,
              child: Text(_editingId != null ? 'Save goal' : 'Add goal'),
            ),
            const SizedBox(width: 8),
            RevisioGhostButton(
              onPressed: _busy ? null : _closeForm,
              child: const Text('Cancel'),
            ),
          ],
        ),
      ],
    );
  }
}
