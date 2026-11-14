/// Grading conformance — replays `mobile/shared/grading-vectors.json`, the
/// golden vectors emitted from `src/domain/grading.ts`. The Dart port must
/// reproduce `expected` exactly or this fails.
library revisio.test.grading_conformance;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/engine/grading.dart';

void main() {
  final vectors = jsonDecode(
    File('../shared/grading-vectors.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final cases = (vectors['cases'] as List).cast<Map<String, dynamic>>();

  Verdict? run(Map<String, dynamic> c) {
    final input = c['input'] as Map<String, dynamic>;
    final accepted = ((input['accepted'] as List?) ?? [])
        .map((a) => AcceptedAnswer.fromJson(a as Map<String, dynamic>))
        .toList();
    switch (c['fn']) {
      case 'gradeCloze':
        return gradeCloze(input['answer'] as String? ?? '', accepted);
      case 'gradeFlashcard':
        return gradeFlashcard(
          input['answer'] as String? ?? '',
          accepted,
          minPointsOverride: input['minPoints'] as int?,
        );
      case 'gradeMcq':
        return gradeMcq(
          input['selectedOptionId'] as String?,
          input['correctOptionId'] as String? ?? '',
        );
    }
    return null;
  }

  /// Compare only the fields the vector pins — the TS engine omits undefined.
  void expectMatch(Map<String, dynamic> expected, Verdict actual, String name) {
    expect(actual.correct, expected['correct'], reason: '$name: correct');
    expect(
      actual.feedbackKind.wire,
      expected['feedbackKind'],
      reason: '$name: feedbackKind',
    );
    if (expected.containsKey('matchedAnswerId')) {
      expect(actual.matchedAnswerId, expected['matchedAnswerId'], reason: '$name: matchedAnswerId');
    }
    if (expected.containsKey('note')) {
      expect(actual.note, expected['note'], reason: '$name: note');
    }
    if (expected.containsKey('matchedPhrases')) {
      expect(actual.matchedPhrases, expected['matchedPhrases'], reason: '$name: matchedPhrases');
    }
    if (expected.containsKey('missedPhrases')) {
      expect(actual.missedPhrases, expected['missedPhrases'], reason: '$name: missedPhrases');
    }
  }

  for (final c in cases) {
    test('${c['fn']}: ${c['name']}', () {
      final actual = run(c);
      expect(actual, isNotNull, reason: 'unknown fn ${c['fn']}');
      expectMatch(c['expected'] as Map<String, dynamic>, actual!, c['name'] as String);
    });
  }
}
