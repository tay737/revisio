/// "Cloze marking" — a port of `src/app/(app)/library/ClozeMarking.tsx`.
/// How strictly fill-the-blank answers are marked, scoped global / subject /
/// topic. Developers write every scope; other staff write subject and topic.
library revisio.features.library.cloze_marking;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/grading.dart';
import '../../engine/similarity.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';

class _Policy {
  _Policy({
    this.mode = 'legacy',
    this.typoThreshold = 0.84,
    this.shortWordThreshold = 0.92,
    this.extraSynonyms,
  });

  String mode;
  double typoThreshold;
  double shortWordThreshold;
  List<List<String>>? extraSynonyms;

  factory _Policy.fromJson(Map<String, dynamic>? j) => _Policy(
    mode: j?['mode'] as String? ?? 'legacy',
    typoThreshold: (j?['typoThreshold'] as num?)?.toDouble() ?? 0.84,
    shortWordThreshold: (j?['shortWordThreshold'] as num?)?.toDouble() ?? 0.92,
    extraSynonyms: (j?['extraSynonyms'] as List?)
        ?.map((g) => (g as List).map((w) => w.toString()).toList())
        .toList(),
  );

  Map<String, dynamic> toJson() => {
    'mode': mode,
    'typoThreshold': typoThreshold,
    'shortWordThreshold': shortWordThreshold,
    if (extraSynonyms != null) 'extraSynonyms': extraSynonyms,
  };
}

class _ScopeEntry {
  const _ScopeEntry({required this.scope, required this.policy});
  final Map<String, dynamic> scope;
  final _Policy policy;
}

class _Named {
  const _Named({required this.id, required this.name});
  final String id;
  final String name;
}

class ClozeMarking extends ConsumerStatefulWidget {
  const ClozeMarking({super.key, required this.isDeveloper});

  final bool isDeveloper;

  @override
  ConsumerState<ClozeMarking> createState() => _ClozeMarkingState();
}

class _ClozeMarkingState extends ConsumerState<ClozeMarking> {
  Map<String, dynamic>? _data;
  String _scopeType = 'global';
  String _subjectId = '';
  String _topicId = '';
  late _Policy _policy = _Policy();
  final _synonyms = TextEditingController();
  String _message = '';
  String _error = '';
  bool _busy = false;

  List<_ScopeEntry> get _scopes => [
    for (final s in (_data?['scopes'] as List?) ?? [])
      _ScopeEntry(
        scope: (s as Map)['scope'] as Map<String, dynamic>? ?? {},
        policy: _Policy.fromJson(s['policy'] as Map<String, dynamic>?),
      ),
  ];

  List<_Named> get _subjects => [
    for (final s in (_data?['subjects'] as List?) ?? [])
      _Named(
        id: (s as Map)['id'] as String? ?? '',
        name: s['name'] as String? ?? '',
      ),
  ];

  List<({String id, String name, String subjectId})> get _topics => [
    for (final t in (_data?['topics'] as List?) ?? [])
      (
        id: (t as Map)['id'] as String? ?? '',
        name: t['name'] as String? ?? '',
        subjectId: t['subjectId'] as String? ?? '',
      ),
  ];

  _Policy get _defaultPolicy =>
      _Policy.fromJson(_data?['default'] as Map<String, dynamic>?);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _synonyms.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await ref.read(apiClientProvider).gradingPolicy();
      if (!mounted) return;
      setState(() {
        _data = d;
        _policy = _defaultPolicy;
        _synonyms.text = (_policy.extraSynonyms ?? [])
            .map((g) => g.join(', '))
            .join('\n');
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError
              ? e.message
              : 'Could not load marking settings.',
        );
      }
    }
  }

  /// Load the selected scope's stored policy into the form.
  void _applyScope() {
    final data = _data;
    if (data == null) return;
    _ScopeEntry? entry;
    if (_scopeType == 'subject' && _subjectId.isNotEmpty) {
      entry = _scopes
          .where(
            (s) =>
                s.scope['type'] == 'subject' &&
                s.scope['subjectId'] == _subjectId,
          )
          .firstOrNull;
    } else if (_scopeType == 'topic' && _topicId.isNotEmpty) {
      entry = _scopes
          .where(
            (s) => s.scope['type'] == 'topic' && s.scope['topicId'] == _topicId,
          )
          .firstOrNull;
    }
    setState(() {
      // Web merges DEFAULT + entry.policy for a stored scope, and
      // DEFAULT + data.default otherwise — entry policies do not inherit
      // the deployment default.
      _policy = entry == null
          ? _Policy.fromJson(_defaultPolicy.toJson())
          : _Policy.fromJson(entry.policy.toJson());
      _synonyms.text = (_policy.extraSynonyms ?? [])
          .map((g) => g.join(', '))
          .join('\n');
    });
  }

  List<List<String>>? _parseSynonyms() {
    final groups = _synonyms.text
        .split('\n')
        .map(
          (line) => line
              .split(',')
              .map((w) => w.trim())
              .where((w) => w.isNotEmpty)
              .toList(),
        )
        .where((g) => g.length >= 2)
        .toList();
    return groups.isEmpty ? null : groups;
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = '';
      _message = '';
    });
    try {
      final scope = _scopeType == 'subject' && _subjectId.isNotEmpty
          ? {'type': 'subject', 'subjectId': _subjectId}
          : _scopeType == 'topic' && _topicId.isNotEmpty
          ? {'type': 'topic', 'topicId': _topicId}
          : {'type': 'global'};
      final body = _policy.toJson();
      final extra = _parseSynonyms();
      if (extra != null) body['extraSynonyms'] = extra;
      await ref.read(apiClientProvider).saveGradingPolicy({
        'scope': scope,
        'policy': body,
      });
      if (!mounted) return;
      setState(() => _message = 'Marking settings saved.');
      await _load();
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError
              ? e.message
              : 'Could not save marking settings.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<({String attempt, String expect, bool correct, String relation})>
  get _preview {
    const answer = 'encryption';
    const attempts = [
      ('encryption', 'exact'),
      ('encrypton', 'typo'),
      ('encode', 'synonym'),
      ('data security', 'unrelated'),
    ];
    return [
      for (final (attempt, expect) in attempts)
        () {
          // Legacy ladder decides correctness; similarity only explains
          // near-misses when similar-marking is on.
          final verdict = gradeCloze(attempt, [
            AcceptedAnswer(id: 'x', text: answer, isPrimary: true),
          ]);
          String relation;
          if (verdict.correct) {
            relation = 'exact';
          } else if (_policy.mode == 'similar') {
            final r = bestRelation(
              attempt,
              [answer],
              _policy.extraSynonyms ?? const [],
              CompareOptions(
                typoThreshold: _policy.typoThreshold,
                shortWordThreshold: _policy.shortWordThreshold,
              ),
            );
            relation = switch (r.relation) {
              WordRelation.inflection => 'inflection',
              WordRelation.synonym => 'synonym',
              WordRelation.typo => 'typo',
              _ => 'wrong',
            };
          } else {
            relation = 'wrong';
          }
          return (
            attempt: attempt,
            expect: expect,
            correct: verdict.correct,
            relation: relation,
          );
        }(),
    ];
  }

  String? get _target {
    if (_scopeType == 'subject') {
      return _subjects.where((s) => s.id == _subjectId).firstOrNull?.name;
    }
    if (_scopeType == 'topic') {
      return _topics.where((t) => t.id == _topicId).firstOrNull?.name;
    }
    return 'every subject and topic';
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return _error.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _ErrorNotice(text: _error);
    }
    final topicsForSubject = _subjectId.isEmpty
        ? const <({String id, String name, String subjectId})>[]
        : _topics.where((t) => t.subjectId == _subjectId).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error.isNotEmpty) ...[
          _ErrorNotice(text: _error),
          const SizedBox(height: 12),
        ],
        if (_message.isNotEmpty) ...[
          _GoodNotice(text: _message),
          const SizedBox(height: 12),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _LabeledText('Applies to')),
            if (_scopeType == 'subject') ...[
              const SizedBox(width: 12),
              Expanded(
                child: _Labeled(
                  'Subject',
                  child: _dropdown(
                    value: _subjectId,
                    hint: 'Choose a subject…',
                    items: [
                      for (final s in _subjects)
                        DropdownMenuItem(value: s.id, child: Text(s.name)),
                    ],
                    onChanged: (v) {
                      setState(() => _subjectId = v ?? '');
                      _applyScope();
                    },
                  ),
                ),
              ),
            ],
            if (_scopeType == 'topic') ...[
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Labeled(
                      'Subject',
                      child: _dropdown(
                        value: _subjectId,
                        hint: 'Choose a subject…',
                        items: [
                          for (final s in _subjects)
                            DropdownMenuItem(value: s.id, child: Text(s.name)),
                        ],
                        onChanged: (v) {
                          setState(() {
                            _subjectId = v ?? '';
                            _topicId = '';
                          });
                          _applyScope();
                        },
                      ),
                    ),
                    const SizedBox(height: 8),
                    _Labeled(
                      'Topic',
                      child: _dropdown(
                        value: _topicId,
                        hint: 'Choose a topic…',
                        items: [
                          for (final t in topicsForSubject)
                            DropdownMenuItem(value: t.id, child: Text(t.name)),
                        ],
                        onChanged: (v) {
                          setState(() => _topicId = v ?? '');
                          _applyScope();
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        _Segmented(
          options: const ['global', 'subject', 'topic'],
          value: _scopeType,
          disabled: (o) => o == 'global' && !widget.isDeveloper,
          onSelect: (v) {
            setState(() => _scopeType = v);
            _applyScope();
          },
        ),
        const SizedBox(height: 16),
        const _LabeledText('Strictness'),
        const SizedBox(height: 8),
        _Segmented(
          options: const ['legacy', 'similar'],
          labels: const {'legacy': 'Exact', 'similar': 'Warn on similar'},
          value: _policy.mode,
          onSelect: (v) => setState(() => _policy.mode = v),
        ),
        const SizedBox(height: 6),
        _Caption(
          _policy.mode == 'legacy'
              ? 'A near-miss counts as wrong, and there is no warning. That is how marking works today.'
              : 'A near-miss is still marked wrong, but the learner is told how close it was and shown the exact answer.',
        ),
        if (_policy.mode == 'similar') ...[
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Labeled(
                  'Typo strictness: ${_policy.typoThreshold.toStringAsFixed(2)}',
                  child: Slider(
                    value: _policy.typoThreshold.clamp(0.75, 0.95),
                    min: 0.75,
                    max: 0.95,
                    divisions: 20,
                    onChanged: (v) => setState(() => _policy.typoThreshold = v),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Labeled(
                  'Same-meaning words (one group per line)',
                  child: TextField(
                    controller: _synonyms,
                    minLines: 3,
                    maxLines: 6,
                    style: TypeScale.caption.copyWith(fontFamily: 'monospace'),
                    decoration: const InputDecoration(
                      hintText: 'phishing, fraud\ndata, information',
                      isDense: true,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          _Caption(
            'Higher accepts fewer typos. Words under five letters always need a closer match.',
          ),
          const SizedBox(height: 4),
          _Caption(
            'Comma-separated words that mean the same in this subject. Words not listed are never treated as synonyms.',
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: context.secondary,
              borderRadius: BorderRadius.circular(RadiusTokens.md),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'HOW “ENCRYPTION” WOULD BE MARKED',
                  style: TypeScale.micro.copyWith(
                    color: context.mutedForeground,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 6),
                for (final p in _preview)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        RevisioIcon(
                          p.correct ? 'correct' : 'close',
                          size: 13,
                          color: p.relation == 'exact'
                              ? context.goodStrong
                              : p.relation == 'wrong'
                              ? context.mutedForeground
                              : context.goldInk,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '“${p.attempt}”',
                          style: TypeScale.caption.copyWith(
                            fontFamily: 'monospace',
                          ),
                        ),
                        const Spacer(),
                        _Caption(
                          p.relation == 'exact'
                              ? 'correct'
                              : p.relation == 'wrong'
                              ? 'wrong'
                              : 'wrong · ${p.relation} warning',
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            RevisioGoodButton(
              compact: true,
              onPressed:
                  _busy ||
                      (_scopeType == 'subject' && _subjectId.isEmpty) ||
                      (_scopeType == 'topic' && _topicId.isEmpty)
                  ? null
                  : _save,
              child: Text(_busy ? 'Saving…' : 'Save marking settings'),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Caption(
                _scopeType == 'global'
                    ? 'Applies everywhere a subject or topic does not override it.'
                    : 'Overrides the wider setting for ${_target ?? '–'}.',
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _dropdown({
    required String value,
    required String hint,
    required List<DropdownMenuItem<String>> items,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      initialValue: value.isEmpty ? null : value,
      isExpanded: true,
      decoration: InputDecoration(hintText: hint, isDense: true),
      items: items,
      onChanged: onChanged,
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({
    required this.options,
    required this.value,
    required this.onSelect,
    this.labels,
    this.disabled,
  });

  final List<String> options;
  final String value;
  final ValueChanged<String> onSelect;
  final Map<String, String>? labels;
  final bool Function(String)? disabled;

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
                enabled: !(disabled?.call(o) ?? false),
                child: GestureDetector(
                  onTap: disabled?.call(o) ?? false ? null : () => onSelect(o),
                  child: Opacity(
                    opacity: disabled?.call(o) ?? false ? 0.4 : 1,
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
                        labels?[o] ?? o,
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

class _GoodNotice extends StatelessWidget {
  const _GoodNotice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: context.goodSoft,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        border: Border.all(color: context.good.withOpacity(0.4)),
      ),
      child: Text(
        text,
        style: TypeScale.caption.copyWith(color: context.goodStrong),
      ),
    );
  }
}
