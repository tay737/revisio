/// Settings panels — appearance/avatar, security, consent and data controls.
/// Each panel PATCHes only the keys it owns; the server merges.
library revisio.features.settings.panels;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../design/theme.dart';
import '../../engine/models.dart';
import '../../design/tokens.dart';
import '../../services/api_client.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import '../../design/revisio_icons.dart';

/// The web palettes, verbatim — a colour the server rejects is a 400.
const avatarColors = ['ink', 'moss', 'bee', 'dawn', 'sky'];
const bannerColors = ['dusk', 'rose', 'sea', 'moss', 'bee', 'ember'];

const _avatarColorHex = {
  'ink': 0xFF1A1A1A,
  'moss': 0xFF4A7C59,
  'bee': 0xFFE8A13D,
  'dawn': 0xFFE8C4A0,
  'sky': 0xFF7FA8C9,
};
const _bannerColorHex = {
  'dusk': 0xFF2E2A45,
  'rose': 0xFFC97B8E,
  'sea': 0xFF4E8D8D,
  'moss': 0xFF4A7C59,
  'bee': 0xFFE8A13D,
  'ember': 0xFFB85C38,
};

/// Section card matching SettingsScreen's _Section styling.
class PanelCard extends StatelessWidget {
  const PanelCard({super.key, required this.title, required this.children});

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

class PanelSwitch extends StatelessWidget {
  const PanelSwitch({
    super.key,
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

// ── appearance / avatar ─────────────────────────────────────────────────────

class AppearancePanel extends ConsumerStatefulWidget {
  const AppearancePanel({super.key, required this.me});

  final MeDetail me;

  @override
  ConsumerState<AppearancePanel> createState() => _AppearancePanelState();
}

class _AppearancePanelState extends ConsumerState<AppearancePanel> {
  late String _emoji = widget.me.avatarEmoji ?? '🦉';
  late String _avatarColor = widget.me.avatarColor;
  late String _bannerColor = widget.me.bannerColor;
  bool _busy = false;
  String? _notice;

  Future<void> _patch(Map<String, dynamic> body) async {
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      await ref.read(apiClientProvider).patchMe(body);
      ref.invalidate(meProvider);
      setState(() => _notice = 'Saved.');
    } catch (_) {
      setState(() => _notice = 'Could not save — try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickPhoto() async {
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (picked == null) {
        setState(() => _busy = false);
        return;
      }
      final bytes = await picked.readAsBytes();
      final ext = picked.name.split('.').last.toLowerCase();
      final contentType = switch (ext) {
        'png' => 'image/png',
        'gif' => 'image/gif',
        _ => 'image/jpeg',
      };
      if (bytes.length > 5 * 1024 * 1024) {
        setState(() {
          _notice = 'That image is over 5 MB.';
          _busy = false;
        });
        return;
      }
      await ref.read(apiClientProvider).uploadAvatar(
            kind: 'avatar',
            bytes: bytes,
            contentType: contentType,
          );
      ref.invalidate(meProvider);
      setState(() => _notice = 'Photo updated.');
    } on ApiError catch (e) {
      setState(() {
        _notice = e.status == 503
            ? 'Image uploads are unavailable — the colour avatar still works.'
            : e.status == 413
                ? 'That image is over 5 MB.'
                : 'The upload failed — try again.';
      });
    } catch (_) {
      setState(() => _notice = 'The upload failed — try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PanelCard(
      title: 'Appearance',
      children: [
        // Preview
        Center(
          child: Column(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: Color(_avatarColorHex[_avatarColor] ?? _avatarColorHex['ink']!),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(_emoji, style: const TextStyle(fontSize: 32)),
              ),
              const SizedBox(height: 6),
              Container(
                width: 140,
                height: 8,
                decoration: BoxDecoration(
                  color: Color(_bannerColorHex[_bannerColor] ?? _bannerColorHex['dusk']!),
                  borderRadius: BorderRadius.circular(RadiusTokens.pill),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text('Avatar emoji', style: TypeScale.caption.copyWith(color: context.mutedForeground)),
        const SizedBox(height: 6),
        TextField(
          controller: TextEditingController(text: _emoji),
          maxLength: 4,
          decoration: const InputDecoration(counterText: ''),
          onChanged: (v) => _emoji = v,
          onSubmitted: (_) => _patch({'avatarEmoji': _emoji}),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final c in avatarColors)
              _Swatch(
                color: Color(_avatarColorHex[c]!),
                selected: _avatarColor == c,
                onTap: () {
                  setState(() => _avatarColor = c);
                  _patch({'avatarColor': c});
                },
              ),
          ],
        ),
        const SizedBox(height: 14),
        Text('Banner colour', style: TypeScale.caption.copyWith(color: context.mutedForeground)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            for (final c in bannerColors)
              _Swatch(
                color: Color(_bannerColorHex[c]!),
                selected: _bannerColor == c,
                onTap: () {
                  setState(() => _bannerColor = c);
                  _patch({'bannerColor': c});
                },
              ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : _pickPhoto,
                icon: const RevisioIcon('photo', size: 18),
                label: const Text('Change photo'),
              ),
            ),
            if (widget.me.avatarUrl != null) ...[
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        try {
                          await ref.read(apiClientProvider).removeAvatar(kind: 'avatar');
                          ref.invalidate(meProvider);
                          setState(() => _notice = 'Photo removed.');
                        } catch (_) {
                          setState(() => _notice = 'Could not remove the photo.');
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
                child: const Text('Remove'),
              ),
            ],
          ],
        ),
        if (_notice != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_notice!, style: TypeScale.fine.copyWith(color: context.mutedForeground)),
          ),
      ],
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch({required this.color, required this.selected, required this.onTap});

  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RadiusTokens.pill),
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected ? context.foreground : context.border,
            width: selected ? 3 : 1,
          ),
        ),
      ),
    );
  }
}

// ── security ────────────────────────────────────────────────────────────────

class SecurityPanel extends ConsumerStatefulWidget {
  const SecurityPanel({super.key});

  @override
  ConsumerState<SecurityPanel> createState() => _SecurityPanelState();
}

class _SecurityPanelState extends ConsumerState<SecurityPanel> {
  Future<void> _changeEmail() async {
    final password = TextEditingController();
    final email = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change email'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            TextField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'New email'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send link')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final pending = await ref.read(apiClientProvider).changeEmail(
            password: password.text,
            newEmail: email.text.trim(),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(pending ? 'Check the new inbox — the change completes from that link.' : 'Nothing changed.')),
        );
      }
    } on ApiError catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _changePassword() async {
    final current = TextEditingController();
    final next = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
            TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Change')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final changed = await ref.read(apiClientProvider).changePassword(
            currentPassword: current.text,
            newPassword: next.text,
          );
      if (changed) {
        // Every refresh token is revoked — including this device's.
        await ref.read(authProvider.notifier).signOut();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Password changed — sign in again on every device.')),
          );
        }
      }
    } on ApiError catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PanelCard(
      title: 'Security',
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Change email'),
          subtitle: const Text('A confirmation link goes to the new address'),
          trailing: const RevisioIcon('expand'),
          onTap: _changeEmail,
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Change password'),
          subtitle: const Text('Signs out every device, including this one'),
          trailing: const RevisioIcon('expand'),
          onTap: _changePassword,
        ),
      ],
    );
  }
}

// ── consent ─────────────────────────────────────────────────────────────────

const _consentLabels = {
  'preferences': 'Preferences',
  'analytics': 'Analytics',
  'marketing': 'Marketing',
  'notifications': 'Notifications',
  'profile': 'Profile fields',
  'school': 'School / account data',
  'research': 'Research',
};

class ConsentPanel extends ConsumerStatefulWidget {
  const ConsentPanel({super.key});

  @override
  ConsumerState<ConsentPanel> createState() => _ConsentPanelState();
}

class _ConsentPanelState extends ConsumerState<ConsentPanel> {
  Map<String, bool>? _choices;
  bool _saving = false;
  bool _saved = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ref.read(apiClientProvider).getConsent();
      final consent = (data['consent'] as Map?)?.cast<String, dynamic>() ?? {};
      if (!mounted) return;
      setState(() {
        _choices = {
          for (final e in _consentLabels.entries) e.key: consent[e.key] == true,
        };
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'We could not load your saved choices.');
    }
  }

  Future<void> _save() async {
    if (_choices == null) return;
    setState(() {
      _saving = true;
      _saved = false;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).updateConsent(_choices!);
      ref.invalidate(consentProvider);
      if (mounted) setState(() => _saved = true);
    } catch (_) {
      if (mounted) setState(() => _error = 'We could not save your choices.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PanelCard(
      title: 'How we use your data',
      children: [
        Text(
          'Essential cookies, sessions and security are always on. You can change your other choices at any time.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
        const SizedBox(height: 8),
        PanelSwitch(
          title: 'Essential',
          subtitle: 'Strictly necessary for sessions, security and the account.',
          value: true,
          onChanged: (_) {},
        ),
        if (_choices == null && _error == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
          )
        else if (_choices != null)
          for (final e in _consentLabels.entries)
            PanelSwitch(
              title: e.value,
              subtitle: null,
              value: _choices![e.key] ?? false,
              onChanged: (v) => setState(() => _choices![e.key] = v),
            ),
        if (_error != null)
          Text(_error!, style: TypeScale.fine.copyWith(color: context.destructive)),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _saving || _choices == null ? null : _save,
          child: Text(_saving ? 'Saving…' : 'Save choices'),
        ),
        if (_saved)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Your consent choices have been saved.',
                style: TypeScale.fine.copyWith(color: context.mutedForeground)),
          ),
      ],
    );
  }
}

// ── data: export + deletion + classes ───────────────────────────────────────

class DataPanel extends ConsumerStatefulWidget {
  const DataPanel({super.key});

  @override
  ConsumerState<DataPanel> createState() => _DataPanelState();
}

class _DataPanelState extends ConsumerState<DataPanel> {
  bool _busy = false;
  String? _notice;

  Future<void> _export() async {
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final bytes = await ref.read(apiClientProvider).exportTranscript(format: 'csv');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/revisio-transcript.csv');
      await file.writeAsBytes(bytes);
      await Share.shareXFiles([XFile(file.path, mimeType: 'text/csv')],
          subject: 'Revisio transcript');
      setState(() => _notice = 'Transcript exported.');
    } catch (_) {
      setState(() => _notice = 'The export failed — try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Two-step challenge per MOBILE-DATA-API: request → show the server's
  /// message verbatim → confirm with the token → sign out everywhere.
  Future<void> _deleteAccount() async {
    setState(() => _busy = true);
    try {
      final first = await ref.read(apiClientProvider).requestDataDeletion();
      if (!mounted) return;
      final token = first['confirmationToken'] as String?;
      final message = first['message'] as String? ?? 'This cannot be undone.';
      if (token == null) {
        setState(() {
          _notice = message;
          _busy = false;
        });
        return;
      }
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Delete account?'),
          content: Text(message),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: context.destructive),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete forever'),
            ),
          ],
        ),
      );
      if (ok != true) {
        setState(() => _busy = false);
        return;
      }
      await ref.read(apiClientProvider).confirmDataDeletion(token);
      await ref.read(authProvider.notifier).signOut();
      if (mounted) context.go('/login');
    } on ApiError catch (e) {
      setState(() {
        _notice = e.code == 'deletion_confirmation_expired'
            ? 'That confirmation expired — start the deletion again.'
            : e.message;
        _busy = false;
      });
    } catch (_) {
      setState(() {
        _notice = 'The deletion request failed — try again.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final classes = ref.watch(myClassesProvider);
    return PanelCard(
      title: 'Your data',
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Download transcript'),
          subtitle: const Text('CSV of your reviews and progress'),
          trailing: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const RevisioIcon('download'),
          onTap: _busy ? null : _export,
        ),
        classes.when(
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
          data: (list) => list.isEmpty
              ? const SizedBox.shrink()
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),
                    Text('Classes', style: TypeScale.caption.copyWith(color: context.mutedForeground)),
                    for (final c in list)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('· ${c['name']}', style: TypeScale.body),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _busy ? null : _deleteAccount,
          icon: RevisioIcon('remove', color: context.destructive),
          label: Text('Delete account', style: TextStyle(color: context.destructive)),
          style: OutlinedButton.styleFrom(side: BorderSide(color: context.destructive)),
        ),
        if (_notice != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_notice!, style: TypeScale.fine.copyWith(color: context.mutedForeground)),
          ),
      ],
    );
  }
}
