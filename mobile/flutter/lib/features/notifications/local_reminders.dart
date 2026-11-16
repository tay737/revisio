/// Local reminders (#11) — the on-device half of the notification contract.
///
/// The server owns the prefs (`/api/v1/notifications/prefs`) and the email
/// channel; this service schedules the same two kinds locally from data the
/// client already holds: `me.today.due` (due + fresh cards, same shape as the
/// server's `waitingCount.total`) and `me.gamification.streak` /
/// `me.today.reviewed` for streak risk. Copy is verbatim `retention.ts` —
/// counts and streak numbers only, never card or subject text.
///
/// One notification per day: a single daily `zonedSchedule` whose content is
/// recomputed on every app open, sync and session end (cancel-pending +
/// reschedule is the spec's idempotent model — no drift, no missed reschedule
/// after a timezone or prefs change).
library revisio.features.notifications.local_reminders;

import 'dart:async';
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

import '../../engine/models.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';

/// Recomputes the pending reminder whenever the inputs change: sign-in state,
/// `/me` (due count, streak, reviewed-today), and the prefs document. Watching
/// this provider is the whole "reschedule on open/sync" hook — `_finish()` in
/// the review flow already invalidates `meProvider`/`queueProvider`, so a
/// completed session re-arms the reminder with fresh counts automatically.
final reminderSyncProvider = Provider<void>((ref) {
  if (ref.watch(authProvider) is! AuthAuthenticated) {
    unawaited(LocalReminders.instance.cancelAll());
    return;
  }
  final me = ref.watch(meProvider).valueOrNull;
  final prefs = ref.watch(notificationPrefsProvider).valueOrNull;
  if (me == null || prefs == null) return;
  unawaited(
    LocalReminders.instance.sync(
      prefs: prefs.prefs,
      consentNotifications: prefs.consentNotifications,
      dueCount: me.today.due,
      streak: me.gamification.streak,
      reviewedToday: me.today.reviewed,
    ),
  );
});

/// The two v0 kinds — mirrors the server-side candidate merge in
/// `processRetentionReminders`: `due_cards` wins when both qualify and carries
/// the streak clause; `streak_risk` fires alone only when the queue is empty
/// or due-cards is off.
class ReminderContent {
  final String kind;
  final String title;
  final String body;

  const ReminderContent({
    required this.kind,
    required this.title,
    required this.body,
  });
}

/// Copy verbatim from `src/services/retention.ts` — the live contract. The
/// spec doc's draft table ('Streak ends tonight') predates the shipped copy.
ReminderContent? reminderContent({
  required NotificationPrefs prefs,
  required int dueCount,
  required int streak,
  required int reviewedToday,
}) {
  final triggers = prefs.triggers;
  final streakAtRisk =
      streak > 0 &&
      reviewedToday == 0 &&
      triggers['streakRisk'] != false;
  if (dueCount > 0 && triggers['dueCards'] != false) {
    final n = dueCount;
    return ReminderContent(
      kind: 'due_cards',
      title: 'Your study queue is ready',
      body: streakAtRisk
          ? 'You have $n card${n == 1 ? '' : 's'} waiting, and your streak is '
                'still alive. A short review keeps it going.'
          : 'You have $n card${n == 1 ? '' : 's'} waiting. Open Revisio when '
                "you're ready.",
    );
  }
  if (streakAtRisk) {
    return ReminderContent(
      kind: 'streak_risk',
      title: 'Your streak is still alive',
      body:
          'One review today keeps it going. It does not have to be a long one '
          '— a single card counts.',
    );
  }
  return null;
}

int? _hhmm(String? value) {
  if (value == null) return null;
  final parts = value.split(':');
  if (parts.length != 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/// The wall-clock minute-of-day the daily notification fires at: `localTime`,
/// shifted to `quietEnd` when it lands inside the quiet window. Quiet windows
/// may wrap midnight (22:00–08:00); `quietEnd` is always a valid daily time
/// either way. Malformed times fall back to 18:00, the server default.
int reminderSendMinutes(NotificationPrefs prefs) {
  final base = _hhmm(prefs.localTime) ?? 18 * 60;
  final start = _hhmm(prefs.quietStart);
  final end = _hhmm(prefs.quietEnd);
  if (start == null || end == null || start == end) return base;
  final inQuiet = start < end
      ? base >= start && base < end
      : base >= start || base < end;
  return inQuiet ? end : base;
}

class LocalReminders {
  LocalReminders._();

  static final LocalReminders instance = LocalReminders._();

  static const _notificationId = 7001;
  static const _channelId = 'reminders';
  static const _payloadPath = '/review';

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  bool _tzReady = false;

  /// Set by the app shell: a tapped reminder carries `payloadPath` and routes
  /// through go_router like any other in-app destination.
  void Function(String payload)? onPayload;

  /// Plugin + timezone warm-up at app start, so a notification tap that
  /// cold-launches the app is delivered as soon as the framework is up rather
  /// than whenever the first sync happens to run.
  Future<void> warmUp() => _ensureInit();

  Future<void> _ensureInit() async {
    if (_initialized) return;
    _initialized = true;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            // Permissions are asked contextually (settings toggle / first
            // completed review), never at init — the spec's consent rule.
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (response) {
          final payload = response.payload;
          if (payload != null) onPayload?.call(payload);
        },
      );
    } catch (_) {
      _initialized = false;
    }
    if (!_tzReady) {
      _tzReady = true;
      try {
        tz_data.initializeTimeZones();
        final info = await FlutterTimezone.getLocalTimezone();
        tz.setLocalLocation(tz.getLocation(info.identifier));
      } catch (_) {
        // Device tz unavailable — UTC keeps the schedule honest rather than
        // crashing; reschedule-on-open corrects it next launch.
      }
    }
  }

  /// OS-level permission, asked only when the user turns reminders on.
  /// Returns whether notifications can be delivered; callers treat `false`
  /// as "explain, don't schedule".
  Future<bool> ensurePermission() async {
    await _ensureInit();
    try {
      if (Platform.isAndroid) {
        final android = _plugin
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >();
        // Below API 33 there is nothing to ask — notifications are granted.
        return await android?.requestNotificationsPermission() ?? true;
      }
      if (Platform.isIOS) {
        final ios = _plugin
            .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin
            >();
        return await ios?.requestPermissions(
              alert: true,
              sound: true,
              badge: false,
            ) ??
            false;
      }
    } catch (_) {}
    return false;
  }

  /// Cancel every pending + presented reminder. Called on disable, sign-out
  /// and account switch — reminder content is per-account.
  Future<void> cancelAll() async {
    await _ensureInit();
    try {
      await _plugin.cancelAll();
    } catch (_) {}
  }

  /// Recompute and re-arm the daily reminder. Fail-quiet throughout: a
  /// platform or prefs error leaves whatever was pending before untouched
  /// only when we never got far enough to cancel — once we cancel, a failed
  /// reschedule simply means no reminder until the next sync.
  Future<void> sync({
    required NotificationPrefs prefs,
    required bool consentNotifications,
    required int dueCount,
    required int streak,
    required int reviewedToday,
  }) async {
    await _ensureInit();
    if (!prefs.enabled || !consentNotifications) {
      try {
        await _plugin.cancelAllPendingNotifications();
      } catch (_) {}
      return;
    }
    final content = reminderContent(
      prefs: prefs,
      dueCount: dueCount,
      streak: streak,
      reviewedToday: reviewedToday,
    );
    try {
      await _plugin.cancelAllPendingNotifications();
      if (content == null) return;
      final send = reminderSendMinutes(prefs);
      final now = DateTime.now();
      // `matchDateTimeComponents: time` makes this a daily wall-clock
      // recurrence; the plugin rolls a past time to tomorrow on its own.
      final when = tz.TZDateTime.from(
        DateTime(now.year, now.month, now.day, send ~/ 60, send % 60),
        tz.local,
      );
      await _plugin.zonedSchedule(
        id: _notificationId,
        title: content.title,
        body: content.body,
        scheduledDate: when,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            'Reminders',
            channelDescription: 'Daily study reminders',
          ),
          iOS: DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        matchDateTimeComponents: DateTimeComponents.time,
        payload: _payloadPath,
      );
    } catch (_) {}
  }
}
