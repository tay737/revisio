import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/app_router.dart';

void main() {
  group('deepLinkPath', () {
    test('maps every web path word', () {
      const cases = {
        'today': '/today',
        'review': '/review',
        'learn': '/learn',
        'rank': '/rank',
        'cram': '/cram',
        'exam': '/exam',
        'practice': '/practice',
        'library': '/library',
        'settings': '/settings',
        'you': '/settings',
        'teacher': '/teacher',
        'teaching': '/teacher',
        'admin': '/admin',
      };
      for (final entry in cases.entries) {
        expect(
          deepLinkPath(Uri.parse('revisio://${entry.key}')),
          entry.value,
          reason: entry.key,
        );
      }
    });

    test('rejects other schemes and unknown hosts', () {
      expect(deepLinkPath(Uri.parse('https://revisio.app/today')), isNull);
      expect(deepLinkPath(Uri.parse('revisio://nonsense')), isNull);
      expect(deepLinkPath(Uri.parse('revisio://')), isNull);
    });

    test('accepts a path-style link', () {
      expect(deepLinkPath(Uri.parse('revisio:///teacher')), '/teacher');
    });
  });
}
