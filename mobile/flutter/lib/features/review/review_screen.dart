/// Review — the loop. One card at a time: answer, Check, server verdict,
/// Next. The server re-grades; its verdict is what the UI shows.
///
/// Offline: a failed submit lands in the outbox and the card counts as done —
/// the sync engine replays it oldest-first when the network returns.
library revisio.features.review.review_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/copy.dart' as copy;
import '../../engine/models.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import '../../services/api_client.dart';
import '../../design/revisio_icons.dart';

/// Optional payload pushed by Learn/Cram: a ready-made card list.
class ReviewSession {
  final List<QueueCard> cards;
  final String title;
  final String mode;
  final String? sessionId;
  final List<Note> notes;
  final String? noteDensityLabel;
  final FirstExposure? exposure;

  const ReviewSession({
    required this.cards,
    this.title = 'Review',
    this.mode = 'daily',
    this.sessionId,
    this.notes = const [],
    this.noteDensityLabel,
    this.exposure,
  });
}

class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({super.key});

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  List<QueueCard>? _cards;
  bool _loading = true;
  String? _loadError;
  String _title = 'Review';
  String _mode = 'daily';
  String? _sessionId;
  List<Note> _notes = const [];
  String? _noteDensityLabel;
  FirstExposure? _exposure;

  int _index = 0;
  _Phase _phase = _Phase.answering;
  final _answer = TextEditingController();
  String? _selectedOptionId;
  Map<String, dynamic>? _result;
  int _correct = 0;
  int _answered = 0;
  int _sessionXp = 0;
  bool _ended = false;
  bool _queuedOffline = false;
  bool _anyOffline = false;
  bool _offlineMode = false;
  bool _submitting = false;
  String? _submitError;
  Stopwatch? _watch;

  bool _started = false;

  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    final extra = GoRouterState.of(context).extra;
    if (extra is ReviewSession) {
      _cards = extra.cards;
      _title = extra.title;
      _mode = extra.mode;
      _sessionId = extra.sessionId;
      _notes = extra.notes;
      _noteDensityLabel = extra.noteDensityLabel;
      _exposure = extra.exposure;
      _loading = false;
      _watch = Stopwatch()..start();
    } else {
      _loadQueue();
    }
  }

  Future<void> _loadQueue() async {
    try {
      final cards = await ref.read(apiClientProvider).queueToday();
      if (!mounted) return;
      setState(() {
        _cards = cards;
        _loading = false;
        _watch = Stopwatch()..start();
      });
    } catch (_) {
      // Offline — fall back to the cached pack so the loop still runs.
      final store = await ref.read(offlineStoreProvider.future);
      final pack = store.cachedPack();
      if (!mounted) return;
      if (pack != null && pack.cards.isNotEmpty) {
        setState(() {
          _cards = pack.cards.map(QueueCard.fromOfflineCard).toList();
          _offlineMode = true;
          _loading = false;
          _watch = Stopwatch()..start();
        });
        return;
      }
      setState(() {
        _loadError = 'Could not load your queue.';
        _loading = false;
      });
    }
  }

  QueueCard? get _card =>
      (_cards == null || _index >= _cards!.length) ? null : _cards![_index];

  bool get _isMcq => _card?.kind == 'mcq';

  Future<void> _submit() async {
    final card = _card;
    if (card == null || _submitting) return;
    if (!_isMcq && _answer.text.trim().isEmpty) return;
    if (_isMcq && _selectedOptionId == null) return;

    setState(() => _submitting = true);
    _watch ??= Stopwatch()..start();
    final durationMs = _watch!.elapsedMilliseconds;

    try {
      final result = await ref
          .read(apiClientProvider)
          .submitReview(
            cardId: card.id,
            answer: _isMcq ? null : _answer.text.trim(),
            selectedOptionId: _isMcq ? _selectedOptionId : null,
            durationMs: durationMs,
            mode: _mode,
            sessionId: _sessionId,
          );
      // The server took it — remove it from the cached pack too, so coming
      // back offline cannot deal a card already answered.
      if (_offlineMode) {
        final store = await ref.read(offlineStoreProvider.future);
        store.dropCardFromPack(card.id);
      }
      if (!mounted) return;
      setState(() {
        _result = result;
        _phase = _Phase.feedback;
        _answered += 1;
        _sessionXp += (result['xpAwarded'] as int?) ?? 0;
        if ((result['verdict'] as Map?)?['correct'] == true) _correct += 1;
        _queuedOffline = false;
        _submitError = null;
        _submitting = false;
      });
    } on ApiError catch (e) {
      // A 4xx is a real rejection — show it and stay on the card. Anything
      // else (no status, 5xx) is owed to the outbox.
      if (e.status >= 400 && e.status < 500) {
        if (!mounted) return;
        setState(() {
          _submitError = e.message;
          _submitting = false;
        });
        return;
      }
      await _queueOffline(card, durationMs);
    } catch (_) {
      await _queueOffline(card, durationMs);
    }
  }

  Future<void> _queueOffline(QueueCard card, int durationMs) async {
    final store = await ref.read(offlineStoreProvider.future);
    store.enqueueReview(
      cardId: card.id,
      answer: _isMcq ? null : _answer.text.trim(),
      selectedOptionId: _isMcq ? _selectedOptionId : null,
      durationMs: durationMs,
      mode: _mode,
      sessionId: _sessionId,
    );
    if (!mounted) return;
    setState(() {
      _result = null;
      _phase = _Phase.feedback;
      _answered += 1;
      _queuedOffline = true;
      _anyOffline = true;
      _submitting = false;
    });
  }

  void _next() {
    _answer.clear();
    _selectedOptionId = null;
    _result = null;
    _queuedOffline = false;
    _submitError = null;
    _watch = Stopwatch()..start();
    setState(() {
      _index += 1;
      _phase = _Phase.answering;
    });
  }

  /// "End session" — every point already earned stands; the report opens and
  /// the remaining cards stay due. Same destination as running dry.
  void _endSession() => setState(() => _ended = true);

  /// First-exposure "Meet N more" — the web's `load` refetches the topic's
  /// next unseen batch and keeps the session (and its notes) alive.
  Future<void> _loadMoreExposure() async {
    final exposure = _exposure;
    if (exposure == null) return;
    try {
      final next = await ref
          .read(apiClientProvider)
          .learn(topicId: exposure.topic.id, batch: 4);
      if (!mounted) return;
      setState(() {
        _cards = next.batch;
        _exposure = next;
        _index = 0;
        _phase = _Phase.answering;
        _result = null;
        _answer.clear();
        _selectedOptionId = null;
        _ended = false;
        _watch = Stopwatch()..start();
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('That batch could not be loaded.')),
        );
      }
    }
  }

  /// "Load more" on the daily report — the web's `load` refetches the queue;
  /// answered cards are already graded so the fresh list is what is still due.
  Future<void> _loadMore() async {
    try {
      final fresh = await ref.read(apiClientProvider).queueToday();
      if (!mounted) return;
      setState(() {
        _cards = fresh;
        _index = 0;
        _phase = _Phase.answering;
        _result = null;
        _answer.clear();
        _selectedOptionId = null;
        _ended = false;
        _watch = Stopwatch()..start();
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('More cards could not be loaded — try again.'),
          ),
        );
      }
    }
  }

  void _finish() {
    ref.invalidate(queueProvider);
    ref.invalidate(meProvider);
    ref.invalidate(offlineSyncProvider);
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/today');
    }
  }

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _loadError != null
            ? _ErrorCard(message: _loadError!, onRetry: _loadQueue)
            : _card == null || _ended
            ? _report(context)
            : _buildCard(context),
      ),
    );
  }

  /// The report is the destination for both ways out of a session — running
  /// the queue dry and pressing "End session" are the same case, as on web.
  Widget _report(BuildContext context) {
    final exposure = _exposure;
    if (exposure != null) {
      // A first-exposure session that never dealt a card is the empty-queue
      // state, not a report — same split the web makes on `queue.length`.
      if (_answered == 0 && (_cards?.isEmpty ?? true)) {
        return _ExposureEmpty(exposure: exposure, onBack: _finish);
      }
      return _ExposureReport(
        exposure: exposure,
        correct: _correct,
        done: _answered,
        sessionXp: _sessionXp,
        onAgain: _loadMoreExposure,
        onBack: _finish,
      );
    }
    if (_answered == 0 && (_cards?.isEmpty ?? true)) {
      return _QueueEmpty(
        onCram: () => context.push('/cram'),
        onLearn: () => context.go('/learn'),
        onBack: _finish,
      );
    }
    return _SessionReport(
      correct: _correct,
      done: _answered,
      sessionXp: _sessionXp,
      queuedOffline: _anyOffline,
      ended: _ended,
      onAgain: _loadMore,
      onLadder: () => context.go('/rank'),
      onDone: _finish,
    );
  }

  Widget _buildCard(BuildContext context) {
    final card = _card!;
    final prompt = card.promptText;
    final inFeedback = _phase == _Phase.feedback;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_offlineMode)
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: _OfflineBanner(),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            children: [
              Text(
                '${_index + 1} / ${_cards!.length}',
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
              ),
              if (_exposure != null) ...[
                const SizedBox(width: 8),
                Text(
                  '${_exposure!.progress.met} / ${_exposure!.progress.total} met',
                  style: TypeScale.caption.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
              ],
              const Spacer(),
              Text(
                '${card.subjectName} · ${card.topicName}',
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        _buildNotesPanel(context),
        // The session's own progress readout — green, because you are earning.
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: _cards!.isEmpty
                        ? 0
                        : (_answered / _cards!.length).clamp(0.0, 1.0),
                    minHeight: 6,
                    backgroundColor: context.muted,
                    valueColor: AlwaysStoppedAnimation(context.good),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              if (_anyOffline)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Row(
                    children: [
                      RevisioIcon(
                        'offline',
                        size: 12,
                        color: context.mutedForeground,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Offline',
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
              Text(
                '+$_sessionXp XP',
                style: TypeScale.fine.copyWith(
                  color: context.goodStrong,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 4),
              // Ink, not green — leaving is not something to celebrate.
              TextButton(
                onPressed: _endSession,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, kTouchTarget),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    RevisioIcon(
                      'signOut',
                      size: 12,
                      color: context.mutedForeground,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'End session',
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
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(prompt, style: TypeScale.lead),
              const SizedBox(height: 20),
              if (_isMcq) _buildOptions(card, inFeedback),
              if (!_isMcq)
                RevisioTextInput(
                  controller: _answer,
                  placeholder: 'Your answer',
                  enabled: !inFeedback,
                  maxLines: 3,
                  onSubmitted: (_) => _submit(),
                ),
              if (inFeedback) _buildFeedback(context),
            ],
          ),
        ),
        if (_submitError != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: RevisioNotice(
              tone: NoticeTone.bad,
              show: true,
              child: Text(_submitError!),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: inFeedback
              ? RevisioButton(
                  onPressed: _index + 1 >= _cards!.length ? _finish : _next,
                  child: Text(
                    _index + 1 >= _cards!.length ? 'Done' : 'Next card',
                  ),
                )
              : RevisioButton(
                  onPressed: _submitting ? null : _submit,
                  loading: _submitting,
                  child: const Text('Check'),
                ),
        ),
      ],
    );
  }

  Widget _buildOptions(QueueCard card, bool inFeedback) {
    final options = card.options ?? const <CardOption>[];
    // The response does not name the right option — a wrong pick is marked,
    // and `modelAnswer`/`primaryAnswer` in the verdict carries the answer text.
    final missed = inFeedback && _result?['verdict']?['correct'] != true;
    return Column(
      children: [
        for (final o in options)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _OptionTile(
              label: o.text,
              selected: _selectedOptionId == o.id,
              state: inFeedback
                  ? (missed && o.id == _selectedOptionId
                        ? _OptionState.wrong
                        : _OptionState.idle)
                  : (_selectedOptionId == o.id
                        ? _OptionState.selected
                        : _OptionState.idle),
              enabled: !inFeedback,
              onTap: () => setState(() => _selectedOptionId = o.id),
            ),
          ),
      ],
    );
  }

  /// Cram sessions carry revision notes; the web shows them above the card.
  Widget _buildNotesPanel(BuildContext context) {
    if (_notes.isEmpty) return const SizedBox.shrink();
    final summary = _noteDensityLabel == 'summary';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: 8),
          leading: RevisioIcon('notes', size: 16, color: context.foreground),
          title: Text(
            'Revision notes${_noteDensityLabel != null ? ' · ${_noteDensityLabel![0].toUpperCase()}${_noteDensityLabel!.substring(1)}' : ''}',
            style: TypeScale.caption.copyWith(fontWeight: FontWeight.w600),
          ),
          children: [
            for (final n in _notes)
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        n.title,
                        style: TypeScale.caption.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (n.specRefs != null)
                        Text(
                          n.specRefs!,
                          style: TypeScale.fine.copyWith(
                            color: context.mutedForeground,
                          ),
                        ),
                      const SizedBox(height: 2),
                      Text(
                        n.body(summary: summary),
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildFeedback(BuildContext context) {
    final verdict = _result?['verdict'] as Map<String, dynamic>?;
    final correct = verdict?['correct'] == true;
    // A queued review has no verdict — neutral tone, not a failure stamp.
    final note = verdict?['note'] as String?;
    final model =
        _result?['modelAnswer'] as String? ??
        _result?['primaryAnswer'] as String?;
    final accent = _queuedOffline
        ? context.mutedForeground
        : (correct ? context.goodStrong : context.destructiveInk);
    final fill = _queuedOffline
        ? context.muted
        : (correct ? context.goodSoft : context.destructive.withOpacity(0.08));
    final edge = _queuedOffline
        ? context.border
        : (correct ? context.good : context.destructive.withOpacity(0.4));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            border: Border.all(color: edge),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _queuedOffline
                    ? 'Saved — syncs when you are back online'
                    : (correct ? 'Correct' : 'Not quite'),
                style: TypeScale.strong.copyWith(color: accent),
              ),
              if (note != null && note.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(note, style: TypeScale.caption),
              ],
              if (model != null && model.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  'Answer: $model',
                  style: TypeScale.caption.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
              ],
              if (_result?['xpAwarded'] != null) ...[
                const SizedBox(height: 4),
                Text(
                  '+${_result!['xpAwarded']} XP · streak ${_result!['streak']}',
                  style: TypeScale.caption.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

enum _Phase { answering, feedback }

enum _OptionState { idle, selected, wrong }

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.label,
    required this.selected,
    required this.state,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final _OptionState state;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color border;
    switch (state) {
      case _OptionState.wrong:
        bg = context.destructive.withOpacity(0.08);
        border = context.destructive;
      case _OptionState.selected:
      case _OptionState.idle:
        bg = selected || state == _OptionState.selected
            ? context.secondary
            : context.card;
        border = selected || state == _OptionState.selected
            ? context.foreground
            : context.border;
    }
    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
        child: Container(
          constraints: const BoxConstraints(minHeight: kTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            border: Border.all(color: border, width: selected ? 2 : 1),
          ),
          child: Text(label, style: TypeScale.body),
        ),
      ),
    );
  }
}

/// First exposure ran out of new cards before any were dealt — the web's
/// "Every question met" / "No questions here yet" card.
class _ExposureEmpty extends StatelessWidget {
  const _ExposureEmpty({required this.exposure, required this.onBack});

  final FirstExposure exposure;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final topic = exposure.topic;
    final allMet =
        exposure.progress.total > 0 && exposure.progress.remaining == 0;
    final subjectId = topic.subjectId;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RevisioIcon(
              allMet ? 'reviewed' : 'notes',
              size: 22,
              color: context.foreground,
            ),
            const SizedBox(height: 12),
            Text(
              allMet ? 'Every question met' : 'No questions here yet',
              style: TypeScale.displaySm,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              allMet
                  ? 'You have now seen all ${exposure.progress.total} ${exposure.progress.total == 1 ? 'question' : 'questions'} in “${topic.name}”. They will come back on their own schedule from here.'
                  : '“${topic.name}” has no questions attached. Its notes are still worth reading.',
              style: TypeScale.body.copyWith(color: context.mutedForeground),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            if (subjectId != null && subjectId.isNotEmpty)
              RevisioSecondaryButton(
                onPressed: () => context.push('/learn/$subjectId/${topic.id}'),
                child: const Text('Read the notes'),
              ),
            const SizedBox(height: 8),
            RevisioButton(
              onPressed: onBack,
              child: const Text('Back to reviews'),
            ),
          ],
        ),
      ),
    );
  }
}

/// No session at all and the queue came back empty — the web's clear-schedule
/// card with Cram and Read-ahead exits.
class _QueueEmpty extends ConsumerWidget {
  const _QueueEmpty({
    required this.onCram,
    required this.onLearn,
    required this.onBack,
  });

  final VoidCallback onCram;
  final VoidCallback onLearn;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).valueOrNull;
    final streak = me?.gamification.streak ?? 0;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RevisioIcon('reviewed', size: 22, color: context.foreground),
            const SizedBox(height: 12),
            Text(
              copy.emptyQueueLine(0, streak),
              style: TypeScale.body.copyWith(color: context.mutedForeground),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            RevisioSecondaryButton(
              onPressed: onCram,
              child: const Text('Cram a topic'),
            ),
            const SizedBox(height: 8),
            RevisioButton(onPressed: onLearn, child: const Text('Read ahead')),
            const SizedBox(height: 8),
            TextButton(onPressed: onBack, child: const Text('Back to Today')),
          ],
        ),
      ),
    );
  }
}

/// The first-look report — where a Learn batch lands. The web's
/// `FirstExposureReport`: met count, correct/done, and "Meet N more" until the
/// topic is fully met, then a Cram exit.
class _ExposureReport extends StatelessWidget {
  const _ExposureReport({
    required this.exposure,
    required this.correct,
    required this.done,
    required this.sessionXp,
    required this.onAgain,
    required this.onBack,
  });

  final FirstExposure exposure;
  final int correct;
  final int done;
  final int sessionXp;
  final VoidCallback onAgain;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final met = exposure.progress.met + done;
    final total = exposure.progress.total;
    final remaining = total - met > 0 ? total - met : 0;
    final topic = exposure.topic;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                RevisioIcon('learn', size: 13, color: context.mutedForeground),
                const SizedBox(width: 6),
                Text(
                  'First look',
                  style: TypeScale.fine.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              remaining == 0
                  ? 'That is the whole topic'
                  : '$done new ${done == 1 ? 'question' : 'questions'} met',
              style: TypeScale.displaySm,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              remaining == 0
                  ? 'You have met all $total questions in “${topic.name}”. They now come back on their own schedule, so you do not need to chase them.'
                  : '$met of $total met in “${topic.name}”. $remaining still to meet. They will keep.',
              style: TypeScale.body.copyWith(color: context.mutedForeground),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              children: [
                _ReportChip('$correct/$done correct'),
                _ReportChip('$met/$total met'),
                if (sessionXp > 0) _ReportChip('+$sessionXp XP'),
              ],
            ),
            const SizedBox(height: 20),
            if (remaining > 0)
              RevisioSecondaryButton(
                onPressed: onAgain,
                child: Text('Meet ${remaining < 4 ? remaining : 4} more'),
              )
            else
              RevisioSecondaryButton(
                onPressed: () => context.push(
                  '/cram?topic=${Uri.encodeComponent(topic.id)}',
                ),
                child: const Text('Practise this topic'),
              ),
            const SizedBox(height: 8),
            RevisioButton(
              onPressed: () => context.go('/review'),
              child: const Text('Back to reviews'),
            ),
            const SizedBox(height: 8),
            TextButton(onPressed: onBack, child: const Text('Back to Today')),
          ],
        ),
      ),
    );
  }
}

/// The daily session report — score, XP and the way back to more work. The
/// web's `SessionReport` also names the rank when a session promoted; the
/// crest/promotion half needs a before/after rank fetch and is tracked as a
/// follow-up rather than faked here.
class _SessionReport extends StatelessWidget {
  const _SessionReport({
    required this.correct,
    required this.done,
    required this.sessionXp,
    required this.queuedOffline,
    required this.ended,
    required this.onAgain,
    required this.onLadder,
    required this.onDone,
  });

  final int correct;
  final int done;
  final int sessionXp;
  final bool queuedOffline;
  final bool ended;
  final VoidCallback onAgain;
  final VoidCallback onLadder;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              ended ? 'Session ended' : 'Session complete',
              style: TypeScale.displaySm,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              queuedOffline
                  ? '$done answered — saved offline, will sync.'
                  : copy.sessionSummary(correct, done),
              style: TypeScale.body.copyWith(color: context.mutedForeground),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              children: [
                _ReportChip('$correct/$done correct'),
                if (sessionXp > 0) _ReportChip('+$sessionXp XP'),
              ],
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton.icon(
                  onPressed: onAgain,
                  icon: RevisioIcon(
                    'next',
                    size: 16,
                    color: context.foreground,
                  ),
                  label: const Text('Load more'),
                ),
                TextButton.icon(
                  onPressed: onLadder,
                  icon: RevisioIcon(
                    'next',
                    size: 16,
                    color: context.foreground,
                  ),
                  label: const Text('See the ladder'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            RevisioButton(
              onPressed: onDone,
              child: const Text('Back to Today'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReportChip extends StatelessWidget {
  const _ReportChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.muted,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Text(
        label,
        style: TypeScale.fine.copyWith(
          color: context.mutedForeground,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: context.muted,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Row(
        children: [
          RevisioIcon('offline', size: 16, color: context.mutedForeground),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              "You're offline — answers save to this device and sync later.",
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            style: TypeScale.body.copyWith(color: context.mutedForeground),
          ),
          const SizedBox(height: 16),
          RevisioButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}
