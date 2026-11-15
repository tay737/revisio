import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:revisio/features/app/app_shell.dart';
import 'package:revisio/features/auth/auth_provider.dart';
import 'package:revisio/engine/models.dart';
import 'package:revisio/services/api_client.dart';

/// Chrome regression: AppChrome's TopBar/BottomNav sit outside every screen
/// Scaffold, so without a Material ancestor their InkWells are dead — the
/// exact defect that shipped the replica chrome non-interactive.
class _Api extends RevisioApi {
  _Api() : super(storage: SessionStorage());

  @override
  Future<MeDetail> me() async =>
      const MeDetail(name: 'Test', email: 't@t.dev', role: 'student');
}

void main() {
  Future<GoRouter> pumpChrome(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/today',
      routes: [
        for (final path in ['/today', '/review', '/learn', '/rank'])
          GoRoute(
            path: path,
            builder: (_, __) => AppChrome(child: Text('screen $path')),
          ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(_Api())],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('BottomNav slot navigates', (tester) async {
    final router = await pumpChrome(tester);
    await tester.tap(find.text('Review').last);
    await tester.pumpAndSettle();
    expect(find.text('screen /review'), findsOneWidget);
    expect(router.routeInformationProvider.value.uri.path, '/review');
  });

  testWidgets('More slot opens the account sheet', (tester) async {
    await pumpChrome(tester);
    await tester.tap(find.text('More').last);
    await tester.pumpAndSettle();
    expect(find.text('Sign out'), findsOneWidget);
    expect(find.textContaining('Profile and account'), findsWidgets);
  });
}
