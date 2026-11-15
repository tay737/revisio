/// Library — "My content", a port of `src/app/(app)/library/page.tsx`:
/// page header with live counts, notice pair, equal-slot tabs (Topics /
/// Write / Import / Generate / Maths / Marking* / Class), the topic list
/// with publish/withdraw, the merge disclosure and the class join form.
/// *Marking is staff-only, exactly as on the web.
library revisio.features.library.library_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/staff_models.dart';
import '../../services/api_client.dart';
import '../app/app_data.dart';
import 'cloze_marking.dart';
import 'compose_topic.dart';
import 'generate_cloze.dart';
import 'import_deck.dart';
import 'maths_sets.dart';
import '../auth/auth_provider.dart';

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  List<MyTopic>? _topics;
  bool _loadFailed = false;
  String _message = '';
  String _error = '';
  String _busyTopic = '';
  String _classCode = '';
  bool _joining = false;
  String _tab = 'topics';

  bool get _isStaff {
    final role = ref.watch(meProvider).valueOrNull?.role;
    return role == 'teacher' || role == 'developer';
  }

  List<String> get _tabIds => [
    'topics',
    'write',
    'import',
    'generate',
    'maths',
    if (_isStaff) 'marking',
    'class',
  ];

  String get _activeTab => _tabIds.contains(_tab) ? _tab : 'topics';

  static const _tabLabels = {
    'topics': 'Topics',
    'write': 'Write',
    'import': 'Import',
    'generate': 'Generate',
    'maths': 'Maths',
    'marking': 'Marking',
    'class': 'Class',
  };
  static const _tabIcons = {
    'topics': 'topic',
    'write': 'edit',
    'import': 'upload',
    'generate': 'rocket',
    'maths': 'practice',
    'marking': 'gauge',
    'class': 'join',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final payload = await ref.read(apiClientProvider).myTopics();
      if (mounted) {
        setState(() {
          _topics = payload.topics;
          _loadFailed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadFailed = true);
    }
  }

  void _say(String text) => setState(() {
    _error = '';
    _message = text;
  });

  void _fail(String text) => setState(() {
    _message = '';
    _error = text;
  });

  Future<void> _setVisibility(MyTopic topic, bool toPublic) async {
    setState(() => _busyTopic = topic.id);
    _error = '';
    try {
      final res = await ref
          .read(apiClientProvider)
          .setTopicVisibility(
            topicId: topic.id,
            visibility: toPublic ? 'public' : 'private',
          );
      final cards = res['cards'] as int? ?? 0;
      _say(
        toPublic
            ? '“${topic.name}” is public. $cards ${cards == 1 ? 'question' : 'questions'} went with it.'
            : '“${topic.name}” is private again.',
      );
      await _load();
    } catch (e) {
      _fail(e is ApiError ? e.message : 'That change did not go through.');
    } finally {
      if (mounted) setState(() => _busyTopic = '');
    }
  }

  Future<void> _joinClass() async {
    setState(() {
      _joining = true;
      _error = '';
    });
    try {
      final d = await ref.read(apiClientProvider).joinClass(_classCode.trim());
      final name = (d['class'] as Map?)?['name'] as String? ?? 'the class';
      _say('Joined $name.');
      setState(() => _classCode = '');
    } catch (e) {
      _fail(e is ApiError ? e.message : 'That code did not match a class.');
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final topics = _topics;
    if (topics == null) {
      if (_loadFailed) {
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _Caption('Your content could not be loaded.'),
              const SizedBox(height: 12),
              RevisioSecondaryButton(
                compact: true,
                onPressed: () {
                  setState(() => _loadFailed = false);
                  _load();
                },
                child: const Text('Try again'),
              ),
            ],
          ),
        );
      }
      return const Center(child: CircularProgressIndicator());
    }
    final questionCount = topics.fold<int>(0, (n, t) => n + (t.cardCount ?? 0));
    final noteCount = topics.fold<int>(0, (n, t) => n + (t.lessonCount ?? 0));
    final subtitle = topics.isEmpty
        ? 'Nothing here yet.'
        : '${topics.length} ${topics.length == 1 ? 'topic' : 'topics'} · '
              '$questionCount questions · $noteCount note ${noteCount == 1 ? 'set' : 'sets'}';

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
              child: const Center(child: RevisioIcon('library', size: 20)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('My content', style: TypeScale.display),
                  _Caption(subtitle),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (_message.isNotEmpty) ...[
          _Notice(tone: _NoticeTone.good, text: _message),
          const SizedBox(height: 12),
        ],
        if (_error.isNotEmpty) ...[
          _Notice(tone: _NoticeTone.bad, text: _error),
          const SizedBox(height: 12),
        ],
        _TabGrid(
          ids: _tabIds,
          labels: _tabLabels,
          icons: _tabIcons,
          selected: _activeTab,
          onSelect: (id) => setState(() => _tab = id),
        ),
        const SizedBox(height: 16),
        switch (_activeTab) {
          'topics' => _TopicsTab(
            topics: topics,
            busyTopic: _busyTopic,
            onToggle: _setVisibility,
            onSay: _say,
            onChanged: _load,
          ),
          'class' => _ClassTab(
            code: _classCode,
            joining: _joining,
            onCode: (v) => setState(() => _classCode = v.toUpperCase()),
            onJoin: _joinClass,
          ),
          'import' => _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Bring a deck', style: TypeScale.strong),
                const SizedBox(height: 4),
                _Caption(
                  'Add it to a topic you already have, so its questions sit with its notes.',
                ),
                const SizedBox(height: 20),
                ImportDeck(
                  topics: topics,
                  subjects: ref.watch(subjectsProvider).valueOrNull ?? const [],
                  onImported: _say,
                  onChanged: _load,
                ),
              ],
            ),
          ),
          'generate' => _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Generate fill-the-blank questions',
                  style: TypeScale.strong,
                ),
                const SizedBox(height: 4),
                _Caption(
                  "Proposals come from this topic's own notes, ranked by how well they test recall. You approve each one, and nothing is added without you. Importing is unchanged.",
                ),
                const SizedBox(height: 20),
                GenerateCloze(
                  topics: topics,
                  onDone: (m) {
                    _say(m);
                    _load();
                  },
                ),
              ],
            ),
          ),
          'maths' => _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Maths practice sets', style: TypeScale.strong),
                const SizedBox(height: 4),
                _Caption(
                  'Pin generator concepts to a topic. Questions are generated fresh at practice time, so every student can meet different numbers forever.',
                ),
                const SizedBox(height: 20),
                MathsSets(topics: topics, onDone: _say),
              ],
            ),
          ),
          'marking' => _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Cloze marking', style: TypeScale.strong),
                const SizedBox(height: 4),
                _Caption(
                  'How strictly fill-the-blank answers are marked. Applies to your subjects and topics; developers set the default for everyone.',
                ),
                const SizedBox(height: 20),
                ClozeMarking(
                  isDeveloper:
                      ref.read(meProvider).valueOrNull?.role == 'developer',
                ),
              ],
            ),
          ),
          'write' => _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Write a topic', style: TypeScale.strong),
                const SizedBox(height: 4),
                _Caption(
                  'Notes and questions together, so they arrive as one.',
                ),
                const SizedBox(height: 20),
                ComposeTopic(
                  subjects: ref.watch(subjectsProvider).valueOrNull ?? const [],
                  onCreated: (m) {
                    _say(m);
                    _load();
                  },
                ),
              ],
            ),
          ),
          _ => _AuthoringTab(id: _activeTab),
        },
      ],
    );
  }
}

// ── tab grid ────────────────────────────────────────────────────────────────

class _TabGrid extends StatelessWidget {
  const _TabGrid({
    required this.ids,
    required this.labels,
    required this.icons,
    required this.selected,
    required this.onSelect,
  });

  final List<String> ids;
  final Map<String, String> labels;
  final Map<String, String> icons;
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: ids.length,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 6,
      crossAxisSpacing: 6,
      childAspectRatio: 0.9,
      children: [
        for (final id in ids)
          Semantics(
            button: true,
            selected: id == selected,
            label: labels[id],
            child: GestureDetector(
              onTap: () => onSelect(id),
              child: Container(
                decoration: BoxDecoration(
                  color: id == selected
                      ? context.foreground
                      : context.secondary,
                  borderRadius: BorderRadius.circular(RadiusTokens.md),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    RevisioIcon(
                      icons[id]!,
                      size: 15,
                      color: id == selected
                          ? context.background
                          : context.mutedForeground,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      labels[id]!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TypeScale.micro.copyWith(
                        fontWeight: FontWeight.w600,
                        color: id == selected
                            ? context.background
                            : context.foreground,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ── shared bits ─────────────────────────────────────────────────────────────

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

enum _NoticeTone { good, bad }

class _Notice extends StatelessWidget {
  const _Notice({required this.tone, required this.text});

  final _NoticeTone tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    final good = tone == _NoticeTone.good;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: good ? context.goodSoft : context.destructive.withOpacity(0.12),
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        border: Border.all(
          color: good
              ? context.good.withOpacity(0.4)
              : context.destructive.withOpacity(0.4),
        ),
      ),
      child: Text(
        text,
        style: TypeScale.caption.copyWith(
          color: good ? context.goodStrong : context.destructiveInk,
        ),
      ),
    );
  }
}

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

// ── Topics tab ──────────────────────────────────────────────────────────────

class _TopicsTab extends StatelessWidget {
  const _TopicsTab({
    required this.topics,
    required this.busyTopic,
    required this.onToggle,
    required this.onSay,
    required this.onChanged,
  });

  final List<MyTopic> topics;
  final String busyTopic;
  final Future<void> Function(MyTopic, bool) onToggle;
  final void Function(String) onSay;
  final Future<void> Function() onChanged;

  static const _glyph = {
    'public': 'publish',
    'pending_review': 'schedule',
    'private': 'private',
  };

  @override
  Widget build(BuildContext context) {
    if (topics.isEmpty) {
      return _Card(
        child: Column(
          children: [
            const RevisioIcon('library2', size: 28),
            const SizedBox(height: 12),
            Text('Start with a topic', style: TypeScale.strong),
            const SizedBox(height: 6),
            _Caption(
              'Questions and notes live together in one. Write it under Write, or bring a deck you already have under Import.',
            ),
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final t in topics)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: context.secondary,
              borderRadius: BorderRadius.circular(RadiusTokens.md),
            ),
            child: Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 200,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 160),
                            child: Text(
                              t.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TypeScale.strong,
                            ),
                          ),
                          _VisibilityChip(
                            glyph: _glyph[t.visibility] ?? 'private',
                            label: t.visibility.replaceAll('_', ' '),
                            active: t.visibility == 'public',
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Wrap(
                        spacing: 8,
                        children: [
                          _Caption(t.subjectName ?? 'No subject'),
                          _Caption('·'),
                          _Caption(
                            '${t.cardCount ?? 0} ${(t.cardCount ?? 0) == 1 ? 'question' : 'questions'}',
                          ),
                          _Caption('·'),
                          Text(
                            '${t.lessonCount ?? 0} note ${(t.lessonCount ?? 0) == 1 ? 'set' : 'sets'}',
                            style: TypeScale.caption.copyWith(
                              color: (t.lessonCount ?? 0) == 0
                                  ? context.destructiveInk
                                  : context.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: busyTopic == t.id
                      ? null
                      : () => onToggle(t, t.visibility != 'public'),
                  icon: RevisioIcon(
                    t.visibility == 'public' ? 'unpublish' : 'publish',
                    size: 14,
                  ),
                  label: Text(
                    t.visibility == 'public' ? 'Withdraw' : 'Publish',
                  ),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                  ),
                ),
              ],
            ),
          ),
        if (topics.length > 1)
          _MergeCard(topics: topics, onSay: onSay, onChanged: onChanged),
      ],
    );
  }
}

class _VisibilityChip extends StatelessWidget {
  const _VisibilityChip({
    required this.glyph,
    required this.label,
    required this.active,
  });

  final String glyph;
  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: active ? context.foreground : context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
        border: Border.all(color: active ? context.foreground : context.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          RevisioIcon(
            glyph,
            size: 12,
            color: active ? context.background : context.mutedForeground,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TypeScale.fine.copyWith(
              color: active ? context.background : context.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _MergeCard extends ConsumerStatefulWidget {
  const _MergeCard({
    required this.topics,
    required this.onSay,
    required this.onChanged,
  });

  final List<MyTopic> topics;
  final void Function(String) onSay;
  final Future<void> Function() onChanged;

  @override
  ConsumerState<_MergeCard> createState() => _MergeCardState();
}

class _MergeCardState extends ConsumerState<_MergeCard> {
  bool _open = false;
  String? _source;
  String? _target;
  bool _busy = false;

  Future<void> _merge() async {
    if (_source == null || _target == null || _source == _target) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(apiClientProvider)
          .mergeTopics(sourceId: _source!, targetId: _target!, publish: false);
      widget.onSay('Merged.');
      await widget.onChanged();
    } catch (e) {
      widget.onSay(
        e is ApiError ? e.message : 'That merge did not go through.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: context.secondary,
                      shape: BoxShape.circle,
                    ),
                    child: const Center(child: RevisioIcon('merge', size: 17)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Merge two topics', style: TypeScale.strong),
                        _Caption(
                          'Questions in one and notes in the other? Put them together.',
                        ),
                      ],
                    ),
                  ),
                  RevisioIcon(
                    _open ? 'collapse' : 'expand',
                    size: 15,
                    color: context.mutedForeground,
                  ),
                ],
              ),
            ),
          ),
          if (_open) ...[
            const SizedBox(height: 16),
            _Caption('Merge from'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _source,
              decoration: const InputDecoration(isDense: true),
              items: [
                for (final t in widget.topics)
                  DropdownMenuItem(value: t.id, child: Text(t.name)),
              ],
              onChanged: (v) => setState(() => _source = v),
            ),
            const SizedBox(height: 12),
            _Caption('Merge into'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _target,
              decoration: const InputDecoration(isDense: true),
              items: [
                for (final t in widget.topics)
                  DropdownMenuItem(value: t.id, child: Text(t.name)),
              ],
              onChanged: (v) => setState(() => _target = v),
            ),
            const SizedBox(height: 12),
            _Caption(
              'The source topic is deleted once its questions and notes move. This cannot be undone.',
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: RevisioGoodButton(
                compact: true,
                onPressed:
                    _busy ||
                        _source == null ||
                        _target == null ||
                        _source == _target
                    ? null
                    : _merge,
                child: Text(_busy ? 'Merging…' : 'Yes, merge them'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Class tab ───────────────────────────────────────────────────────────────

class _ClassTab extends StatelessWidget {
  const _ClassTab({
    required this.code,
    required this.joining,
    required this.onCode,
    required this.onJoin,
  });

  final String code;
  final bool joining;
  final ValueChanged<String> onCode;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Join a class', style: TypeScale.strong),
          const SizedBox(height: 4),
          _Caption(
            'The six-character code from your teacher. It shares your review activity, nothing else.',
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                width: 160,
                child: TextField(
                  textCapitalization: TextCapitalization.characters,
                  maxLength: 6,
                  onChanged: onCode,
                  decoration: const InputDecoration(
                    hintText: 'ABC123',
                    counterText: '',
                    isDense: true,
                  ),
                  style: TypeScale.body.copyWith(letterSpacing: 4),
                ),
              ),
              const SizedBox(width: 8),
              RevisioButton(
                compact: true,
                onPressed: joining || code.length < 6 ? null : onJoin,
                child: Text(joining ? 'Joining…' : 'Join'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── authoring tabs (ported next) ────────────────────────────────────────────

class _AuthoringTab extends StatelessWidget {
  const _AuthoringTab({required this.id});

  final String id;

  static const _copy = {
    'write': (
      'Write a topic',
      'Notes and questions together, so they arrive as one.',
    ),
    'import': (
      'Bring a deck',
      'Add it to a topic you already have, so its questions sit with its notes.',
    ),
    'generate': (
      'Generate fill-the-blank questions',
      "Proposals come from this topic's own notes, ranked by how well they test recall. You approve each one, and nothing is added without you. Importing is unchanged.",
    ),
    'maths': (
      'Maths practice sets',
      'Pin generator concepts to a topic. Questions are generated fresh at practice time, so every student can meet different numbers forever.',
    ),
    'marking': (
      'Cloze marking',
      'How strictly fill-the-blank answers are marked. Applies to your subjects and topics; developers set the default for everyone.',
    ),
  };

  @override
  Widget build(BuildContext context) {
    final c = _copy[id] ?? ('', '');
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.$1, style: TypeScale.strong),
          const SizedBox(height: 4),
          _Caption(c.$2),
          const SizedBox(height: 12),
          _Caption(
            'This surface is being ported — the web app has the full editor for now.',
          ),
        ],
      ),
    );
  }
}
