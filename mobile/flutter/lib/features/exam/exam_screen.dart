/// Exam simulator — a port of `src/app/(app)/exam/page.tsx`. Builds a paper
/// from exam topics, takes answers question-by-question, marks against the
/// mark scheme, then teaches how the marks were awarded: AO splits, points
/// hit and missed, examiner notes, mark scheme and model answers.
library revisio.features.exam.exam_screen;

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';

class _ExamTopic {
  const _ExamTopic({required this.id, required this.name});
  final String id;
  final String name;

  factory _ExamTopic.fromJson(Map<String, dynamic> j) => _ExamTopic(
    id: j['id'] as String? ?? '',
    name: j['name'] as String? ?? '',
  );
}

class _ExamQuestion {
  const _ExamQuestion({
    required this.id,
    required this.kind,
    required this.questionMd,
    required this.marks,
    required this.options,
    required this.board,
    required this.sourceYear,
    required this.aoSplit,
    required this.qwcMarks,
    required this.questionRef,
  });
  final String id;
  final String kind;
  final String questionMd;
  final int marks;
  final List<({String id, String text})>? options;
  final String board;
  final int? sourceYear;
  final List<({String ao, int marks})>? aoSplit;
  final int qwcMarks;
  final String questionRef;

  factory _ExamQuestion.fromJson(Map<String, dynamic> j) {
    final aoRaw = j['aoSplit'] as List?;
    final optRaw = j['options'] as List?;
    return _ExamQuestion(
      id: j['id'] as String? ?? '',
      kind: j['kind'] as String? ?? 'free_response',
      questionMd: j['questionMd'] as String? ?? '',
      marks: j['marks'] as int? ?? 0,
      options: optRaw == null
          ? null
          : optRaw
                .map(
                  (o) => (
                    id: (o as Map<String, dynamic>)['id'] as String? ?? '',
                    text: o['text'] as String? ?? '',
                  ),
                )
                .toList(),
      board: j['board'] as String? ?? '',
      sourceYear: j['sourceYear'] as int?,
      aoSplit: aoRaw == null
          ? null
          : aoRaw
                .map(
                  (a) => (
                    ao: (a as Map<String, dynamic>)['ao'] as String? ?? '',
                    marks: a['marks'] as int? ?? 0,
                  ),
                )
                .toList(),
      qwcMarks: j['qwcMarks'] as int? ?? 0,
      questionRef: j['questionRef'] as String? ?? '',
    );
  }
}

class _StoredPaper {
  const _StoredPaper({
    required this.id,
    required this.title,
    required this.kind,
    required this.board,
    required this.series,
    required this.paperCode,
    required this.totalMarks,
    required this.durationMinutes,
  });
  final String id;
  final String title;
  final String kind;
  final String board;
  final String series;
  final String paperCode;
  final int? totalMarks;
  final int? durationMinutes;

  factory _StoredPaper.fromJson(Map<String, dynamic> j) => _StoredPaper(
    id: j['id'] as String? ?? '',
    title: j['title'] as String? ?? '',
    kind: j['kind'] as String? ?? 'other',
    board: j['board'] as String? ?? '',
    series: j['series'] as String? ?? '',
    paperCode: j['paperCode'] as String? ?? '',
    totalMarks: j['totalMarks'] as int?,
    durationMinutes: j['durationMinutes'] as int?,
  );
}

class _Attempt {
  const _Attempt({
    required this.id,
    required this.score,
    required this.maxScore,
    required this.createdAt,
  });
  final String id;
  final int score;
  final int maxScore;
  final String createdAt;

  factory _Attempt.fromJson(Map<String, dynamic> j) => _Attempt(
    id: j['id'] as String? ?? '',
    score: j['score'] as int? ?? 0,
    maxScore: j['maxScore'] as int? ?? 0,
    createdAt: j['createdAt'] as String? ?? '',
  );
}

class _PaperDoc {
  const _PaperDoc({required this.title, required this.contentMd});
  final String title;
  final String contentMd;

  factory _PaperDoc.fromJson(Map<String, dynamic> j) => _PaperDoc(
    title: j['title'] as String? ?? '',
    contentMd: j['contentMd'] as String? ?? '',
  );
}

class _MarkedDetail {
  const _MarkedDetail({
    required this.questionId,
    required this.awarded,
    required this.marks,
    required this.correct,
    required this.feedback,
    this.userAnswer,
    required this.questionRef,
    required this.aoSplit,
    required this.modelAnswerMd,
    required this.markSchemeMd,
    required this.markingNotesMd,
    required this.qwcMarks,
    required this.matchedPhrases,
    required this.missedPhrases,
  });
  final String questionId;
  final int awarded;
  final int marks;
  final bool correct;
  final String feedback;
  final String? userAnswer;
  final String questionRef;
  final List<({String ao, int marks})>? aoSplit;
  final String modelAnswerMd;
  final String markSchemeMd;
  final String markingNotesMd;
  final int qwcMarks;
  final List<String> matchedPhrases;
  final List<String> missedPhrases;

  factory _MarkedDetail.fromJson(Map<String, dynamic> j) {
    final aoRaw = j['aoSplit'] as List?;
    List<String> strs(String key) =>
        ((j[key] as List?) ?? []).map((e) => e.toString()).toList();
    return _MarkedDetail(
      questionId: j['questionId'] as String? ?? '',
      awarded: j['awarded'] as int? ?? 0,
      marks: j['marks'] as int? ?? 0,
      correct: j['correct'] == true,
      feedback: j['feedback'] as String? ?? '',
      userAnswer: j['userAnswer'] as String?,
      questionRef: j['questionRef'] as String? ?? '',
      aoSplit: aoRaw == null
          ? null
          : aoRaw
                .map(
                  (a) => (
                    ao: (a as Map<String, dynamic>)['ao'] as String? ?? '',
                    marks: a['marks'] as int? ?? 0,
                  ),
                )
                .toList(),
      modelAnswerMd: j['modelAnswerMd'] as String? ?? '',
      markSchemeMd: j['markSchemeMd'] as String? ?? '',
      markingNotesMd: j['markingNotesMd'] as String? ?? '',
      qwcMarks: j['qwcMarks'] as int? ?? 0,
      matchedPhrases: strs('matchedPhrases'),
      missedPhrases: strs('missedPhrases'),
    );
  }
}

class _AoProfileRow {
  const _AoProfileRow({
    required this.ao,
    required this.awarded,
    required this.available,
    required this.percentage,
  });
  final String ao;
  final int awarded;
  final int available;
  final int percentage;

  factory _AoProfileRow.fromJson(Map<String, dynamic> j) => _AoProfileRow(
    ao: j['ao'] as String? ?? '',
    awarded: j['awarded'] as int? ?? 0,
    available: j['available'] as int? ?? 0,
    percentage: j['percentage'] as int? ?? 0,
  );
}

class _Marked {
  const _Marked({
    required this.score,
    required this.maxScore,
    required this.percentage,
    required this.detail,
    required this.xpAwarded,
    required this.aoProfile,
  });
  final int score;
  final int maxScore;
  final int percentage;
  final List<_MarkedDetail> detail;
  final int xpAwarded;
  final List<_AoProfileRow>? aoProfile;

  factory _Marked.fromJson(Map<String, dynamic> j) => _Marked(
    score: j['score'] as int? ?? 0,
    maxScore: j['maxScore'] as int? ?? 0,
    percentage: j['percentage'] as int? ?? 0,
    detail: ((j['detail'] as List?) ?? [])
        .map((d) => _MarkedDetail.fromJson(d as Map<String, dynamic>))
        .toList(),
    xpAwarded: j['xpAwarded'] as int? ?? 0,
    aoProfile: (j['aoProfile'] as List?)
        ?.map((a) => _AoProfileRow.fromJson(a as Map<String, dynamic>))
        .toList(),
  );
}

class _ExamInfo {
  const _ExamInfo({
    required this.topics,
    required this.questionsAvailable,
    required this.papers,
    required this.attempts,
  });
  final List<_ExamTopic> topics;
  final int questionsAvailable;
  final List<_StoredPaper> papers;
  final List<_Attempt> attempts;

  factory _ExamInfo.fromJson(Map<String, dynamic> j) => _ExamInfo(
    topics: ((j['topics'] as List?) ?? [])
        .map((t) => _ExamTopic.fromJson(t as Map<String, dynamic>))
        .toList(),
    questionsAvailable: j['questionsAvailable'] as int? ?? 0,
    papers: ((j['papers'] as List?) ?? [])
        .map((p) => _StoredPaper.fromJson(p as Map<String, dynamic>))
        .toList(),
    attempts: ((j['attempts'] as List?) ?? [])
        .map((a) => _Attempt.fromJson(a as Map<String, dynamic>))
        .toList(),
  );
}

const _aoExplainer = <String, ({String label, String description})>{
  'AO1': (
    label: 'Knowledge & understanding',
    description: 'Recall marks. Awarded for stating accurate facts, definitions and terms, naming the thing correctly. No context needed: a correct fact is a mark even in isolation.',
  ),
  'AO2': (
    label: 'Application',
    description: 'Application marks. Awarded for using knowledge in the scenario given. The answer must refer to the context (the club, the college, the data), not state general theory on its own.',
  ),
  'AO3': (
    label: 'Analysis & evaluation',
    description: 'Reasoning marks. Awarded for chains of reasoning: weighing options, drawing conclusions, making justified judgements. "This means… therefore… which affects the business because…"',
  ),
};

const _paperKindLabel = <String, String>{
  'question_paper': 'Question paper',
  'mark_scheme': 'Mark scheme',
  'formulae_sheet': 'Formulae sheet',
  'other': 'Document',
};

String _aoDirective(List<_AoProfileRow> profile) {
  final sorted = [...profile]
    ..sort((a, b) => a.percentage.compareTo(b.percentage));
  final weakest = sorted.first;
  final strongest = sorted.last;
  String label(String ao) => _aoExplainer[ao]?.label.toLowerCase() ?? ao;
  if (sorted.length > 1 && weakest.percentage == strongest.percentage) {
    return 'Every objective scored the same. Revise the questions you lost, whatever kind of mark they were.';
  }
  if (weakest.percentage >= strongest.percentage - 10) {
    return 'Marks are spread evenly across objectives. Revise from the per-question breakdown below.';
  }
  final focus = weakest.ao == 'AO1'
      ? 'Re-read the notes for the facts and definitions you were expected to state.'
      : weakest.ao == 'AO2'
      ? 'Practise tying your answers to the scenario. Every point should name the business, person or data in the question.'
      : 'Practise finishing answers with a reasoned judgement: weigh both sides, then decide.';
  return 'Your weakest objective is ${weakest.ao} (${label(weakest.ao)}) at ${weakest.percentage}%. $focus';
}

class ExamScreen extends ConsumerStatefulWidget {
  const ExamScreen({super.key});

  @override
  ConsumerState<ExamScreen> createState() => _ExamScreenState();
}

class _ExamScreenState extends ConsumerState<ExamScreen> {
  _ExamInfo? _info;
  bool _infoFailed = false;
  final Set<String> _picked = {};
  int _count = 5;
  List<_ExamQuestion>? _paper;
  final Map<String, String> _answers = {};
  _Marked? _result;
  String? _openDoc;
  _PaperDoc? _doc;
  bool _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadInfo() async {
    try {
      final d = await ref.read(apiClientProvider).examInfo();
      if (mounted) {
        setState(() {
          _info = _ExamInfo.fromJson(d);
          _infoFailed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _infoFailed = true);
    }
  }

  Future<void> _buildPaper() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final d = await ref.read(apiClientProvider).examAction({
        'topicIds': _picked.toList(),
        'questionCount': _count,
      });
      if (!mounted) return;
      setState(() {
        _paper = ((d['paper'] as List?) ?? [])
            .map((q) => _ExamQuestion.fromJson(q as Map<String, dynamic>))
            .toList();
        _answers.clear();
        _result = null;
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError
              ? e.message
              : 'We could not build that paper.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openPaperDoc(_StoredPaper paper) async {
    setState(() {
      _openDoc = paper.id;
      _doc = null;
    });
    try {
      final d = await ref.read(apiClientProvider).examPaper(paper.id);
      if (mounted) {
        setState(
          () => _doc = _PaperDoc.fromJson(
            d['paper'] as Map<String, dynamic>? ?? {},
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _doc = null;
          _openDoc = null;
        });
      }
    }
  }

  Future<void> _submitPaper() async {
    final paper = _paper;
    if (paper == null) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final payload = [
        for (final q in paper)
          {
            'questionId': q.id,
            'answer': _answers[q.id],
            'selectedOptionId': _answers[q.id],
          },
      ];
      final d = await ref.read(apiClientProvider).examAction({
        'topicIds': _picked.toList(),
        'answers': payload,
      });
      if (!mounted) return;
      setState(() => _result = _Marked.fromJson(d));
      _loadInfo();
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError
              ? e.message
              : 'We could not mark that paper.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _newPaper() {
    setState(() {
      _paper = null;
      _result = null;
      _answers.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    if (info == null) {
      if (_infoFailed) {
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const _Caption('Exam data could not be loaded.'),
              const SizedBox(height: 12),
              RevisioSecondaryButton(
                compact: true,
                onPressed: () {
                  setState(() => _infoFailed = false);
                  _loadInfo();
                },
                child: const Text('Try again'),
              ),
            ],
          ),
        );
      }
      return const Center(child: CircularProgressIndicator());
    }

    final paper = _paper;
    final result = _result;
    final answered = paper == null
        ? 0
        : paper.where((q) => (_answers[q.id] ?? '').trim().isNotEmpty).length;

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
              child: const Center(child: RevisioIcon('exam', size: 20)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Exam simulator', style: TypeScale.display),
                  Text(
                    'Marked against the mark scheme.',
                    style: TypeScale.caption.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            if (result != null)
              RevisioSecondaryButton(
                compact: true,
                onPressed: _newPaper,
                child: const Text('New paper'),
              ),
          ],
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 16),
          _Notice(text: _error),
        ],
        if (paper == null) ...[
          const SizedBox(height: 16),
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Label('Topics in this paper'),
                const SizedBox(height: 8),
                if (info.topics.isEmpty)
                  const _Caption(
                    'No exam topics are available on this deployment yet.',
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final t in info.topics)
                        _Chip(
                          label: t.name,
                          icon: 'correct',
                          active: _picked.contains(t.id),
                          onTap: () => setState(() {
                            if (_picked.contains(t.id)) {
                              _picked.remove(t.id);
                            } else {
                              _picked.add(t.id);
                            }
                          }),
                        ),
                    ],
                  ),
                const SizedBox(height: 20),
                _Label('Questions: $_count'),
                Slider(
                  value: _count.toDouble(),
                  min: 3,
                  max: 15,
                  label: '$_count',
                  onChanged: (v) => setState(() => _count = v.round()),
                ),
                const SizedBox(height: 4),
                _Caption(
                  info.questionsAvailable == 0
                      ? 'No exam questions have been uploaded yet. Ask your teacher, or check back soon.'
                      : '${info.questionsAvailable} ${info.questionsAvailable == 1 ? 'question is' : 'questions are'} available across your topics.',
                ),
                const SizedBox(height: 12),
                RevisioGoodButton(
                  onPressed:
                      _picked.isEmpty || _busy || info.questionsAvailable == 0
                      ? null
                      : _buildPaper,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const RevisioIcon('start', size: 18, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(_busy ? 'Building…' : 'Generate paper'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (info.papers.isNotEmpty) ...[
            const SizedBox(height: 16),
            _Section(
              title: 'Real papers & mark schemes',
              caption: "The board's own documents, extracted from the originals. The mark scheme is the most honest revision guide there is. Read it beside the notes.",
              children: [
                for (final p in info.papers)
                  _PaperRow(
                    paper: p,
                    open: _openDoc == p.id,
                    doc: _doc,
                    onToggle: () => _openDoc == p.id
                        ? setState(() => _openDoc = null)
                        : _openPaperDoc(p),
                  ),
              ],
            ),
          ],
          if (info.attempts.isNotEmpty) ...[
            const SizedBox(height: 16),
            _Section(
              title: 'Your attempts',
              caption: 'Every paper you have sat, most recent first.',
              children: [
                for (final a in info.attempts) _AttemptRow(attempt: a),
              ],
            ),
          ],
        ] else if (result == null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: context.card,
              borderRadius: BorderRadius.circular(RadiusTokens.lg),
              border: Border.all(color: context.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '$answered',
                        style: TypeScale.strong.copyWith(
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      TextSpan(
                        text: ' of ${paper.length} answered',
                        style: TypeScale.caption.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: context.secondary,
                    borderRadius: BorderRadius.circular(RadiusTokens.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const RevisioIcon('spec', size: 13),
                      const SizedBox(width: 4),
                      Text(
                        '${paper.fold<int>(0, (s, q) => s + q.marks)} marks',
                        style: TypeScale.captionS.copyWith(
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < paper.length; i++) ...[
            _QuestionCard(
              index: i,
              question: paper[i],
              answer: _answers[paper[i].id] ?? '',
              onAnswer: (v) => setState(() => _answers[paper[i].id] = v),
            ),
          ],
          const SizedBox(height: 8),
          RevisioGoodButton(
            onPressed: _busy ? null : _submitPaper,
            child: Text(_busy ? 'Marking…' : 'Submit for marking'),
          ),
        ] else ...[
          const SizedBox(height: 8),
          _ResultCard(result: result),
          const SizedBox(height: 16),
          for (var i = 0; i < result.detail.length; i++)
            _ResultDetailCard(
              detail: result.detail[i],
              index: i,
              totalPaper: paper.length,
            ),
          if (result.aoProfile != null && result.aoProfile!.isNotEmpty) ...[
            const SizedBox(height: 4),
            _Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Where the marks went', style: TypeScale.strong),
                      _Caption('marks earned by assessment objective'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final row in result.aoProfile!)
                    _AoRow(
                      ao: row.ao,
                      awarded: row.awarded,
                      available: row.available,
                      percentage: row.percentage,
                    ),
                  const SizedBox(height: 8),
                  _Caption(_aoDirective(result.aoProfile!)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          RevisioSecondaryButton(
            onPressed: _newPaper,
            child: const Text('Build another paper'),
          ),
        ],
      ],
    );
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

class _Notice extends StatelessWidget {
  const _Notice({required this.text});

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

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.caption,
    required this.children,
  });

  final String title;
  final String caption;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TypeScale.strong),
          const SizedBox(height: 4),
          _Caption(caption),
          const SizedBox(height: 12),
          for (final c in children) ...[c, const SizedBox(height: 8)],
        ],
      ),
    );
  }
}

class _QuestionCard extends StatefulWidget {
  const _QuestionCard({
    required this.index,
    required this.question,
    required this.answer,
    required this.onAnswer,
  });

  final int index;
  final _ExamQuestion question;
  final String answer;
  final ValueChanged<String> onAnswer;

  @override
  State<_QuestionCard> createState() => _QuestionCardState();
}

class _QuestionCardState extends State<_QuestionCard> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.answer,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.question;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: context.secondary,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${widget.index + 1}',
                      style: TypeScale.fine.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${q.marks} ${q.marks == 1 ? 'mark' : 'marks'}'
                    '${q.qwcMarks > 0 ? '  + ${q.qwcMarks} QWC' : ''}',
                    style: TypeScale.caption.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                ],
              ),
              if (q.sourceYear != null) _MiniChip('${q.board} ${q.sourceYear}'),
            ],
          ),
          const SizedBox(height: 12),
          MarkdownBody(data: q.questionMd, styleSheet: _mdStyle(context)),
          if ((q.aoSplit?.isNotEmpty ?? false) || q.qwcMarks > 0) ...[
            const SizedBox(height: 8),
            Text(
              [
                if (q.aoSplit != null)
                  q.aoSplit!.map((a) => '${a.ao} ${a.marks}').join(' · '),
                if (q.qwcMarks > 0) '${q.qwcMarks} QWC',
              ].join(' · '),
              style: TypeScale.caption.copyWith(color: context.mutedForeground),
            ),
          ],
          const SizedBox(height: 12),
          if (q.kind == 'mcq' && q.options != null)
            for (final o in q.options!)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _OptionButton(
                  text: o.text,
                  selected: widget.answer == o.id,
                  onTap: () => widget.onAnswer(o.id),
                ),
              )
          else
            TextField(
              controller: _controller,
              onChanged: widget.onAnswer,
              minLines: 4,
              maxLines: 8,
              decoration: const InputDecoration(
                hintText: 'Write your answer the way you would under timed conditions.',
              ),
              style: TypeScale.body,
            ),
        ],
      ),
    );
  }
}

class _OptionButton extends StatelessWidget {
  const _OptionButton({
    required this.text,
    required this.selected,
    required this.onTap,
  });

  final String text;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: kTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? context.secondary : context.card.withOpacity(0.6),
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            border: Border.all(
              color: selected ? context.foreground : context.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Text(
            text,
            style: TypeScale.body.copyWith(
              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
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
      child: Text(
        text,
        style: TypeScale.fine.copyWith(
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});

  final _Marked result;

  @override
  Widget build(BuildContext context) {
    final guidance = result.percentage >= 80
        ? 'That is a strong paper. The remainder is worth a look while the marking is fresh.'
        : result.percentage >= 50
        ? 'A solid pass. Read the feedback below before you move on.'
        : 'Worth re-reading the notes on the questions you lost marks on.';
    return _Card(
      child: Column(
        children: [
          Text(
            '${result.percentage}%',
            style: TypeScale.displayMd.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 4),
          _Caption(
            '${result.score} of ${result.maxScore} marks'
            '${result.xpAwarded > 0 ? ' · +${result.xpAwarded} XP' : ''}',
          ),
          const SizedBox(height: 4),
          _Caption(guidance),
        ],
      ),
    );
  }
}

class _ResultDetailCard extends StatefulWidget {
  const _ResultDetailCard({
    required this.detail,
    required this.index,
    required this.totalPaper,
  });

  final _MarkedDetail detail;
  final int index;
  final int totalPaper;

  @override
  State<_ResultDetailCard> createState() => _ResultDetailCardState();
}

class _ResultDetailCardState extends State<_ResultDetailCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    final label = d.questionRef.isNotEmpty
        ? 'Question ${d.questionRef}'
        : 'Question ${widget.index + 1}';
    final total = d.marks + d.qwcMarks;
    final hasMaterial =
        d.markSchemeMd.isNotEmpty ||
        d.modelAnswerMd.isNotEmpty ||
        d.markingNotesMd.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      padding: const EdgeInsets.all(16),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 2,
              decoration: BoxDecoration(
                color: d.correct ? context.good : context.destructive,
                borderRadius: BorderRadius.circular(1),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(child: _detailBody(context, d, label, total, hasMaterial)),
          ],
        ),
      ),
    );
  }

  Widget _detailBody(
    BuildContext context,
    _MarkedDetail d,
    String label,
    int total,
    bool hasMaterial,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _Caption(label),
            Text(
              '${d.awarded}/$total',
              style: TypeScale.captionS.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
                color: d.correct ? context.goodStrong : context.destructiveInk,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(d.feedback, style: TypeScale.caption),
        if (d.matchedPhrases.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: 'Points covered: ',
                  style: TextStyle(color: context.mutedForeground),
                ),
                for (var i = 0; i < d.matchedPhrases.length; i++) ...[
                  if (i > 0) const TextSpan(text: ' · '),
                  TextSpan(
                    text: d.matchedPhrases[i],
                    style: TextStyle(color: context.good),
                  ),
                ],
              ],
            ),
            style: TypeScale.caption,
          ),
        ],
        if (d.missedPhrases.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: 'Missing for more marks: ',
                  style: TextStyle(color: context.mutedForeground),
                ),
                for (var i = 0; i < d.missedPhrases.length && i < 5; i++) ...[
                  if (i > 0) const TextSpan(text: ' · '),
                  TextSpan(text: d.missedPhrases[i]),
                ],
              ],
            ),
            style: TypeScale.caption,
          ),
        ],
        if (d.aoSplit != null && d.aoSplit!.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            'WHERE THE MARKS LIVE',
            style: TypeScale.micro.copyWith(
              color: context.mutedForeground,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 6),
          for (final a in d.aoSplit!)
            _AoRow(
              ao: a.ao,
              awarded: a.marks,
              available: 0,
              percentage: 0,
              hidePct: true,
            ),
          if (d.qwcMarks > 0)
            _Caption(
              'Plus ${d.qwcMarks} QWC ${d.qwcMarks == 1 ? 'mark' : 'marks'} for quality of written communication: clear structure, controlled grammar, and the subject\'s technical terms used properly.',
            ),
        ],
        if (hasMaterial) ...[
          const SizedBox(height: 8),
          Semantics(
            button: true,
            expanded: _open,
            child: TextButton.icon(
              onPressed: () => setState(() => _open = !_open),
              icon: RevisioIcon(_open ? 'collapse' : 'expand', size: 13),
              label: Text(
                _open ? 'Hide marking material' : 'Mark scheme & model answer',
              ),
              style: TextButton.styleFrom(
                minimumSize: const Size(0, kTouchTarget),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                foregroundColor: context.foreground,
              ),
            ),
          ),
          if (_open) ...[
            const SizedBox(height: 8),
            if (d.markingNotesMd.isNotEmpty) ...[
              _MicroLabel('How an examiner marks this'),
              MarkdownBody(
                data: d.markingNotesMd,
                styleSheet: _mdStyle(context),
              ),
            ],
            if (d.markSchemeMd.isNotEmpty) ...[
              _MicroLabel('Mark scheme'),
              MarkdownBody(data: d.markSchemeMd, styleSheet: _mdStyle(context)),
            ],
            if (d.modelAnswerMd.isNotEmpty) ...[
              _MicroLabel('Model answer'),
              MarkdownBody(
                data: d.modelAnswerMd,
                styleSheet: _mdStyle(context),
              ),
            ],
            if ((d.userAnswer ?? '').isNotEmpty) ...[
              _MicroLabel('Your answer'),
              Text(d.userAnswer!, style: TypeScale.caption),
            ],
          ],
        ],
      ],
    );
  }
}

class _AoRow extends StatelessWidget {
  const _AoRow({
    required this.ao,
    required this.awarded,
    required this.available,
    required this.percentage,
    this.hidePct = false,
  });

  final String ao;
  final int awarded;
  final int available;
  final int percentage;
  final bool hidePct;

  @override
  Widget build(BuildContext context) {
    final guide = _aoExplainer[ao];
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '$ao · ${guide?.label ?? 'Assessment objective'}',
                style: TypeScale.caption.copyWith(fontWeight: FontWeight.w600),
              ),
              if (!hidePct)
                Text(
                  '$awarded/$available · $percentage%',
                  style: TypeScale.captionS.copyWith(
                    color: context.mutedForeground,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                )
              else
                Text(
                  '$awarded ${awarded == 1 ? 'mark' : 'marks'}',
                  style: TypeScale.captionS.copyWith(
                    color: context.mutedForeground,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
            ],
          ),
          if (guide != null)
            Text(
              guide.description,
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
        ],
      ),
    );
  }
}

class _MicroLabel extends StatelessWidget {
  const _MicroLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 2),
      child: Text(
        text.toUpperCase(),
        style: TypeScale.micro.copyWith(
          color: context.mutedForeground,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _PaperRow extends StatelessWidget {
  const _PaperRow({
    required this.paper,
    required this.open,
    required this.doc,
    required this.onToggle,
  });

  final _StoredPaper paper;
  final bool open;
  final _PaperDoc? doc;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final p = paper;
    final meta = [
      p.board,
      p.series,
      p.paperCode,
      if (p.durationMinutes != null) '${p.durationMinutes} min',
    ].where((e) => e.isNotEmpty).join(' · ');
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                label: _paperKindLabel[p.kind] ?? 'Document',
                onTap: () {},
                active: p.kind == 'question_paper',
                small: true,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  p.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.strong,
                ),
              ),
              if (p.totalMarks != null)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Text(
                    '${p.totalMarks} marks',
                    style: TypeScale.captionS.copyWith(
                      color: context.mutedForeground,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              Semantics(
                button: true,
                expanded: open,
                child: TextButton.icon(
                  onPressed: onToggle,
                  icon: RevisioIcon(open ? 'collapse' : 'expand', size: 14),
                  label: Text(open ? 'Hide' : 'Open'),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, kTouchTarget),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    foregroundColor: context.foreground,
                  ),
                ),
              ),
            ],
          ),
          if (meta.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                meta,
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
              ),
            ),
          if (open) ...[
            const SizedBox(height: 12),
            if (doc == null)
              const _Caption('Loading…')
            else
              MarkdownBody(data: doc!.contentMd, styleSheet: _mdStyle(context)),
          ],
        ],
      ),
    );
  }
}

class _AttemptRow extends StatelessWidget {
  const _AttemptRow({required this.attempt});

  final _Attempt attempt;

  @override
  Widget build(BuildContext context) {
    final pct = attempt.maxScore > 0
        ? (attempt.score / attempt.maxScore * 100).round()
        : 0;
    final date = DateTime.tryParse(attempt.createdAt);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Row(
        children: [
          Text(
            date == null
                ? ''
                : '${date.day} ${_months[date.month - 1]} ${date.year}',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
          const Spacer(),
          SizedBox(
            width: 64,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(RadiusTokens.pill),
              child: LinearProgressIndicator(
                value: pct / 100,
                minHeight: 6,
                backgroundColor: context.border,
                valueColor: AlwaysStoppedAnimation(context.foreground),
              ),
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 40,
            child: Text(
              '$pct%',
              textAlign: TextAlign.right,
              style: TypeScale.captionS.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

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
