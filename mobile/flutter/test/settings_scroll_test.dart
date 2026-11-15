import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/features/auth/auth_provider.dart';
import 'package:revisio/features/settings/settings_screen.dart';
import 'package:revisio/engine/models.dart';
import 'package:revisio/services/api_client.dart';

/// Real provider timing: responses land *while* the list is being scrolled,
/// like on device. A fake that resolves instantly cannot reproduce a
/// rebuild-mid-gesture defect.
class _SlowApi extends RevisioApi {
  _SlowApi() : super(storage: SessionStorage());

  @override
  Future<MeDetail> me() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return const MeDetail(name: 'Test', email: 't@t.dev', role: 'teacher');
  }

  @override
  Future<Map<String, dynamic>> getConsent() async {
    await Future.delayed(const Duration(milliseconds: 600));
    return {'consent': <String, dynamic>{}};
  }

  @override
  Future<List<Map<String, dynamic>>> myClassesList() async {
    await Future.delayed(const Duration(milliseconds: 900));
    return <Map<String, dynamic>>[];
  }
}

void main() {
  testWidgets('settings list scrolls while providers resolve', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(_SlowApi())],
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );
    // me() lands at ~300ms; consent (~600ms) and classes (~900ms) are still
    // in flight — scroll while those resolve, like on device.
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    final list = find.byType(ListView);
    for (var i = 0; i < 20; i++) {
      await tester.drag(list, const Offset(0, -300));
      await tester.pump(const Duration(milliseconds: 120));
    }
    await tester.pumpAndSettle();
    expect(find.text('Delete account'), findsOneWidget);
    expect(find.text('PREFERENCES'), findsOneWidget);
  });
}
