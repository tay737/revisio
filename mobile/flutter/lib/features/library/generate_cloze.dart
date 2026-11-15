/// "Generate fill-the-blank questions" — a port of
/// `src/app/(app)/library/GenerateCloze.tsx`. Proposals come from the
/// topic's own notes; the author keeps, edits or discards each one and
/// nothing is written until they approve.
library revisio.features.library.generate_cloze;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/staff_models.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';

class _Proposal {
  _Proposal({
    required this.answer,
    required this.textWithBlank,
    this.lessonTitle,
  });

  String answer;
  String textWithBlank;
  String? lessonTitle;
  bool keep = true;
}

class GenerateCloze extends ConsumerStatefulWidget {
  const GenerateCloze({super.key, required this.topics, required this.onDone});

  final List<MyTopic> topics;
  final void Function(String message) onDone;

  @override
  ConsumerState<GenerateCloze> createState() => _GenerateClozeState();
}

class _GenerateClozeState extends ConsumerState<GenerateCloze> {
  String _topicId = '';
  int _count = 10;
  List<_Proposal>? _proposals;
  bool _busy = false;
  bool _inserting = false;
  String _error = '';

  MyTopic? get _picked =>
      widget.topics.where((t) => t.id == _topicId).firstOrNull;

  Future<void> _generate() async {
    if (_topicId.isEmpty) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final d = await ref.read(apiClientProvider).contentAction({
        'action': 'generate_cloze',
        'topicId': _topicId,
        'count': _count,
      });
      if (!mounted) return;
      final raw = (d['proposals'] as List?) ?? [];
      setState(() {
        _proposals = [
          for (final p in raw)
            _Proposal(
              answer: (p as Map)['answer'] as String? ?? '',
              textWithBlank: p['textWithBlank'] as String? ?? '',
              lessonTitle: p['lessonTitle'] as String?,
            ),
        ];
      });
      if (raw.isEmpty) {
        setState(
          () => _error = 'No new questions came out of these notes. Add more prose to the topic, or the notes may already be fully asked.',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError ? e.message : 'Generation failed.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _insert() async {
    final proposals = _proposals;
    if (proposals == null) return;
    final keepers = proposals
        .where(
          (p) =>
              p.keep &&
              p.textWithBlank.contains('____') &&
              p.answer.trim().isNotEmpty,
        )
        .toList();
    if (keepers.isEmpty) return;
    setState(() {
      _inserting = true;
      _error = '';
    });
    try {
      final d = await ref.read(apiClientProvider).contentAction({
        'action': 'insert_cloze',
        'topicId': _topicId,
        'proposals': [
          for (final p in keepers)
            {
              'answer': p.answer,
              'textWithBlank': p.textWithBlank,
              if (p.lessonTitle != null) 'lessonTitle': p.lessonTitle,
            },
        ],
      });
      if (!mounted) return;
      final inserted = d['inserted'] as int? ?? 0;
      widget.onDone(
        inserted == keepers.length
            ? '$inserted ${inserted == 1 ? 'question' : 'questions'} added to “${_picked?.name}”.'
            : '$inserted added. ${keepers.length - inserted} were already in the topic and were skipped.',
      );
      setState(() => _proposals = null);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is ApiError ? e.message : 'Insert failed.');
      }
    } finally {
      if (mounted) setState(() => _inserting = false);
    }
  }

  int get _kept =>
      _proposals
          ?.where(
            (p) =>
                p.keep &&
                p.textWithBlank.contains('____') &&
                p.answer.trim().isNotEmpty,
          )
          .length ??
      0;

  @override
  Widget build(BuildContext context) {
    final proposals = _proposals;
    final picked = _picked;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error.isNotEmpty) ...[
          _ErrorNotice(text: _error),
          const SizedBox(height: 16),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: _Labeled(
                'Topic',
                child: DropdownButtonFormField<String>(
                  initialValue: _topicId.isEmpty ? null : _topicId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    isDense: true,
                    hintText: 'Choose a topic…',
                  ),
                  items: [
                    for (final t in widget.topics)
                      DropdownMenuItem(
                        value: t.id,
                        child: Text(
                          t.subjectName != null && t.subjectName!.isNotEmpty
                              ? '${t.subjectName} — ${t.name}'
                              : t.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: (v) => setState(() {
                    _topicId = v ?? '';
                    _proposals = null;
                    _error = '';
                  }),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: _Labeled(
                'How many: $_count',
                child: Slider(
                  value: _count.toDouble(),
                  min: 5,
                  max: 30,
                  divisions: 5,
                  onChanged: (v) => setState(() => _count = v.round()),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        _Caption(
          picked == null
              ? 'Questions are proposed from the topic’s own notes.'
              : picked.subjectName != null && picked.subjectName!.isNotEmpty
              ? 'Reading the notes of “${picked.name}” in ${picked.subjectName}.'
              : 'Reading the notes of “${picked.name}”.',
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            RevisioSecondaryButton(
              compact: true,
              onPressed: _topicId.isEmpty || _busy ? null : _generate,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const RevisioIcon('rocket', size: 16),
                  const SizedBox(width: 8),
                  Text(_busy ? 'Reading the notes…' : 'Propose questions'),
                ],
              ),
            ),
            if (proposals != null && _kept > 0)
              RevisioGoodButton(
                compact: true,
                onPressed: _inserting ? null : _insert,
                child: Text(
                  _inserting
                      ? 'Adding…'
                      : 'Add $_kept ${_kept == 1 ? 'question' : 'questions'}',
                ),
              ),
          ],
        ),
        if (proposals != null && proposals.isNotEmpty) ...[
          const SizedBox(height: 16),
          for (var i = 0; i < proposals.length; i++)
            _ProposalCard(
              proposal: proposals[i],
              index: i,
              onChanged: () => setState(() {}),
            ),
          const SizedBox(height: 8),
          _Caption(
            'Edit any question before adding it. The blank is ____; the answer is what fills it.',
          ),
        ],
      ],
    );
  }
}

class _ProposalCard extends StatefulWidget {
  const _ProposalCard({
    required this.proposal,
    required this.index,
    required this.onChanged,
  });

  final _Proposal proposal;
  final int index;
  final VoidCallback onChanged;

  @override
  State<_ProposalCard> createState() => _ProposalCardState();
}

class _ProposalCardState extends State<_ProposalCard> {
  late final TextEditingController _text = TextEditingController(
    text: widget.proposal.textWithBlank,
  );
  late final TextEditingController _answer = TextEditingController(
    text: widget.proposal.answer,
  );

  @override
  void dispose() {
    _text.dispose();
    _answer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.proposal;
    return Opacity(
      opacity: p.keep ? 1 : 0.55,
      child: Container(
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
            TextField(
              controller: _text,
              onChanged: (v) {
                p.textWithBlank = v;
                widget.onChanged();
              },
              style: TypeScale.caption,
              decoration: const InputDecoration(isDense: true),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                _Caption('Answer'),
                const SizedBox(width: 8),
                SizedBox(
                  width: 176,
                  child: TextField(
                    controller: _answer,
                    onChanged: (v) {
                      p.answer = v;
                      widget.onChanged();
                    },
                    style: TypeScale.caption,
                    decoration: const InputDecoration(isDense: true),
                  ),
                ),
                if (p.lessonTitle != null) ...[
                  const SizedBox(width: 8),
                  _MiniChip(p.lessonTitle!),
                ],
                const Spacer(),
                Semantics(
                  button: true,
                  toggled: p.keep,
                  child: TextButton.icon(
                    onPressed: () {
                      p.keep = !p.keep;
                      widget.onChanged();
                    },
                    icon: RevisioIcon(
                      p.keep ? 'correct' : 'close',
                      size: 15,
                      color: p.keep
                          ? context.goodStrong
                          : context.mutedForeground,
                    ),
                    label: Text(
                      p.keep ? 'Keeping' : 'Discarded',
                      style: TypeScale.caption.copyWith(
                        color: p.keep ? context.goodStrong : context.foreground,
                      ),
                    ),
                    style: TextButton.styleFrom(
                      minimumSize: const Size(0, kTouchTarget),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                  ),
                ),
              ],
            ),
          ],
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
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
        border: Border.all(color: context.border),
      ),
      child: Text(text, style: TypeScale.fine),
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
      children: [
        Text(
          label,
          style: TypeScale.caption.copyWith(
            fontWeight: FontWeight.w600,
            color: context.mutedForeground,
          ),
        ),
        const SizedBox(height: 4),
        child,
      ],
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
