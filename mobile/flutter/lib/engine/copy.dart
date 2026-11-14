/// Personalisation copy — pure functions, a Dart port of `src/lib/profile.ts`.
///
/// Keeping the copy here (rather than inline in widgets) means it is testable,
/// consistent across every surface, and proven equal to the web by
/// `test/copy_conformance_test.dart` against `mobile/shared/copy-vectors.json`.
///
/// Voice: second person, quiet confidence, no exclamation marks, no emoji.
library revisio.engine.copy;

String firstName(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'there';
  return trimmed.split(RegExp(r'\s+')).first;
}

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return 'R';
  if (parts.length == 1) return parts[0].substring(0, parts[0].length >= 2 ? 2 : 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/// Time-of-day greeting. Late night gets acknowledged rather than scolded.
String greeting({DateTime? now}) {
  final h = (now ?? DateTime.now()).hour;
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  if (h < 23) return 'Good evening';
  return 'Late session';
}

String greetingFor(String name, {DateTime? now}) => '${greeting(now: now)}, ${firstName(name)}';

/// The subset of the learner snapshot `openers` reads.
typedef OpenersInput = ({int due, int streak, int level, List<String> subjects});

/// Conversation starters for the rotating headline on the dashboard.
List<String> openers(OpenersInput snap, {DateTime? now}) {
  final lines = <String>[];
  if (snap.due > 0) {
    lines.add('${snap.due} ${snap.due == 1 ? 'card is' : 'cards are'} waiting');
    lines.add("Let's clear today's queue");
  } else {
    lines.add('Nothing is due today');
    lines.add('Want to work ahead?');
  }
  if (snap.streak >= 2) lines.add('Day ${snap.streak} of your streak');
  if (snap.level > 1) lines.add('Level ${snap.level}');
  if (snap.subjects.isNotEmpty) lines.add('Back to ${snap.subjects.first}?');
  // Array.from(new Set(lines)) — first occurrence wins, order preserved.
  final seen = <String>{};
  final unique = lines.where((l) => seen.add(l)).toList();
  return unique.isNotEmpty ? unique : ["Let's get started"];
}

/// Post-session copy. Score first, then one sentence that explains it.
String sessionSummary(int correct, int total) {
  if (total == 0) return 'No cards answered yet.';
  final pct = ((correct / total) * 100).round();
  if (pct == 100) return '$correct for $total. Nothing to redo.';
  if (pct >= 80) return '$correct for $total. ${total - correct} to look at again.';
  if (pct >= 50) return '$correct for $total. Read the notes before the next run.';
  return '$correct for $total. Go back to the notes; this set is not settled yet.';
}

/// Empty-state copy that hands the learner a next action rather than a shrug.
String emptyQueueLine(int due, int streak) {
  if (due == 0 && streak > 0) {
    return 'Your schedule is clear and your $streak-day streak is safe. Anything you review now comes off tomorrow.';
  }
  return 'Your schedule is clear. Cram a topic, read ahead, or come back tomorrow.';
}

// ── the companion ───────────────────────────────────────────────────────────
// Same policy order as `companionFor` in profile.ts: welcome → returning →
// finished work → momentum → nudge → open.

enum CompanionTone { welcome, returning, praise, momentum, nudge, open }

class CompanionRead {
  final CompanionTone tone;
  final String line;
  final String actionLabel;

  const CompanionRead({required this.tone, required this.line, required this.actionLabel});
}

/// The snapshot `companionFor` reads. `totalXp` distinguishes a new account;
/// `rankLabel` is e.g. "Silver II" when the learner holds a rank.
typedef CompanionSnapshot = ({
  String name,
  String role,
  int due,
  int reviewed,
  int correct,
  int streak,
  int bestStreak,
  int level,
  List<String> subjects,
  int totalXp,
  String? rankLabel,
});

CompanionRead companionFor(CompanionSnapshot snap, {DateTime? now}) {
  final due = snap.due;
  final reviewed = snap.reviewed;
  final correct = snap.correct;
  final streak = snap.streak;
  final bestStreak = snap.bestStreak;
  final totalXp = snap.totalXp;
  final rank = snap.rankLabel != null ? ' ${snap.rankLabel}' : '';
  final n = now ?? DateTime.now();

  // 1 — a brand new account. The one moment the app must not be coy.
  if (totalXp <= 0 && reviewed == 0) {
    return CompanionRead(
      tone: CompanionTone.welcome,
      line: 'Nothing here yet, ${firstName(snap.name)}. Ten minutes on one topic is enough to start.',
      actionLabel: 'Pick a topic',
    );
  }

  // 2 — a gap worth acknowledging. Best-streak is the proof they were serious.
  if (streak == 0 && bestStreak >= 3 && reviewed == 0) {
    return CompanionRead(
      tone: CompanionTone.returning,
      line:
          'You had $bestStreak days going. Your queue kept your place, so today starts the next run.',
      actionLabel: 'Resume where you left off',
    );
  }

  // 3 — the work is done. Name it in their own numbers.
  if (due == 0 && reviewed > 0) {
    final clean = correct == reviewed;
    return CompanionRead(
      tone: clean ? CompanionTone.praise : CompanionTone.open,
      line: clean
          ? '$reviewed for $reviewed.${rank.isNotEmpty ? ' Still$rank.' : ''}'
          : '$reviewed answered and the queue is clear.${rank.isNotEmpty ? ' Still$rank.' : ''}',
      actionLabel: 'See the ladder',
    );
  }

  // 4 — mid-session. Short, because they are in the middle of something.
  if (reviewed > 0 && due > 0) {
    return CompanionRead(
      tone: CompanionTone.momentum,
      line: '$reviewed down, $due to go.',
      actionLabel: 'Carry on',
    );
  }

  // 5 — the nudge. Late at night it is an offer, not an order.
  if (due > 0) {
    final late = n.hour >= 23 || n.hour < 5;
    return CompanionRead(
      tone: CompanionTone.nudge,
      line: late
          ? (due == 1
              ? 'One card is due. It will take a minute.'
              : '$due cards are due. A few now, the rest tomorrow.')
          : '$due cards are due. All of them are cards you have already seen.',
      actionLabel: 'Start the queue',
    );
  }

  // 6 — nothing due and nothing done: an invitation, not a reprimand.
  return const CompanionRead(
    tone: CompanionTone.open,
    line: 'Nothing is due. Get ahead on a topic, or leave it until tomorrow.',
    actionLabel: 'Get ahead',
  );
}

/// The lobby's line for the current week.
String lobbyLine({
  required String zone, // 'promotion' | 'safe' | 'demotion' | 'pending'
  required int position,
  required int size,
  required int daysLeft,
  required String rankLabel,
}) {
  final days = daysLeft == 1 ? 'Today is the last day' : '$daysLeft days left';
  if (zone == 'pending') {
    return 'We are still placing you. A few more reviews and we will seat you in a $rankLabel lobby.';
  }
  if (zone == 'promotion') {
    return '$position of $size. You are inside the promotion zone. $days; holding this seat moves you up a rung.';
  }
  if (zone == 'demotion') {
    return '$position of $size. That is the demotion band, and one session pulls you clear of it.';
  }
  return '$position of $size. Safe, and close enough to the promotion band to take it. $days.';
}
