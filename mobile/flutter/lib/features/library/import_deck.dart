/// "Bring a deck" — a port of `src/app/(app)/library/ImportDeck.tsx`.
/// Import into an existing topic or a new one; the choice is the point.
library revisio.features.library.import_deck;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../../engine/staff_models.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';

class ImportDeck extends ConsumerStatefulWidget {
  const ImportDeck({
    super.key,
    required this.topics,
    required this.subjects,
    required this.onImported,
    required this.onChanged,
  });

  final List<MyTopic> topics;
  final List<Subject> subjects;
  final void Function(String message) onImported;
  final Future<void> Function() onChanged;

  @override
  ConsumerState<ImportDeck> createState() => _ImportDeckState();
}

class _ImportDeckState extends ConsumerState<ImportDeck> {
  String? _fileName;
  List<int>? _fileBytes;
  String _kind = 'tsv';
  late String _mode = widget.topics.isNotEmpty ? 'existing' : 'new';
  String _topicId = '';
  final _name = TextEditingController();
  String _subjectId = '';
  bool _publish = false;
  bool _busy = false;
  String _error = '';
  String _report = '';
  bool _helpOpen = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _ready =>
      _fileBytes != null &&
      (_mode == 'existing'
          ? _topicId.isNotEmpty
          : _name.text.trim().isNotEmpty);

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['csv', 'tsv', 'txt'],
      withData: true,
    );
    final file = result?.files.firstOrNull;
    if (file == null) return;
    setState(() {
      _fileName = file.name;
      _fileBytes = file.bytes;
      _report = '';
    });
  }

  Future<void> _submit() async {
    final bytes = _fileBytes;
    if (bytes == null) return;
    setState(() {
      _busy = true;
      _error = '';
      _report = '';
    });
    try {
      final res = await ref
          .read(apiClientProvider)
          .importDeck(
            bytes: bytes,
            filename: _fileName ?? 'deck.txt',
            kind: _kind,
            topicId: _mode == 'existing' ? _topicId : null,
            topicName: _mode == 'new' ? _name.text.trim() : null,
            subjectId: _mode == 'new'
                ? (_subjectId.isNotEmpty
                      ? _subjectId
                      : widget.subjects.firstOrNull?.id)
                : null,
            publish: _mode == 'new' && _publish,
          );
      if (!mounted) return;
      final created = res['created'] as int? ?? 0;
      final failed = res['failed'] as int? ?? 0;
      final attached = res['attached'] == true;
      final topicName = res['topicName'] as String? ?? '';
      final where = attached ? 'into “$topicName”' : 'as “$topicName”';
      setState(() {
        _report =
            '$created ${created == 1 ? 'question' : 'questions'} added $where.'
            '${failed > 0 ? ' $failed ${failed == 1 ? 'row' : 'rows'} skipped.' : ''}';
        _fileName = null;
        _fileBytes = null;
        _name.clear();
      });
      widget.onImported('');
      await widget.onChanged();
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiError
              ? e.message
              : 'That import did not go through.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _Labeled(
                'File',
                child: OutlinedButton.icon(
                  onPressed: _pick,
                  icon: const RevisioIcon('upload', size: 15),
                  label: Text(
                    _fileName ?? 'Choose a .csv, .tsv or .txt file',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, kTouchTarget),
                    alignment: Alignment.centerLeft,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Labeled(
                'Format',
                child: DropdownButtonFormField<String>(
                  initialValue: _kind,
                  isExpanded: true,
                  decoration: const InputDecoration(isDense: true),
                  items: const [
                    DropdownMenuItem(
                      value: 'tsv',
                      child: Text('TSV / Anki export'),
                    ),
                    DropdownMenuItem(value: 'csv', child: Text('CSV')),
                    DropdownMenuItem(
                      value: 'anki_tsv',
                      child: Text('Anki TSV'),
                    ),
                  ],
                  onChanged: (v) => setState(() => _kind = v ?? 'tsv'),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const _LabeledText('Where should these questions go?'),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            border: Border.all(color: context.border.withOpacity(0.7)),
            color: context.card.withOpacity(0.6),
          ),
          child: Row(
            children: [
              for (final (value, label) in [
                ('existing', 'Into a topic I have'),
                ('new', 'Into a new topic'),
              ])
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: _mode == value,
                    child: GestureDetector(
                      onTap: value == 'existing' && widget.topics.isEmpty
                          ? null
                          : () => setState(() => _mode = value),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        decoration: BoxDecoration(
                          color: _mode == value
                              ? context.foreground
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(RadiusTokens.sm),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          label,
                          textAlign: TextAlign.center,
                          style: TypeScale.caption.copyWith(
                            fontWeight: FontWeight.w600,
                            color: _mode == value
                                ? context.background
                                : context.foreground,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (_mode == 'existing') ...[
          const _LabeledText('Attach to'),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            initialValue: _topicId.isEmpty ? null : _topicId,
            isExpanded: true,
            decoration: const InputDecoration(
              isDense: true,
              hintText: 'Pick a topic…',
            ),
            items: [
              for (final t in widget.topics)
                DropdownMenuItem(
                  value: t.id,
                  child: Text(
                    '${t.name}'
                    '${t.cardCount != null ? ' · ${t.cardCount} questions, ${t.lessonCount ?? 0} note ${(t.lessonCount ?? 0) == 1 ? 'set' : 'sets'}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() => _topicId = v ?? ''),
          ),
          const SizedBox(height: 6),
          _Caption(
            'The notes in that topic stay where they are, and the questions land beside them.',
          ),
        ] else ...[
          Row(
            children: [
              Expanded(
                child: _Labeled(
                  'Topic name',
                  child: TextField(
                    controller: _name,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      hintText: 'Defaults to the file name',
                      isDense: true,
                    ),
                    style: TypeScale.body,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Labeled(
                  'Subject',
                  child: DropdownButtonFormField<String>(
                    initialValue: widget.subjects.any((s) => s.id == _subjectId)
                        ? _subjectId
                        : null,
                    isExpanded: true,
                    decoration: const InputDecoration(isDense: true),
                    items: [
                      for (final s in widget.subjects)
                        DropdownMenuItem(value: s.id, child: Text(s.name)),
                    ],
                    onChanged: (v) => setState(() => _subjectId = v ?? ''),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Semantics(
            button: true,
            toggled: _publish,
            child: InkWell(
              onTap: () => setState(() => _publish = !_publish),
              borderRadius: BorderRadius.circular(RadiusTokens.sm),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 20,
                      height: 20,
                      child: Checkbox(
                        value: _publish,
                        onChanged: (v) => setState(() => _publish = v ?? false),
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Submit for students to see',
                            style: TypeScale.caption,
                          ),
                          _Caption('Someone checks it before it goes out.'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 12),
        _HelpDisclosure(
          open: _helpOpen,
          onToggle: () => setState(() => _helpOpen = !_helpOpen),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            RevisioGoodButton(
              compact: true,
              onPressed: !_ready || _busy ? null : _submit,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const RevisioIcon('upload', size: 16, color: Colors.white),
                  const SizedBox(width: 8),
                  Text(_busy ? 'Importing…' : 'Import'),
                ],
              ),
            ),
            if (_report.isNotEmpty) ...[
              const SizedBox(width: 12),
              Flexible(
                child: Text(
                  _report,
                  style: TypeScale.caption.copyWith(color: context.goodStrong),
                ),
              ),
            ],
          ],
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: context.destructive.withOpacity(0.12),
              borderRadius: BorderRadius.circular(RadiusTokens.md),
              border: Border.all(color: context.destructive.withOpacity(0.4)),
            ),
            child: Text(
              _error,
              style: TypeScale.caption.copyWith(color: context.destructiveInk),
            ),
          ),
        ],
      ],
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

class _HelpDisclosure extends StatelessWidget {
  const _HelpDisclosure({required this.open, required this.onToggle});

  final bool open;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            button: true,
            expanded: open,
            child: InkWell(
              onTap: onToggle,
              borderRadius: BorderRadius.circular(RadiusTokens.sm),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    const RevisioIcon('notes', size: 15),
                    const SizedBox(width: 8),
                    Text(
                      'What a file can look like',
                      style: TypeScale.caption.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    RevisioIcon(
                      open ? 'collapse' : 'expand',
                      size: 14,
                      color: context.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (open) ...[
            const SizedBox(height: 12),
            for (final line in [
              'question⇥answer',
              'cloze: The cell\'s powerhouse is the ____ | mitochondrion',
              'mcq: Which organelle…?; Ribosome; *Mitochondrion; Nucleus',
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  line,
                  style: TypeScale.caption.copyWith(
                    fontFamily: 'monospace',
                    color: context.mutedForeground,
                  ),
                ),
              ),
            _Caption('* marks the correct option, or end the row with | 1.'),
          ],
        ],
      ),
    );
  }
}
