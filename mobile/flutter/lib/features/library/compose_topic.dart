/// "Write a topic" — a port of `src/app/(app)/library/ComposeTopic.tsx`.
/// Notes and questions together, so they arrive as one topic.
library revisio.features.library.compose_topic;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';

enum _Kind { cloze, flashcard, mcq }

class _Draft {
  _Draft(this.kind);

  _Kind kind;
  String textWithBlank = '';
  String prompt = '';
  String question = '';
  String answers = '';
  String options = '';
  int correctIdx = 0;
}

class ComposeTopic extends ConsumerStatefulWidget {
  const ComposeTopic({
    super.key,
    required this.subjects,
    required this.onCreated,
  });

  final List<Subject> subjects;
  final void Function(String message) onCreated;

  @override
  ConsumerState<ComposeTopic> createState() => _ComposeTopicState();
}

class _ComposeTopicState extends ConsumerState<ComposeTopic> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  String _subjectId = '';
  final _lessonTitle = TextEditingController();
  final _lessonDetailed = TextEditingController();
  final _lessonSummary = TextEditingController();
  final _lessonSpecRefs = TextEditingController();
  final List<_Draft> _drafts = [];
  bool _publish = false;
  bool _busy = false;
  String _error = '';
  bool _notesOpen = true;
  bool _questionsOpen = false;

  @override
  void dispose() {
    for (final c in [
      _name,
      _description,
      _lessonTitle,
      _lessonDetailed,
      _lessonSummary,
      _lessonSpecRefs,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await ref.read(apiClientProvider).createContent({
        'subjectId': _subjectId.isNotEmpty
            ? _subjectId
            : widget.subjects.firstOrNull?.id,
        'name': _name.text,
        'description': _description.text,
        'publish': _publish,
        'lessons': _lessonTitle.text.isNotEmpty
            ? [
                {
                  'title': _lessonTitle.text,
                  'detailedMd': _lessonDetailed.text,
                  'summaryMd': _lessonSummary.text,
                  'specRefs': _lessonSpecRefs.text,
                },
              ]
            : <Map<String, dynamic>>[],
        'cards':
            [
                  for (final d in _drafts)
                    {
                      'kind': d.kind.name,
                      if (d.textWithBlank.isNotEmpty)
                        'textWithBlank': d.textWithBlank,
                      if (d.prompt.isNotEmpty) 'prompt': d.prompt,
                      if (d.question.isNotEmpty) 'question': d.question,
                      if (d.kind != _Kind.mcq && d.answers.isNotEmpty)
                        'answers': d.answers
                            .split('|')
                            .map((s) => s.trim())
                            .where((s) => s.isNotEmpty)
                            .toList(),
                      if (d.kind == _Kind.mcq)
                        'options': d.options
                            .split('\n')
                            .map((s) => s.trim())
                            .where((s) => s.isNotEmpty)
                            .toList(),
                      if (d.kind == _Kind.mcq) 'correctIdx': d.correctIdx,
                    },
                ]
                .where(
                  (c) =>
                      c['textWithBlank'] != null ||
                      c['prompt'] != null ||
                      c['question'] != null,
                )
                .toList(),
      });
      if (!mounted) return;
      widget.onCreated(_publish ? 'Sent for review.' : 'Saved to your topics.');
      setState(() {
        _name.clear();
        _description.clear();
        _lessonTitle.clear();
        _lessonDetailed.clear();
        _lessonSummary.clear();
        _lessonSpecRefs.clear();
        _drafts.clear();
        _publish = false;
        _notesOpen = true;
        _questionsOpen = false;
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError ? e.message : 'That topic did not save.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _Field(
                label: 'Topic',
                controller: _name,
                hint: 'Pattern recognition',
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Field(
                label: 'Subject',
                child: DropdownButtonFormField<String>(
                  initialValue: widget.subjects.any((s) => s.id == _subjectId)
                      ? _subjectId
                      : null,
                  isExpanded: true,
                  decoration: const InputDecoration(isDense: true),
                  items: [
                    for (final s in widget.subjects)
                      DropdownMenuItem(value: s.id, child: Text(s.name)),
                  ],
                  onChanged: (v) => setState(() => _subjectId = v ?? ''),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _Field(
          label: 'One line about it',
          controller: _description,
          hint: 'Optional',
        ),
        const SizedBox(height: 12),
        _Disclosure(
          icon: 'notes',
          title: 'Notes',
          count: _lessonTitle.text.isEmpty ? 0 : 1,
          open: _notesOpen,
          onToggle: () => setState(() => _notesOpen = !_notesOpen),
          child: Column(
            children: [
              _Input(
                controller: _lessonTitle,
                hint: 'Where I read this from',
                onChanged: () => setState(() {}),
              ),
              const SizedBox(height: 8),
              _Area(
                controller: _lessonDetailed,
                hint: '## Heading\n- a point worth remembering',
                minLines: 5,
              ),
              const SizedBox(height: 8),
              _Area(
                controller: _lessonSummary,
                hint: 'Summary: the version cram shows you',
                minLines: 3,
              ),
              const SizedBox(height: 8),
              _Input(
                controller: _lessonSpecRefs,
                hint: 'Spec references, e.g. 1.1.1',
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        _Disclosure(
          icon: 'target',
          title: 'Questions',
          count: _drafts.length,
          open: _questionsOpen,
          onToggle: () => setState(() => _questionsOpen = !_questionsOpen),
          child: Column(
            children: [
              for (var i = 0; i < _drafts.length; i++)
                _DraftCard(
                  key: ObjectKey(_drafts[i]),
                  draft: _drafts[i],
                  index: i,
                  onChanged: () => setState(() {}),
                  onRemove: () => setState(() => _drafts.removeAt(i)),
                  onKind: (k) => setState(() => _drafts[i] = _Draft(k)),
                ),
              Align(
                alignment: Alignment.centerLeft,
                child: RevisioSecondaryButton(
                  compact: true,
                  onPressed: () =>
                      setState(() => _drafts.add(_Draft(_Kind.cloze))),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      RevisioIcon('add', size: 15),
                      SizedBox(width: 6),
                      Text('Add a question'),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Semantics(
          button: true,
          toggled: _publish,
          child: InkWell(
            onTap: () => setState(() => _publish = !_publish),
            borderRadius: BorderRadius.circular(RadiusTokens.sm),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: Checkbox(
                      value: _publish,
                      onChanged: (v) => setState(() => _publish = v ?? false),
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Submit for students to see',
                          style: TypeScale.caption,
                        ),
                        _Caption('Someone checks it before it goes out.'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 12),
          _ErrorNotice(text: _error),
        ],
        const SizedBox(height: 12),
        RevisioGoodButton(
          onPressed: _busy || _name.text.trim().isEmpty ? null : _submit,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              RevisioIcon(
                _publish ? 'publish' : 'add',
                size: 16,
                color: Colors.white,
              ),
              const SizedBox(width: 8),
              Text(
                _busy
                    ? 'Saving…'
                    : _publish
                    ? 'Submit for review'
                    : 'Save topic',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DraftCard extends StatefulWidget {
  const _DraftCard({
    super.key,
    required this.draft,
    required this.index,
    required this.onChanged,
    required this.onRemove,
    required this.onKind,
  });

  final _Draft draft;
  final int index;
  final VoidCallback onChanged;
  final VoidCallback onRemove;
  final ValueChanged<_Kind> onKind;

  @override
  State<_DraftCard> createState() => _DraftCardState();
}

class _DraftCardState extends State<_DraftCard> {
  late final Map<String, TextEditingController> _fields = {
    'textWithBlank': TextEditingController(text: widget.draft.textWithBlank),
    'prompt': TextEditingController(text: widget.draft.prompt),
    'question': TextEditingController(text: widget.draft.question),
    'answers': TextEditingController(text: widget.draft.answers),
    'options': TextEditingController(text: widget.draft.options),
  };

  void _sync(String field, String value) {
    final d = widget.draft;
    switch (field) {
      case 'textWithBlank':
        d.textWithBlank = value;
      case 'prompt':
        d.prompt = value;
      case 'question':
        d.question = value;
      case 'answers':
        d.answers = value;
      case 'options':
        d.options = value;
    }
    widget.onChanged();
  }

  @override
  void dispose() {
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.draft;
    Widget field(String name, {String? hint, int minLines = 1}) {
      final c = _fields[name]!;
      if (minLines == 1) {
        return _Input(
          controller: c,
          hint: hint ?? '',
          onChanged: () => _sync(name, c.text),
        );
      }
      return _Area(
        controller: c,
        hint: hint ?? '',
        minLines: minLines,
        onChanged: () => _sync(name, c.text),
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Column(
        children: [
          Row(
            children: [
              SizedBox(
                width: 170,
                child: DropdownButtonFormField<_Kind>(
                  initialValue: d.kind,
                  isDense: true,
                  decoration: const InputDecoration(isDense: true),
                  items: const [
                    DropdownMenuItem(
                      value: _Kind.cloze,
                      child: Text('Fill the blank'),
                    ),
                    DropdownMenuItem(
                      value: _Kind.flashcard,
                      child: Text('Flashcard'),
                    ),
                    DropdownMenuItem(
                      value: _Kind.mcq,
                      child: Text('Multiple choice'),
                    ),
                  ],
                  onChanged: (v) => v == null ? null : widget.onKind(v),
                ),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: widget.onRemove,
                icon: const RevisioIcon('remove', size: 14),
                label: const Text('Remove'),
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, kTouchTarget),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  foregroundColor: context.destructiveInk,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (d.kind == _Kind.cloze)
            field(
              'textWithBlank',
              hint: 'The powerhouse of the cell is the ____',
            ),
          if (d.kind == _Kind.flashcard)
            field('prompt', hint: 'What should you be able to answer?'),
          if (d.kind == _Kind.mcq) ...[
            field('question', hint: 'Question'),
            const SizedBox(height: 8),
            field('options', hint: 'One option per line', minLines: 3),
            const SizedBox(height: 8),
            Text(
              'Correct option (count from 0)',
              style: TypeScale.caption.copyWith(
                fontWeight: FontWeight.w600,
                color: context.mutedForeground,
              ),
            ),
            const SizedBox(height: 4),
            SizedBox(
              width: 110,
              child: TextFormField(
                initialValue: '${d.correctIdx}',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(isDense: true),
                onChanged: (v) {
                  d.correctIdx = int.tryParse(v) ?? 0;
                  widget.onChanged();
                },
              ),
            ),
          ],
          if (d.kind != _Kind.mcq)
            field(
              'answers',
              hint: d.kind == _Kind.cloze
                  ? 'Accepted answers, separated by |'
                  : 'Model answer',
            ),
        ],
      ),
    );
  }
}

class _Disclosure extends StatelessWidget {
  const _Disclosure({
    required this.icon,
    required this.title,
    required this.count,
    required this.open,
    required this.onToggle,
    required this.child,
  });

  final String icon;
  final String title;
  final int count;
  final bool open;
  final VoidCallback onToggle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            button: true,
            expanded: open,
            child: InkWell(
              onTap: onToggle,
              borderRadius: BorderRadius.circular(RadiusTokens.sm),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    RevisioIcon(icon, size: 15),
                    const SizedBox(width: 8),
                    Text(
                      title,
                      style: TypeScale.caption.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: context.card,
                        borderRadius: BorderRadius.circular(RadiusTokens.pill),
                        border: Border.all(color: context.border),
                      ),
                      child: Text('$count', style: TypeScale.fine),
                    ),
                    const Spacer(),
                    RevisioIcon(
                      open ? 'collapse' : 'expand',
                      size: 14,
                      color: context.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (open) ...[const SizedBox(height: 12), child],
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, this.controller, this.child, this.hint});

  final String label;
  final TextEditingController? controller;
  final Widget? child;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TypeScale.caption.copyWith(
            fontWeight: FontWeight.w600,
            color: context.mutedForeground,
          ),
        ),
        const SizedBox(height: 4),
        child ?? _Input(controller: controller!, hint: hint ?? ''),
      ],
    );
  }
}

class _Input extends StatelessWidget {
  const _Input({required this.controller, required this.hint, this.onChanged});

  final TextEditingController controller;
  final String hint;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: (_) => onChanged?.call(),
      decoration: InputDecoration(hintText: hint, isDense: true),
      style: TypeScale.body,
    );
  }
}

class _Area extends StatelessWidget {
  const _Area({
    required this.controller,
    required this.hint,
    this.minLines = 4,
    this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final int minLines;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: (_) => onChanged?.call(),
      minLines: minLines,
      maxLines: 12,
      decoration: InputDecoration(hintText: hint, isDense: true),
      style: TypeScale.body.copyWith(height: 1.5),
    );
  }
}

class _Caption extends StatelessWidget {
  const _Caption(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TypeScale.caption.copyWith(color: context.mutedForeground),
    );
  }
}

class _ErrorNotice extends StatelessWidget {
  const _ErrorNotice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: context.destructive.withOpacity(0.12),
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        border: Border.all(color: context.destructive.withOpacity(0.4)),
      ),
      child: Text(
        text,
        style: TypeScale.caption.copyWith(color: context.destructiveInk),
      ),
    );
  }
}
