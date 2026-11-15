/// Teaching — classes, join codes and how each student is doing.
///
/// The web's `/teacher`, ported to the same subset the native clients carry:
/// create a class, rotate its code, rename it, add a student by email,
/// remove one, switch the class's subject, delete the class, and publish or
/// withdraw the topics you wrote. Card/lesson authoring stays web-only.
///
/// Every action goes through `staffAction`, which re-reads the console after
/// it lands, so this screen never shows a state the server has moved past.
library revisio.features.staff.teaching_screen;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../../engine/staff_models.dart';
import 'staff_bits.dart';
import 'staff_controller.dart';

class TeachingScreen extends ConsumerWidget {
  const TeachingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Teaching')),
      body: SafeArea(
        child: staff.teacherData == null
            ? _LoadState(staff: staff)
            : _Console(staff: staff),
      ),
    );
  }
}

class _LoadState extends ConsumerWidget {
  const _LoadState({required this.staff});

  final StaffState staff;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        const _Eyebrow('Staff'),
        Text(
          'Classes, join codes, progress.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 18),
        _Notices(staff: staff),
        StaffSoftCard(
          child: Text(
            staff.staffBusy
                ? 'Loading your classes…'
                : staff.staffError ?? 'Your classes are not loaded yet.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: RevisioSecondaryButton(
            onPressed: staff.staffBusy
                ? null
                : () =>
                      ref.read(staffControllerProvider.notifier).loadTeaching(),
            child: const Text('Load classes'),
          ),
        ),
      ],
    );
  }
}

class _Console extends ConsumerWidget {
  const _Console({required this.staff});

  final StaffState staff;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = staff.teacherData!;
    final subjects = data.subjects;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        const _Eyebrow('Staff'),
        Text(
          'Classes, join codes, progress.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 18),
        _Notices(staff: staff),
        _NewClassCard(subjects: subjects),
        if (data.classes.isEmpty) ...[
          const SizedBox(height: 20),
          const StaffSoftCard(
            child: Text(
              'No classes yet. Create one above, share the code, and students appear here as they join.',
              style: TypeScale.fine,
            ),
          ),
        ],
        for (var i = 0; i < data.classes.length; i++) ...[
          const SizedBox(height: 16),
          _ClassCard(klass: data.classes[i], subjects: subjects),
        ],
        const SizedBox(height: 20),
        StaffCard(
          title: 'Content',
          trailing: StaffChip(
            '${staff.myTopics.length} topic${staff.myTopics.length == 1 ? '' : 's'}',
          ),
          children: [
            Text(
              'Staff topics go public immediately, and the questions inside go with them.',
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
            const SizedBox(height: 10),
            if (staff.myTopics.isEmpty)
              Text(
                'Nothing written yet — start in My content.',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              )
            else
              for (var i = 0; i < staff.myTopics.length; i++) ...[
                if (i > 0) const StaffHairline(),
                _TopicPublishRow(topic: staff.myTopics[i]),
              ],
          ],
        ),
        const SizedBox(height: 20),
        const _NewSubjectCard(),
        const SizedBox(height: 28),
      ],
    );
  }
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: StaffLabel(text),
    );
  }
}

class _Notices extends ConsumerWidget {
  const _Notices({required this.staff});

  final StaffState staff;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final note = staff.staffNote;
    final error = staff.staffError;
    if (note == null && error == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        children: [
          if (note != null)
            RevisioNotice(tone: NoticeTone.note, show: true, child: Text(note)),
          if (error != null) ...[
            if (note != null) const SizedBox(height: 8),
            RevisioNotice(tone: NoticeTone.bad, show: true, child: Text(error)),
          ],
        ],
      ),
    );
  }
}

class _NewClassCard extends ConsumerStatefulWidget {
  const _NewClassCard({required this.subjects});

  final List<SubjectRef> subjects;

  @override
  ConsumerState<_NewClassCard> createState() => _NewClassCardState();
}

class _NewClassCardState extends ConsumerState<_NewClassCard> {
  final _name = TextEditingController();
  String _subjectId = '';

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(staffControllerProvider);
    final subjects = widget.subjects;
    return StaffCard(
      title: 'New class',
      children: [
        Text(
          'You will get a six-character code to hand out. You can rotate it if it spreads further than you want.',
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 12),
        RevisioField(
          label: 'Class name',
          child: RevisioTextInput(
            controller: _name,
            placeholder: '10B Biology',
            onChanged: (_) => setState(() {}),
          ),
        ),
        if (subjects.isNotEmpty) ...[
          const SizedBox(height: 10),
          StaffSubjectPicker(
            label: 'Subject',
            current: _subjectId.isEmpty && subjects.isNotEmpty
                ? subjects.first.id
                : _subjectId,
            subjects: subjects,
            onPick: (id) => setState(() => _subjectId = id),
          ),
        ],
        const SizedBox(height: 14),
        Align(
          alignment: Alignment.centerLeft,
          child: RevisioButton(
            enabled: _name.text.trim().isNotEmpty && !staff.staffBusy,
            loading: staff.staffBusy,
            onPressed: () {
              final subjectId = _subjectId.isNotEmpty
                  ? _subjectId
                  : (subjects.isNotEmpty ? subjects.first.id : '');
              ref
                  .read(staffControllerProvider.notifier)
                  .staffAction(
                    admin: false,
                    body: {
                      'action': 'create_class',
                      'name': _name.text.trim(),
                      if (subjectId.isNotEmpty) 'subjectId': subjectId,
                    },
                    okMsg: 'Class created. Share the join code.',
                  );
              _name.clear();
              setState(() {});
            },
            child: const Text('Create class'),
          ),
        ),
      ],
    );
  }
}

class _ClassCard extends ConsumerStatefulWidget {
  const _ClassCard({required this.klass, required this.subjects});

  final TeacherClass klass;
  final List<SubjectRef> subjects;

  @override
  ConsumerState<_ClassCard> createState() => _ClassCardState();
}

/// New subject — the web's last card on `/teacher`. Subjects group topics,
/// one per course usually.
class _NewSubjectCard extends ConsumerStatefulWidget {
  const _NewSubjectCard();

  @override
  ConsumerState<_NewSubjectCard> createState() => _NewSubjectCardState();
}

class _NewSubjectCardState extends ConsumerState<_NewSubjectCard> {
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(staffControllerProvider);
    return StaffCard(
      title: 'New subject',
      children: [
        Text(
          'Subjects group topics, one per course usually.',
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: RevisioTextInput(
                controller: _name,
                placeholder: 'Chemistry',
                onChanged: (_) => setState(() {}),
              ),
            ),
            const SizedBox(width: 8),
            RevisioButton(
              compact: true,
              enabled: _name.text.trim().isNotEmpty && !staff.staffBusy,
              onPressed: () {
                ref
                    .read(staffControllerProvider.notifier)
                    .staffAction(
                      admin: false,
                      body: {
                        'action': 'create_subject',
                        'name': _name.text.trim(),
                      },
                      okMsg: 'Subject created.',
                    );
                _name.clear();
                setState(() {});
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ],
    );
  }
}

class _ClassCardState extends ConsumerState<_ClassCard> {
  bool _renaming = false;
  bool _inviting = false;
  bool _copied = false;
  bool _copyFailed = false;
  final _renameDraft = TextEditingController();
  final _inviteEmail = TextEditingController();

  TeacherClass get klass => widget.klass;

  @override
  void dispose() {
    _renameDraft.dispose();
    _inviteEmail.dispose();
    super.dispose();
  }

  void _action(Map<String, dynamic> body, String okMsg) {
    ref
        .read(staffControllerProvider.notifier)
        .staffAction(admin: false, body: body, okMsg: okMsg);
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(staffControllerProvider);
    final roster = klass.roster;
    return StaffCard(
      title: klass.name,
      trailing: StaffChip(
        '${roster.length} student${roster.length == 1 ? '' : 's'}',
      ),
      children: [
        // The join code, and the things a teacher does to it — copy first,
        // because the code is the thing they hand out.
        Wrap(
          spacing: 10,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: context.muted,
                borderRadius: BorderRadius.circular(RadiusTokens.sm),
              ),
              child: Text(klass.joinCode, style: TypeScale.strong),
            ),
            RevisioSecondaryButton(
              compact: true,
              onPressed: () async {
                try {
                  await Clipboard.setData(ClipboardData(text: klass.joinCode));
                  if (!mounted) return;
                  setState(() {
                    _copied = true;
                    _copyFailed = false;
                  });
                  Future.delayed(const Duration(seconds: 2), () {
                    if (mounted) setState(() => _copied = false);
                  });
                } catch (_) {
                  if (mounted) {
                    setState(() {
                      _copied = false;
                      _copyFailed = true;
                    });
                  }
                }
              },
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RevisioIcon(_copied ? 'correct' : 'notes', size: 14),
                  const SizedBox(width: 6),
                  Text(_copied ? 'Copied' : 'Copy'),
                ],
              ),
            ),
            RevisioGhostButton(
              onPressed: staff.staffBusy
                  ? null
                  : () async {
                      // Rotating kills the live join code instantly — the old
                      // code stops working the moment this lands.
                      final ok = await staffConfirm(
                        context,
                        title: 'Rotate the join code?',
                        message: 'The current code stops working immediately. Students will need the new one.',
                        confirmLabel: 'Rotate',
                      );
                      if (ok) {
                        _action({
                          'action': 'rotate_code',
                          'classId': klass.id,
                        }, 'New code generated. The old one no longer works.');
                      }
                    },
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RevisioIcon('rotate', size: 14),
                  SizedBox(width: 6),
                  Text('Rotate'),
                ],
              ),
            ),
          ],
        ),
        if (_copyFailed) ...[
          const SizedBox(height: 4),
          Text(
            'Copy blocked. Select the code and copy it by hand.',
            style: TypeScale.micro.copyWith(color: context.destructiveInk),
          ),
        ],
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            RevisioGhostButton(
              onPressed: () => setState(() {
                _renaming = !_renaming;
                if (_renaming) _renameDraft.text = klass.name;
              }),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RevisioIcon('edit', size: 14),
                  SizedBox(width: 6),
                  Text('Rename'),
                ],
              ),
            ),
            RevisioGhostButton(
              onPressed: () => setState(() {
                _inviting = !_inviting;
                if (_inviting) _inviteEmail.clear();
              }),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RevisioIcon('add', size: 14),
                  SizedBox(width: 6),
                  Text('Add student'),
                ],
              ),
            ),
            RevisioGhostButton(
              onPressed: staff.staffBusy
                  ? null
                  : () async {
                      final ok = await staffConfirm(
                        context,
                        title: 'Delete ${klass.name}?',
                        message: 'The class and its roster are removed. This cannot be undone.',
                        confirmLabel: 'Delete',
                      );
                      if (ok) {
                        _action({
                          'action': 'delete_class',
                          'classId': klass.id,
                        }, 'Class "${klass.name}" deleted.');
                      }
                    },
              child: const Text('Delete'),
            ),
          ],
        ),
        if (_renaming) ...[
          const SizedBox(height: 10),
          RevisioField(
            label: 'New class name',
            child: RevisioTextInput(
              controller: _renameDraft,
              placeholder: klass.name,
              maxLength: 80,
              onChanged: (_) => setState(() {}),
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: RevisioButton(
              enabled: _renameDraft.text.trim().isNotEmpty && !staff.staffBusy,
              onPressed: () {
                _action({
                  'action': 'rename_class',
                  'classId': klass.id,
                  'name': _renameDraft.text.trim(),
                }, 'Class renamed.');
                setState(() => _renaming = false);
              },
              child: const Text('Save'),
            ),
          ),
        ],
        if (_inviting) ...[
          const SizedBox(height: 10),
          RevisioField(
            label: 'Student email',
            child: RevisioTextInput(
              controller: _inviteEmail,
              placeholder: 'student@school.org',
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.done,
              onChanged: (_) => setState(() {}),
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: RevisioButton(
              enabled: _inviteEmail.text.contains('@') && !staff.staffBusy,
              onPressed: () {
                _action({
                  'action': 'add_class_member',
                  'classId': klass.id,
                  'email': _inviteEmail.text.trim(),
                }, '${_inviteEmail.text.trim()} added to ${klass.name}.');
                setState(() => _inviting = false);
              },
              child: const Text('Add to class'),
            ),
          ),
        ],
        // A class belongs to a subject; switching it here keeps the dashboard
        // grouping truthful without recreating the class.
        if (widget.subjects.isNotEmpty) ...[
          const SizedBox(height: 12),
          StaffSubjectPicker(
            label: 'Subject',
            current: klass.subjectId,
            subjects: widget.subjects,
            onPick: (next) => _action({
              'action': 'set_class_subject',
              'classId': klass.id,
              'subjectId': next,
            }, 'Subject updated.'),
          ),
        ],
        const SizedBox(height: 12),
        const StaffHairline(),
        if (roster.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              'Nobody has joined yet. Share the code above and they will show up here.',
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
          )
        else
          for (var i = 0; i < roster.length; i++) ...[
            if (i > 0) const StaffHairline(),
            _RosterRow(
              student: roster[i],
              classId: klass.id,
              className: klass.name,
            ),
          ],
      ],
    );
  }
}

class _RosterRow extends ConsumerWidget {
  const _RosterRow({
    required this.student,
    required this.classId,
    required this.className,
  });

  final RosterEntry student;
  final String classId;
  final String className;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffControllerProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // The name opens the progress sheet — the web's affordance: the
              // weekly numbers say who has stalled, and the sheet says why.
              Expanded(
                child: Semantics(
                  button: true,
                  label: 'Open ${student.name} progress',
                  child: InkWell(
                    onTap: () => context.push(
                      '/staff/student?userId=${Uri.encodeComponent(student.userId)}'
                      '&name=${Uri.encodeComponent(student.name)}',
                    ),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 44),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  student.name,
                                  style: TypeScale.captionS,
                                ),
                              ),
                              // The web's TI2 fix: the entry point carries a
                              // persistent label, not just the expand glyph.
                              const SizedBox(width: 6),
                              Text(
                                'Progress',
                                style: TypeScale.micro.copyWith(
                                  color: context.mutedForeground,
                                ),
                              ),
                              const SizedBox(width: 4),
                              RevisioIcon(
                                'expand',
                                size: 11,
                                color: context.mutedForeground,
                              ),
                            ],
                          ),
                          Text(
                            student.email,
                            style: TypeScale.fine.copyWith(
                              color: context.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              // Removing is one tap with its own undo-by-rejoining path, so the
              // confirm the web needs is not reproduced as a dialog here; the
              // roster reloads and the student can rejoin with the code.
              RevisioGhostButton(
                onPressed: staff.staffBusy
                    ? null
                    : () => ref
                          .read(staffControllerProvider.notifier)
                          .staffAction(
                            admin: false,
                            body: {
                              'action': 'remove_class_member',
                              'classId': classId,
                              'userId': student.userId,
                            },
                            okMsg: '${student.name} removed from $className.',
                          ),
                child: const Text('Remove'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              RevisioIcon(
                'streak',
                size: 12,
                color: student.streak > 0
                    ? context.streak
                    : context.mutedForeground,
              ),
              const SizedBox(width: 4),
              Text(
                '${student.streak}d',
                style: TypeScale.fine.copyWith(
                  color: student.streak > 0
                      ? context.streak
                      : context.mutedForeground,
                ),
              ),
              const SizedBox(width: 14),
              Text(
                '${student.reviews7d} rev',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
              const SizedBox(width: 14),
              Text(
                '${student.xp7d} XP',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const StaffLabel('Mastery'),
              const SizedBox(width: 8),
              Expanded(child: StaffMeter(student.masteryPct)),
              const SizedBox(width: 8),
              Text(
                '${student.masteryPct}%',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TopicPublishRow extends ConsumerWidget {
  const _TopicPublishRow({required this.topic});

  final MyTopic topic;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffControllerProvider);
    final live = topic.visibility == 'public';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(topic.name, style: TypeScale.captionS),
                    ),
                    const SizedBox(width: 8),
                    StaffChip(
                      live ? 'public' : topic.visibility.replaceAll('_', ' '),
                      tint: live ? context.goodStrong : null,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '${topic.cardCount ?? 0} questions',
                        style: TypeScale.fine.copyWith(
                          color: (topic.cardCount ?? 0) == 0
                              ? context.destructiveInk
                              : context.mutedForeground,
                        ),
                      ),
                      TextSpan(
                        text: ' · ',
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                      TextSpan(
                        text:
                            '${topic.lessonCount ?? 0} note ${(topic.lessonCount ?? 0) == 1 ? 'set' : 'sets'}',
                        style: TypeScale.fine.copyWith(
                          color: (topic.lessonCount ?? 0) == 0
                              ? context.destructiveInk
                              : context.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          live
              ? RevisioGhostButton(
                  onPressed: staff.staffBusy
                      ? null
                      : () => ref
                            .read(staffControllerProvider.notifier)
                            .staffAction(
                              admin: false,
                              body: {
                                'action': 'set_topic_visibility',
                                'topicId': topic.id,
                                'visibility': 'private',
                              },
                              okMsg: '${topic.name} withdrawn.',
                            ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      RevisioIcon('unpublish', size: 14),
                      SizedBox(width: 6),
                      Text('Withdraw'),
                    ],
                  ),
                )
              : RevisioSecondaryButton(
                  compact: true,
                  onPressed: staff.staffBusy
                      ? null
                      : () => ref
                            .read(staffControllerProvider.notifier)
                            .staffAction(
                              admin: false,
                              body: {
                                'action': 'set_topic_visibility',
                                'topicId': topic.id,
                                'visibility': 'public',
                              },
                              okMsg:
                                  '${topic.name} is live, questions included.',
                            ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      RevisioIcon('publish', size: 14),
                      SizedBox(width: 6),
                      Text('Publish'),
                    ],
                  ),
                ),
        ],
      ),
    );
  }
}
