/// Launch version gate — `GET /api/v1/version` is unauthenticated and cheap.
/// `build < minBuild` is a required update; `build < latest` is a suggestion.
/// A failed check never blocks: the gate only speaks when the server answers.
library revisio.features.app.version_gate;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../auth/auth_provider.dart';

enum VersionStatus { current, updateAvailable, updateRequired }

class VersionCheck {
  final VersionStatus status;
  final String latest;

  const VersionCheck({required this.status, required this.latest});
}

/// The app's own compiled-in build number — stamped by
/// `scripts/native/set-version.mjs` into pubspec's `+N`.
final ownBuildProvider = FutureProvider<int>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return int.tryParse(info.buildNumber) ?? 0;
});

final versionCheckProvider = FutureProvider<VersionCheck?>((ref) async {
  try {
    final server = await ref.read(apiClientProvider).appVersion();
    final own = await ref.read(ownBuildProvider.future);
    final build = server['build'] as int? ?? 0;
    final minBuild = server['minBuild'] as int? ?? 0;
    final latest = server['latest'] as String? ?? '';
    if (own < minBuild) {
      return VersionCheck(status: VersionStatus.updateRequired, latest: latest);
    }
    if (own < build) {
      return VersionCheck(status: VersionStatus.updateAvailable, latest: latest);
    }
    return VersionCheck(status: VersionStatus.current, latest: latest);
  } catch (_) {
    return null; // offline or server down — never gate on a failed check
  }
});

const _updateUrl = 'https://revisio-srs.vercel.app';

/// Shows the gate once per launch, after first frame, above whatever route
/// the router picked. Call from the app root with the navigator's context.
Future<void> maybeShowVersionGate(BuildContext context, WidgetRef ref) async {
  final check = await ref.read(versionCheckProvider.future);
  if (!context.mounted || check == null || check.status == VersionStatus.current) {
    return;
  }
  final required = check.status == VersionStatus.updateRequired;
  await showDialog<void>(
    context: context,
    barrierDismissible: !required,
    builder: (ctx) => AlertDialog(
      title: Text(required ? 'Update required' : 'Update available'),
      content: Text(
        required
            ? 'This version of Revisio is no longer supported. Update to keep studying.'
            : 'Revisio ${check.latest}',
      ),
      actions: [
        if (!required)
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Later')),
        FilledButton(
          onPressed: () {
            Navigator.pop(ctx);
            launchUrl(Uri.parse(_updateUrl), mode: LaunchMode.externalApplication);
          },
          child: const Text('Update'),
        ),
      ],
    ),
  );
}
