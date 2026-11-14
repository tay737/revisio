/// Cram — pick topics, pick a note density, sprint. Cram grades but never
/// moves the review schedule; answers post with `mode:"cram"` and the
/// session's `sessionId` so the server can group them.
library revisio.features.cram.cram_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../../services/api_client.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import '../review/review_screen.dart';

class CramScreen extends ConsumerStatefulWidget {
  const CramScreen({super.key, this.preselectedTopicId});

  /// `?topic=` — a Learn row can land here with one topic already ticked.
  final String? preselectedTopicId;

  @override
  ConsumerState<CramScreen> createState() => _CramScreenState();
}

class _CramScreenState extends ConsumerState<CramScreen> {
  List<Topic>? _topics;
  final Set<String> _picked = {};
  String _density = 'summary';
  double _maxPerTopic = 10;
  bool _starting = false;
  String? _error;
  bool _densitySeeded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final topics = await ref.read(apiClientProvider).cramTopics();
      if (!mounted) return;
      setState(() {
        _topics = topics;
        final pre = widget.preselectedTopicId;
        if (pre != null &&
            topics.any((t) => t.id == pre && t.questions > 0)) {
          _picked.add(pre);
        }
      });
    } catch (_) {
      if (mounted) setState(() => _topics = const []);
    }
  }

  /// The density picker starts from the account preference — the same owner
  /// the web reads once at mount.
  void _seedDensity(MeDetail? me) {
    if (_densitySeeded || me == null) return;
    _densitySeeded = true;
    final owned = me.prefs.noteDensity;
    if (owned == 'detailed' || owned == 'summary') {
      _density = owned;
    }
  }

  Future<void> _start() async {
    if (_picked.isEmpty) return;
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final session = await ref.read(apiClientProvider).cramSession(
            topicIds: _picked.toList(),
            maxPerTopic: _maxPerTopic.round(),
            noteDensity: _density,
          );
      if (!mounted) return;
      if (session.queue.isEmpty) {
        setState(() {
          _error = 'Those topics have no cards right now.';
          _starting = false;
        });
        return;
      }
      context.push(
        '/review',
        extra: ReviewSession(
          cards: session.queue,
          title: 'Cram',
          mode: 'cram',
          sessionId: session.sessionId,
          notes: session.notes,
          noteDensityLabel: session.noteDensity,
        ),
      );
    } on ApiError catch (e) {
      setState(() {
        _error = e.message.isNotEmpty ? e.message : 'We could not start that session.';
        _starting = false;
      });
    } catch (_) {
      setState(() {
        _error = 'We could not start that session — check your connection and try again.';
        _starting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    _seedDensity(ref.watch(meProvider).valueOrNull);
    final topics = _topics;
    return Scaffold(
      appBar: AppBar(title: const Text('Cram')),
      body: SafeArea(
        child: topics == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  Text(
                    'Extra practice. Your schedule stays put.',
                    style: TypeScale.body.copyWith(color: context.mutedForeground),
                  ),
                  const SizedBox(height: 20),
                  _PanelCard(
                    title: 'Topics',
                    child: topics.every((t) => t.questions == 0)
                        ? Text('No cram topics yet.',
                            style: TypeScale.body.copyWith(color: context.mutedForeground))
                        : Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final t in topics.where((t) => t.questions > 0))
                                _TopicChip(
                                  name: t.name,
                                  count: t.questions,
                                  selected: _picked.contains(t.id),
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
                  ),
                  const SizedBox(height: 16),
                  _PanelCard(
                    title: 'Notes to show',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            for (final d in ['summary', 'detailed'])
                              Expanded(
                                child: Padding(
                                  padding: EdgeInsets.only(
                                      right: d == 'summary' ? 8 : 0,
                                      left: d == 'detailed' ? 8 : 0),
                                  child: SizedBox(
                                    height: kTouchTarget,
                                    child: OutlinedButton(
                                      onPressed: () =>
                                          setState(() => _density = d),
                                      style: OutlinedButton.styleFrom(
                                        backgroundColor: _density == d
                                            ? context.primary
                                            : context.card,
                                        foregroundColor: _density == d
                                            ? context.primaryForeground
                                            : context.foreground,
                                        side: BorderSide(
                                            color: _density == d
                                                ? context.primary
                                                : context.border),
                                      ),
                                      child: Text(
                                          d[0].toUpperCase() + d.substring(1)),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Summary notes are the ones to skim five minutes before the exam.',
                          style: TypeScale.fine.copyWith(color: context.mutedForeground),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _PanelCard(
                    title: 'Questions per topic: ${_maxPerTopic.round()}',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Slider(
                          value: _maxPerTopic,
                          min: 5,
                          max: 30,
                          divisions: 5,
                          label: '${_maxPerTopic.round()}',
                          onChanged: (v) => setState(() => _maxPerTopic = v),
                        ),
                        Text(
                          _picked.isEmpty
                              ? 'Pick at least one topic to begin.'
                              : 'Up to ${_picked.length * _maxPerTopic.round()} questions across ${_picked.length} ${_picked.length == 1 ? 'topic' : 'topics'}.',
                          style: TypeScale.fine.copyWith(color: context.mutedForeground),
                        ),
                      ],
                    ),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: RevisioNotice(
                        tone: NoticeTone.bad,
                        show: true,
                        child: Text(_error!),
                      ),
                    ),
                  const SizedBox(height: 20),
                  RevisioButton(
                    enabled: !_starting && _picked.isNotEmpty,
                    onPressed: _starting ? null : _start,
                    child: Text(_starting ? 'Building your session…' : 'Start cram session'),
                  ),
                ],
              ),
      ),
    );
  }
}

class _PanelCard extends StatelessWidget {
  const _PanelCard({required this.title, required this.child});

  final String title;
  final Widget child;

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
          Text(title.toUpperCase(),
              style: TypeScale.eyebrow.copyWith(color: context.mutedForeground)),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _TopicChip extends StatelessWidget {
  const _TopicChip({
    required this.name,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String name;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RadiusTokens.pill),
      child: Container(
        constraints: const BoxConstraints(minHeight: kTouchTarget),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? context.primary : context.card,
          borderRadius: BorderRadius.circular(RadiusTokens.pill),
          border: Border.all(color: selected ? context.primary : context.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (selected) ...[
              RevisioIcon('correct', size: 13, color: context.primaryForeground),
              const SizedBox(width: 6),
            ],
            Text(
              name,
              style: TypeScale.body.copyWith(
                color: selected ? context.primaryForeground : context.foreground,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              '$count',
              style: TypeScale.fine.copyWith(
                color: selected
                    ? context.primaryForeground.withOpacity(0.7)
                    : context.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
