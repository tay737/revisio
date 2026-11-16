import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/features/settings/settings_panels.dart';
import "package:revisio/services/api_client.dart";
import "package:revisio/features/auth/auth_provider.dart";
import 'package:revisio/engine/models.dart';

class _Api extends RevisioApi {
  _Api() : super(storage: SessionStorage());
  @override
  Future<NotificationPrefsResponse> notificationPrefs() async {
    await Future.delayed(const Duration(milliseconds: 100));
    return const NotificationPrefsResponse(prefs: NotificationPrefs());
  }
}

void main() {
  testWidgets('reminders panel settles', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(_Api())],
        child: const MaterialApp(home: Scaffold(body: SingleChildScrollView(child: RemindersPanel()))),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Save reminders'), findsOneWidget);
  });
}
