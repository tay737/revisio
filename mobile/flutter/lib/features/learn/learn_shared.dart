/// Shared helpers for the Learn subject/topic screens — port of
/// `src/app/(app)/learn/[subjectId]/shared.ts`.
library revisio.features.learn.learn_shared;

import '../../engine/models.dart';

/// The leading unit code of a topic — the text before the first
/// dash/dash-like separator ("1.1.1 – 1.1.2 Pattern Recognition" →
/// "1.1.1 – 1.1.2"). Topics without a code land in "Other".
String unitFromTopic(Topic t) {
  final m = RegExp(r'^([\d.]+(?:\s*[–—-]\s*[\d.]+)?)').firstMatch(t.name);
  if (m == null) return 'Other';
  final code = m.group(1)!.trim();
  return RegExp(r'\d').hasMatch(code) ? code : 'Other';
}

/// Numeric sort on the leading version-like code so 1.10 > 1.2 but
/// 1.2 < 1.10 stays readable.
int topicSortKey(Topic a, Topic b) {
  List<String> key(Topic t) =>
      unitFromTopic(t)
          .split(RegExp(r'[\s–—-]+'))
          .where((s) => s.isNotEmpty)
          .toList();
  final ka = key(a);
  final kb = key(b);
  final n = ka.length > kb.length ? ka.length : kb.length;
  for (var i = 0; i < n; i++) {
    final va = i < ka.length ? ka[i] : '';
    final vb = i < kb.length ? kb[i] : '';
    final na = double.tryParse(va);
    final nb = double.tryParse(vb);
    if (na != null && nb != null && na != nb) return na.compareTo(nb);
    final c = va.compareTo(vb);
    if (c != 0) return c;
  }
  return 0;
}
