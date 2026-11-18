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
    // The preferences card grew with the F1/F2/F4 rows, so the bottom of the
    // list is further away — scroll the lazily-built list until the footer's
    // delete row is actually on screen.
    await tester.scrollUntilVisible(
      find.text('Delete account'),
      300,
      // Panels carry their own nested scrollables; the page list is the
      // outermost Scrollable, which the tree lists first.
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Delete account'), findsOneWidget);
    expect(find.text('PREFERENCES'), findsOneWidget);
  });
}
