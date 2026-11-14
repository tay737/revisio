/// Settings — profile, subjects, preferences, privacy and account.
/// Writes go through `PATCH /me` / `PATCH /consent` / `POST /classes/join`;
/// the server merges partial payloads, so each control sends only its key.
library revisio.features.settings.settings_screen;

import 'package:flutter/material.dart' hide Visibility;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/components/components.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import 'settings_panels.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _name = TextEditingController();
  final _bio = TextEditingController();
  final _classCode = TextEditingController();
  bool _saving = false;
  bool _seeded = false;
  String? _notice;
  bool _noticeBad = false;

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    _classCode.dispose();
    super.dispose();
  }

  void _seed(MeDetail me) {
    if (_seeded) return;
    _seeded = true;
    _name.text = me.name;
    _bio.text = me.bio ?? '';
  }

  Future<void> _patch(Map<String, dynamic> body, {String? ok}) async {
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      final done = await ref.read(apiClientProvider).patchMe(body);
      ref.invalidate(meProvider);
      setState(() {
        _notice = ok ?? (done ? 'Saved.' : 'Nothing changed.');
        _noticeBad = false;
      });
    } catch (e) {
      setState(() {
        _notice = 'Could not save — try again.';
        _noticeBad = true;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _joinClass() async {
    final code = _classCode.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      await ref.read(apiClientProvider).joinClass(code);
      ref.invalidate(meProvider);
      ref.invalidate(subjectsProvider);
      setState(() {
        _notice = 'Joined.';
        _noticeBad = false;
        _classCode.clear();
      });
    } catch (_) {
      setState(() {
        _notice = 'That code did not work.';
        _noticeBad = true;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _signOut() async {
    await ref.read(authProvider.notifier).signOut();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(meProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SafeArea(
        child: me.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(
            child: Text('Settings could not be loaded.',
                style: TypeScale.body.copyWith(color: context.mutedForeground)),
          ),
          data: (m) {
            _seed(m);
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                if (_notice != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: RevisioNotice(
                      tone: _noticeBad ? NoticeTone.bad : NoticeTone.note,
                      show: true,
                      child: Text(_notice!),
                    ),
                  ),
                _Section('Profile', [
                  RevisioField(
                    label: 'Name',
                    child: RevisioTextInput(controller: _name, placeholder: 'Your name'),
                  ),
                  const SizedBox(height: 12),
                  RevisioField(
                    label: 'Bio',
                    child: RevisioTextInput(
                      controller: _bio,
                      placeholder: 'A line about you',
                      maxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: RevisioButton(
                      enabled: !_saving,
                      onPressed: () => _patch({
                        'name': _name.text.trim(),
                        'bio': _bio.text.trim(),
                      }, ok: 'Profile saved.'),
                      child: const Text('Save profile'),
                    ),
                  ),
                ]),
                AppearancePanel(me: m),
                _Section('Privacy', [
                  _SwitchTile(
                    title: 'Show on leaderboards',
                    subtitle: m.leaderboardOptOut ? 'Hidden — opt back in' : 'Your name appears on boards',
                    value: !m.leaderboardOptOut,
                    onChanged: (v) => _patch({'leaderboardOptOut': !v}),
                  ),
                  for (final entry in {
                    'name': 'Name',
                    'nickname': 'Nickname',
                    'bio': 'Bio',
                    'pronouns': 'Pronouns',
                    'subjects': 'Subjects',
                    'stats': 'Stats',
                    'achievements': 'Achievements',
                  }.entries)
                    _SwitchTile(
                      title: 'Profile: ${entry.value}',
                      subtitle: null,
                      value: _visibilityValue(m.profileVisibility, entry.key),
                      onChanged: (v) => _patch({
                        'profileVisibility': {entry.key: v},
                      }),
                    ),
                ]),
                _Section('Account', [
                  _InfoTile(label: 'Email', value: m.email),
                  _InfoTile(label: 'Role', value: m.role),
                  if (m.totpEnabled) const _InfoTile(label: 'Two-factor', value: 'On'),
                  const SizedBox(height: 8),
                  RevisioButton(
                    onPressed: _saving ? null : _signOut,
                    child: const Text('Sign out'),
                  ),
                ]),
                _Section('Class', [
                  Row(
                    children: [
                      Expanded(
                        child: RevisioTextInput(
                          controller: _classCode,
                          placeholder: 'Class code',
                          textCapitalization: TextCapitalization.characters,
                        ),
                      ),
                      const SizedBox(width: 8),
                      RevisioButton(
                        enabled: !_saving && _classCode.text.trim().isNotEmpty,
                        onPressed: _joinClass,
                        child: const Text('Join'),
                      ),
                    ],
                  ),
                ]),
                const SecurityPanel(),
                const ConsentPanel(),
                const DataPanel(),
                _Section('Preferences', [
                  _SwitchTile(
                    title: 'Detailed notes',
                    subtitle: 'Full explanations beside each card',
                    value: m.prefs.noteDensity == 'detailed',
                    onChanged: (v) => _patch({
                      'prefs': {'noteDensity': v ? 'detailed' : 'summary'},
                    }),
                  ),
                  _SwitchTile(
                    title: 'Reduced motion',
                    subtitle: 'Calmer transitions',
                    value: m.prefs.reducedMotion,
                    onChanged: (v) => _patch({
                      'prefs': {'reducedMotion': v},
                    }),
                  ),
                ]),
              ],
            );
          },
        ),
      ),
    );
  }

  bool _visibilityValue(Visibility v, String key) => switch (key) {
        'name' => v.name,
        'nickname' => v.nickname,
        'bio' => v.bio,
        'pronouns' => v.pronouns,
        'subjects' => v.subjects,
        'stats' => v.stats,
        'achievements' => v.achievements,
        _ => true,
      };
}

class _Section extends StatelessWidget {
  const _Section(this.title, this.children);

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              title.toUpperCase(),
              style: TypeScale.eyebrow.copyWith(color: context.mutedForeground),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.card,
              borderRadius: BorderRadius.circular(RadiusTokens.lg),
              border: Border.all(color: context.border),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
          ),
        ],
      ),
    );
  }
}

class _SwitchTile extends StatelessWidget {
  const _SwitchTile({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TypeScale.body),
                if (subtitle != null)
                  Text(subtitle!,
                      style: TypeScale.fine.copyWith(color: context.mutedForeground)),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(label,
                style: TypeScale.caption.copyWith(color: context.mutedForeground)),
          ),
          Expanded(child: Text(value, style: TypeScale.body)),
        ],
      ),
    );
  }
}
