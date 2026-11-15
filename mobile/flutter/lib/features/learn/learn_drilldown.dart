/// Learn drill-downs — ports of the web's
/// `learn/[subjectId]` (specification + grouped topics) and
/// `learn/[subjectId]/[topicId]` (the reading screen) pages.
library revisio.features.learn.learn_drilldown;

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import '../review/review_screen.dart';
import 'learn_shared.dart';

/// Starts the topic's first-exposure batch as a review session — the web's
/// `Learn` button (`/review?topic=`) resolved to its Flutter equivalent.
Future<void> startLearnSession(
  BuildContext context,
  WidgetRef ref, {
  required Topic topic,
  String? noteDensity,
}) async {
  try {
    final exposure = await ref.read(apiClientProvider).learn(topicId: topic.id);
    if (!context.mounted) return;
    // An empty batch still opens the session — the review screen shows the
    // web's "Every question met" / "No questions here yet" state, which needs
    // the exposure's topic and progress to render.
    context.push(
      '/review/session',
      extra: ReviewSession(
        cards: exposure.batch,
        title: 'Learn · ${topic.name}',
        mode: 'learn',
        notes: exposure.notes,
        noteDensityLabel: noteDensity,
        exposure: exposure,
      ),
    );
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This topic could not be started.')),
      );
    }
  }
}

// ── /learn/[subjectId] ──────────────────────────────────────────────────────

class LearnSubjectScreen extends ConsumerStatefulWidget {
  const LearnSubjectScreen({super.key, required this.subjectId});

  final String subjectId;

  @override
  ConsumerState<LearnSubjectScreen> createState() => _LearnSubjectScreenState();
}

class _LearnSubjectScreenState extends ConsumerState<LearnSubjectScreen> {
  String _query = '';
  bool _specsOpen = false;
  String? _startingTopicId;

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(subjectsProvider);
    final topicsAsync = ref.watch(subjectTopicsProvider(widget.subjectId));

    return Scaffold(
      body: SafeArea(
        child: subjects.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => _LoadError(
            title: 'Subjects could not be loaded.',
            onRetry: () => ref.invalidate(subjectsProvider),
          ),
          data: (list) {
            Subject? subject;
            for (final s in list) {
              if (s.id == widget.subjectId) {
                subject = s;
                break;
              }
            }
            if (subject == null) {
              return _NotFound(
                icon: 'learn',
                title: 'Subject not found',
                detail: 'It may have been withdrawn, or the link is wrong.',
                actionLabel: 'Back to Learn',
                onAction: () => context.go('/learn'),
              );
            }
            final found = subject;
            return topicsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => _LoadError(
                title: 'Topics could not be loaded.',
                onRetry: () =>
                    ref.invalidate(subjectTopicsProvider(widget.subjectId)),
              ),
              data: (topics) => _SubjectBody(
                subject: found,
                topics: topics,
                query: _query,
                specsOpen: _specsOpen,
                startingTopicId: _startingTopicId,
                onQuery: (q) => setState(() => _query = q),
                onToggleSpecs: () => setState(() => _specsOpen = !_specsOpen),
                onLearn: _startLearn,
                onCram: (t) => context.push('/cram?topic=${t.id}'),
                onOpenTopic: (t) =>
                    context.push('/learn/${widget.subjectId}/${t.id}'),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _startLearn(Topic t) async {
    setState(() => _startingTopicId = t.id);
    await startLearnSession(context, ref, topic: t);
    if (mounted) setState(() => _startingTopicId = null);
  }
}

class _SubjectBody extends StatelessWidget {
  const _SubjectBody({
    required this.subject,
    required this.topics,
    required this.query,
    required this.specsOpen,
    required this.startingTopicId,
    required this.onQuery,
    required this.onToggleSpecs,
    required this.onLearn,
    required this.onCram,
    required this.onOpenTopic,
  });

  final Subject subject;
  final List<Topic> topics;
  final String query;
  final bool specsOpen;
  final String? startingTopicId;
  final ValueChanged<String> onQuery;
  final VoidCallback onToggleSpecs;
  final Future<void> Function(Topic) onLearn;
  final void Function(Topic) onCram;
  final void Function(Topic) onOpenTopic;

  @override
  Widget build(BuildContext context) {
    final q = query.trim().toLowerCase();
    final ordered = topics.where((t) {
      if (q.isEmpty) return true;
      return t.name.toLowerCase().contains(q) ||
          (t.description?.toLowerCase().contains(q) ?? false) ||
          t.specRefs.any((r) => r.toLowerCase().contains(q));
    }).toList()..sort(topicSortKey);

    // Specification: refs grouped by leading unit, deduped in lesson order —
    // the same derivation the API already did per topic.
    final specMap = <String, ({List<String> refs, List<Topic> topics})>{};
    for (final t in [...topics]..sort(topicSortKey)) {
      final unit = unitFromTopic(t);
      final entry = specMap.putIfAbsent(
        unit,
        () => (refs: <String>[], topics: <Topic>[]),
      );
      entry.topics.add(t);
      for (final ref in t.specRefs) {
        if (!entry.refs.contains(ref)) entry.refs.add(ref);
      }
    }
    final specUnits = specMap.entries.toList()
      ..sort((a, b) => _compareUnits(a.key, b.key));
    final specCount = specMap.values.fold<int>(0, (n, u) => n + u.refs.length);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        // Breadcrumb — the escape hatch back to the catalogue.
        InkWell(
          onTap: () => context.go('/learn'),
          borderRadius: BorderRadius.circular(RadiusTokens.sm),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const RevisioIcon('expand', size: 14),
                const SizedBox(width: 6),
                Text(
                  'All subjects',
                  style: TypeScale.caption.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(subject.name, style: TypeScale.title),
                  if ((subject.description ?? '').isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      subject.description!,
                      style: TypeScale.caption.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 12),
            _Chip(
              '${topics.length} ${topics.length == 1 ? 'topic' : 'topics'}'
              ' · $specCount spec refs',
            ),
          ],
        ),
        const SizedBox(height: 24),

        // ── Specification ──────────────────────────────────────────────
        if (specCount > 0)
          Container(
            decoration: BoxDecoration(
              color: context.card,
              borderRadius: BorderRadius.circular(RadiusTokens.lg),
              border: Border.all(color: context.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                InkWell(
                  onTap: onToggleSpecs,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: context.secondary,
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: const RevisioIcon('spec', size: 16),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Specification',
                                style: TypeScale.strong,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '$specCount references across ${topics.length} topics, taken from the notes themselves',
                                style: TypeScale.caption.copyWith(
                                  color: context.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ),
                        AnimatedRotation(
                          turns: specsOpen ? 0.25 : 0,
                          duration: const Duration(milliseconds: 150),
                          child: RevisioIcon(
                            'expand',
                            size: 16,
                            color: context.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  alignment: Alignment.topCenter,
                  child: specsOpen
                      ? Container(
                          width: double.infinity,
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                          decoration: BoxDecoration(
                            border: Border(
                              top: BorderSide(color: context.border),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (final e in specUnits) ...[
                                Text('Unit ${e.key}', style: TypeScale.strong),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 6,
                                  children: [
                                    for (final ref in e.value.refs)
                                      _Chip(ref, soft: true),
                                  ],
                                ),
                                const SizedBox(height: 16),
                              ],
                            ],
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          ),
        if (specCount > 0) const SizedBox(height: 24),

        // ── Topics ─────────────────────────────────────────────────────
        Text('Topics', style: TypeScale.tagline),
        const SizedBox(height: 16),
        if (topics.length > 5)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: TextField(
              onChanged: onQuery,
              decoration: InputDecoration(
                hintText: 'Search topics…',
                prefixIcon: Padding(
                  padding: const EdgeInsets.all(12),
                  child: RevisioIcon(
                    'search',
                    size: 17,
                    color: context.mutedForeground,
                  ),
                ),
              ),
            ),
          ),
        if (q.isNotEmpty && ordered.isEmpty && topics.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text.rich(
              TextSpan(
                text: 'Nothing matches “$query”. ',
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
                children: [
                  WidgetSpan(
                    alignment: PlaceholderAlignment.baseline,
                    baseline: TextBaseline.alphabetic,
                    child: InkWell(
                      onTap: () => onQuery(''),
                      child: const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          'clear the search',
                          style: TextStyle(
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (topics.isEmpty)
          Text(
            'No topics under this subject yet.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
        for (final t in ordered) ...[
          _TopicRow(
            topic: t,
            starting: startingTopicId == t.id,
            onOpen: () => onOpenTopic(t),
            onLearn: () => onLearn(t),
            onCram: () => onCram(t),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  /// Unit codes compare the way `topicSortKey` compares topic names:
  /// numeric where both sides parse, lexical otherwise.
  int _compareUnits(String a, String b) {
    final ka = a.split(RegExp(r'[\s–—-]+')).where((s) => s.isNotEmpty).toList();
    final kb = b.split(RegExp(r'[\s–—-]+')).where((s) => s.isNotEmpty).toList();
    final n = ka.length > kb.length ? ka.length : kb.length;
    for (var i = 0; i < n; i++) {
      final va = i < ka.length ? ka[i] : '';
      final vb = i < kb.length ? kb[i] : '';
      final na = double.tryParse(va);
      final nb = double.tryParse(vb);
      if (na != null && nb != null && na != nb) return na.compareTo(nb);
      final c = va.compareTo(vb);
      if (c != 0) return c;
    }
    return 0;
  }
}

class _TopicRow extends StatelessWidget {
  const _TopicRow({
    required this.topic,
    required this.starting,
    required this.onOpen,
    required this.onLearn,
    required this.onCram,
  });

  final Topic topic;
  final bool starting;
  final VoidCallback onOpen;
  final VoidCallback onLearn;
  final VoidCallback onCram;

  @override
  Widget build(BuildContext context) {
    final notes = topic.notes;
    final questions = topic.questions;
    return Container(
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: onOpen,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(topic.name, style: TypeScale.strong),
                        if ((topic.description ?? '').isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            topic.description!,
                            style: TypeScale.caption.copyWith(
                              color: context.mutedForeground,
                            ),
                          ),
                        ],
                        if (topic.specRefs.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            '${topic.specRefs.take(4).join(' · ')}'
                            '${topic.specRefs.length > 4 ? ' · +${topic.specRefs.length - 4}' : ''}',
                            style: TypeScale.captionS.copyWith(
                              color: context.mutedForeground,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  _Chip(
                    '$notes ${notes == 1 ? 'note' : 'notes'} · '
                    '$questions ${questions == 1 ? 'question' : 'questions'}',
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: _SmallButton(
                    label: starting ? 'Starting…' : 'Learn',
                    icon: 'learn',
                    primary: true,
                    onTap: starting ? null : onLearn,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SmallButton(
                    label: 'Cram',
                    icon: 'cram',
                    onTap: onCram,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SmallButton extends StatelessWidget {
  const _SmallButton({
    required this.label,
    required this.icon,
    required this.onTap,
    this.primary = false,
  });

  final String label;
  final String icon;
  final VoidCallback? onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final child = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        RevisioIcon(
          icon,
          size: 14,
          color: primary ? Colors.white : context.foreground,
        ),
        const SizedBox(width: 6),
        Text(label),
      ],
    );
    return SizedBox(
      height: kTouchTarget,
      child: primary
          ? ElevatedButton(
              onPressed: onTap,
              style: ElevatedButton.styleFrom(
                backgroundColor: context.primary,
                foregroundColor: context.primaryForeground,
                elevation: 0,
                minimumSize: const Size(0, kTouchTarget),
                padding: EdgeInsets.zero,
                shape: const StadiumBorder(),
              ),
              child: child,
            )
          : OutlinedButton(
              onPressed: onTap,
              style: OutlinedButton.styleFrom(
                foregroundColor: context.foreground,
                side: BorderSide(color: context.border),
                minimumSize: const Size(0, kTouchTarget),
                padding: EdgeInsets.zero,
                shape: const StadiumBorder(),
              ),
              child: child,
            ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.text, {this.soft = false});

  final String text;
  final bool soft;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: soft ? context.secondary : context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
        border: soft ? null : Border.all(color: context.border),
      ),
      child: Text(
        text,
        style: TypeScale.caption.copyWith(
          color: context.foreground,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.title, required this.onRetry});

  final String title;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: TypeScale.body.copyWith(color: context.mutedForeground),
            ),
            const SizedBox(height: 16),
            TextButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

class _NotFound extends StatelessWidget {
  const _NotFound({
    required this.icon,
    required this.title,
    required this.detail,
    required this.actionLabel,
    required this.onAction,
  });

  final String icon;
  final String title;
  final String detail;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Container(
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: context.card,
            borderRadius: BorderRadius.circular(RadiusTokens.lg),
            border: Border.all(color: context.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: context.secondary,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: RevisioIcon(icon, size: 22),
              ),
              const SizedBox(height: 16),
              Text(title, style: TypeScale.tagline),
              const SizedBox(height: 8),
              Text(
                detail,
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              RevisioButton(onPressed: onAction, child: Text(actionLabel)),
            ],
          ),
        ),
      ),
    );
  }
}

// ── /learn/[subjectId]/[topicId] ────────────────────────────────────────────

class LearnTopicScreen extends ConsumerStatefulWidget {
  const LearnTopicScreen({
    super.key,
    required this.subjectId,
    required this.topicId,
  });

  final String subjectId;
  final String topicId;

  @override
  ConsumerState<LearnTopicScreen> createState() => _LearnTopicScreenState();
}

class _LearnTopicScreenState extends ConsumerState<LearnTopicScreen> {
  String? _density;
  bool _starting = false;

  @override
  Widget build(BuildContext context) {
    final metaAsync = ref.watch(topicMetaProvider(widget.topicId));
    final lessonsAsync = ref.watch(topicLessonsProvider(widget.topicId));
    final me = ref.watch(meProvider).valueOrNull;
    _density ??= me?.prefs.noteDensity ?? 'detailed';

    return Scaffold(
      body: SafeArea(
        child: metaAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => _LoadError(
            title: 'This topic could not be loaded.',
            onRetry: () => ref.invalidate(topicMetaProvider(widget.topicId)),
          ),
          data: (topic) {
            if (topic == null) {
              return _TopicNotFound(
                subjectId: widget.subjectId,
                onBack: () => _back(),
              );
            }
            return lessonsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => _LoadError(
                title: 'Notes could not be loaded.',
                onRetry: () =>
                    ref.invalidate(topicLessonsProvider(widget.topicId)),
              ),
              data: (lessons) => _TopicBody(
                topic: topic,
                lessons: lessons,
                density: _density!,
                starting: _starting,
                onDensity: _setDensity,
                onLearn: _startLearn,
                onCram: () => context.push('/cram?topic=${widget.topicId}'),
                onBack: _back,
              ),
            );
          },
        ),
      ),
    );
  }

  void _back() {
    context.go('/learn/${widget.subjectId}');
  }

  void _setDensity(String d) {
    setState(() => _density = d);
    ref.read(apiClientProvider).patchMe({
      'prefs': {'noteDensity': d},
    });
  }

  Future<void> _startLearn(Topic topic) async {
    setState(() => _starting = true);
    await startLearnSession(context, ref, topic: topic, noteDensity: _density);
    if (mounted) setState(() => _starting = false);
  }
}

class _TopicNotFound extends StatelessWidget {
  const _TopicNotFound({required this.subjectId, required this.onBack});

  final String subjectId;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return _NotFound(
      icon: 'notes',
      title: 'Topic not found',
      detail: 'It may be private, withdrawn, or the link is wrong.',
      actionLabel: 'Back',
      onAction: onBack,
    );
  }
}

class _TopicBody extends StatelessWidget {
  const _TopicBody({
    required this.topic,
    required this.lessons,
    required this.density,
    required this.starting,
    required this.onDensity,
    required this.onLearn,
    required this.onCram,
    required this.onBack,
  });

  final Topic topic;
  final List<Lesson> lessons;
  final String density;
  final bool starting;
  final ValueChanged<String> onDensity;
  final Future<void> Function(Topic) onLearn;
  final VoidCallback onCram;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        // Breadcrumb back to the subject.
        InkWell(
          onTap: onBack,
          borderRadius: BorderRadius.circular(RadiusTokens.sm),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const RevisioIcon('expand', size: 14),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    // The web breadcrumb labels itself with the topic's
                    // name — `meta.name` is the topic, not the subject.
                    topic.name,
                    style: TypeScale.caption.copyWith(
                      color: context.mutedForeground,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: kTouchTarget,
                        decoration: BoxDecoration(
                          color: context.secondary,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: const RevisioIcon('notes', size: 18),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Text(topic.name, style: TypeScale.title)),
                    ],
                  ),
                  if ((topic.description ?? '').isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      topic.description!,
                      style: TypeScale.caption.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // Density toggle + study actions.
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _DensityToggle(density: density, onSelect: onDensity),
            _SmallButton(
              label: starting ? 'Starting…' : 'Learn',
              icon: 'learn',
              primary: true,
              onTap: starting ? null : () => onLearn(topic),
            ),
            _SmallButton(label: 'Cram', icon: 'cram', onTap: onCram),
          ],
        ),
        const SizedBox(height: 24),
        if (lessons.isEmpty)
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: context.card,
              borderRadius: BorderRadius.circular(RadiusTokens.lg),
              border: Border.all(color: context.border),
            ),
            child: Column(
              children: [
                Text(
                  'No notes written for this topic yet',
                  style: TypeScale.tagline,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Check back once the topic has been published.',
                  style: TypeScale.caption.copyWith(
                    color: context.mutedForeground,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          )
        else
          for (final l in lessons) ...[
            _LessonCard(lesson: l, density: density),
            const SizedBox(height: 24),
          ],
      ],
    );
  }
}

/// The detailed/summary segment — same owner as the web toggle:
/// `prefs.noteDensity`, patched through `/me` on change.
class _DensityToggle extends StatelessWidget {
  const _DensityToggle({required this.density, required this.onSelect});

  final String density;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: context.card.withOpacity(0.6),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: context.border.withOpacity(0.7)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final d in const ['detailed', 'summary'])
            _Segment(
              label: d == 'detailed' ? 'Detailed' : 'Summary',
              active: density == d,
              onTap: () => onSelect(d),
            ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          constraints: const BoxConstraints(
            minHeight: kTouchTarget,
            minWidth: 72,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? context.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TypeScale.caption.copyWith(
              color: active ? context.primaryForeground : context.foreground,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

class _LessonCard extends StatelessWidget {
  const _LessonCard({required this.lesson, required this.density});

  final Lesson lesson;
  final String density;

  @override
  Widget build(BuildContext context) {
    final text = density == 'detailed'
        ? (lesson.detailedMd?.isNotEmpty == true
              ? lesson.detailedMd!
              : lesson.summaryMd ?? '')
        : (lesson.summaryMd?.isNotEmpty == true
              ? lesson.summaryMd!
              : lesson.detailedMd ?? '');

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(lesson.title, style: TypeScale.tagline)),
              if ((lesson.specRefs ?? '').isNotEmpty) ...[
                const SizedBox(width: 8),
                _SpecBadge(refs: lesson.specRefs!),
              ],
            ],
          ),
          const SizedBox(height: 12),
          MarkdownBody(
            data: text,
            styleSheet: MarkdownStyleSheet(
              p: TypeScale.body.copyWith(height: 1.6),
              h1: TypeScale.title,
              h2: TypeScale.strong,
              h3: TypeScale.strong,
              listBullet: TypeScale.body,
              code: TypeScale.caption.copyWith(
                fontFamily: 'monospace',
                backgroundColor: context.muted,
              ),
              codeblockDecoration: BoxDecoration(
                color: context.muted,
                borderRadius: BorderRadius.circular(RadiusTokens.sm),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SpecBadge extends StatelessWidget {
  const _SpecBadge({required this.refs});

  final String refs;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          RevisioIcon('spec', size: 12, color: context.mutedForeground),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              refs,
              style: TypeScale.caption.copyWith(color: context.mutedForeground),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
