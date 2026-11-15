/// Admin — users and content, developers only.
///
/// The web's `/admin` is a thousand-line console; the phone carries the parts
/// a developer acts on from their pocket, in the web's own order and with the
/// web's own numbers: approvals, the content shape (so "0 public questions" is
/// stated at the top instead of being discovered by a student), feature flags,
/// pending topics, users with their roles and classes, and the audit trail.
/// Seasons, badges and achievements stay web-only — the native port made the
/// same cut.
///
/// Every action goes through `staffAction`, which re-reads the console after
/// it lands — the same reload the web's `act()` performs.
library revisio.features.staff.admin_screen;

import 'package:flutter/material.dart';
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

class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Developer admin')),
      body: SafeArea(
        child: staff.adminData == null
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
        const _Eyebrow('Developer'),
        Text(
          'Users, content and flags.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 18),
        _Notices(staff: staff),
        StaffSoftCard(
          child: Text(
            staff.staffBusy
                ? 'Loading the console…'
                : staff.staffError ?? 'The console is not loaded yet.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: RevisioSecondaryButton(
            onPressed: staff.staffBusy
                ? null
                : () => ref.read(staffControllerProvider.notifier).loadAdmin(),
            child: const Text('Load console'),
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
    final data = staff.adminData!;
    final subjects = data.subjects;
    final pending = data.approvals.where((a) => a.status == 'pending').toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        const _Eyebrow('Developer'),
        Text(
          'Users, content and flags.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 18),
        _Notices(staff: staff),

        // ── the content shape, stated at the top ───────────────────────────
        // The web's four stats, with its notes and alarms: a library with no
        // public questions is a fact to state, not a number to bury.
        StaffCard(
          title: 'Content',
          children: [
            Wrap(
              spacing: 20,
              runSpacing: 12,
              children: [
                _Stat(
                  'Topics',
                  '${data.contentStats.topics}',
                  note: '${data.contentStats.publicTopics} public',
                ),
                _Stat('Note sets', '${data.contentStats.lessons}'),
                _Stat(
                  'Questions',
                  '${data.contentStats.cards}',
                  note: '${data.contentStats.publicCards} public',
                  alarm:
                      data.contentStats.publicCards == 0 ||
                      data.contentStats.cards == 0,
                ),
                _Stat(
                  'Empty topics',
                  '${data.contentStats.emptyTopics}',
                  note: 'no questions',
                  alarm: data.contentStats.emptyTopics > 0,
                ),
              ],
            ),
          ],
        ),

        // ── approvals ──────────────────────────────────────────────────────
        if (pending.isNotEmpty) ...[
          const SizedBox(height: 20),
          StaffCard(
            title: 'Approval requests',
            trailing: StaffChip('${pending.length} pending'),
            children: [
              Text(
                'Teacher and developer accounts cannot sign in until someone here approves them.',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
              const SizedBox(height: 10),
              for (var i = 0; i < pending.length; i++) ...[
                if (i > 0) const StaffHairline(),
                _ApprovalRow(request: pending[i]),
              ],
            ],
          ),
        ],

        // ── pending topics ─────────────────────────────────────────────────
        if (data.pendingTopics.isNotEmpty) ...[
          const SizedBox(height: 20),
          StaffCard(
            title: 'Publishing queue',
            trailing: StaffChip('${data.pendingTopics.length} awaiting review'),
            children: [
              Text(
                'Topics students submitted for public publishing. Approving makes them visible to everyone.',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
              const SizedBox(height: 10),
              for (var i = 0; i < data.pendingTopics.length; i++) ...[
                if (i > 0) const StaffHairline(),
                _PendingTopicRow(topic: data.pendingTopics[i]),
              ],
            ],
          ),
        ],

        // ── feature flags ──────────────────────────────────────────────────
        if (data.flags.isNotEmpty) ...[
          const SizedBox(height: 20),
          StaffCard(
            title: 'Feature flags',
            children: [
              for (var i = 0; i < data.flags.length; i++) ...[
                if (i > 0) const StaffHairline(),
                _FlagRow(flag: data.flags[i]),
              ],
            ],
          ),
        ],

        // ── users ──────────────────────────────────────────────────────────
        const SizedBox(height: 20),
        StaffCard(
          title: 'Users',
          children: [
            Text(
              '${data.users.length} most recent. Tap a user to manage them.',
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
            const SizedBox(height: 10),
            for (var i = 0; i < data.users.take(50).length; i++) ...[
              if (i > 0) const StaffHairline(),
              _AdminUserRow(
                user: data.users[i],
                classes: data.classes,
                subjects: subjects,
              ),
            ],
          ],
        ),

        // ── classes ────────────────────────────────────────────────────────
        if (data.classes.isNotEmpty) ...[
          const SizedBox(height: 20),
          StaffCard(
            title: 'Classes',
            children: [
              Text(
                'Every class on the platform, with its owner.',
                style: TypeScale.fine.copyWith(color: context.mutedForeground),
              ),
              const SizedBox(height: 10),
              for (var i = 0; i < data.classes.length; i++) ...[
                if (i > 0) const StaffHairline(),
                _AdminClassRow(klass: data.classes[i], subjects: subjects),
              ],
            ],
          ),
        ],

        // ── audit ──────────────────────────────────────────────────────────
        if (data.audit.isNotEmpty) ...[
          const SizedBox(height: 20),
          StaffCard(
            title: 'Audit log',
            children: [
              for (final row in data.audit.take(20))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Text(
                    '${row.action} · ${_day(row.createdAt)}',
                    style: TypeScale.fine.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                ),
            ],
          ),
        ],
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

/// First ten characters of an ISO timestamp — the audit row's day.
String _day(String? iso) =>
    iso != null && iso.length >= 10 ? iso.substring(0, 10) : (iso ?? '');

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, {this.note, this.alarm = false});

  final String label;
  final String value;
  final String? note;
  final bool alarm;

  @override
  Widget build(BuildContext context) {
    final tint = alarm ? context.destructiveInk : context.foreground;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        StaffLabel(label),
        Text(value, style: TypeScale.displaySm.copyWith(color: tint)),
        if (note != null)
          Text(
            note!,
            style: TypeScale.micro.copyWith(color: context.mutedForeground),
          ),
      ],
    );
  }
}

void _adminAction(
  WidgetRef ref, {
  required Map<String, dynamic> body,
  required String okMsg,
}) {
  ref
      .read(staffControllerProvider.notifier)
      .staffAction(admin: true, body: body, okMsg: okMsg);
}

class _ApprovalRow extends ConsumerWidget {
  const _ApprovalRow({required this.request});

  final ApprovalRequest request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffControllerProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${request.name} · ${request.roleRequested}',
            style: TypeScale.captionS,
          ),
          Text(
            request.email,
            style: TypeScale.fine.copyWith(color: context.mutedForeground),
          ),
          if (request.note.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              request.note,
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              RevisioGoodButton(
                compact: true,
                onPressed: staff.staffBusy
                    ? null
                    : () => _adminAction(
                        ref,
                        body: {
                          'action': 'approve_request',
                          'approvalId': request.id,
                        },
                        okMsg: '${request.name} approved.',
                      ),
                child: const Text('Approve'),
              ),
              const SizedBox(width: 8),
              RevisioGhostButton(
                onPressed: staff.staffBusy
                    ? null
                    : () => _adminAction(
                        ref,
                        body: {
                          'action': 'reject_request',
                          'approvalId': request.id,
                        },
                        okMsg: '${request.name} rejected.',
                      ),
                child: const Text('Reject'),
              ),
              const SizedBox(width: 8),
              RevisioSecondaryButton(
                compact: true,
                onPressed: staff.staffBusy
                    ? null
                    : () => _adminAction(
                        ref,
                        body: {
                          'action': 'verify_user_email',
                          'userId': request.userId,
                        },
                        okMsg: '${request.name}\'s email marked verified.',
                      ),
                child: const Text('Verify email'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PendingTopicRow extends ConsumerWidget {
  const _PendingTopicRow({required this.topic});

  final PendingTopic topic;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffControllerProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: Text(topic.name, style: TypeScale.captionS)),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              RevisioSecondaryButton(
                compact: true,
                onPressed: staff.staffBusy
                    ? null
                    : () => _adminAction(
                        ref,
                        body: {
                          'action': 'review_topic',
                          'topicId': topic.id,
                          'approveTopic': true,
                        },
                        okMsg: 'Published.',
                      ),
                child: const Text('Publish'),
              ),
              RevisioGhostButton(
                onPressed: staff.staffBusy
                    ? null
                    : () => _adminAction(
                        ref,
                        body: {
                          'action': 'review_topic',
                          'topicId': topic.id,
                          'approveTopic': false,
                        },
                        okMsg: 'Sent back to private.',
                      ),
                child: const Text('Reject'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FlagRow extends ConsumerWidget {
  const _FlagRow({required this.flag});

  final FeatureFlag flag;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffControllerProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: Text(flag.key, style: TypeScale.captionS)),
          flag.enabled
              ? RevisioSecondaryButton(
                  compact: true,
                  onPressed: staff.staffBusy
                      ? null
                      : () => _adminAction(
                          ref,
                          body: {
                            'action': 'set_flag',
                            'flagKey': flag.key,
                            'enabled': false,
                          },
                          okMsg: '${flag.key} disabled.',
                        ),
                  child: const Text('Disable'),
                )
              : RevisioGhostButton(
                  onPressed: staff.staffBusy
                      ? null
                      : () => _adminAction(
                          ref,
                          body: {
                            'action': 'set_flag',
                            'flagKey': flag.key,
                            'enabled': true,
                          },
                          okMsg: '${flag.key} enabled.',
                        ),
                  child: const Text('Enable'),
                ),
        ],
      ),
    );
  }
}

/// One user, with the actions a developer actually reaches for: role, status,
/// verification, sessions — and the class chips, which behave exactly like the
/// web's: tap a chip to remove, open the picker to add.
class _AdminUserRow extends ConsumerStatefulWidget {
  const _AdminUserRow({
    required this.user,
    required this.classes,
    required this.subjects,
  });

  final AdminUser user;
  final List<AdminClass> classes;
  final List<SubjectRef> subjects;

  @override
  ConsumerState<_AdminUserRow> createState() => _AdminUserRowState();
}

class _AdminUserRowState extends ConsumerState<_AdminUserRow> {
  bool _open = false;
  // The web's AP1 rule: a role pick is a draft until Save — a stray tap must
  // not retier an account.
  String? _pendingRole;

  AdminUser get user => widget.user;

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(staffControllerProvider);
    final inClasses = widget.classes
        .where((c) => c.members.any((m) => m.userId == user.id))
        .toList();
    final notIn = widget.classes
        .where((c) => c.members.every((m) => m.userId != user.id))
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () => setState(() => _open = !_open),
          child: Semantics(
            button: true,
            label: _open ? 'Collapse ${user.name}' : 'Manage ${user.name}',
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user.name, style: TypeScale.captionS),
                          Text(
                            user.email,
                            style: TypeScale.fine.copyWith(
                              color: context.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    StaffChip(user.role),
                    if (user.status != 'active') ...[
                      const SizedBox(width: 6),
                      StaffChip(user.status, tint: context.streak),
                    ],
                    const SizedBox(width: 6),
                    RevisioIcon(
                      _open ? 'collapse' : 'expand',
                      size: 14,
                      color: context.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (_open) ...[
          const SizedBox(height: 4),
          // Class membership chips — tap to remove, picker to add. Only
          // classes the account is not in are listed in the picker, exactly
          // as the web's own rule reads.
          const StaffLabel('Classes'),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              for (final klass in inClasses.take(3))
                StaffChipPill(
                  label: '${klass.name} ×',
                  onTap: () => _adminAction(
                    ref,
                    body: {
                      'action': 'remove_class_member',
                      'classId': klass.id,
                      'userId': user.id,
                    },
                    okMsg: '${user.name} removed from ${klass.name}.',
                  ),
                ),
            ],
          ),
          if (inClasses.length > 3)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '+${inClasses.length - 3} more',
                style: TypeScale.micro.copyWith(color: context.mutedForeground),
              ),
            ),
          for (final klass in notIn.take(4))
            InkWell(
              onTap: () => _adminAction(
                ref,
                body: {
                  'action': 'add_class_member',
                  'classId': klass.id,
                  'userId': user.id,
                },
                okMsg: '${user.name} added to ${klass.name}.',
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      RevisioIcon(
                        'join',
                        size: 12,
                        color: context.mutedForeground,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Add to ${klass.name} (${klass.teacherName})',
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (notIn.length > 4)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '+${notIn.length - 4} more classes',
                style: TypeScale.micro.copyWith(color: context.mutedForeground),
              ),
            ),
          const SizedBox(height: 10),
          const StaffLabel('Account'),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              user.status == 'suspended'
                  ? RevisioGoodButton(
                      compact: true,
                      onPressed: staff.staffBusy
                          ? null
                          : () => _adminAction(
                              ref,
                              body: {
                                'action': 'activate_user',
                                'userId': user.id,
                              },
                              okMsg: '${user.name} activated.',
                            ),
                      child: const Text('Activate'),
                    )
                  : RevisioGhostButton(
                      onPressed: staff.staffBusy
                          ? null
                          : () async {
                              final ok = await staffConfirm(
                                context,
                                title: 'Suspend ${user.name}?',
                                message: 'They are signed out and cannot sign back in until reactivated.',
                                confirmLabel: 'Suspend',
                              );
                              if (ok) {
                                _adminAction(
                                  ref,
                                  body: {
                                    'action': 'suspend_user',
                                    'userId': user.id,
                                  },
                                  okMsg: '${user.name} suspended.',
                                );
                              }
                            },
                      child: const Text('Suspend'),
                    ),
              if (user.emailVerifiedAt == null)
                RevisioSecondaryButton(
                  compact: true,
                  onPressed: staff.staffBusy
                      ? null
                      : () => _adminAction(
                          ref,
                          body: {
                            'action': 'verify_user_email',
                            'userId': user.id,
                          },
                          okMsg: '${user.name}\'s email marked verified.',
                        ),
                  child: const Text('Verify email'),
                ),
              RevisioGhostButton(
                onPressed: staff.staffBusy
                    ? null
                    : () async {
                        final ok = await staffConfirm(
                          context,
                          title: 'Revoke all sessions?',
                          message:
                              'Every device signed in as ${user.name} is signed out immediately.',
                          confirmLabel: 'Revoke',
                        );
                        if (ok) {
                          _adminAction(
                            ref,
                            body: {
                              'action': 'revoke_sessions',
                              'userId': user.id,
                            },
                            okMsg:
                                'All of ${user.name}\'s devices are signed out.',
                          );
                        }
                      },
                child: const Text('Revoke sessions'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // The progress sheet, opened from the expanded row: the roster tap
          // the teacher screen uses, one level down, because this row's first
          // tap already belongs to expanding it.
          Align(
            alignment: Alignment.centerLeft,
            child: RevisioGhostButton(
              onPressed: () => context.push(
                '/staff/student?userId=${Uri.encodeComponent(user.id)}'
                '&name=${Uri.encodeComponent(user.name)}',
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RevisioIcon('expand', size: 14),
                  SizedBox(width: 6),
                  Text('Progress'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          const StaffLabel('Role'),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              StaffChip(user.role),
              for (final role in const ['student', 'teacher', 'developer'])
                if (role != user.role)
                  _pendingRole == role
                      ? RevisioSecondaryButton(
                          compact: true,
                          onPressed: () => setState(() => _pendingRole = role),
                          child: Text(
                            role[0].toUpperCase() + role.substring(1),
                          ),
                        )
                      : RevisioGhostButton(
                          onPressed: () => setState(() => _pendingRole = role),
                          child: Text(
                            role[0].toUpperCase() + role.substring(1),
                          ),
                        ),
            ],
          ),
          if (_pendingRole != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                RevisioButton(
                  compact: true,
                  enabled: !staff.staffBusy,
                  onPressed: () {
                    _adminAction(
                      ref,
                      body: {
                        'action': 'set_user_role',
                        'userId': user.id,
                        'role': _pendingRole,
                      },
                      okMsg: '${user.name} is now a $_pendingRole.',
                    );
                    setState(() => _pendingRole = null);
                  },
                  child: const Text('Save role'),
                ),
                const SizedBox(width: 8),
                RevisioGhostButton(
                  onPressed: () => setState(() => _pendingRole = null),
                  child: const Text('Cancel'),
                ),
              ],
            ),
          ],
        ],
      ],
    );
  }
}

class _AdminClassRow extends ConsumerStatefulWidget {
  const _AdminClassRow({required this.klass, required this.subjects});

  final AdminClass klass;
  final List<SubjectRef> subjects;

  @override
  ConsumerState<_AdminClassRow> createState() => _AdminClassRowState();
}

class _AdminClassRowState extends ConsumerState<_AdminClassRow> {
  bool _renaming = false;
  final _renameDraft = TextEditingController();

  AdminClass get klass => widget.klass;

  @override
  void dispose() {
    _renameDraft.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(staffControllerProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(klass.name, style: TypeScale.captionS),
          Text(
            '${klass.teacherName} · ${klass.members.length} member${klass.members.length == 1 ? '' : 's'} · code ${klass.joinCode}',
            style: TypeScale.fine.copyWith(color: context.mutedForeground),
          ),
          const SizedBox(height: 6),
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
                onPressed: staff.staffBusy
                    ? null
                    : () async {
                        final ok = await staffConfirm(
                          context,
                          title: 'Rotate the join code?',
                          message: 'The current code stops working immediately. Students will need the new one.',
                          confirmLabel: 'Rotate',
                        );
                        if (ok) {
                          _adminAction(
                            ref,
                            body: {
                              'action': 'rotate_code',
                              'classId': klass.id,
                            },
                            okMsg: 'New code for ${klass.name}.',
                          );
                        }
                      },
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    RevisioIcon('rotate', size: 14),
                    SizedBox(width: 6),
                    Text('Rotate code'),
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
                          _adminAction(
                            ref,
                            body: {
                              'action': 'delete_class',
                              'classId': klass.id,
                            },
                            okMsg: 'Class "${klass.name}" deleted.',
                          );
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
                enabled:
                    _renameDraft.text.trim().isNotEmpty && !staff.staffBusy,
                onPressed: () {
                  _adminAction(
                    ref,
                    body: {
                      'action': 'rename_class',
                      'classId': klass.id,
                      'name': _renameDraft.text.trim(),
                    },
                    okMsg: 'Class renamed.',
                  );
                  setState(() => _renaming = false);
                },
                child: const Text('Save'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
