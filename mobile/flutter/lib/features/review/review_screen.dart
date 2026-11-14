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

  const ReviewSession({
    required this.cards,
    this.title = 'Review',
    this.mode = 'daily',
    this.sessionId,
    this.notes = const [],
    this.noteDensityLabel,
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

  int _index = 0;
  _Phase _phase = _Phase.answering;
  final _answer = TextEditingController();
  String? _selectedOptionId;
  Map<String, dynamic>? _result;
  int _correct = 0;
  int _answered = 0;
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
      final result = await ref.read(apiClientProvider).submitReview(
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
                : _card == null
                    ? _DoneCard(
                        answered: _answered,
                        correct: _correct,
                        queuedOffline: _anyOffline,
                        onDone: _finish,
                      )
                    : _buildCard(context),
      ),
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
              Text('${_index + 1} / ${_cards!.length}',
                  style: TypeScale.caption.copyWith(color: context.mutedForeground)),
              const Spacer(),
              Text('${card.subjectName} · ${card.topicName}',
                  style: TypeScale.caption.copyWith(color: context.mutedForeground),
                  overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
        _buildNotesPanel(context),
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
                  child: Text(_index + 1 >= _cards!.length ? 'Done' : 'Next card'),
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
                  : (_selectedOptionId == o.id ? _OptionState.selected : _OptionState.idle),
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
                      Text(n.title, style: TypeScale.caption.copyWith(fontWeight: FontWeight.w700)),
                      if (n.specRefs != null)
                        Text(n.specRefs!,
                            style: TypeScale.fine.copyWith(color: context.mutedForeground)),
                      const SizedBox(height: 2),
                      Text(
                        n.body(summary: summary),
                        style: TypeScale.fine.copyWith(color: context.mutedForeground, height: 1.4),
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
    final model = _result?['modelAnswer'] as String? ?? _result?['primaryAnswer'] as String?;
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
                _queuedOffline ? 'Saved — syncs when you are back online' : (correct ? 'Correct' : 'Not quite'),
                style: TypeScale.strong.copyWith(color: accent),
              ),
              if (note != null && note.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(note, style: TypeScale.caption),
              ],
              if (model != null && model.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text('Answer: $model',
                    style: TypeScale.caption.copyWith(color: context.mutedForeground)),
              ],
              if (_result?['xpAwarded'] != null) ...[
                const SizedBox(height: 4),
                Text(
                  '+${_result!['xpAwarded']} XP · streak ${_result!['streak']}',
                  style: TypeScale.caption.copyWith(color: context.mutedForeground),
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
        bg = selected || state == _OptionState.selected ? context.secondary : context.card;
        border = selected || state == _OptionState.selected ? context.foreground : context.border;
    }
    return InkWell(
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
    );
  }
}

class _DoneCard extends StatelessWidget {
  const _DoneCard({
    required this.answered,
    required this.correct,
    required this.queuedOffline,
    required this.onDone,
  });

  final int answered;
  final int correct;
  final bool queuedOffline;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Session complete', style: TypeScale.displaySm),
            const SizedBox(height: 8),
            Text(
              queuedOffline
                  ? '$answered answered — saved offline, will sync.'
                  : '$correct of $answered correct.',
              style: TypeScale.body.copyWith(color: context.mutedForeground),
            ),
            const SizedBox(height: 24),
            RevisioButton(onPressed: onDone, child: const Text('Back to Today')),
          ],
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
          Text(message, style: TypeScale.body.copyWith(color: context.mutedForeground)),
          const SizedBox(height: 16),
          RevisioButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}
