import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/engine/models.dart';
import 'package:revisio/features/notifications/local_reminders.dart';

NotificationPrefs _prefs({
  bool enabled = true,
  String localTime = '18:00',
  String? quietStart,
  String? quietEnd,
  Map<String, bool> triggers = const {},
}) => NotificationPrefs(
  enabled: enabled,
  localTime: localTime,
  quietStart: quietStart,
  quietEnd: quietEnd,
  triggers: triggers,
);

void main() {
  group('reminderContent', () {
    test('due_cards wins and carries the streak clause when both qualify', () {
      final c = reminderContent(
        prefs: _prefs(),
        dueCount: 5,
        streak: 3,
        reviewedToday: 0,
      )!;
      expect(c.kind, 'due_cards');
      expect(c.title, 'Your study queue is ready');
      expect(
        c.body,
        'You have 5 cards waiting, and your streak is still alive. A short '
        'review keeps it going.',
      );
    });

    test('due_cards without streak risk uses the plain body', () {
      final c = reminderContent(
        prefs: _prefs(),
        dueCount: 1,
        streak: 0,
        reviewedToday: 0,
      )!;
      expect(c.kind, 'due_cards');
      expect(
        c.body,
        "You have 1 card waiting. Open Revisio when you're ready.",
      );
    });

    test('streak_risk fires alone when the queue is empty', () {
      final c = reminderContent(
        prefs: _prefs(triggers: const {'dueCards': false}),
        dueCount: 0,
        streak: 7,
        reviewedToday: 0,
      )!;
      expect(c.kind, 'streak_risk');
      expect(c.title, 'Your streak is still alive');
      expect(
        c.body,
        'One review today keeps it going. It does not have to be a long one '
        '— a single card counts.',
      );
    });

    test('no content when a review already happened today', () {
      expect(
        reminderContent(
          prefs: _prefs(),
          dueCount: 0,
          streak: 4,
          reviewedToday: 2,
        ),
        isNull,
      );
    });

    test('triggers suppress their kind individually', () {
      expect(
        reminderContent(
          prefs: _prefs(triggers: const {'dueCards': false}),
          dueCount: 9,
          streak: 0,
          reviewedToday: 0,
        ),
        isNull,
      );
      expect(
        reminderContent(
          prefs: _prefs(triggers: const {'streakRisk': false}),
          dueCount: 0,
          streak: 9,
          reviewedToday: 0,
        ),
        isNull,
      );
    });
  });

  group('reminderSendMinutes', () {
    test('returns localTime when no quiet hours are set', () {
      expect(reminderSendMinutes(_prefs(localTime: '07:30')), 7 * 60 + 30);
    });

    test('shifts to quietEnd when localTime falls inside quiet hours', () {
      expect(
        reminderSendMinutes(
          _prefs(localTime: '23:00', quietStart: '22:00', quietEnd: '08:00'),
        ),
        8 * 60,
      );
    });

    test('keeps localTime outside a wrap-midnight quiet window', () {
      expect(
        reminderSendMinutes(
          _prefs(localTime: '18:00', quietStart: '22:00', quietEnd: '08:00'),
        ),
        18 * 60,
      );
    });

    test('handles a same-day quiet window', () {
      expect(
        reminderSendMinutes(
          _prefs(localTime: '13:00', quietStart: '12:00', quietEnd: '14:00'),
        ),
        14 * 60,
      );
      expect(
        reminderSendMinutes(
          _prefs(localTime: '15:00', quietStart: '12:00', quietEnd: '14:00'),
        ),
        15 * 60,
      );
    });

    test('malformed times fall back to the server default 18:00', () {
      expect(reminderSendMinutes(_prefs(localTime: 'nope')), 18 * 60);
      expect(reminderSendMinutes(_prefs(localTime: '25:99')), 18 * 60);
    });
  });
}
