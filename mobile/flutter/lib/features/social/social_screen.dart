/// Study circle (#15) — a screen-for-screen port of the web `/social` page:
/// opt-in buddies and accountability partners, the private weekly friend
/// board (deliberately NOT the public leaderboard), and guardian summary
/// links. Everything sits behind `consent.social` — the API 409s without it,
/// so the page explains the gate instead of failing.
library revisio.features.social.social_screen;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/design.dart';
import '../../design/revisio_icons.dart';
import '../../engine/models.dart';
import '../../services/api_client.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';

class SocialScreen extends ConsumerStatefulWidget {
  const SocialScreen({super.key});

  @override
  ConsumerState<SocialScreen> createState() => _SocialScreenState();
}

class _SocialScreenState extends ConsumerState<SocialScreen> {
  SocialOverview? _overview;
  bool _loadError = false;
  List<GuardianLink>? _links;
  bool _linksError = false;
  bool _busy = false;
  String _error = '';
  String _notice = '';

  final _username = TextEditingController();
  String _kind = 'buddy';
  final _guardianUsername = TextEditingController();
  String? _summaryFor;
  GuardianSummary? _summary;

  // Writer-vetted consent strings (docs/COPY-SOCIAL-CONSENT-2026-11-16.md §2):
  // the actor's own switch is what 409/403-consent means — name the setting,
  // say what to do, never blame the counterparty.
  static const _consentGeneric =
      'Social is off on your account. Enable Social under How we use your '
      'data in Settings, save, then try again.';
  static const _consentGuardianAccept =
      'You need Social turned on to accept a summary link. Enable it under '
      'How we use your data in Settings, save, then accept again.';
  static const _consentSummaryView =
      'You need Social turned on to view summaries. Enable it under How we '
      'use your data in Settings, save, then try again.';

  @override
  void initState() {
    super.initState();
    _load();
    _loadLinks();
  }

  @override
  void dispose() {
    _username.dispose();
    _guardianUsername.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final overview = await ref.read(apiClientProvider).socialOverview();
      if (mounted) {
        setState(() {
          _overview = overview;
          _loadError = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadError = true);
    }
  }

  Future<void> _loadLinks() async {
    try {
      final links = await ref.read(apiClientProvider).guardianLinks();
      if (mounted) {
        setState(() {
          _links = links;
          _linksError = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _linksError = true);
    }
  }

  bool _isConsentError(Object e) {
    if (e is ApiError) {
      if (e.status == 409) return true;
      if (e.status == 403 && e.message.toLowerCase().contains('consent')) {
        return true;
      }
    }
    if (e is DioException) {
      final status = e.response?.statusCode;
      if (status == 409) return true;
      if (status == 403) {
        final data = e.response?.data;
        final message = data is Map ? '${data['error'] ?? data['message'] ?? ''}' : '';
        if (message.toLowerCase().contains('consent')) return true;
      }
    }
    return false;
  }

  void _fail(Object e, [String consentCopy = _consentGeneric]) {
    String message;
    if (_isConsentError(e)) {
      message = consentCopy;
    } else if (e is ApiError) {
      message = e.message;
    } else {
      message = 'That did not go through.';
    }
    setState(() {
      _error = message;
      _notice = '';
    });
  }

  Future<void> _act(Future<void> Function() fn, [String ok = 'Done.']) async {
    setState(() {
      _busy = true;
      _error = '';
      _notice = '';
    });
    try {
      await fn();
      if (mounted) setState(() => _notice = ok);
      await _load();
    } catch (e) {
      _fail(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _guardianAct(
    Future<void> Function() fn, {
    String ok = 'Done.',
    String consentCopy = _consentGeneric,
  }) async {
    setState(() {
      _busy = true;
      _error = '';
      _notice = '';
    });
    try {
      await fn();
      if (mounted) setState(() => _notice = ok);
      await _loadLinks();
    } catch (e) {
      _fail(e, consentCopy);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _send() {
    final name = _username.text.trim().replaceFirst(RegExp(r'^@'), '');
    if (name.isEmpty) return;
    _act(() async {
      await ref.read(apiClientProvider).socialAction({
        'action': 'send',
        'username': name,
        'kind': _kind,
      });
      _username.clear();
    }, 'Request sent.');
  }

  void _respond(String id, String response) => _act(
    () => ref.read(apiClientProvider).socialAction({
      'action': 'respond',
      'connectionId': id,
      'response': response,
    }),
    'Updated.',
  );

  void _addGuardian() {
    final name = _guardianUsername.text
        .trim()
        .replaceFirst(RegExp(r'^@'), '');
    if (name.isEmpty) return;
    _guardianAct(() async {
      await ref.read(apiClientProvider).guardianAction({
        'action': 'create',
        'guardianUsername': name,
      });
      _guardianUsername.clear();
    }, ok: 'Summary link sent — they need to accept it.');
  }

  void _guardianRespond(String linkId, String response) => _guardianAct(
    () => ref.read(apiClientProvider).guardianAction({
      'action': 'respond',
      'linkId': linkId,
      'response': response,
    }),
    ok: 'Updated.',
    consentCopy: response == 'accept' ? _consentGuardianAccept : _consentGeneric,
  );

  Future<void> _viewSummary(String studentId) async {
    if (studentId.isEmpty) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final summary = await ref
          .read(apiClientProvider)
          .guardianSummary(studentId);
      if (mounted) {
        setState(() {
          _summary = summary;
          _summaryFor = studentId;
        });
      }
    } catch (e) {
      _fail(e, _consentSummaryView);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(meProvider).valueOrNull;
    final overview = _overview;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            Row(
              children: [
                const RevisioIcon('join', size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Study circle', style: TypeScale.strong),
                      Text(
                        'Buddies and accountability partners — private, never '
                        'on the public leaderboard.',
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            RevisioNotice(
              tone: NoticeTone.bad,
              show: _error.isNotEmpty,
              child: Text(_error),
            ),
            if (_notice.isNotEmpty) ...[
              const SizedBox(height: 8),
              RevisioNotice(tone: NoticeTone.note, show: true, child: Text(_notice)),
            ],
            const SizedBox(height: 16),
            if (_loadError && overview == null)
              _ErrorCard(onRetry: _load)
            else if (overview == null)
              const _Skeleton()
            else if (!overview.consentSocial)
              _ConsentOffCard(underAge: me?.isUnderAge ?? false)
            else
              _buildCircle(overview),
          ],
        ),
      ),
    );
  }

  Widget _buildCircle(SocialOverview overview) {
    final connections = overview.connections;
    final incoming = connections
        .where((c) => c.status == 'pending' && c.direction == 'incoming')
        .toList();
    final outgoing = connections
        .where((c) => c.status == 'pending' && c.direction == 'outgoing')
        .toList();
    final accepted = connections.where((c) => c.status == 'accepted').toList();
    final links = _links ?? const <GuardianLink>[];
    final consentOff = !overview.consentSocial;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Add someone ──────────────────────────────────────────────
        _Card(
          title: 'Add someone',
          children: [
            Text(
              'Their username, exactly as it appears on their profile.',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            ),
            const SizedBox(height: 12),
            RevisioTextInput(
              controller: _username,
              placeholder: 'studybuddy',
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _kind,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'buddy',
                        child: Text('Study buddy'),
                      ),
                      DropdownMenuItem(
                        value: 'accountability',
                        child: Text('Accountability'),
                      ),
                    ],
                    onChanged: (v) =>
                        setState(() => _kind = v ?? _kind),
                  ),
                ),
                const SizedBox(width: 12),
                RevisioButton(
                  compact: true,
                  enabled:
                      !_busy && _username.text.trim().isNotEmpty && !consentOff,
                  onPressed: _send,
                  child: const Text('Send request'),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 16),

        // ── Requests ─────────────────────────────────────────────────
        if (incoming.isNotEmpty || outgoing.isNotEmpty) ...[
          _Card(
            title: 'Requests',
            children: [
              for (final c in incoming)
                _ConnectionRow(
                  connection: c,
                  trailing: Wrap(
                    spacing: 8,
                    children: [
                      RevisioButton(
                        compact: true,
                        enabled: !_busy,
                        onPressed: () => _respond(c.id, 'accept'),
                        child: const Text('Accept'),
                      ),
                      RevisioGhostButton(
                        enabled: !_busy,
                        onPressed: () => _respond(c.id, 'decline'),
                        child: const Text('Decline'),
                      ),
                      RevisioGhostButton(
                        enabled: !_busy,
                        onPressed: () => _respond(c.id, 'block'),
                        child: const Text('Block'),
                      ),
                    ],
                  ),
                ),
              for (final c in outgoing)
                _ConnectionRow(
                  connection: c,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'waiting for them',
                        style: TypeScale.fine.copyWith(
                          color: context.mutedForeground,
                        ),
                      ),
                      const SizedBox(width: 8),
                      RevisioGhostButton(
                        enabled: !_busy,
                        onPressed: () => _respond(c.id, 'cancel'),
                        child: const Text('Cancel'),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
        ],

        // ── Your circle ──────────────────────────────────────────────
        _Card(
          title: 'Your circle',
          children: [
            if (accepted.isEmpty)
              Text(
                'Nobody yet. Send a request above — they appear here once '
                'they accept.',
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
              )
            else
              for (final c in accepted)
                _ConnectionRow(
                  connection: c,
                  trailing: RevisioGhostButton(
                    enabled: !_busy,
                    onPressed: () => _respond(c.id, 'remove'),
                    child: const Text('Remove'),
                  ),
                ),
          ],
        ),
        const SizedBox(height: 16),

        // ── Friend board — private, weekly ───────────────────────────
        if (overview.board.isNotEmpty || accepted.isNotEmpty) ...[
          _Card(
            title: 'This week, privately',
            children: [
              Text(
                'Weekly XP and streaks for your circle only. It never '
                'touches the public leaderboard.',
                style: TypeScale.caption.copyWith(
                  color: context.mutedForeground,
                ),
              ),
              const SizedBox(height: 8),
              if (overview.board.isEmpty)
                Text(
                  'Nobody in your circle is sharing weekly stats right now '
                  '— they may have boards turned off in Settings.',
                  style: TypeScale.caption.copyWith(
                    color: context.mutedForeground,
                  ),
                )
              else
                for (final b in overview.board) _BoardRow(entry: b),
            ],
          ),
          const SizedBox(height: 16),
        ],

        // ── Guardian summary ─────────────────────────────────────────
        _Card(
          title: 'Guardian summary',
          children: [
            Text(
              'Share a read-only progress summary with a parent or '
              'guardian. They see reviews, accuracy, streak and topics '
              'mastered — nothing else, and only while the link is '
              'accepted.',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            ),
            if (_linksError) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'We couldn’t load your summary links.',
                      style: TypeScale.caption.copyWith(
                        color: context.mutedForeground,
                      ),
                    ),
                  ),
                  RevisioGhostButton(
                    onPressed: _loadLinks,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ],
            for (final l in links.where(
              (l) => l.status == 'pending' && l.role == 'guardian',
            ))
              _GuardianPendingRow(
                link: l,
                busy: _busy,
                onAccept: () => _guardianRespond(l.id, 'accept'),
                onDecline: () => _guardianRespond(l.id, 'decline'),
              ),
            for (final l in links.where((l) => l.role == 'student'))
              _GuardianStudentRow(
                link: l,
                busy: _busy,
                onRevoke: () => _guardianRespond(l.id, 'revoke'),
              ),
            const SizedBox(height: 12),
            RevisioTextInput(
              controller: _guardianUsername,
              placeholder: 'parent_or_guardian',
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 4),
            Text(
              'They will need Social turned on in their own Settings '
              'before they can accept the link.',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: RevisioSecondaryButton(
                compact: true,
                enabled: !_busy && _guardianUsername.text.trim().isNotEmpty,
                onPressed: _addGuardian,
                child: const Text('Share summary'),
              ),
            ),
            if (links.any((l) => l.role == 'guardian' && l.status == 'accepted')) ...[
              const SizedBox(height: 16),
              Divider(color: context.border, height: 1),
              const SizedBox(height: 12),
              Text('Summaries you can see', style: TypeScale.caption.copyWith(
                fontWeight: FontWeight.w600,
                color: context.foreground,
              )),
              const SizedBox(height: 8),
              for (final l in links.where(
                (l) => l.role == 'guardian' && l.status == 'accepted',
              ))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Expanded(child: _PersonChip(user: l.user)),
                      RevisioGhostButton(
                        enabled: !_busy && (l.user?.id ?? '').isNotEmpty,
                        onPressed: () => _viewSummary(l.user?.id ?? ''),
                        child: Text(
                          _summaryFor == l.user?.id ? 'Refresh' : 'View summary',
                        ),
                      ),
                    ],
                  ),
                ),
              if (_summary != null && _summaryFor != null) _SummaryBox(summary: _summary!),
            ],
          ],
        ),
      ],
    );
  }
}

// ── shared bits ─────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children});

  final String title;
  final List<Widget> children;

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
          Text(title, style: TypeScale.strong),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _PersonChip extends StatelessWidget {
  const _PersonChip({required this.user});

  final SocialUser? user;

  @override
  Widget build(BuildContext context) {
    final u = user;
    if (u == null || u.id.isEmpty) {
      return Text(
        'Unknown account',
        style: TypeScale.caption.copyWith(color: context.mutedForeground),
      );
    }
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: context.secondary,
          ),
          alignment: Alignment.center,
          child: Text(
            (u.name.isEmpty ? '?' : u.name[0]).toUpperCase(),
            style: TypeScale.caption.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                u.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TypeScale.caption.copyWith(fontWeight: FontWeight.w600),
              ),
              if (u.username != null)
                Text(
                  '@${u.username}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeScale.fine.copyWith(
                    color: context.mutedForeground,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _KindBadge extends StatelessWidget {
  const _KindBadge({required this.kind});

  final String kind;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
      ),
      child: Text(
        kind == 'accountability' ? 'accountability' : 'buddy',
        style: TypeScale.fine.copyWith(color: context.foreground),
      ),
    );
  }
}

class _ConnectionRow extends StatelessWidget {
  const _ConnectionRow({required this.connection, required this.trailing});

  final Connection connection;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: _PersonChip(user: connection.user)),
          const SizedBox(width: 8),
          _KindBadge(kind: connection.kind),
          const SizedBox(width: 8),
          trailing,
        ],
      ),
    );
  }
}

class _BoardRow extends StatelessWidget {
  const _BoardRow({required this.entry});

  final BoardEntry entry;

  @override
  Widget build(BuildContext context) {
    final b = entry;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text(
              '${b.rank}',
              textAlign: TextAlign.right,
              style: TypeScale.caption.copyWith(
                fontWeight: FontWeight.w700,
                color: context.mutedForeground,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${b.name}${b.isSelf ? ' (you)' : ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TypeScale.caption.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Text(
            '${b.weeklyXp} XP this week',
            style: TypeScale.fine.copyWith(color: context.mutedForeground),
          ),
          const SizedBox(width: 10),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              RevisioIcon(
                'streak',
                size: 12,
                color: context.mutedForeground,
              ),
              const SizedBox(width: 3),
              Text(
                '${b.streak}',
                style: TypeScale.fine.copyWith(
                  color: context.mutedForeground,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GuardianPendingRow extends StatelessWidget {
  const _GuardianPendingRow({
    required this.link,
    required this.busy,
    required this.onAccept,
    required this.onDecline,
  });

  final GuardianLink link;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: _PersonChip(user: link.user)),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              'wants to see your summary',
              style: TypeScale.fine.copyWith(color: context.mutedForeground),
            ),
          ),
          const SizedBox(width: 8),
          RevisioButton(
            compact: true,
            enabled: !busy,
            onPressed: onAccept,
            child: const Text('Share'),
          ),
          const SizedBox(width: 6),
          RevisioGhostButton(
            enabled: !busy,
            onPressed: onDecline,
            child: const Text('Decline'),
          ),
        ],
      ),
    );
  }
}

class _GuardianStudentRow extends StatelessWidget {
  const _GuardianStudentRow({
    required this.link,
    required this.busy,
    required this.onRevoke,
  });

  final GuardianLink link;
  final bool busy;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final status = link.status == 'accepted'
        ? 'sharing'
        : link.status == 'pending'
        ? 'waiting'
        : link.status;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: _PersonChip(user: link.user)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: context.secondary,
              borderRadius: BorderRadius.circular(RadiusTokens.pill),
            ),
            child: Text(
              status,
              style: TypeScale.fine.copyWith(
                color: context.foreground.withOpacity(
                  link.status == 'accepted' ? 1 : 0.6,
                ),
              ),
            ),
          ),
          if (link.status == 'accepted') ...[
            const SizedBox(width: 8),
            RevisioGhostButton(
              enabled: !busy,
              onPressed: onRevoke,
              child: const Text('Stop sharing'),
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryBox extends StatelessWidget {
  const _SummaryBox({required this.summary});

  final GuardianSummary summary;

  @override
  Widget build(BuildContext context) {
    final s = summary;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Last 30 days',
            style: TypeScale.caption.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          if (s.hasCounts)
            Text(
              '${s.reviews ?? 0} reviews'
              '${s.accuracy != null ? ' · ${s.accuracy}% accurate' : ''}',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            )
          else
            Text(
              'Review counts are not shared.',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            ),
          if (s.streak != null)
            Text(
              'Current streak: ${s.streak} days',
              style: TypeScale.caption.copyWith(
                color: context.mutedForeground,
              ),
            ),
          Text(
            'Topics mastered: ${s.topicsMastered}',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
        ],
      ),
    );
  }
}

class _ConsentOffCard extends StatelessWidget {
  const _ConsentOffCard({required this.underAge});

  final bool underAge;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: underAge
          ? 'Social is not available on this account'
          : 'Social is off',
      children: [
        Text(
          underAge
              ? 'This account was registered with guardian consent, so '
                    'study links, friend boards and guardian summaries stay '
                    'off — only a parent or guardian can change that.'
              : 'Study circle — buddies, accountability partners and '
                    'guardian summaries — sits behind the Social switch in '
                    'Settings. Nothing here is shared while it is off.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        if (!underAge) ...[
          const SizedBox(height: 8),
          Text(
            'Turning Social on lets people you link see your name, '
            'username and avatar, and shows a private weekly board of XP '
            'and streak for your circle — never public, never the '
            'leaderboard. A guardian summary shares review counts, '
            'accuracy, streak and topics mastered over the last 30 days, '
            'only with someone you choose, and only while they accept.',
            style: TypeScale.caption.copyWith(
              color: context.mutedForeground,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Turning Social off ends your study links and summary shares.',
            style: TypeScale.caption.copyWith(
              color: context.mutedForeground,
            ),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => context.push('/settings'),
            child: Text(
              'Open Settings',
              style: TypeScale.caption.copyWith(
                fontWeight: FontWeight.w600,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'We couldn’t load your study circle.',
      children: [
        Text(
          'Check your connection and try again.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: RevisioSecondaryButton(
            compact: true,
            onPressed: onRetry,
            child: const Text('Try again'),
          ),
        ),
      ],
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 120,
      decoration: BoxDecoration(
        color: context.secondary,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
      ),
    );
  }
}
