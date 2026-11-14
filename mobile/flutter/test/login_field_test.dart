import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:revisio/features/auth/login_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('login password field is present and focusable', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();

    final fields = find.byType(TextFormField);
    expect(fields, findsNWidgets(2));

    // Tap the password field and type — proves hit-testing reaches it.
    await tester.tap(fields.at(1));
    await tester.pump();
    await tester.enterText(fields.at(1), 'hunter2');
    await tester.pump();

    final passwordField = tester.widget<TextFormField>(fields.at(1));
    expect(passwordField.controller?.text, 'hunter2');
    expect(tester.widget<TextField>(find.descendant(
      of: fields.at(1),
      matching: find.byType(TextField),
    )).obscureText, isTrue);
  });

  testWidgets('login fields expose semantics nodes', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();

    final fields = find.byType(TextFormField);
    expect(fields, findsNWidgets(2));
    for (var i = 0; i < 2; i++) {
      final node = tester.getSemantics(fields.at(i));
      expect(node.label.isNotEmpty || node.hint.isNotEmpty || node.value.isNotEmpty,
          isTrue,
          reason: 'field $i has no accessible label');
    }
    handle.dispose();
  });
}
