/// Learn — subjects → topics → lessons & first-exposure batches.
/// A learn batch hands its cards to the review loop with `mode: "learn"`.
library revisio.features.learn.learn_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import '../review/review_screen.dart';
import '../../design/revisio_icons.dart';

class LearnScreen extends ConsumerStatefulWidget {
  const LearnScreen({super.key});

  @override
  ConsumerState<LearnScreen> createState() => _LearnScreenState();
}

class _LearnScreenState extends ConsumerState<LearnScreen> {
  Subject? _subject;
  Topic? _topic;

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(subjectsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Learn')),
      body: SafeArea(
        child: subjects.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => _Message(
            text: 'Subjects could not be loaded.',
            action: () => ref.invalidate(subjectsProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return const _Message(text: 'No subjects yet — join a class from Settings.');
            }
            final subject = _subject ?? list.firstWhere((s) => s.enrolled, orElse: () => list.first);
            return Column(
              children: [
                _SubjectStrip(
                  subjects: list,
                  selected: subject,
                  onSelect: (s) => setState(() {
                    _subject = s;
                    _topic = null;
                  }),
                ),
                Expanded(child: _TopicPane(subject: subject, topic: _topic, onTopic: (t) => setState(() => _topic = t))),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SubjectStrip extends StatelessWidget {
  const _SubjectStrip({required this.subjects, required this.selected, required this.onSelect});

  final List<Subject> subjects;
  final Subject selected;
  final ValueChanged<Subject> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: subjects.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final s = subjects[i];
          final active = s.id == selected.id;
          return ChoiceChip(
            label: Text(s.name),
            selected: active,
            onSelected: (_) => onSelect(s),
            showCheckmark: false,
            labelStyle: TypeScale.captionS.copyWith(
              color: active ? context.primaryForeground : context.foreground,
            ),
            selectedColor: context.primary,
            backgroundColor: context.card,
            side: BorderSide(color: active ? context.primary : context.border),
          );
        },
      ),
    );
  }
}

class _TopicPane extends ConsumerStatefulWidget {
  const _TopicPane({required this.subject, required this.topic, required this.onTopic});

  final Subject subject;
  final Topic? topic;
  final ValueChanged<Topic?> onTopic;

  @override
  ConsumerState<_TopicPane> createState() => _TopicPaneState();
}

class _TopicPaneState extends ConsumerState<_TopicPane> {
  late Future<List<Topic>> _topicsFuture;
  @override
  void initState() {
    super.initState();
    _topicsFuture = _load();
  }

  @override
  void didUpdateWidget(_TopicPane old) {
    super.didUpdateWidget(old);
    if (old.subject.id != widget.subject.id) {
        _topicsFuture = _load();
    }
  }

  Future<List<Topic>> _load() =>
      ref.read(apiClientProvider).content(subjectId: widget.subject.id);

  @override
  Widget build(BuildContext context) {
    final topic = widget.topic;
    if (topic == null) {
      return FutureBuilder<List<Topic>>(
        future: _topicsFuture,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return _Message(text: 'Topics could not be loaded.');
          }
          final topics = snap.data ?? const [];
          if (topics.isEmpty) {
            return const _Message(text: 'No topics in this subject yet.');
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: topics.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final t = topics[i];
              final count = t.cardCount ?? t.cards ?? 0;
              final lessons = t.lessonCount ?? t.lessons ?? 0;
              return Card(
                color: context.card,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(RadiusTokens.lg),
                  side: BorderSide(color: context.border),
                ),
                child: ListTile(
                  title: Text(t.name, style: TypeScale.strong),
                  subtitle: Text('$count cards · $lessons lessons',
                      style: TypeScale.caption.copyWith(color: context.mutedForeground)),
                  trailing: const RevisioIcon('expand'),
                  onTap: () => widget.onTopic(t),
                ),
              );
            },
          );
        },
      );
    }
    // Keyed by topic so switching topics rebuilds state instead of showing
    // the previous topic's lessons/exposure.
    return _TopicDetail(key: ValueKey(topic.id), topic: topic, onBack: () => widget.onTopic(null));
  }
}

class _TopicDetail extends ConsumerStatefulWidget {
  const _TopicDetail({super.key, required this.topic, required this.onBack});

  final Topic topic;
  final VoidCallback onBack;

  @override
  ConsumerState<_TopicDetail> createState() => _TopicDetailState();
}

class _TopicDetailState extends ConsumerState<_TopicDetail> {
  FirstExposure? _exposure;
  List<Lesson>? _lessons;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = ref.read(apiClientProvider);
      final results = await Future.wait([
        api.learn(topicId: widget.topic.id),
        api.lessons(topicId: widget.topic.id),
      ]);
      if (!mounted) return;
      setState(() {
        _exposure = results[0] as FirstExposure;
        _lessons = results[1] as List<Lesson>;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'This topic could not be loaded.';
        _loading = false;
      });
    }
  }

  void _openReview() {
    final cards = _exposure?.batch ?? const <QueueCard>[];
    if (cards.isEmpty) return;
    context.push(
      '/review',
      extra: ReviewSession(
        cards: cards,
        title: 'Learn · ${widget.topic.name}',
        mode: 'learn',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
          child: Row(
            children: [
              IconButton(
                icon: const RevisioIcon('back'),
                tooltip: 'Back to topics',
                onPressed: widget.onBack,
              ),
              Expanded(
                child: Text(widget.topic.name, style: TypeScale.title, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _Message(text: _error!, action: _load)
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                      children: [
                        if (_exposure != null) ...[
                          _ExposureHeader(exposure: _exposure!),
                          const SizedBox(height: 16),
                        ],
                        if (_lessons?.isNotEmpty == true) ...[
                          Text('Lessons', style: TypeScale.strong),
                          const SizedBox(height: 8),
                          for (final l in _lessons!) _LessonTile(lesson: l),
                          const SizedBox(height: 16),
                        ],
                        if (_exposure?.notes.isNotEmpty == true) ...[
                          Text('Notes', style: TypeScale.strong),
                          const SizedBox(height: 8),
                          for (final n in _exposure!.notes) _NoteTile(note: n),
                        ],
                      ],
                    ),
        ),
        if (_exposure?.batch.isNotEmpty == true)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: RevisioButton(
              onPressed: _openReview,
              child: Text('Review ${_exposure!.batch.length} new cards'),
            ),
          ),
      ],
    );
  }
}

class _ExposureHeader extends StatelessWidget {
  const _ExposureHeader({required this.exposure});

  final FirstExposure exposure;

  @override
  Widget build(BuildContext context) {
    final p = exposure.progress;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('First exposure', style: TypeScale.captionS.copyWith(color: context.mutedForeground)),
          const SizedBox(height: 4),
          Text('${p.met} of ${p.total} seen · ${p.remaining} left', style: TypeScale.body),
        ],
      ),
    );
  }
}

class _LessonTile extends StatelessWidget {
  const _LessonTile({required this.lesson});

  final Lesson lesson;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: context.card,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        side: BorderSide(color: context.border),
      ),
      child: ExpansionTile(
        title: Text(lesson.title, style: TypeScale.body),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Text(
            lesson.detailedMd ?? lesson.summaryMd ?? '',
            style: TypeScale.caption.copyWith(color: context.mutedForeground, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _NoteTile extends StatelessWidget {
  const _NoteTile({required this.note});

  final Note note;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: context.card,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        side: BorderSide(color: context.border),
      ),
      child: ExpansionTile(
        title: Text(note.title, style: TypeScale.body),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Text(
            note.detailedMd ?? note.summaryMd ?? note.contentMd ?? '',
            style: TypeScale.caption.copyWith(color: context.mutedForeground, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, this.action});

  final String text;
  final VoidCallback? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text, style: TypeScale.body.copyWith(color: context.mutedForeground), textAlign: TextAlign.center),
            if (action != null) ...[
              const SizedBox(height: 16),
              RevisioButton(onPressed: action, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}
