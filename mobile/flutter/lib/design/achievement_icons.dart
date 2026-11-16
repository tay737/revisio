/// Achievement id/emoji → Flutter icon-registry key.
///
/// The server stores either a Lucide-style icon name or, on older rows, an
/// emoji in `icon`. The Flutter registry is a curated set (not the web's full
/// Lucide map), so this resolves to the closest registered glyph and falls
/// back to the achievements badge.
library revisio.design.achievement_icons;

/// Resolve an achievement's icon to a `kRevisioIconPaths` key.
String achievementIconName(String? id, String? legacyEmoji) {
  const byId = <String, String>{
    'first-review': 'review',
    'reviews-10': 'checked',
    'reviews-50': 'streak',
    'reviews-200': 'notes',
    'perfect-session': 'target',
    'xp-500': 'xp',
    'xp-1000': 'level',
    'xp-5000': 'climb',
    'level-5': 'level',
    'level-10': 'crown',
    'streak-3': 'streak',
    'streak-7': 'rocket',
    'streak-30': 'crown',
    'subject-master': 'topic',
    'topic-mastered': 'target',
    'weekly-board': 'league',
    'exam-ready': 'exam',
    'exam-distinction': 'crown',
    'class-helper': 'class',
    'content-contributor': 'edit',
    'marathon': 'climb',
    'early-bird': 'sun',
    'night-owl': 'moon',
    'comeback': 'rotate',
    'week-strong': 'week',
    'month-strong': 'schedule',
    'rank-bronze': 'rank',
    'rank-silver': 'rank',
    'rank-gold': 'rank',
    'rank-platinum': 'rank',
    'rank-emerald': 'rank',
    'rank-sapphire': 'rank',
    'rank-diamond': 'rank',
    'rank-ruby': 'rank',
    'rank-obsidian': 'rank',
    'rank-legend': 'crown',
  };

  const byEmoji = <String, String>{
    '⚡': 'rocket',
    '🔥': 'streak',
    '📚': 'notes',
    '🎯': 'target',
    '🏅': 'achievements',
    '⭐': 'level',
    '👑': 'crown',
    '🚀': 'rocket',
    '💡': 'practice',
    '✅': 'checked',
    '📅': 'week',
    '✍️': 'edit',
    '📝': 'edit',
    '🏆': 'league',
    '🎓': 'exam',
    '👥': 'class',
    '🧠': 'learn',
    '🌙': 'moon',
    '☀️': 'sun',
    '🔄': 'rotate',
    '📈': 'climb',
    '⏱️': 'clock',
    '🚩': 'target',
    '🛡️': 'secure',
    '💎': 'rank',
    '🔷': 'rank',
  };

  if (id != null) {
    final icon = byId[id];
    if (icon != null) return icon;
  }
  if (legacyEmoji != null) {
    final icon = byEmoji[legacyEmoji];
    if (icon != null) return icon;
  }
  return 'achievements';
}
