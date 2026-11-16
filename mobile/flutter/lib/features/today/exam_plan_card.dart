/// Exam countdown & reflection (#17) — a port of the web dashboard's
/// `ExamPlanCard`: the nearest active plan's deadline, pace and weakest
/// topics, a compact create/edit form, and the post-exam reflection prompt.
/// A visible date is the retention hook: it turns "someday" revision into
/// a schedule.
///
/// Self-contained fetch like the other retention cards: student-only,
/// skeleton while loading, an error card with retry on failure.
library revisio.features.today.exam_plan_card;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/design.dart';
import '../../design/revisio_icons.dart';
import '../../engine/models.dart';
import '../../services/api_client.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';

class ExamPlanCard extends ConsumerStatefulWidget {
  const ExamPlanCard({super.key});

  @override
  ConsumerState<ExamPlanCard> createState() => _ExamPlanCardState();
}

class _ExamPlanCardState extends ConsumerState<ExamPlanCard> {
  List<ExamPlan>? _plans;
  bool _loadError = false;
  bool _busy = false;
  String _error = '';
  String? _confirmRemove;

  // Plan form — null means closed.
  bool _formOpen = false;
  ExamPlan? _editing;
  final _title = TextEditingController();
  String? _examDate; // YYYY-MM-DD
  String _subjectId = '';
  final _dailyTarget = TextEditingController(text: '10');

  // Reflection form for the most recent past-due plan.
  final _score = TextEditingController();
  final _maxScore = TextEditingController();
  final _note = TextEditingController();
  bool _reflectBusy = false;
  String _reflectError = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _dailyTarget.dispose();
    _score.dispose();
    _maxScore.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loadError = false);
    try {
      final plans = await ref.read(apiClientProvider).examPlans();
      if (mounted) {
        setState(
          () => _plans = plans.where((p) => p.status == 'active').toList(),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _plans = null;
          _loadError = true;
        });
      }
    }
  }

  void _resetForm() => setState(() {
    _formOpen = false;
    _editing = null;
    _title.clear();
    _examDate = null;
    _subjectId = '';
    _dailyTarget.text = '10';
    _error = '';
  });

  void _startEdit(ExamPlan p) => setState(() {
    _editing = p;
    _formOpen = true;
    _title.text = p.title;
    _examDate = p.examDate.length >= 10 ? p.examDate.substring(0, 10) : p.examDate;
    _subjectId = p.subjectId ?? '';
    _dailyTarget.text = '${p.dailyTarget}';
    _error = '';
  });

  Future<void> _save() async {
    final title = _title.text.trim();
    final date = _examDate;
    if (title.isEmpty || date == null) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    final body = <String, dynamic>{
      'title': title,
      'examDate': date,
      'subjectId': _subjectId.isEmpty ? null : _subjectId,
      'dailyTarget': int.tryParse(_dailyTarget.text.trim()) ?? 10,
    };
    try {
      final api = ref.read(apiClientProvider);
      if (_editing != null) {
        await api.updateExamPlan(_editing!.id, body);
      } else {
        await api.createExamPlan(body);
      }
      if (!mounted) return;
      _resetForm();
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e is ApiError ? e.message : 'Could not save the plan.';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(String id) async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await ref.read(apiClientProvider).deleteExamPlan(id);
      if (!mounted) return;
      setState(() {
        _confirmRemove = null;
        _busy = false;
      });
      _resetForm();
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _confirmRemove = null;
          _busy = false;
          _error = e is ApiError ? e.message : 'Could not remove the plan.';
        });
      }
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _examDate != null
          ? DateTime.tryParse(_examDate!) ?? now
          : now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 10),
    );
    if (picked != null && mounted) {
      setState(
        () => _examDate =
            '${picked.year.toString().padLeft(4, '0')}-'
            '${picked.month.toString().padLeft(2, '0')}-'
            '${picked.day.toString().padLeft(2, '0')}',
      );
    }
  }

  Future<void> _reflect(ExamPlan plan, {bool justClose = false}) async {
    setState(() {
      _reflectBusy = true;
      _reflectError = '';
    });
    try {
      final body = <String, dynamic>{};
      if (!justClose) {
        final s = double.tryParse(_score.text.trim());
        final m = double.tryParse(_maxScore.text.trim());
        final n = _note.text.trim();
        if (s != null) body['score'] = s;
        if (m != null) body['maxScore'] = m;
        if (n.isNotEmpty) body['note'] = n;
      }
      await ref.read(apiClientProvider).reflectExamPlan(plan.id, body);
      _score.clear();
      _maxScore.clear();
      _note.clear();
      await _load();
    } catch (e) {
      if (mounted) {
        setState(
          () => _reflectError = e is ApiError
              ? e.message
              : (justClose
                    ? 'Could not close the plan.'
                    : 'Could not save the reflection.'),
        );
      }
    } finally {
      if (mounted) setState(() => _reflectBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(meProvider).valueOrNull?.role;
    final plans = _plans;
    if (role != 'student') return const SizedBox.shrink();
    if (plans == null) {
      if (_loadError) {
        return _Card(
          title: 'Exam countdown',
          children: [
            Text(
              'We couldn’t load your exam plans. Check your connection '
              'and try again.',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: RevisioSecondaryButton(
                compact: true,
                onPressed: _load,
                child: const Text('Try again'),
              ),
            ),
          ],
        );
      }
      return Container(
        height: 96,
        decoration: BoxDecoration(
          color: context.secondary,
          borderRadius: BorderRadius.circular(RadiusTokens.lg),
        ),
      );
    }

    // Local-calendar check: the server clamps daysLeft at 0, so "the exam
    // was yesterday" has to be read off the date itself.
    bool examPassed(ExamPlan p) {
      final today = DateTime.now();
      final day = DateTime(today.year, today.month, today.day);
      final exam = DateTime.tryParse('${p.examDate}T00:00:00');
      return exam != null && exam.isBefore(day);
    }

    final upcoming = plans.where((p) => !examPassed(p)).toList()
      ..sort((a, b) => a.daysLeft.compareTo(b.daysLeft));
    final plan = upcoming.isEmpty ? null : upcoming.first;
    // The most recent plan whose exam date has passed still sits 'active'
    // until the student reflects — that is the post-exam prompt.
    final pastPlan = plans.where(examPassed).toList()
      ..sort((a, b) => b.examDate.compareTo(a.examDate));
    final past = pastPlan.isEmpty ? null : pastPlan.first;

    return _Card(
      title: 'Exam countdown',
      trailing: plan != null
          ? _Chip(
              plan.daysLeft == 0 ? 'Today' : '${plan.daysLeft}d left',
            )
          : null,
      children: [
        if (_formOpen) _buildForm()
        else if (plan != null) _buildPlan(plan)
        else _buildEmpty(),
        if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _error,
              style: TypeScale.fine.copyWith(color: context.destructiveInk),
            ),
          ),
        if (plan != null && !_formOpen) ...[
          const SizedBox(height: 12),
          Divider(color: context.border, height: 1),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => context.push('/cram'),
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'A date makes the queue personal. '),
                  TextSpan(
                    text: 'Cram mode',
                    style: TextStyle(
                      color: context.foreground,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                  const TextSpan(text: ' focuses the next session.'),
                ],
              ),
              style: TypeScale.fine.copyWith(
                color: context.mutedForeground,
              ),
            ),
          ),
        ],
        if (past != null) ...[
          const SizedBox(height: 16),
          Divider(color: context.border, height: 1),
          const SizedBox(height: 12),
          _buildReflection(past),
        ],
      ],
    );
  }

  Widget _buildPlan(ExamPlan plan) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(plan.title, style: TypeScale.body),
        const SizedBox(height: 4),
        Text(
          plan.daysLeft == 0
              ? 'The exam is today.'
              : '${plan.daysLeft} ${plan.daysLeft == 1 ? 'day' : 'days'} to '
                    'go · ${plan.topicsRemaining} of ${plan.topicsTotal} '
                    'topics still open',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 4),
        Text(
          plan.perDayNeeded > 0
              ? 'About ${plan.perDayNeeded} topics a day keeps you on pace'
                    '${plan.onTrack ? ' — you are on track.' : '.'}'
              : 'Every topic is mastered. Well ahead of the date.',
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
        if (plan.weakestTopics.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final t in plan.weakestTopics)
                _Chip('${t.name} · ${t.remaining} left'),
            ],
          ),
        ],
        const SizedBox(height: 10),
        Row(
          children: [
            RevisioGhostButton(
              onPressed: () => _startEdit(plan),
              child: const Text('Edit'),
            ),
            if (_confirmRemove == plan.id) ...[
              RevisioGhostButton(
                enabled: !_busy,
                onPressed: () => _remove(plan.id),
                child: Text(_busy ? 'Removing…' : 'Yes, remove it'),
              ),
              RevisioGhostButton(
                onPressed: () => setState(() => _confirmRemove = null),
                child: const Text('Keep it'),
              ),
            ] else
              RevisioGhostButton(
                onPressed: () => setState(() => _confirmRemove = plan.id),
                child: const Text('Remove plan'),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildEmpty() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        'Pick an exam date and Revisio paces your topics to it — how many '
        'a day, what is left, where you are weakest.',
        style: TypeScale.caption.copyWith(color: context.mutedForeground),
      ),
      const SizedBox(height: 12),
      Align(
        alignment: Alignment.centerLeft,
        child: RevisioSecondaryButton(
          compact: true,
          onPressed: () => setState(() {
            _editing = null;
            _formOpen = true;
          }),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              RevisioIcon('add', size: 14),
              SizedBox(width: 6),
              Text('Set an exam date'),
            ],
          ),
        ),
      ),
    ],
  );

  Widget _buildForm() {
    final subjects = ref.watch(meProvider).valueOrNull?.subjects ?? const [];
    final canSave =
        _title.text.trim().isNotEmpty && _examDate != null && !_busy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RevisioField(
          label: 'Exam or test',
          child: RevisioTextInput(
            controller: _title,
            placeholder: 'GCSE Maths — Paper 1',
            maxLength: 120,
            onChanged: (_) => setState(() {}),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'DATE',
                    style: TypeScale.fine.copyWith(
                      color: context.mutedForeground,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.04,
                    ),
                  ),
                  const SizedBox(height: 6),
                  InkWell(
                    onTap: _pickDate,
                    borderRadius: BorderRadius.circular(RadiusTokens.md),
                    child: Container(
                      height: 48,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: context.card,
                        borderRadius: BorderRadius.circular(RadiusTokens.md),
                        border: Border.all(color: context.border),
                      ),
                      alignment: Alignment.centerLeft,
                      child: Text(
                        _examDate != null
                            ? _examDateLabel(_examDate!)
                            : 'Pick a date',
                        style: TypeScale.body,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Today or later — the countdown starts the day you '
                    'save it.',
                    style: TypeScale.fine.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: RevisioField(
                label: 'Daily target (topics)',
                child: RevisioTextInput(
                  controller: _dailyTarget,
                  placeholder: '10',
                  keyboardType: TextInputType.number,
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'How many topics a day you can realistically give it. Revisio '
          'compares this with what the date needs.',
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
        if (subjects.isNotEmpty) ...[
          const SizedBox(height: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'SUBJECT (OPTIONAL)',
                style: TypeScale.fine.copyWith(
                  color: context.mutedForeground,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.04,
                ),
              ),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                initialValue: _subjectId,
                isExpanded: true,
                decoration: const InputDecoration(
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                items: [
                  const DropdownMenuItem(
                    value: '',
                    child: Text('Whole syllabus'),
                  ),
                  for (final s in subjects)
                    DropdownMenuItem(value: s.id, child: Text(s.name)),
                ],
                onChanged: (v) => setState(() => _subjectId = v ?? ''),
              ),
              const SizedBox(height: 4),
              Text(
                'Narrow it to one subject, or leave it open.',
                style: TypeScale.fine.copyWith(
                  color: context.mutedForeground,
                ),
              ),
            ],
          ),
        ],
        if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _error,
              style: TypeScale.fine.copyWith(color: context.destructiveInk),
            ),
          ),
        const SizedBox(height: 12),
        Row(
          children: [
            RevisioButton(
              compact: true,
              enabled: canSave,
              loading: _busy,
              onPressed: _save,
              child: Text(
                _editing != null ? 'Save changes' : 'Start the countdown',
              ),
            ),
            const SizedBox(width: 8),
            RevisioGhostButton(
              onPressed: _busy ? null : _resetForm,
              child: Text(_editing != null ? 'Cancel' : 'Not now'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildReflection(ExamPlan plan) {
    final r = plan.reflection;
    if (_confirmRemove == plan.id) {
      return Row(
        children: [
          Expanded(
            child: Text(
              'The exam is over',
              style: TypeScale.strong.copyWith(fontSize: 15),
            ),
          ),
          RevisioGhostButton(
            enabled: !_busy,
            onPressed: () => _remove(plan.id),
            child: Text(_busy ? 'Removing…' : 'Yes, remove it'),
          ),
          RevisioGhostButton(
            onPressed: () => setState(() => _confirmRemove = null),
            child: const Text('Keep it'),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'The exam is over',
                style: TypeScale.strong.copyWith(fontSize: 15),
              ),
            ),
            RevisioGhostButton(
              onPressed: () => setState(() => _confirmRemove = plan.id),
              child: const Text('Remove plan'),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          '${plan.title} — sat ${_examDateLabel(plan.examDate)}. A minute '
          'of honesty here is what makes the next countdown smarter.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 8),
        if (r != null)
          Text(
            '${r.score != null ? 'You logged ${_fmtScore(r.score)}${r.maxScore != null ? '/${_fmtScore(r.maxScore)}' : ''}. ' : 'Reflection saved. '}'
            '${r.note != null && r.note!.isNotEmpty ? '“${r.note!.length > 140 ? '${r.note!.substring(0, 140)}…' : r.note}”' : ''}',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          )
        else ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: RevisioField(
                  label: 'Score (optional)',
                  child: RevisioTextInput(
                    controller: _score,
                    placeholder: '72',
                    keyboardType: TextInputType.number,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: RevisioField(
                  label: 'Out of (optional)',
                  child: RevisioTextInput(
                    controller: _maxScore,
                    placeholder: '100',
                    keyboardType: TextInputType.number,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          RevisioField(
            label: "What helped, what didn't (optional)",
            child: TextFormField(
              controller: _note,
              maxLength: 2000,
              maxLines: 3,
              style: const TextStyle(fontSize: 16),
              cursorColor: context.foreground,
              decoration: InputDecoration(
                hintText:
                    'Cram mode the week before worked. Wish I’d started '
                    'the essay topics earlier.',
                hintStyle: TextStyle(
                  color: context.mutedForeground.withOpacity(0.75),
                  fontSize: 16,
                ),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                filled: true,
                fillColor: context.card,
                counterText: '',
              ),
            ),
          ),
          if (_reflectError.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _reflectError,
                style: TypeScale.fine.copyWith(color: context.destructiveInk),
              ),
            ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              RevisioButton(
                compact: true,
                loading: _reflectBusy,
                onPressed: () => _reflect(plan),
                child: const Text('Save reflection'),
              ),
              RevisioGhostButton(
                enabled: !_reflectBusy,
                onPressed: () => _reflect(plan, justClose: true),
                child: const Text('Just close it'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

// ── shared bits ─────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.title, this.trailing, required this.children});

  final String title;
  final Widget? trailing;
  final List<Widget> children;

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
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Text(
        label,
        style: TypeScale.fine.copyWith(color: context.foreground),
      ),
    );
  }
}

/// examDate/exam plan dates are plain calendar dates — render the day only.
String _examDateLabel(String iso) {
  final d = DateTime.tryParse(
    '${iso.length >= 10 ? iso.substring(0, 10) : iso}T12:00:00Z',
  );
  if (d == null) return iso;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final sameYear = d.year == DateTime.now().year;
  return '${d.day} ${months[d.month - 1]}${sameYear ? '' : ' ${d.year}'}';
}

String _fmtScore(double? v) =>
    v == null ? '' : (v == v.roundToDouble() ? '${v.toInt()}' : '$v');
