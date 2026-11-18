/// Signed-in data providers — one FutureProvider per contract read.
/// They watch the session so a sign-out (or account switch) refetches cleanly.
library revisio.features.app.data;

import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../engine/kv.dart';
import '../../engine/models.dart';
import '../../engine/offline.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';
import '../rank/season_models.dart';

final meProvider = FutureProvider<MeDetail>((ref) async {
  ref.watch(authProvider); // refetch on session change
  return ref.read(apiClientProvider).me();
});

final queueProvider = FutureProvider<List<QueueCard>>((ref) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).queueToday();
});

final gamificationProvider = FutureProvider<GamificationPayload>((ref) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).gamification();
});

/// `GET /gamification?scope=` — the XP board's daily/weekly/monthly windows.
final gamificationScopedProvider =
    FutureProvider.family<GamificationPayload, String>((ref, scope) async {
      ref.watch(authProvider);
      return ref.read(apiClientProvider).gamification(scope: scope);
    });

/// `GET /seasons` — the seasonal rank payload behind the Rank tab.
final seasonsProvider = FutureProvider<SeasonPayload>((ref) async {
  ref.watch(authProvider);
  return SeasonPayload.fromJson(await ref.read(apiClientProvider).seasons());
});

/// `GET /insights` — own-progress payload for the Strength tab. Fetched only
/// while that tab is open, same as the web.
final insightsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).insights();
});

final subjectsProvider = FutureProvider<List<Subject>>((ref) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).subjects();
});

/// `GET /consent` — the consent record lives here, not in `/me`.
final consentProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).getConsent();
});

/// `GET /notifications/prefs` — reminder prefs + notification consent, the
/// contract the local-reminder scheduler consumes.
final notificationPrefsProvider =
    FutureProvider<NotificationPrefsResponse>((ref) async {
      ref.watch(authProvider);
      return ref.read(apiClientProvider).notificationPrefs();
    });

/// Topics under one subject (`/content?subjectId=`) — the Learn subject
/// screen's list, with per-topic spec refs.
final subjectTopicsProvider = FutureProvider.family<List<Topic>, String>((
  ref,
  subjectId,
) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).content(subjectId: subjectId);
});

/// One topic's meta (`/content?topicId=`) — null when not visible.
final topicMetaProvider = FutureProvider.family<Topic?, String>((
  ref,
  topicId,
) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).contentTopic(topicId: topicId);
});

/// A topic's lessons (`/lessons?topicId=`) — the reading screen's sections.
final topicLessonsProvider = FutureProvider.family<List<Lesson>, String>((
  ref,
  topicId,
) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).lessons(topicId: topicId);
});

/// Joined classes for the Settings → Class section.
final myClassesProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  ref.watch(authProvider);
  return ref.read(apiClientProvider).myClassesList();
});

/// The offline store — pack cache + owed-review outbox. Documents dir on
/// device, memory in tests.
final offlineStoreProvider = FutureProvider<OfflineStore>((ref) async {
  final dir = await getApplicationDocumentsDirectory();
  return OfflineStore(
    FileKeyValueStore(Directory('${dir.path}/revisio_offline')),
  );
});

/// Refresh the cached offline pack. Offline or signed-out → keep the old pack;
/// this provider never surfaces an error to the UI.
final offlinePackSyncProvider = FutureProvider<void>((ref) async {
  ref.watch(authProvider);
  try {
    final store = await ref.watch(offlineStoreProvider.future);
    final pack = await ref.watch(apiClientProvider).offlinePack();
    store.savePack(pack);
  } catch (_) {}
});

/// Drain the owed-review outbox, oldest first. Runs on Today mount and after
/// every review session; failures just leave the remainder queued.
final offlineSyncProvider = FutureProvider<SyncOutcome>((ref) async {
  ref.watch(authProvider);
  final store = await ref.watch(offlineStoreProvider.future);
  final api = ref.watch(apiClientProvider);
  return SyncEngine(store, _ReviewApiSink(api)).syncOutbox();
});

/// Adapts `POST /reviews` to the outbox's `ReviewApi` seam. A 4xx means the
/// review can never be accepted (unknown/deleted card) — drop it rather than
/// let one poison entry block every review behind it. The exception is
/// 401/403: the session is dead, not the review — keep the entry so a
/// re-authenticated user still syncs it.
class _ReviewApiSink implements ReviewApi {
  _ReviewApiSink(this._api);

  final RevisioApi _api;

  @override
  Future<bool> submitReview(PendingReview review) async {
    try {
      await _api.submitReview(
        cardId: review.cardId,
        answer: review.answer,
        selectedOptionId: review.selectedOptionId,
        durationMs: review.durationMs,
        mode: review.mode,
        sessionId: review.sessionId,
        confidence: review.confidence,
      );
      return true;
    } on ApiError catch (e) {
      if (e.status == 401 || e.status == 403)
        return false; // session dead — keep
      if (e.status >= 400 && e.status < 500) return true; // un-acceptable: drop
      rethrow;
    }
  }
}
