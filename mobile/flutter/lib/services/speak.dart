/// Read-aloud (F3) — system TTS via `flutter_tts`, the Dart port of web's
/// `src/lib/speak.ts`. Same three rules:
///
///   • capability is checked honestly — if the engine cannot initialise there
///     is no button, not a dead control;
///   • only the *question side* is ever composed here — answers and verdict
///     correctness never reach the speaker before the learner has answered;
///   • one utterance at a time — a new speak() stops whatever is running.
library revisio.services.speak;

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// Strip markdown to speakable plain text — mirrors `stripForSpeech`.
String stripForSpeech(String md) {
  var text = md;
  text = text.replaceAllMapped(
    RegExp(r'!\[([^\]]*)\]\([^)]*\)'),
    (m) => m.group(1) ?? '',
  );
  text = text.replaceAllMapped(
    RegExp(r'\[([^\]]+)\]\([^)]*\)'),
    (m) => m.group(1) ?? '',
  );
  text = text.replaceAll(RegExp(r'`{1,3}[^`]*`{1,3}'), ' ');
  text = text.replaceAll(RegExp(r'^#{1,6}\s+', multiLine: true), '');
  text = text.replaceAll(RegExp(r'^\s*[-*+]\s+', multiLine: true), '');
  text = text.replaceAll(RegExp(r'^\s*\d+[.)]\s+', multiLine: true), '');
  text = text.replaceAll(RegExp(r'^>\s?', multiLine: true), '');
  text = text.replaceAll(RegExp(r'\*\*|__|\*|_'), '');
  text = text.replaceAllMapped(
    RegExp(r'\$\$?([^$]+)\$\$?'),
    (m) => m.group(1) ?? '',
  );
  text = text.replaceAll('|', ' ');
  return text.replaceAll(RegExp(r'\s+'), ' ').trim();
}

/// The question side of a queue card, composed per kind. Never answers.
String cardSpeechText({
  required String kind,
  String? textWithBlank,
  String? prompt,
  String? question,
  List<({String id, String text})>? options,
}) {
  if (kind == 'cloze') {
    // Underscores read as the word "blank" — a cloze heard aloud is a
    // fill-in, and speaking the underscores would be noise.
    return stripForSpeech(
      (textWithBlank ?? '').replaceAll(RegExp(r'_{2,}'), ' blank '),
    );
  }
  if (kind == 'flashcard') return stripForSpeech(prompt ?? '');
  final parts = <String>[stripForSpeech(question ?? '')];
  for (final o in options ?? const <({String id, String text})>[]) {
    final t = stripForSpeech(o.text);
    if (t.isNotEmpty) parts.add(t);
  }
  return parts.where((p) => p.isNotEmpty).join('. ');
}

/// Free markdown (model answer, explanation) → speakable text.
String markdownSpeechText(String md) => stripForSpeech(md);

/// One shared engine — TTS is a device singleton anyway.
class Speaker {
  Speaker._();
  static final Speaker instance = Speaker._();

  final FlutterTts _tts = FlutterTts();
  bool _ready = false;
  bool _started = false;
  bool _speaking = false;

  /// True once the engine answered a language probe. Mobile-only feature:
  /// on platforms flutter_tts cannot drive, init throws and we stay false.
  bool get ready => _ready;
  bool get speaking => _speaking;

  Future<void> _ensure() async {
    if (_started) return;
    _started = true;
    try {
      await _tts.setLanguage('en-US');
      await _tts.setSpeechRate(0.5);
      // Await completion so `speak` resolves when the utterance ends — the
      // caller's speaking state then tracks real audio, not a fired request.
      await _tts.awaitSpeakCompletion(true);
      _ready = true;
    } catch (_) {
      _ready = false;
    }
  }

  /// Capability probe that does NOT vocalise — asks the engine for its
  /// language list. False on platforms flutter_tts cannot drive.
  Future<bool> supported() async {
    if (kIsWeb) return false;
    await _ensure();
    if (!_ready) return false;
    try {
      final langs = await _tts.getLanguages;
      return langs is List && langs.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Speak [text], cutting off anything in flight. Returns false when the
  /// capability gate fails — callers treat that as "no button".
  Future<bool> speak(String text) async {
    if (kIsWeb) return false;
    await _ensure();
    if (!_ready || text.trim().isEmpty) return false;
    try {
      await _tts.stop();
      _speaking = true;
      await _tts.speak(text);
      return true;
    } catch (_) {
      return false;
    } finally {
      _speaking = false;
    }
  }

  Future<void> stop() async {
    _speaking = false;
    try {
      await _tts.stop();
    } catch (_) {}
  }
}
