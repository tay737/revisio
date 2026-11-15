/// "Maths practice sets" — a port of `src/app/(app)/library/MathsSets.tsx`.
/// A set pins generator concepts to a topic; questions are generated fresh
/// at practice time. Only maths-enabled subjects accept sets.
library revisio.features.library.maths_sets;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../../engine/staff_models.dart';
import '../../services/api_client.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';

class _Concept {
  const _Concept({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
  });
  final String id;
  final String name;
  final String category;
  final String description;

  factory _Concept.fromJson(Map<String, dynamic> j) => _Concept(
    id: j['id'] as String? ?? '',
    name: j['name'] as String? ?? '',
    category: j['category'] as String? ?? '',
    description: j['description'] as String? ?? '',
  );
}

class _MathSet {
  const _MathSet({
    required this.id,
    required this.topicId,
    required this.title,
    required this.description,
    required this.concepts,
    required this.defaultCount,
    required this.defaultDifficulty,
  });
  final String id;
  final String topicId;
  final String title;
  final String description;
  final List<String> concepts;
  final int defaultCount;
  final String defaultDifficulty;

  factory _MathSet.fromJson(Map<String, dynamic> j) => _MathSet(
    id: j['id'] as String? ?? '',
    topicId: j['topicId'] as String? ?? '',
    title: j['title'] as String? ?? '',
    description: j['description'] as String? ?? '',
    concepts: ((j['concepts'] as List?) ?? [])
        .map((c) => c is Map ? c['id'] as String? ?? '' : c.toString())
        .toList(),
    defaultCount: j['defaultCount'] as int? ?? 0,
    defaultDifficulty: j['defaultDifficulty'] as String? ?? 'mixed',
  );
}

class MathsSets extends ConsumerStatefulWidget {
  const MathsSets({super.key, required this.topics, required this.onDone});

  final List<MyTopic> topics;
  final void Function(String message) onDone;

  @override
  ConsumerState<MathsSets> createState() => _MathsSetsState();
}

class _MathsSetsState extends ConsumerState<MathsSets> {
  List<_Concept> _concepts = const [];
  bool _catalogueFailed = false;
  bool _setsFailed = false;
  String _subjectId = '';
  String _topicId = '';
  final _title = TextEditingController();
  final _description = TextEditingController();
  String _difficulty = 'mixed';
  int _count = 10;
  final Set<String> _picked = {};
  List<_MathSet> _mySets = const [];
  bool _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadCatalogue();
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _loadCatalogue() async {
    try {
      final d = await ref.read(apiClientProvider).mathsConcepts();
      if (mounted) {
        setState(() {
          _concepts = ((d['concepts'] as List?) ?? [])
              .map((c) => _Concept.fromJson(c as Map<String, dynamic>))
              .toList();
          _catalogueFailed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _catalogueFailed = true);
    }
  }

  Future<void> _loadSets(String subjectId) async {
    if (subjectId.isEmpty) {
      setState(() => _mySets = const []);
      return;
    }
    try {
      final d = await ref.read(apiClientProvider).mathsCatalogue(subjectId);
      if (mounted) {
        setState(() {
          _mySets = ((d['mySets'] as List?) ?? [])
              .map((s) => _MathSet.fromJson(s as Map<String, dynamic>))
              .toList();
          _setsFailed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _setsFailed = true);
    }
  }

  List<MyTopic> get _subjectTopics => _subjectId.isEmpty
      ? const []
      : widget.topics.where((t) => t.subjectId == _subjectId).toList();

  Map<String, List<_Concept>> get _byCategory {
    final groups = <String, List<_Concept>>{};
    for (final c in _concepts) {
      groups.putIfAbsent(c.category, () => []).add(c);
    }
    return groups;
  }

  List<Subject> get _mathsSubjects =>
      (ref.watch(subjectsProvider).valueOrNull ?? const <Subject>[])
          .where((s) => s.mathsEnabled)
          .toList();

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await ref.read(apiClientProvider).mathsAction({
        'action': 'create_set',
        'topicId': _topicId,
        'title': _title.text,
        'description': _description.text,
        'concepts': _picked.toList(),
        'defaultDifficulty': _difficulty,
        'defaultCount': _count,
      });
      if (!mounted) return;
      widget.onDone(
        '“${_title.text}” saved. Students practising this topic will now be offered it.',
      );
      setState(() {
        _title.clear();
        _description.clear();
        _picked.clear();
      });
      await _loadSets(_subjectId);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError ? e.message : 'That set did not save.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmRemove(_MathSet set) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this set?'),
        content: Text(
          '“${set.title}” and its pinned concepts will be removed. Students will no longer be offered it.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Keep it'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed == true) await _removeSet(set);
  }

  Future<void> _removeSet(_MathSet set) async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await ref.read(apiClientProvider).mathsDeleteSet(set.id);
      if (!mounted) return;
      widget.onDone('“${set.title}” removed.');
      await _loadSets(_subjectId);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError ? e.message : 'That set did not delete.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final subjects = _mathsSubjects;
    if (subjects.isEmpty) {
      return _Caption(
        'No subject has maths practice yet. A developer switches it on per subject in Admin.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _Labeled(
                'Subject (maths enabled)',
                child: DropdownButtonFormField<String>(
                  initialValue: _subjectId.isEmpty ? null : _subjectId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    isDense: true,
                    hintText: 'Choose…',
                  ),
                  items: [
                    for (final s in subjects)
                      DropdownMenuItem(value: s.id, child: Text(s.name)),
                  ],
                  onChanged: (v) {
                    setState(() {
                      _subjectId = v ?? '';
                      _topicId = '';
                    });
                    _loadSets(_subjectId);
                  },
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Labeled(
                'Topic',
                child: DropdownButtonFormField<String>(
                  initialValue: _topicId.isEmpty ? null : _topicId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    isDense: true,
                    hintText: 'Choose…',
                  ),
                  items: [
                    for (final t in _subjectTopics)
                      DropdownMenuItem(value: t.id, child: Text(t.name)),
                  ],
                  onChanged: _subjectId.isEmpty
                      ? null
                      : (v) => setState(() => _topicId = v ?? ''),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _Labeled(
                'Set title',
                child: TextField(
                  controller: _title,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    hintText: 'Brackets and equations',
                    isDense: true,
                  ),
                  style: TypeScale.body,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Labeled(
                'One line about it',
                child: TextField(
                  controller: _description,
                  decoration: const InputDecoration(
                    hintText: 'Optional',
                    isDense: true,
                  ),
                  style: TypeScale.body,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (_catalogueFailed) ...[
          _ErrorNotice(text: 'The concept catalogue could not be loaded.'),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: RevisioSecondaryButton(
              compact: true,
              onPressed: _loadCatalogue,
              child: const Text('Try again'),
            ),
          ),
          const SizedBox(height: 8),
        ],
        _LabeledText('Concepts in this set (${_picked.length})'),
        const SizedBox(height: 6),
        Container(
          constraints: const BoxConstraints(maxHeight: 256),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            border: Border.all(color: context.border.withOpacity(0.7)),
          ),
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final entry in _byCategory.entries) ...[
                Text(
                  entry.key.toUpperCase(),
                  style: TypeScale.micro.copyWith(
                    color: context.mutedForeground,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final c in entry.value)
                      _ConceptChip(
                        concept: c,
                        on: _picked.contains(c.id),
                        onTap: () => setState(() {
                          if (_picked.contains(c.id)) {
                            _picked.remove(c.id);
                          } else {
                            _picked.add(c.id);
                          }
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _LabeledText('Default difficulty')),
            const SizedBox(width: 16),
            Expanded(child: _LabeledText('Default questions: $_count')),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _Segmented(
                options: const ['easy', 'medium', 'hard', 'mixed'],
                value: _difficulty,
                onSelect: (v) => setState(() => _difficulty = v),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Slider(
                value: _count.toDouble(),
                min: 5,
                max: 30,
                divisions: 5,
                onChanged: (v) => setState(() => _count = v.round()),
              ),
            ),
          ],
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 12),
          _ErrorNotice(text: _error),
        ],
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: RevisioGoodButton(
            compact: true,
            onPressed:
                _busy ||
                    _topicId.isEmpty ||
                    _title.text.trim().isEmpty ||
                    _picked.isEmpty
                ? null
                : _submit,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const RevisioIcon('add', size: 16, color: Colors.white),
                const SizedBox(width: 8),
                Text(_busy ? 'Saving…' : 'Save set'),
              ],
            ),
          ),
        ),
        if (_setsFailed) ...[
          const SizedBox(height: 12),
          _ErrorNotice(text: 'Your sets could not be loaded.'),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: RevisioSecondaryButton(
              compact: true,
              onPressed: () => _loadSets(_subjectId),
              child: const Text('Try again'),
            ),
          ),
        ],
        if (_mySets.isNotEmpty) ...[
          const SizedBox(height: 20),
          const _LabeledText('Your sets in this subject'),
          const SizedBox(height: 8),
          for (final s in _mySets)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: context.secondary,
                borderRadius: BorderRadius.circular(RadiusTokens.md),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s.title, style: TypeScale.strong),
                        _Caption(
                          '${s.concepts.length} concepts · default ${s.defaultCount} questions · ${s.defaultDifficulty}',
                        ),
                      ],
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _busy ? null : () => _confirmRemove(s),
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
            ),
        ],
      ],
    );
  }
}

class _ConceptChip extends StatelessWidget {
  const _ConceptChip({
    required this.concept,
    required this.on,
    required this.onTap,
  });

  final _Concept concept;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: on,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 32),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: on ? context.foreground : context.secondary,
            borderRadius: BorderRadius.circular(RadiusTokens.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (on) ...[
                const RevisioIcon('correct', size: 12, color: Colors.white),
                const SizedBox(width: 4),
              ],
              Text(
                concept.name,
                style: TypeScale.caption.copyWith(
                  fontWeight: FontWeight.w600,
                  color: on ? context.background : context.foreground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({
    required this.options,
    required this.value,
    required this.onSelect,
  });

  final List<String> options;
  final String value;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        border: Border.all(color: context.border.withOpacity(0.7)),
        color: context.card.withOpacity(0.6),
      ),
      child: Row(
        children: [
          for (final o in options)
            Expanded(
              child: Semantics(
                button: true,
                selected: value == o,
                child: GestureDetector(
                  onTap: () => onSelect(o),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: value == o
                          ? context.foreground
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(RadiusTokens.sm),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      o,
                      style: TypeScale.caption.copyWith(
                        fontWeight: FontWeight.w600,
                        color: value == o
                            ? context.background
                            : context.foreground,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Labeled extends StatelessWidget {
  const _Labeled(this.label, {required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [_LabeledText(label), const SizedBox(height: 4), child],
    );
  }
}

class _LabeledText extends StatelessWidget {
  const _LabeledText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TypeScale.caption.copyWith(
        fontWeight: FontWeight.w600,
        color: context.mutedForeground,
      ),
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
