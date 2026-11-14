/// Copy and rank conformance — replays `mobile/shared/copy-vectors.json`, the
/// golden vectors emitted from `src/lib/profile.ts` + `src/domain/ranked.ts`.
/// The Dart ports must reproduce `expected` exactly or this fails.
library revisio.test.copy_conformance;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/engine/copy.dart' as copy;
import 'package:revisio/engine/ranked.dart' as ranked;

void main() {
  final vectors = jsonDecode(
    File('../shared/copy-vectors.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  List<Map<String, dynamic>> cases(String key) =>
      ((vectors[key] as List?) ?? []).cast<Map<String, dynamic>>();

  group('names', () {
    for (final c in cases('names')) {
      test('${c['name']}', () {
        expect(copy.firstName(c['name'] as String), c['first']);
        expect(copy.initials(c['name'] as String), c['initials']);
      });
    }
  });

  group('greeting', () {
    for (final c in cases('greeting')) {
      test('hour ${c['hour']} → ${c['expected']}', () {
        final now = DateTime(2026, 1, 5, c['hour'] as int);
        expect(copy.greeting(now: now), c['expected']);
      });
    }
  });

  group('openers', () {
    for (final c in cases('openers')) {
      test('due=${c['due']} streak=${c['streak']}', () {
        final snap = (
          due: c['due'] as int,
          streak: c['streak'] as int,
          level: c['level'] as int,
          subjects: (c['subject'] as String?) != null
              ? [c['subject'] as String]
              : <String>[],
        );
        expect(copy.openers(snap), c['expected']);
      });
    }
  });

  group('companionFor', () {
    for (final c in cases('companionFor')) {
      final input = c['input'] as Map<String, dynamic>;
      final expected = c['expected'] as Map<String, dynamic>;
      test('${expected['tone']}: ${input['name']}', () {
        final snap = (
          name: input['name'] as String? ?? '',
          role: input['role'] as String? ?? 'student',
          due: input['due'] as int? ?? 0,
          reviewed: input['reviewed'] as int? ?? 0,
          correct: input['correct'] as int? ?? 0,
          streak: input['streak'] as int? ?? 0,
          bestStreak: input['bestStreak'] as int? ?? 0,
          level: input['level'] as int? ?? 1,
          subjects: (input['subjects'] as List?)?.cast<String>() ?? const <String>[],
          totalXp: input['totalXp'] as int? ?? 0,
          rankLabel: input['rankLabel'] as String?,
        );
        final now = DateTime(2026, 1, 5, input['hour'] as int? ?? 12);
        final actual = copy.companionFor(snap, now: now);
        expect(actual.tone.name, expected['tone']);
        expect(actual.line, expected['line']);
        expect(actual.actionLabel, expected['actionLabel']);
      });
    }
  });

  group('sessionSummary', () {
    for (final c in cases('sessionSummary')) {
      test('${c['correct']}/${c['total']}', () {
        expect(copy.sessionSummary(c['correct'] as int, c['total'] as int), c['expected']);
      });
    }
  });

  group('emptyQueueLine', () {
    for (final c in cases('emptyQueueLine')) {
      test('due=${c['due']} streak=${c['streak']}', () {
        expect(copy.emptyQueueLine(c['due'] as int, c['streak'] as int), c['expected']);
      });
    }
  });

  group('lobbyLine', () {
    for (final c in cases('lobbyLine')) {
      test('${c['zone']} pos=${c['position']}', () {
        expect(
          copy.lobbyLine(
            zone: c['zone'] as String,
            position: c['position'] as int,
            size: c['size'] as int,
            daysLeft: c['daysLeft'] as int,
            rankLabel: c['rankLabel'] as String,
          ),
          c['expected'],
        );
      });
    }
  });

  group('ladder constants', () {
    test('rung count and top of ladder', () {
      final ladder = vectors['ladder'] as Map<String, dynamic>;
      expect(ranked.rankLadder.length, ladder['rungCount']);
      expect(ranked.topOfLadder, ladder['topOfLadder']);
      for (final r in (ladder['rungs'] as List).cast<Map<String, dynamic>>()) {
        final rung = ranked.rankLadder[r['index'] as int];
        expect(rung.tier.name, r['tier'], reason: 'rung ${r['index']} tier');
        expect(rung.division, r['division'], reason: 'rung ${r['index']} division');
        expect(rung.base, r['base'], reason: 'rung ${r['index']} base');
        expect(rung.span, r['span'], reason: 'rung ${r['index']} span');
      }
    });
  });

  group('rankFor', () {
    for (final c in cases('rankFor')) {
      test('xp=${c['xp']}', () {
        final rank = ranked.rankFor(c['xp'] as int);
        final e = c['expected'] as Map<String, dynamic>;
        expect(rank.tier.name, e['tier']);
        expect(rank.division, e['division']);
        expect(rank.index, e['index']);
        expect(rank.label, e['label']);
        expect(rank.short, e['short']);
        expect(rank.points, e['points']);
        expect(rank.intoDivision, e['intoDivision']);
        expect(rank.forDivision, e['forDivision']);
        expect(rank.percent, e['percent']);
        expect(rank.remaining, e['remaining']);
        expect(rank.isApex, e['isApex']);
      });
    }
  });

  group('formFor', () {
    for (final c in cases('formFor')) {
      test('reviewed=${c['reviewed']} correct=${c['correct']}', () {
        final read = ranked.formFor(c['reviewed'] as int, c['correct'] as int);
        final e = c['expected'] as Map<String, dynamic>;
        expect(read.form.name, e['form']);
        expect(read.label, e['label']);
        expect(read.detail, e['detail']);
      });
    }
  });

  group('zoneBand', () {
    for (final c in cases('zoneBand')) {
      test('size=${c['size']}', () {
        expect(ranked.zoneBand(c['size'] as int), c['expected']);
      });
    }
  });

  group('reviewsForRp', () {
    for (final c in cases('reviewsForRp')) {
      test('rp=${c['rp']}', () {
        expect(ranked.reviewsForRp(c['rp'] as int), c['expected']);
      });
    }
  });
}
