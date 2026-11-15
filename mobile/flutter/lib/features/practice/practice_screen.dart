/// Practice — the standalone maths tool, a port of
/// `src/app/(app)/practice/page.tsx`. Deliberately outside the review loop:
/// nothing answered here is scheduled, logged or worth SRS — only the closing
/// `award_xp` touches XP and the league week.
library revisio.features.practice.practice_screen;

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';

class _Concept {
  const _Concept({required this.id, required this.name, this.description = ''});
  final String id;
  final String name;
  final String description;

  factory _Concept.fromJson(Map<String, dynamic> j) => _Concept(
    id: j['id'] as String? ?? '',
    name: j['name'] as String? ?? '',
    description: j['description'] as String? ?? '',
  );
}

class _PracticeSet {
  const _PracticeSet({
    required this.id,
    required this.title,
    required this.conceptCount,
    required this.defaultCount,
    required this.defaultDifficulty,
  });
  final String id;
  final String title;
  final int conceptCount;
  final int defaultCount;
  final String defaultDifficulty;

  factory _PracticeSet.fromJson(Map<String, dynamic> j) => _PracticeSet(
    id: j['id'] as String? ?? '',
    title: j['title'] as String? ?? '',
    conceptCount: j['conceptCount'] as int? ?? 0,
    defaultCount: j['defaultCount'] as int? ?? 0,
    defaultDifficulty: j['defaultDifficulty'] as String? ?? '',
  );
}

class _PracticeTopic {
  const _PracticeTopic({
    required this.id,
    required this.name,
    this.description = '',
    this.sets = const [],
  });
  final String id;
  final String name;
  final String description;
  final List<_PracticeSet> sets;

  factory _PracticeTopic.fromJson(Map<String, dynamic> j) => _PracticeTopic(
    id: j['id'] as String? ?? '',
    name: j['name'] as String? ?? '',
    description: j['description'] as String? ?? '',
    sets: ((j['sets'] as List?) ?? [])
        .map((s) => _PracticeSet.fromJson(s as Map<String, dynamic>))
        .toList(),
  );
}

class _Question {
  const _Question({
    required this.questionId,
    required this.conceptId,
    required this.conceptName,
    required this.difficulty,
    required this.marks,
    required this.prompt,
  });
  final String questionId;
  final String conceptId;
  final String conceptName;
  final String difficulty;
  final int marks;
  final String prompt;

  factory _Question.fromJson(Map<String, dynamic> j) => _Question(
    questionId: j['questionId'] as String? ?? '',
    conceptId: j['conceptId'] as String? ?? '',
    conceptName: j['conceptName'] as String? ?? '',
    difficulty: j['difficulty'] as String? ?? 'mixed',
    marks: j['marks'] as int? ?? 1,
    prompt: j['prompt'] as String? ?? '',
  );
}

class _MarkResult {
  const _MarkResult({
    required this.questionId,
    required this.correct,
    required this.answer,
    required this.solution,
    required this.marks,
  });
  final String questionId;
  final bool correct;
  final String answer;
  final String solution;
  final int marks;

  factory _MarkResult.fromJson(Map<String, dynamic> j) => _MarkResult(
    questionId: j['questionId'] as String? ?? '',
    correct: j['correct'] == true,
    answer: j['answer'] as String? ?? '',
    solution: j['solution'] as String? ?? '',
    marks: j['marks'] as int? ?? 0,
  );
}

class _LogEntry {
  const _LogEntry({required this.q, required this.r});
  final _Question q;
  final _MarkResult r;
}

enum _Phase { pick, run, done }

class PracticeScreen extends ConsumerStatefulWidget {
  const PracticeScreen({super.key});

  @override
  ConsumerState<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends ConsumerState<PracticeScreen> {
  List<Subject>? _subjects;
  bool _subjectsFailed = false;
  String? _subjectId;
  List<_Concept> _catalogue = const [];
  List<_PracticeTopic>? _topics;
  bool _catalogueFailed = false;
  final Set<String> _pickedTopics = {};
  final Set<String> _pickedConcepts = {};
  String _difficulty = 'mixed';
  int _count = 10;
  _Phase _phase = _Phase.pick;
  List<_Question> _paper = const [];
  int _idx = 0;
  String _input = '';
  _MarkResult? _result;
  bool _busy = false;
  String _error = '';
  final List<_LogEntry> _log = [];
  ({int xpAwarded, bool capped})? _xp;

  @override
  void initState() {
    super.initState();
    _loadSubjects();
  }

  Future<void> _loadSubjects() async {
    try {
      final list = await ref.read(apiClientProvider).subjects();
      if (!mounted) return;
      final enabled = list.where((s) => s.mathsEnabled).toList();
      setState(() {
        _subjects = list;
        if (enabled.length == 1) _subjectId = enabled.first.id;
      });
    } catch (_) {
      if (mounted) setState(() => _subjectsFailed = true);
    }
  }

  Future<void> _loadCatalogue(String subjectId) async {
    setState(() {
      _topics = null;
      _catalogueFailed = false;
      _pickedTopics.clear();
    });
    try {
      final d = await ref.read(apiClientProvider).mathsCatalogue(subjectId);
      if (!mounted) return;
      setState(() {
        _catalogue = ((d['concepts'] as List?) ?? [])
            .map((c) => _Concept.fromJson(c as Map<String, dynamic>))
            .toList();
        _topics = ((d['topics'] as List?) ?? [])
            .map((t) => _PracticeTopic.fromJson(t as Map<String, dynamic>))
            .toList();
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _catalogueFailed = true;
          _catalogue = const [];
          _topics = const [];
        });
      }
    }
  }

  void _selectSubject(String id) {
    setState(() => _subjectId = id);
    _loadCatalogue(id);
  }

  Future<void> _start() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final d = await ref.read(apiClientProvider).mathsAction({
        'action': 'start',
        'topicIds': _pickedTopics.toList(),
        if (_pickedConcepts.isNotEmpty) 'conceptIds': _pickedConcepts.toList(),
        'difficulty': _difficulty,
        'count': _count,
      });
      if (!mounted) return;
      setState(() {
        _paper = ((d['paper'] as List?) ?? [])
            .map((q) => _Question.fromJson(q as Map<String, dynamic>))
            .toList();
        _idx = 0;
        _log.clear();
        _input = '';
        _result = null;
        _phase = _Phase.run;
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError
              ? e.message
              : 'We could not start that session.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  _Question? get _question => _idx < _paper.length ? _paper[_idx] : null;

  ({int correct, int marks, int maxMarks}) get _score {
    final correct = _log.where((l) => l.r.correct).length;
    final marks = _log.fold<int>(
      0,
      (n, l) => n + (l.r.correct ? l.r.marks : 0),
    );
    final maxMarks = _log.fold<int>(0, (n, l) => n + l.r.marks);
    return (correct: correct, marks: marks, maxMarks: maxMarks);
  }

  Future<void> _submit() async {
    final q = _question;
    if (q == null || _busy || _result != null) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final d = await ref.read(apiClientProvider).mathsAction({
        'action': 'mark',
        'answers': [
          {'questionId': q.questionId, 'answer': _input},
        ],
      });
      if (!mounted) return;
      final results = (d['results'] as List?) ?? [];
      if (results.isEmpty) return;
      final r = _MarkResult.fromJson(results.first as Map<String, dynamic>);
      setState(() {
        _result = r;
        _log.add(_LogEntry(q: q, r: r));
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError
              ? e.message
              : 'That answer did not reach the server.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _next() {
    if (_idx + 1 >= _paper.length) {
      setState(() => _phase = _Phase.done);
      // Practice XP: award once at completion. Never writes a review log
      // or moves the SRS schedule.
      final score = _score;
      ref
          .read(apiClientProvider)
          .mathsAction({
            'action': 'award_xp',
            'marks': score.marks,
            'maxMarks': score.maxMarks,
            'correct': score.correct,
            'total': _log.length,
          })
          .then((d) {
            if (mounted) {
              setState(
                () => _xp = (
                  xpAwarded: d['xpAwarded'] as int? ?? 0,
                  capped: d['capped'] == true,
                ),
              );
            }
          })
          .catchError((_) {});
      return;
    }
    setState(() {
      _idx += 1;
      _input = '';
      _result = null;
      _error = '';
    });
  }

  void _restart() {
    setState(() {
      _phase = _Phase.pick;
      _paper = const [];
      _idx = 0;
      _input = '';
      _result = null;
      _log.clear();
      _xp = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final subjects = _subjects;
    if (subjects == null) {
      if (_subjectsFailed) {
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _Caption('Subjects could not be loaded.'),
              const SizedBox(height: 12),
              RevisioSecondaryButton(
                compact: true,
                onPressed: () {
                  setState(() => _subjectsFailed = false);
                  _loadSubjects();
                },
                child: const Text('Try again'),
              ),
            ],
          ),
        );
      }
      return const Center(child: CircularProgressIndicator());
    }
    final mathsSubjects = subjects.where((s) => s.mathsEnabled).toList();

    if (_phase == _Phase.run && _question != null) {
      return _runView(_question!);
    }
    if (_phase == _Phase.done) {
      return _doneView();
    }
    return _pickView(mathsSubjects);
  }

  // ── picker ────────────────────────────────────────────────────────────────

  Widget _pickView(List<Subject> mathsSubjects) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: context.secondary,
                borderRadius: BorderRadius.circular(RadiusTokens.md),
              ),
              child: const Center(child: RevisioIcon('practice', size: 20)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Practice', style: TypeScale.display),
                  Text(
                    'Generate maths questions. Your schedule stays out of it.',
                    style: TypeScale.caption.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (mathsSubjects.isEmpty)
          _Card(
            child: Column(
              children: [
                const RevisioIcon('practice', size: 28),
                const SizedBox(height: 12),
                Text(
                  'No subject has maths practice yet',
                  style: TypeScale.strong,
                ),
                const SizedBox(height: 6),
                _Caption(
                  'A developer or teacher turns maths practice on per subject. Once one has it, its topics appear here.',
                ),
              ],
            ),
          )
        else
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Label('Subject'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in mathsSubjects)
                      _Chip(
                        label: s.name,
                        icon: 'correct',
                        active: _subjectId == s.id,
                        onTap: () => _selectSubject(s.id),
                      ),
                  ],
                ),
                if (_subjectId != null) ...[
                  const SizedBox(height: 20),
                  const _Label('Topics'),
                  const SizedBox(height: 8),
                  if (_catalogueFailed)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _Caption('Topics could not be loaded.'),
                        const SizedBox(height: 8),
                        RevisioSecondaryButton(
                          compact: true,
                          onPressed: () => _loadCatalogue(_subjectId!),
                          child: const Text('Try again'),
                        ),
                      ],
                    )
                  else if (_topics == null)
                    _Caption('Loading…')
                  else if (_topics!.isEmpty)
                    _Caption('No topics reach you in this subject yet.'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final t in _topics ?? const <_PracticeTopic>[])
                        _Chip(
                          label: t.sets.isEmpty
                              ? t.name
                              : '${t.name} ${t.sets.length}',
                          icon: 'correct',
                          active: _pickedTopics.contains(t.id),
                          onTap: () => setState(() {
                            if (_pickedTopics.contains(t.id)) {
                              _pickedTopics.remove(t.id);
                            } else {
                              _pickedTopics.add(t.id);
                            }
                          }),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  _Caption(
                    _pickedTopics.isEmpty
                        ? 'No topic selected. Questions come from every concept.'
                        : 'Question sets a teacher pinned to these topics are counted.',
                  ),
                  const SizedBox(height: 12),
                  _FocusConcepts(
                    catalogue: _catalogue,
                    picked: _pickedConcepts,
                    onToggle: (id) => setState(() {
                      if (_pickedConcepts.contains(id)) {
                        _pickedConcepts.remove(id);
                      } else {
                        _pickedConcepts.add(id);
                      }
                    }),
                  ),
                  const SizedBox(height: 20),
                  const _Label('Difficulty'),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(RadiusTokens.md),
                      border: Border.all(color: context.border),
                      color: context.card.withOpacity(0.6),
                    ),
                    child: Row(
                      children: [
                        for (final d in const [
                          'easy',
                          'medium',
                          'hard',
                          'mixed',
                        ])
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() => _difficulty = d),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: _difficulty == d
                                      ? context.foreground
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(
                                    RadiusTokens.sm,
                                  ),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  d,
                                  style: TypeScale.caption.copyWith(
                                    fontWeight: FontWeight.w600,
                                    color: _difficulty == d
                                        ? context.background
                                        : context.foreground,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _Label('Questions: $_count'),
                  Slider(
                    value: _count.toDouble(),
                    min: 5,
                    max: 30,
                    divisions: 5,
                    label: '$_count',
                    onChanged: (v) => setState(() => _count = v.round()),
                  ),
                  const SizedBox(height: 8),
                  RevisioGoodButton(
                    onPressed: _busy ? null : _start,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const RevisioIcon(
                          'start',
                          size: 18,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 8),
                        Text(_busy ? 'Generating…' : 'Generate questions'),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 16),
        if (_error.isNotEmpty) _Notice(tone: _NoticeTone.bad, text: _error),
        const SizedBox(height: 8),
        Center(
          child: Text.rich(
            TextSpan(
              children: [
                const TextSpan(
                  text: 'Looking for your spaced reviews? That is ',
                ),
                TextSpan(
                  text: 'Review',
                  style: const TextStyle(
                    color: Colors.blue,
                    decoration: TextDecoration.underline,
                  ),
                ),
                const TextSpan(text: '. Practice here never changes it.'),
              ],
            ),
            textAlign: TextAlign.center,
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
        ),
      ],
    );
  }

  // ── runner ────────────────────────────────────────────────────────────────

  Widget _runView(_Question q) {
    final score = _score;
    final last = _idx + 1 >= _paper.length;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${_idx + 1} / ${_paper.length}',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: context.secondary,
                borderRadius: BorderRadius.circular(RadiusTokens.pill),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const RevisioIcon('correct', size: 14),
                  const SizedBox(width: 4),
                  Text(
                    '${score.correct}/${_log.length} correct',
                    style: TypeScale.fine.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _Meter(percent: _idx / _paper.length * 100),
        const SizedBox(height: 16),
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _ActiveChip(q.conceptName),
                  _Chip(
                    label: q.difficulty,
                    onTap: () {},
                    active: false,
                    small: true,
                  ),
                  _Caption('${q.marks} ${q.marks == 1 ? 'mark' : 'marks'}'),
                ],
              ),
              const SizedBox(height: 20),
              MarkdownBody(data: q.prompt, styleSheet: _mdStyle(context)),
              const SizedBox(height: 20),
              if (_result == null) ...[
                TextField(
                  controller: _answerController,
                  onChanged: (v) => _input = v,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  decoration: const InputDecoration(
                    hintText: 'Type your answer',
                  ),
                  style: TypeScale.leadAiry,
                ),
                const SizedBox(height: 12),
                RevisioGoodButton(
                  onPressed: _input.trim().isEmpty || _busy ? null : _submit,
                  child: Text(_busy ? 'Marking…' : 'Check answer'),
                ),
                const SizedBox(height: 8),
                Center(
                  child: _Caption(
                    'Fractions like 3/4, or expressions like 2x+6, all mark.',
                  ),
                ),
              ] else ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: _result!.correct
                        ? context.goodSoft
                        : context.destructive.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(RadiusTokens.md),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _result!.correct
                                  ? context.good
                                  : context.destructive,
                            ),
                            child: Center(
                              child: RevisioIcon(
                                _result!.correct ? 'correct' : 'close',
                                size: 16,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _result!.correct ? 'Correct' : 'Not quite',
                            style: TypeScale.leadAiry.copyWith(
                              fontWeight: FontWeight.w600,
                              color: _result!.correct
                                  ? context.goodStrong
                                  : context.destructiveInk,
                            ),
                          ),
                          const Spacer(),
                          _Caption(
                            '${_result!.marks} ${_result!.marks == 1 ? 'mark' : 'marks'}',
                          ),
                        ],
                      ),
                      if (!_result!.correct) ...[
                        const SizedBox(height: 10),
                        _Inset(
                          label: 'Answer',
                          child: Text(
                            _result!.answer,
                            style: TypeScale.caption,
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      _Inset(
                        label: 'Worked solution',
                        child: MarkdownBody(
                          data: _result!.solution,
                          styleSheet: _mdStyle(context),
                        ),
                      ),
                      const SizedBox(height: 16),
                      RevisioButton(
                        onPressed: _next,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(last ? 'See results' : 'Next'),
                            const SizedBox(width: 6),
                            const RevisioIcon('next', size: 17),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 12),
                _Notice(tone: _NoticeTone.bad, text: _error),
              ],
            ],
          ),
        ),
      ],
    );
  }

  final TextEditingController _answerController = TextEditingController();

  // ── report ────────────────────────────────────────────────────────────────

  Widget _doneView() {
    final score = _score;
    final pct = score.maxMarks > 0
        ? (score.marks / score.maxMarks * 100).round()
        : 0;
    final missed = _log.where((l) => !l.r.correct).toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _Card(
          child: Column(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: context.secondary,
                  shape: BoxShape.circle,
                ),
                child: const Center(child: RevisioIcon('target', size: 22)),
              ),
              const SizedBox(height: 16),
              Text('Practice complete', style: TypeScale.tagline),
              const SizedBox(height: 8),
              Text(
                '$pct%',
                style: TypeScale.displayMd.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 4),
              _Caption(
                '${score.correct} of ${_log.length} correct · ${score.marks} of ${score.maxMarks} marks',
              ),
              _Caption('Practice never touches your review schedule.'),
              if (_xp != null && _xp!.xpAwarded > 0) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: context.secondary,
                    borderRadius: BorderRadius.circular(RadiusTokens.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const RevisioIcon('xp', size: 14),
                      const SizedBox(width: 6),
                      Text(
                        '+${_xp!.xpAwarded} XP'
                        '${_xp!.capped ? ' · capped this hour' : ''}',
                        style: TypeScale.caption.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              RevisioButton(
                onPressed: _restart,
                child: const Text('New session'),
              ),
            ],
          ),
        ),
        if (missed.isNotEmpty) ...[
          const SizedBox(height: 16),
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Worth another look', style: TypeScale.strong),
                const SizedBox(height: 4),
                _Caption(
                  'The ones that went wrong, with their worked solutions.',
                ),
                const SizedBox(height: 12),
                for (final l in missed)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.secondary,
                      borderRadius: BorderRadius.circular(RadiusTokens.md),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _Chip(
                              label: l.q.conceptName,
                              onTap: () {},
                              active: false,
                              small: true,
                            ),
                            const Spacer(),
                            Text.rich(
                              TextSpan(
                                children: [
                                  const TextSpan(text: 'Answer: '),
                                  TextSpan(
                                    text: l.r.answer,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                              style: TypeScale.captionS.copyWith(
                                color: context.mutedForeground,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        MarkdownBody(
                          data: l.q.prompt,
                          styleSheet: _mdStyle(context),
                        ),
                        const SizedBox(height: 4),
                        MarkdownBody(
                          data: l.r.solution,
                          styleSheet: _mdStyle(context).copyWith(
                            p: _mdStyle(context).p
                                ?.copyWith(color: context.mutedForeground),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    _answerController.dispose();
    super.dispose();
  }
}

// ── shared bits ─────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

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
      child: child,
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

class _Label extends StatelessWidget {
  const _Label(this.text);

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

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.onTap,
    required this.active,
    this.icon,
    this.small = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool active;
  final String? icon;
  final bool small;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          constraints: BoxConstraints(minHeight: small ? 32 : kTouchTarget),
          padding: EdgeInsets.symmetric(
            horizontal: small ? 10 : 14,
            vertical: small ? 4 : 8,
          ),
          decoration: BoxDecoration(
            color: active ? context.foreground : context.secondary,
            borderRadius: BorderRadius.circular(RadiusTokens.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (active && icon != null) ...[
                RevisioIcon(icon!, size: 13, color: context.background),
                const SizedBox(width: 4),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.caption.copyWith(
                    fontWeight: FontWeight.w600,
                    color: active ? context.background : context.foreground,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActiveChip extends StatelessWidget {
  const _ActiveChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: context.foreground,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Text(
        label,
        style: TypeScale.caption.copyWith(
          fontWeight: FontWeight.w600,
          color: context.background,
        ),
      ),
    );
  }
}

class _FocusConcepts extends StatelessWidget {
  const _FocusConcepts({
    required this.catalogue,
    required this.picked,
    required this.onToggle,
  });

  final List<_Concept> catalogue;
  final Set<String> picked;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        leading: const RevisioIcon('filter', size: 15),
        title: Row(
          children: [
            Text(
              'Focus concepts',
              style: TypeScale.caption.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(width: 8),
            _MiniChip(picked.isEmpty ? 'all' : '${picked.length}'),
          ],
        ),
        children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            childAspectRatio: 2.6,
            children: [
              for (final c in catalogue)
                _ConceptTile(
                  concept: c,
                  on: picked.contains(c.id),
                  onTap: () => onToggle(c.id),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniChip extends StatelessWidget {
  const _MiniChip(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Text(text, style: TypeScale.fine),
    );
  }
}

class _ConceptTile extends StatelessWidget {
  const _ConceptTile({
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
          constraints: const BoxConstraints(minHeight: kTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: on ? context.secondary : null,
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            border: Border.all(
              color: on ? context.foreground : context.border.withOpacity(0.7),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 16,
                height: 16,
                margin: const EdgeInsets.only(top: 1),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: on ? context.foreground : context.borderStrong,
                  ),
                  color: on ? context.foreground : null,
                ),
                child: on
                    ? const Center(
                        child: RevisioIcon(
                          'correct',
                          size: 11,
                          color: Colors.white,
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      concept.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TypeScale.caption.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      concept.description,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TypeScale.fine.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Meter extends StatelessWidget {
  const _Meter({required this.percent});

  final double percent;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 8,
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: (percent / 100).clamp(0.0, 1.0),
        child: Container(
          decoration: BoxDecoration(
            color: context.foreground,
            borderRadius: BorderRadius.circular(RadiusTokens.pill),
          ),
        ),
      ),
    );
  }
}

class _Inset extends StatelessWidget {
  const _Inset({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: TypeScale.micro.copyWith(
              color: context.mutedForeground,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 2),
          child,
        ],
      ),
    );
  }
}

enum _NoticeTone { bad }

class _Notice extends StatelessWidget {
  const _Notice({required this.tone, required this.text});

  final _NoticeTone tone;
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

MarkdownStyleSheet _mdStyle(BuildContext context) => MarkdownStyleSheet(
  p: TypeScale.body.copyWith(height: 1.5),
  strong: const TextStyle(fontWeight: FontWeight.w700),
  code: TextStyle(
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: context.secondary,
  ),
  codeblockDecoration: BoxDecoration(
    color: context.secondary,
    borderRadius: BorderRadius.circular(RadiusTokens.sm),
  ),
);
