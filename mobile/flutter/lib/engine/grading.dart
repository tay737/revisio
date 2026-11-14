/// A Dart port of `src/domain/grading.ts` — the cloze/flashcard/MCQ preview.
///
/// This is the *only* grading code in the Flutter client, and it exists so a
/// review can be marked with no server. It is a copy of the canonical
/// TypeScript engine, proven equal by the grading conformance test against
/// `mobile/shared/grading-vectors.json` — so grading still has one owner.
///
/// Contract (unchanged from the web): the client may preview but never
/// decide. A verdict reached here is provisional; the queued review is
/// re-graded by `POST /api/v1/reviews` when the network returns, and the
/// server's verdict is what earns XP and moves the schedule.
///
/// Only the `legacy` policy ships on the phone: the `similar` rung needs the
/// web's synonym/typo tables, which are not part of the native contract.
library revisio.engine.grading;

import 'unicode_tables.dart';

/// Mirrors `FeedbackKind` in `src/domain/grading.ts`, string-for-string.
enum FeedbackKind {
  correct('correct'),
  caseOnly('case_only'),
  punctuationOnly('punctuation_only'),
  caseAndPunctuation('case_and_punctuation'),
  nearMiss('near_miss'),
  wrong('wrong');

  const FeedbackKind(this.wire);
  final String wire;

  static FeedbackKind fromWire(String value) => FeedbackKind.values.firstWhere(
        (k) => k.wire == value,
        orElse: () => FeedbackKind.wrong,
      );
}

/// A grading result. Null fields are omitted on the wire, matching the TS
/// engine's `undefined`.
class Verdict {
  final bool correct;
  final FeedbackKind feedbackKind;
  final String? matchedAnswerId;
  final String? note;
  final List<String>? matchedPhrases;
  final List<String>? missedPhrases;

  const Verdict({
    required this.correct,
    required this.feedbackKind,
    this.matchedAnswerId,
    this.note,
    this.matchedPhrases,
    this.missedPhrases,
  });

  Map<String, dynamic> toJson() => {
        'correct': correct,
        'feedbackKind': feedbackKind.wire,
        if (matchedAnswerId != null) 'matchedAnswerId': matchedAnswerId,
        if (note != null) 'note': note,
        if (matchedPhrases != null) 'matchedPhrases': matchedPhrases,
        if (missedPhrases != null) 'missedPhrases': missedPhrases,
      };

  factory Verdict.fromJson(Map<String, dynamic> json) => Verdict(
        correct: json['correct'] == true,
        feedbackKind: FeedbackKind.fromWire(json['feedbackKind'] as String? ?? 'wrong'),
        matchedAnswerId: json['matchedAnswerId'] as String?,
        note: json['note'] as String?,
        matchedPhrases: (json['matchedPhrases'] as List?)?.cast<String>(),
        missedPhrases: (json['missedPhrases'] as List?)?.cast<String>(),
      );
}

class Keyword {
  /// Wire name is `required`; the Dart field avoids the built-in identifier.
  final bool isRequired;
  final String phrase;
  final List<String>? synonyms;

  const Keyword({this.isRequired = false, required this.phrase, this.synonyms});

  factory Keyword.fromJson(Map<String, dynamic> json) => Keyword(
        isRequired: json['required'] == true,
        phrase: json['phrase'] as String? ?? '',
        synonyms: (json['synonyms'] as List?)?.cast<String>(),
      );
}

class AcceptedAnswer {
  final String id;
  final String text;
  final bool isPrimary;
  final List<Keyword>? keywords;
  final int? minPoints;

  const AcceptedAnswer({
    required this.id,
    required this.text,
    this.isPrimary = false,
    this.keywords,
    this.minPoints,
  });

  factory AcceptedAnswer.fromJson(Map<String, dynamic> json) => AcceptedAnswer(
        id: json['id'] as String? ?? '',
        text: json['text'] as String? ?? '',
        isPrimary: json['isPrimary'] == true,
        keywords: (json['keywords'] as List?)
            ?.map((k) => Keyword.fromJson(k as Map<String, dynamic>))
            .toList(),
        minPoints: json['minPoints'] as int?,
      );
}

// ── normalization ───────────────────────────────────────────────────────────
//
// `String.prototype.normalize('NFKC'|'NFD')` has no Dart equivalent, so the
// tables in unicode_tables.dart stand in: kCompatFold covers the characters
// whose NFKC form is plain ASCII (the ones that can change a comparison),
// kAccentFold is the exact NFD-minus-U+0300–U+036F fold `stripAccents`
// computes, and kPunctuationSymbolRanges is the \p{P}\p{S} class.

final RegExp _whitespace = RegExp(r'\s+');

String _foldCompat(String input) {
  final buffer = StringBuffer();
  for (final rune in input.runes) {
    buffer.write(kCompatFold[rune] ?? String.fromCharCodes([rune]));
  }
  return buffer.toString();
}

/// NFKC approximation: ASCII-compat folds plus whitespace handling. Characters
/// whose NFKC form is not plain ASCII (superscripts with marks, enclosed
/// forms, …) keep their composed shape — a preview-only gap the server's
/// re-grade closes.
String normalize(String input) =>
    _foldCompat(input).trim().replaceAll(_whitespace, ' ');

String lowercase(String input) => normalize(input).toLowerCase();

bool _isPunctuationOrSymbol(int cp) {
  // Binary search over the sorted ranges.
  var lo = 0, hi = kPunctuationSymbolRanges.length - 1;
  while (lo <= hi) {
    final mid = (lo + hi) >> 1;
    final (start, end) = kPunctuationSymbolRanges[mid];
    if (cp < start) {
      hi = mid - 1;
    } else if (cp > end) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

String _replacePsWithSpace(String input) {
  final buffer = StringBuffer();
  for (final rune in input.runes) {
    buffer.write(_isPunctuationOrSymbol(rune) ? ' ' : String.fromCharCodes([rune]));
  }
  return buffer.toString();
}

String stripPunctuation(String input) {
  final replaced = _replacePsWithSpace(normalize(input));
  return replaced.replaceAll(_whitespace, ' ').trim();
}

/// NFD minus U+0300–U+036F, per character. Cross-character reordering NFD can
/// perform is irrelevant here because every mark in that range is deleted.
String stripAccents(String input) {
  final buffer = StringBuffer();
  for (final rune in input.runes) {
    buffer.write(kAccentFold[rune] ?? String.fromCharCodes([rune]));
  }
  return buffer.toString();
}

String fullyNormalized(String input) =>
    stripPunctuation(stripAccents(lowercase(input)));

// ── cloze ───────────────────────────────────────────────────────────────────

Verdict gradeCloze(String userAnswer, List<AcceptedAnswer> accepted) {
  final user = normalize(userAnswer);
  if (user.isEmpty) {
    return const Verdict(
      correct: false,
      feedbackKind: FeedbackKind.wrong,
      note: 'No answer given.',
    );
  }

  // 1) exact match (after whitespace normalization)
  for (final a in accepted) {
    if (normalize(a.text) == user) {
      return Verdict(correct: true, feedbackKind: FeedbackKind.correct, matchedAnswerId: a.id);
    }
  }

  // 2) case-only difference → correct with a nudge
  for (final a in accepted) {
    if (lowercase(a.text) == lowercase(user)) {
      return Verdict(
        correct: true,
        feedbackKind: FeedbackKind.caseOnly,
        matchedAnswerId: a.id,
        note: 'Correct. Mind your capitalisation.',
      );
    }
  }

  // 3) punctuation-only difference → correct with a nudge
  for (final a in accepted) {
    if (stripPunctuation(lowercase(a.text)) == stripPunctuation(lowercase(user))) {
      return Verdict(
        correct: true,
        feedbackKind: FeedbackKind.punctuationOnly,
        matchedAnswerId: a.id,
        note: 'Correct. Check your punctuation.',
      );
    }
  }

  // 4) both case + punctuation differ → still correct
  for (final a in accepted) {
    if (stripPunctuation(stripAccents(lowercase(a.text))) ==
        stripPunctuation(stripAccents(lowercase(user)))) {
      return Verdict(
        correct: true,
        feedbackKind: FeedbackKind.caseAndPunctuation,
        matchedAnswerId: a.id,
        note: 'Correct. Check capitalisation and punctuation.',
      );
    }
  }

  // 5) wrong content. The right answer travels separately as `primaryAnswer`,
  // so the note says only what was wrong with the attempt.
  return const Verdict(correct: false, feedbackKind: FeedbackKind.wrong);
}

// ── flashcards (keyword-based marking) ──────────────────────────────────────

bool _includesPhrase(String haystack, String needle, List<String> synonyms) {
  for (final candidate in [needle, ...synonyms]) {
    if (haystack.contains(fullyNormalized(candidate))) return true;
  }
  return false;
}

Verdict gradeFlashcard(String userAnswer, List<AcceptedAnswer> accepted,
    {int? minPointsOverride}) {
  final user = fullyNormalized(userAnswer);
  if (user.isEmpty) {
    return const Verdict(
      correct: false,
      feedbackKind: FeedbackKind.wrong,
      note: 'No answer given.',
    );
  }

  final candidates = accepted.where((a) => a.keywords?.isNotEmpty ?? false);
  final rules = candidates.isEmpty ? null : candidates.first;
  final keywords = rules?.keywords;
  if (rules == null || keywords == null || keywords.isEmpty) {
    // No keyword rules — fall back to cloze-style loose comparison.
    return gradeCloze(userAnswer, accepted);
  }

  final minPoints = minPointsOverride ?? rules.minPoints ?? 2;
  final requiredKeywords = keywords.where((k) => k.isRequired).toList();
  final optional = keywords.where((k) => !k.isRequired).toList();

  final matchedRequired = requiredKeywords
      .where((k) => _includesPhrase(user, k.phrase, k.synonyms ?? const []))
      .toList();
  final matchedOptional = optional
      .where((k) => _includesPhrase(user, k.phrase, k.synonyms ?? const []))
      .toList();

  final matchedPhrases = [...matchedRequired, ...matchedOptional].map((k) => k.phrase).toList();
  final missedRequired = requiredKeywords.where((k) => !matchedRequired.contains(k)).toList();
  final missedOptional = optional.where((k) => !matchedOptional.contains(k)).toList();
  final missedPhrases = [...missedRequired, ...missedOptional].map((k) => k.phrase).toList();

  final requiredOk = matchedRequired.length == requiredKeywords.length;
  final pointsOk = matchedRequired.length + matchedOptional.length >= minPoints;

  if (requiredOk && pointsOk) {
    return Verdict(
      correct: true,
      feedbackKind: FeedbackKind.correct,
      matchedAnswerId: rules.id,
      matchedPhrases: matchedPhrases,
      missedPhrases: missedPhrases,
      note: matchedOptional.isNotEmpty || missedOptional.isNotEmpty
          ? 'Covered: ${matchedPhrases.join(', ')}.'
          : null,
    );
  }

  if (requiredOk && !pointsOk) {
    return Verdict(
      correct: false,
      feedbackKind: FeedbackKind.nearMiss,
      matchedAnswerId: rules.id,
      matchedPhrases: matchedPhrases,
      missedPhrases: missedPhrases,
      note:
          'Good start. Also include: ${missedOptional.take(3).map((k) => k.phrase).join(', ')}.',
    );
  }

  return Verdict(
    correct: false,
    feedbackKind: requiredOk ? FeedbackKind.nearMiss : FeedbackKind.wrong,
    matchedAnswerId: rules.id,
    matchedPhrases: matchedPhrases,
    missedPhrases: missedPhrases,
    note: requiredOk
        ? 'Close. Some required points were missing.'
        : 'Some required points were missing.',
  );
}

// ── multiple choice ─────────────────────────────────────────────────────────

Verdict gradeMcq(String? selectedOptionId, String correctOptionId) {
  if (selectedOptionId == null || selectedOptionId.isEmpty) {
    return const Verdict(
      correct: false,
      feedbackKind: FeedbackKind.wrong,
      note: 'No selection made.',
    );
  }
  if (selectedOptionId == correctOptionId) {
    return const Verdict(correct: true, feedbackKind: FeedbackKind.correct);
  }
  return const Verdict(
    correct: false,
    feedbackKind: FeedbackKind.wrong,
    note: 'Incorrect. One attempt only.',
  );
}
