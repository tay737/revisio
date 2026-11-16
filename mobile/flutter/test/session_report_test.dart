import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:revisio/engine/kv.dart';
import 'package:revisio/engine/models.dart';
import 'package:revisio/engine/offline.dart';
import 'package:revisio/features/app/app_data.dart';
import 'package:revisio/features/auth/auth_provider.dart';
import 'package:revisio/features/review/review_screen.dart';
import 'package:revisio/services/api_client.dart';

/// The session report's rank moment — the web's `SessionReport` names the
/// rank when a session moves it: crest, "Promoted to <label>", the RP chip
/// and the distance to the next rung.
class _Api extends RevisioApi {
  _Api({
    required this.totalXp,
    required this.xpAwarded,
    this.newAchievements = const [],
  }) : super(storage: SessionStorage());

  final int totalXp;
  final int xpAwarded;
  final List<Map<String, dynamic>> newAchievements;

  @override
  Future<Map<String, dynamic>> submitReview({
    required String cardId,
    String? answer,
    String? selectedOptionId,
    int? durationMs,
    String mode = 'daily',
    String? sessionId,
  }) async => {
    'verdict': {'correct': true},
    'xpAwarded': xpAwarded,
    'totalXp': totalXp,
    'streak': 3,
    'newAchievements': newAchievements,
  };
}

const _card = QueueCard(
  id: 'c1',
  kind: 'mcq',
  question: 'Which gas do plants absorb?',
  options: [
    CardOption(id: 'a', text: 'Oxygen'),
    CardOption(id: 'b', text: 'Carbon dioxide'),
  ],
);

const _card2 = QueueCard(
  id: 'c2',
  kind: 'mcq',
  question: 'What is the powerhouse of the cell?',
  options: [
    CardOption(id: 'a', text: 'Nucleus'),
    CardOption(id: 'b', text: 'Mitochondria'),
  ],
);

/// Every submit lands in the outbox — the fully-offline session.
class _OfflineApi extends RevisioApi {
  _OfflineApi() : super(storage: SessionStorage());

  @override
  Future<Map<String, dynamic>> submitReview({
    required String cardId,
    String? answer,
    String? selectedOptionId,
    int? durationMs,
    String mode = 'daily',
    String? sessionId,
  }) async {
    throw StateError('offline');
  }
}

/// The first answer reaches the server; the second is owed to the outbox.
class _FlakyApi extends RevisioApi {
  _FlakyApi() : super(storage: SessionStorage());

  int _calls = 0;

  @override
  Future<Map<String, dynamic>> submitReview({
    required String cardId,
    String? answer,
    String? selectedOptionId,
    int? durationMs,
    String mode = 'daily',
    String? sessionId,
  }) async {
    _calls += 1;
    if (_calls == 1) {
      return {
        'verdict': {'correct': true},
        'xpAwarded': 30,
        'totalXp': 130,
        'streak': 3,
        'newAchievements': const <Map<String, dynamic>>[],
      };
    }
    throw StateError('offline');
  }
}

Future<GoRouter> _pumpSession(
  WidgetTester tester, {
  required int totalXp,
  required int xpAwarded,
  List<Map<String, dynamic>> newAchievements = const [],
  RevisioApi? api,
  List<QueueCard> cards = const [_card],
  bool memoryOfflineStore = false,
}) async {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const Scaffold(body: Text('home')),
      ),
      GoRoute(path: '/session', builder: (_, __) => const ReviewScreen()),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(
          api ??
              _Api(
                totalXp: totalXp,
                xpAwarded: xpAwarded,
                newAchievements: newAchievements,
              ),
        ),
        if (memoryOfflineStore)
          offlineStoreProvider.overrideWith(
            (ref) async => OfflineStore(MemoryKeyValueStore()),
          ),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  unawaited(
    router.push(
      '/session',
      extra: ReviewSession(cards: cards, mode: 'daily'),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

Future<void> _answerAndFinish(WidgetTester tester) async {
  await tester.tap(find.text('Carbon dioxide'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Check'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('promotion names the new rank with crest and next rung', (
    tester,
  ) async {
    // 100 XP → Bronze III; +30 lands on 130 → Bronze II (rung 1).
    await _pumpSession(tester, totalXp: 130, xpAwarded: 30);
    await _answerAndFinish(tester);

    expect(find.text('Promoted to Bronze II'), findsOneWidget);
    expect(
      find.text('1 of 1 correct, and the crest moved with it.'),
      findsOneWidget,
    );
    expect(find.text('130 RP'), findsOneWidget);
    expect(
      find.text('110 RP to the next rung · about 11 more reviews.'),
      findsOneWidget,
    );
    // The crest carries its rank as a semantic image label.
    expect(find.bySemanticsLabel('Rank Bronze II'), findsOneWidget);
  });

  testWidgets('tier change uses the harder-tier copy', (tester) async {
    // Bronze III → Silver III crosses a tier boundary (360 RP base).
    await _pumpSession(tester, totalXp: 400, xpAwarded: 60);
    await _answerAndFinish(tester);

    expect(find.text('Promoted to Silver III'), findsOneWidget);
    expect(
      find.text(
        '1 of 1 correct, and that carried you into a new tier. Everything above this is harder, and worth more.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('new achievements render in the verdict feedback', (
    tester,
  ) async {
    await _pumpSession(
      tester,
      totalXp: 60,
      xpAwarded: 10,
      newAchievements: const [
        {'id': 'first-review', 'name': 'First review', 'icon': '⚡'},
      ],
    );
    await tester.tap(find.text('Carbon dioxide'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check'));
    await tester.pumpAndSettle();

    expect(find.text('First review unlocked'), findsOneWidget);
  });

  testWidgets('no promotion still shows the rank and rung distance', (
    tester,
  ) async {
    // 50 XP → 60 XP stays inside Bronze III.
    await _pumpSession(tester, totalXp: 60, xpAwarded: 10);
    await _answerAndFinish(tester);

    expect(find.text('Session complete'), findsOneWidget);
    expect(find.text('60 RP'), findsOneWidget);
    expect(
      find.text('60 RP to the next rung · about 6 more reviews.'),
      findsOneWidget,
    );
  });

  testWidgets('offline-queued answers suppress the rank block', (tester) async {
    await _pumpSession(
      tester,
      totalXp: 0,
      xpAwarded: 0,
      api: _OfflineApi(),
      memoryOfflineStore: true,
    );
    await _answerAndFinish(tester);

    expect(find.text('Session complete'), findsOneWidget);
    expect(find.text('1 answered — saved offline, will sync.'), findsOneWidget);
    expect(find.text('0/1 correct'), findsOneWidget);
    expect(find.textContaining('RP'), findsNothing);
    expect(find.textContaining('Promoted'), findsNothing);
  });

  testWidgets('a queued answer after online XP still hides the rank block', (
    tester,
  ) async {
    await _pumpSession(
      tester,
      totalXp: 0,
      xpAwarded: 0,
      api: _FlakyApi(),
      cards: const [_card, _card2],
      memoryOfflineStore: true,
    );

    await tester.tap(find.text('Carbon dioxide'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Next card'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Mitochondria'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    expect(find.text('Session complete'), findsOneWidget);
    expect(find.text('2 answered — saved offline, will sync.'), findsOneWidget);
    expect(find.text('1/2 correct'), findsOneWidget);
    expect(find.text('+30 XP'), findsOneWidget);
    expect(find.textContaining('RP'), findsNothing);
    expect(find.textContaining('Promoted'), findsNothing);
  });
}
