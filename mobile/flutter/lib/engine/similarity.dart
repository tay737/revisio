/// Word & phrase similarity — port of `src/domain/similarity.ts`.
/// Pure, deterministic. Relations: exact, inflection, synonym, typo, none.
library revisio.engine.similarity;

import 'grading.dart';

enum WordRelation { exact, inflection, synonym, typo, none }

class AnswerRelation {
  const AnswerRelation({
    required this.relation,
    required this.score,
    required this.matchedText,
  });
  final WordRelation relation;
  final double score;
  final String matchedText;
}

const List<List<String>> kSynonymDictionary = [
  ['information', 'data'],
  ['unnecessary', 'irrelevant', 'unneeded', 'excess'],
  ['important', 'key', 'significant', 'crucial', 'vital'],
  ['understand', 'comprehend', 'grasp'],
  ['create', 'make', 'build', 'construct'],
  ['use', 'utilise', 'utilize', 'employ'],
  ['check', 'verify', 'validate'],
  ['protect', 'secure', 'safeguard'],
  ['reduce', 'lower', 'decrease', 'minimise', 'minimize'],
  ['increase', 'raise', 'maximise', 'maximize'],
  ['allow', 'permit', 'let'],
  ['stop', 'prevent', 'block'],
  ['remove', 'delete', 'erase'],
  ['show', 'display', 'present'],
  ['hide', 'conceal'],
  ['start', 'begin', 'launch', 'initiate'],
  ['end', 'finish', 'terminate', 'complete'],
  ['help', 'assist', 'aid'],
  ['buy', 'purchase'],
  ['get', 'obtain', 'acquire'],
  ['give', 'provide', 'supply'],
  ['choose', 'select', 'pick'],
  ['find', 'locate', 'discover', 'detect'],
  ['improve', 'enhance', 'refine'],
  ['plan', 'design', 'specify'],
  ['break', 'split', 'divide', 'decompose'],
  ['combine', 'merge', 'join'],
  ['send', 'transmit'],
  ['store', 'save', 'keep', 'retain'],
  ['copy', 'duplicate', 'clone'],
  ['error', 'mistake', 'fault'],
  ['problem', 'issue'],
  ['answer', 'response', 'reply'],
  ['aim', 'goal', 'objective', 'purpose'],
  ['benefit', 'advantage', 'upside'],
  ['drawback', 'disadvantage', 'downside'],
  ['method', 'approach', 'technique', 'way'],
  ['stage', 'step', 'phase'],
  ['rules', 'laws', 'legislation'],
  ['employee', 'worker', 'staff member'],
  ['employer', 'company', 'organisation', 'organization', 'business'],
  ['customer', 'client', 'user'],
  ['sick', 'ill', 'unwell'],
  ['injury', 'harm', 'damage'],
  ['warning', 'caution', 'alert'],
  ['tired', 'fatigued', 'weary'],
  ['stress', 'pressure', 'strain'],
  ['permission', 'consent', 'authorisation', 'authorization'],
  ['personal', 'private'],
  ['public', 'open'],
  ['accurate', 'correct', 'precise', 'exact'],
  ['roughly', 'approximately', 'about'],
  ['quickly', 'rapidly', 'fast', 'swiftly'],
  ['slowly', 'gradually'],
  ['always', 'constantly', 'invariably'],
  ['never', 'at no point'],
  ['many', 'numerous', 'several', 'multiple'],
  ['few', 'little', 'limited'],
  ['big', 'large', 'sizeable', 'sizable'],
  ['small', 'tiny', 'minor'],
  ['new', 'recent', 'modern'],
  ['old', 'outdated', 'obsolete', 'legacy'],
  ['device', 'machine', 'equipment'],
  ['screen', 'monitor', 'display screen'],
  ['password', 'passphrase'],
  ['username', 'user name', 'login name'],
  ['malicious', 'harmful'],
  ['suspicious', 'dodgy', 'questionable'],
  ['update', 'upgrade', 'patch'],
  ['backup', 'back up', 'copy backup'],
  ['scan', 'sweep'],
  ['connect', 'link', 'attach'],
  ['disconnect', 'unlink', 'detach'],
  ['install', 'set up'],
  ['uninstall', 'remove installation'],
  ['encrypt', 'encode', 'cipher'],
  ['decrypt', 'decode'],
  ['steal', 'take', 'exfiltrate'],
  ['fake', 'counterfeit', 'forged', 'bogus'],
  ['identity', 'identity details', 'personal identity'],
  ['track', 'monitor', 'watch'],
  ['gather', 'collect', 'assemble'],
  ['spread', 'propagate', 'circulate'],
  ['target', 'aim at'],
  ['damage', 'harm', 'hurt'],
  ['repair', 'fix', 'mend'],
  ['review', 'examine', 'assess', 'evaluate'],
  ['follow', 'obey', 'comply with', 'adhere to'],
  ['break rules', 'violate', 'breach'],
  ['fine', 'penalty', 'sanction'],
  ['imprisonment', 'jail', 'prison sentence'],
  ['responsible', 'accountable', 'liable'],
  ['required', 'mandatory', 'obligatory', 'compulsory'],
  ['optional', 'voluntary'],
  ['sufficient', 'enough', 'adequate'],
  ['prior', 'previous', 'earlier'],
  ['subsequent', 'later', 'following'],
];

final Map<String, int> _groupIndex = () {
  final map = <String, int>{};
  for (var i = 0; i < kSynonymDictionary.length; i++) {
    for (final word in kSynonymDictionary[i]) {
      map[canonicalWord(word)] = i;
    }
  }
  return map;
}();

/// Fold a word to a comparable canonical form: accents/punctuation gone,
/// case gone, simple plural and possessive endings collapsed.
String canonicalWord(String word) {
  var w = fullyNormalized(word).replaceAll(RegExp(r'\s+'), ' ');
  if (w.isEmpty) return '';
  if (w.endsWith("'s")) w = w.substring(0, w.length - 2);
  if (w.length > 4) {
    if (w.endsWith('ies')) {
      w = '${w.substring(0, w.length - 3)}y';
    } else if (w.endsWith('sses')) {
      w = w.substring(0, w.length - 2);
    } else if (RegExp(r'(?:ch|sh|s|x|z)es$').hasMatch(w) && w.length > 5) {
      w = w.substring(0, w.length - 2);
    } else if (RegExp(r'(?:[^s]s)$').hasMatch(w) &&
        !RegExp(r'(?:ss|us|is|as)$').hasMatch(w)) {
      w = w.substring(0, w.length - 1);
    }
  }
  return w;
}

/// Normalised Damerau-Levenshtein similarity: 1 - edit distance over the
/// longer word. Transpositions count as one edit.
double stringSimilarity(String a, String b) {
  final x = canonicalWord(a);
  final y = canonicalWord(b);
  if (x.isEmpty || y.isEmpty) return 0;
  if (x == y) return 1;
  final m = x.length;
  final n = y.length;
  List<int>? prev2;
  var prev = List<int>.generate(n + 1, (j) => j);
  var cur = List<int>.filled(n + 1, 0);
  for (var i = 1; i <= m; i++) {
    cur[0] = i;
    for (var j = 1; j <= n; j++) {
      final cost = x[i - 1] == y[j - 1] ? 0 : 1;
      var d = [
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + cost,
      ].reduce((a2, b2) => a2 < b2 ? a2 : b2);
      if (i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1]) {
        d = [
          d,
          (prev2?[j - 2] ?? i - 2) + 1,
        ].reduce((a2, b2) => a2 < b2 ? a2 : b2);
      }
      cur[j] = d;
    }
    prev2 = prev;
    prev = cur;
    cur = List<int>.filled(n + 1, 0);
  }
  return 1 - prev[n] / (m > n ? m : n);
}

/// Optimal-string-alignment edit distance behind [stringSimilarity].
int editDistance(String a, String b) {
  final x = canonicalWord(a);
  final y = canonicalWord(b);
  final m = x.length;
  final n = y.length;
  List<int>? prev2;
  var prev = List<int>.generate(n + 1, (j) => j);
  var cur = List<int>.filled(n + 1, 0);
  for (var i = 1; i <= m; i++) {
    cur[0] = i;
    for (var j = 1; j <= n; j++) {
      final cost = x[i - 1] == y[j - 1] ? 0 : 1;
      var d = [
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + cost,
      ].reduce((a2, b2) => a2 < b2 ? a2 : b2);
      if (i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1]) {
        d = [
          d,
          (prev2?[j - 2] ?? i - 2) + 1,
        ].reduce((a2, b2) => a2 < b2 ? a2 : b2);
      }
      cur[j] = d;
    }
    prev2 = prev;
    prev = cur;
    cur = List<int>.filled(n + 1, 0);
  }
  return prev[n];
}

class CompareOptions {
  const CompareOptions({this.typoThreshold, this.shortWordThreshold});
  final double? typoThreshold;
  final double? shortWordThreshold;
}

const _order = {
  WordRelation.exact: 0,
  WordRelation.inflection: 1,
  WordRelation.synonym: 2,
  WordRelation.typo: 3,
  WordRelation.none: 4,
};

int _groupOf(String canonical, List<List<String>> extraSynonyms) {
  final builtin = _groupIndex[canonical];
  if (builtin != null) return builtin;
  for (var i = 0; i < extraSynonyms.length; i++) {
    for (final word in extraSynonyms[i]) {
      if (canonicalWord(word) == canonical) return 10000 + i;
    }
  }
  return -1;
}

/// How does the learner's word relate to the accepted text?
AnswerRelation compareAnswer(
  String userAnswer,
  String acceptedText, [
  List<List<String>> extraSynonyms = const [],
  CompareOptions opts = const CompareOptions(),
]) {
  final user = fullyNormalized(userAnswer);
  final accepted = fullyNormalized(acceptedText);
  if (user.isEmpty || accepted.isEmpty) {
    return AnswerRelation(
      relation: WordRelation.none,
      score: 0,
      matchedText: acceptedText,
    );
  }
  if (user == accepted) {
    return AnswerRelation(
      relation: WordRelation.exact,
      score: 1,
      matchedText: acceptedText,
    );
  }

  final u = canonicalWord(userAnswer);
  final a = canonicalWord(acceptedText);
  if (u == a) {
    return AnswerRelation(
      relation: WordRelation.inflection,
      score: 0.96,
      matchedText: acceptedText,
    );
  }
  if (u.replaceAll(' ', '') == a.replaceAll(' ', '')) {
    return AnswerRelation(
      relation: WordRelation.inflection,
      score: 0.96,
      matchedText: acceptedText,
    );
  }

  final wholeGroup = _groupOf(u, extraSynonyms);
  if (wholeGroup >= 0 && wholeGroup == _groupOf(a, extraSynonyms)) {
    return AnswerRelation(
      relation: WordRelation.synonym,
      score: 0.9,
      matchedText: acceptedText,
    );
  }

  final userTokens = user.split(' ');
  final acceptedTokens = accepted.split(' ');
  final typoThreshold = opts.typoThreshold ?? 0.84;
  final shortWordThreshold = opts.shortWordThreshold ?? 0.92;

  if (userTokens.length > 1 || acceptedTokens.length > 1) {
    if (userTokens.length == acceptedTokens.length) {
      var worst = AnswerRelation(
        relation: WordRelation.exact,
        score: 1,
        matchedText: acceptedText,
      );
      for (var i = 0; i < userTokens.length; i++) {
        final r = compareAnswer(
          userTokens[i],
          acceptedTokens[i],
          extraSynonyms,
          opts,
        );
        if (_order[r.relation]! < _order[worst.relation]!) {
          worst = AnswerRelation(
            relation: r.relation,
            score: r.score,
            matchedText: acceptedText,
          );
        }
      }
      return worst;
    }
    final shorter = userTokens.length < acceptedTokens.length
        ? userTokens
        : acceptedTokens;
    final longer = userTokens.length < acceptedTokens.length
        ? acceptedTokens
        : userTokens;
    var li = 0;
    var hits = 0;
    for (final token in shorter) {
      var matched = false;
      while (li < longer.length) {
        final r = compareAnswer(token, longer[li], extraSynonyms, opts);
        if (r.relation != WordRelation.none) {
          matched = true;
          hits += 1;
          li += 1;
          break;
        }
        li += 1;
      }
      if (!matched) break;
    }
    if (hits == shorter.length) {
      return AnswerRelation(
        relation: WordRelation.inflection,
        score: 0.85,
        matchedText: acceptedText,
      );
    }
    return AnswerRelation(
      relation: WordRelation.none,
      score: 0,
      matchedText: acceptedText,
    );
  }

  final dice = stringSimilarity(u, a);
  final minLen = u.length < a.length ? u.length : a.length;
  final singleEdit = minLen >= 6 && editDistance(u, a) <= 1;
  final floor = minLen < 5 ? shortWordThreshold : typoThreshold;
  if (singleEdit || dice >= floor) {
    return AnswerRelation(
      relation: WordRelation.typo,
      score: dice,
      matchedText: acceptedText,
    );
  }
  return AnswerRelation(
    relation: WordRelation.none,
    score: 0,
    matchedText: acceptedText,
  );
}

/// The single lookup callers want: best relation across every accepted answer.
AnswerRelation bestRelation(
  String userAnswer,
  List<String> acceptedTexts, [
  List<List<String>> extraSynonyms = const [],
  CompareOptions opts = const CompareOptions(),
]) {
  var best = AnswerRelation(
    relation: WordRelation.none,
    score: 0,
    matchedText: acceptedTexts.isEmpty ? '' : acceptedTexts.first,
  );
  for (final text in acceptedTexts) {
    final r = compareAnswer(userAnswer, text, extraSynonyms, opts);
    if (_order[r.relation]! < _order[best.relation]!) best = r;
  }
  return best;
}
