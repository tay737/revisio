/// The single owner of everything offline — the Dart port of
/// `OfflineStore.kt` / `SyncEngine.kt` / `SessionStore.kt`.
///
/// Two facts live here and nowhere else: the session we cached (the pack),
/// and the reviews we owe the server (the outbox). Same keys and same JSON
/// shapes as `src/lib/offline.ts`, so the phone and the web cannot disagree
/// about what "owed" means.
library revisio.engine.offline;

import 'dart:convert';
import 'dart:math';

import 'kv.dart';
import 'models.dart';

class OfflineStore {
  OfflineStore(this.kv);

  final KeyValueStore kv;

  static const _packKey = 'revisio.offline.pack.v1';
  static const _outboxKey = 'revisio.offline.outbox.v1';

  // ── the cached session ──────────────────────────────────────────────────

  void savePack(OfflinePack pack) {
    try {
      kv.write(_packKey, jsonEncode(pack.toJson()));
    } catch (_) {}
  }

  OfflinePack? cachedPack() {
    final raw = kv.read(_packKey);
    if (raw == null) return null;
    try {
      final pack = OfflinePack.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      return pack.cards.isNotEmpty ? pack : null;
    } catch (_) {
      return null;
    }
  }

  void clearPack() => kv.remove(_packKey);

  /// Take a card out of the cached pack once the server has accepted a review
  /// of it, so coming back offline cannot deal a card already answered.
  void dropCardFromPack(String cardId) {
    final pack = cachedPack();
    if (pack == null) return;
    final remaining = pack.cards.where((c) => c.id != cardId).toList();
    if (remaining.length == pack.cards.length) return;
    savePack(OfflinePack(cards: remaining, builtAt: pack.builtAt));
  }

  // ── the outbox ──────────────────────────────────────────────────────────

  List<PendingReview> pendingReviews() {
    final raw = kv.read(_outboxKey);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List)
          .map((r) => PendingReview.fromJson(r as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  int pendingCount() => pendingReviews().length;

  /// Record a review the server has not accepted.
  PendingReview enqueueReview({
    required String cardId,
    String? answer,
    String? selectedOptionId,
    int durationMs = 0,
    String mode = 'daily',
    String? sessionId,
  }) {
    final now = DateTime.now().toUtc();
    final iso = now.toIso8601String();
    final entry = PendingReview(
      id: '$cardId:${now.millisecondsSinceEpoch}:${Random().nextInt(0xFFFFFF).toRadixString(16).padLeft(6, '0')}',
      cardId: cardId,
      answer: answer,
      selectedOptionId: selectedOptionId,
      durationMs: durationMs,
      mode: mode,
      sessionId: sessionId,
      queuedAt: iso,
    );
    final next = [...pendingReviews(), entry];
    try {
      kv.write(_outboxKey, jsonEncode(next.map((r) => r.toJson()).toList()));
    } catch (_) {}
    return entry;
  }

  void dropReview(String id) {
    final next = pendingReviews().where((r) => r.id != id).toList();
    try {
      kv.write(_outboxKey, jsonEncode(next.map((r) => r.toJson()).toList()));
    } catch (_) {}
  }
}

/// How a sync went: what the server took, and what is still owed.
class SyncOutcome {
  final int sent;
  final int remaining;

  const SyncOutcome({required this.sent, required this.remaining});
}

/// What sync needs from the network — an interface so the outbox's hardest
/// behaviour (stop at the first failure, keep the rest) is provable in a test.
abstract class ReviewApi {
  /// Returns true when the server accepted the review.
  Future<bool> submitReview(PendingReview review);
}

/// Hand the outbox back to the server, oldest first. Stops at the first
/// failure rather than skipping ahead: order matters, and a replay cannot
/// award XP twice because `submitReview` is idempotent per card per session.
class SyncEngine {
  SyncEngine(this.store, this.api);

  final OfflineStore store;
  final ReviewApi api;

  Future<SyncOutcome> syncOutbox() async {
    var sent = 0;
    for (final review in store.pendingReviews()) {
      bool accepted;
      try {
        accepted = await api.submitReview(review);
      } catch (_) {
        accepted = false;
      }
      if (!accepted) break;
      store.dropReview(review.id);
      sent += 1;
    }
    return SyncOutcome(sent: sent, remaining: store.pendingCount());
  }
}

/// What survives a restart: the refresh token and who it belongs to. The
/// access token is short-lived and lives in memory only.
class StoredSession {
  final String refreshToken;
  final Map<String, dynamic> user;

  const StoredSession({required this.refreshToken, required this.user});

  factory StoredSession.fromJson(Map<String, dynamic> json) => StoredSession(
        refreshToken: json['refreshToken'] as String? ?? '',
        user: (json['user'] as Map?)?.cast<String, dynamic>() ?? {},
      );

  Map<String, dynamic> toJson() => {'refreshToken': refreshToken, 'user': user};
}

/// The session that outlives the process — lets the app open *offline* to a
/// greeting with the learner's name rather than a sign-in form.
class SessionStore {
  SessionStore(this.kv);

  final KeyValueStore kv;
  static const _key = 'revisio.session.v1';

  void save({required String refreshToken, required Map<String, dynamic> user}) {
    if (refreshToken.isEmpty) return;
    try {
      kv.write(
        _key,
        jsonEncode(StoredSession(refreshToken: refreshToken, user: user).toJson()),
      );
    } catch (_) {}
  }

  StoredSession? load() {
    final raw = kv.read(_key);
    if (raw == null) return null;
    try {
      return StoredSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  void clear() => kv.remove(_key);
}
