import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/engine/staff_models.dart';
import 'package:revisio/features/auth/auth_provider.dart';
import 'package:revisio/features/staff/staff_controller.dart';
import 'package:revisio/features/staff/staff_bits.dart';
import 'package:revisio/services/api_client.dart';

class _MemStorage extends SessionStorage {
  _MemStorage() : super(storage: const FlutterSecureStorage());

  AuthSession? session;

  @override
  Future<AuthSession?> read() async => session;

  @override
  Future<void> write(AuthSession value) async => session = value;

  @override
  Future<void> clear() async => session = null;
}

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Map<String, dynamic> body) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

Map<String, dynamic> _body(RequestOptions options) {
  final data = options.data;
  if (data is String) return jsonDecode(data) as Map<String, dynamic>;
  return (data as Map).cast<String, dynamic>();
}

RevisioApi _api(_FakeAdapter adapter, _MemStorage storage) {
  final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
  dio.httpClientAdapter = adapter;
  return RevisioApi(storage: storage, client: dio);
}

void main() {
  group('staff model decode', () {
    test('TeacherPayload reads classes, roster and subjects', () {
      final payload = TeacherPayload.fromJson({
        'classes': [
          {
            'id': 'c1',
            'name': '10B Biology',
            'joinCode': 'ABC123',
            'subjectId': 's1',
            'roster': [
              {
                'classId': 'c1',
                'userId': 'u1',
                'name': 'Ada',
                'email': 'ada@school.org',
                'reviews7d': 12,
                'xp7d': 340,
                'streak': 5,
                'masteryPct': 64,
              },
            ],
          },
        ],
        'subjects': [
          {'id': 's1', 'name': 'Biology'},
        ],
      });

      expect(payload.classes.single.name, '10B Biology');
      expect(payload.classes.single.joinCode, 'ABC123');
      expect(payload.classes.single.roster.single.name, 'Ada');
      expect(payload.classes.single.roster.single.masteryPct, 64);
      expect(payload.subjects.single.name, 'Biology');
    });

    test('TeacherPayload tolerates a sparse payload', () {
      final payload = TeacherPayload.fromJson(const {});
      expect(payload.classes, isEmpty);
      expect(payload.subjects, isEmpty);
    });

    test('AdminPayload reads the console sections', () {
      final payload = AdminPayload.fromJson({
        'approvals': [
          {
            'id': 'a1',
            'userId': 'u9',
            'email': 'sam@school.org',
            'name': 'Sam',
            'roleRequested': 'teacher',
            'note': 'Please',
            'status': 'pending',
          },
        ],
        'flags': [
          {'key': 'srs_algorithms', 'description': '{}', 'enabled': true},
        ],
        'users': [
          {
            'id': 'u1',
            'email': 'a@b.co',
            'name': 'Ada',
            'role': 'student',
            'status': 'active',
          },
        ],
        'pendingTopics': [
          {'id': 't1', 'name': 'Cells', 'subjectId': 's1'},
        ],
        'audit': [
          {
            'id': 'l1',
            'action': 'set_flag',
            'target': 'x',
            'createdAt': '2026-11-01T00:00:00Z',
          },
        ],
        'contentStats': {'topics': 10, 'publicTopics': 8, 'emptyTopics': 2},
        'subjects': [
          {'id': 's1', 'name': 'Biology'},
        ],
        'classes': [
          {
            'id': 'c1',
            'name': '10B',
            'joinCode': 'ZZZ999',
            'teacherId': 'u2',
            'teacherName': 'Ms R',
            'members': [
              {
                'classId': 'c1',
                'userId': 'u1',
                'name': 'Ada',
                'email': 'a@b.co',
              },
            ],
          },
        ],
      });

      expect(payload.approvals.single.roleRequested, 'teacher');
      expect(payload.flags.single.enabled, isTrue);
      expect(payload.users.single.role, 'student');
      expect(payload.pendingTopics.single.name, 'Cells');
      expect(payload.contentStats.emptyTopics, 2);
      expect(payload.classes.single.members.single.userId, 'u1');
    });

    test('StudentProgress reads every section with defaults', () {
      final progress = StudentProgress.fromJson({
        'student': {'id': 'u1', 'name': 'Ada', 'email': 'ada@school.org'},
        'overview': {'totalReviews': 40, 'dueCount': 3, 'streak': 5},
        'srsLevels': [
          {'level': 3, 'count': 7},
        ],
        'distribution': [
          {
            'cardId': 'k1',
            'prompt': 'What is mitosis?',
            'srsLevel': 4,
            'srsLabel': 'Adept I',
            'dueAt': '2026-11-20T00:00:00Z',
          },
        ],
        'struggling': [
          {
            'topicId': 't1',
            'topicName': 'Cells',
            'subjectName': 'Biology',
            'misses': 4,
          },
        ],
        'topicHealth': [
          {
            'topicId': 't1',
            'topicName': 'Cells',
            'masteryPct': 55,
            'missCount': 4,
          },
        ],
        'recent': [
          {
            'id': 'r1',
            'prompt': 'Q?',
            'correct': false,
            'userAnswer': 'x',
            'topicName': 'Cells',
            'mode': 'daily',
          },
        ],
        'upcoming': [
          {'cardId': 'k2', 'prompt': 'Next?', 'dueAt': '2026-11-16T00:00:00Z'},
        ],
        'subjects': [
          {'id': 's1', 'name': 'Biology'},
        ],
      });

      expect(progress.student.name, 'Ada');
      expect(progress.overview.dueCount, 3);
      expect(progress.srsLevels.single.count, 7);
      expect(progress.distribution.single.srsLabel, 'Adept I');
      expect(progress.struggling.single.misses, 4);
      expect(progress.recent.single.correct, isFalse);
      expect(progress.upcoming.single.prompt, 'Next?');
    });
  });

  group('staff routes', () {
    test('teacher() GETs /api/v1/teacher with the session token', () async {
      final storage = _MemStorage()
        ..session = AuthSession(
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          user: const {},
        );
      final adapter = _FakeAdapter(
        (options) async =>
            _json(200, {'classes': <dynamic>[], 'subjects': <dynamic>[]}),
      );
      final api = _api(adapter, storage);

      final payload = await api.teacher();

      expect(payload.classes, isEmpty);
      final req = adapter.requests.single;
      expect(req.path, '/api/v1/teacher');
      expect(req.headers['Authorization'], 'Bearer access-1');
    });

    test('myTopics() sends mine=1 to /api/v1/content', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter(
        (options) async => _json(200, {
          'topics': [
            {
              'id': 't1',
              'name': 'Cells',
              'visibility': 'private',
              'cardCount': 9,
              'lessonCount': 2,
            },
          ],
        }),
      );
      final api = _api(adapter, storage);

      final payload = await api.myTopics();

      expect(payload.topics.single.name, 'Cells');
      final req = adapter.requests.single;
      expect(req.path, '/api/v1/content');
      expect(req.queryParameters['mine'], 1);
    });

    test('studentProgress() passes userId as a query parameter', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter(
        (options) async => _json(200, {
          'student': {'id': 'u1', 'name': 'Ada'},
        }),
      );
      final api = _api(adapter, storage);

      final progress = await api.studentProgress(userId: 'u 1');

      expect(progress.student.id, 'u1');
      final req = adapter.requests.single;
      expect(req.path, '/api/v1/teacher/student');
      expect(req.queryParameters['userId'], 'u 1');
    });

    test('admin() GETs /api/v1/admin', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter(
        (options) async => _json(200, {
          'users': <dynamic>[],
          'contentStats': <String, dynamic>{},
        }),
      );
      final api = _api(adapter, storage);

      final payload = await api.admin();

      expect(payload.users, isEmpty);
      expect(adapter.requests.single.path, '/api/v1/admin');
    });

    test(
      'teacherAction posts the action envelope to /api/v1/teacher',
      () async {
        final storage = _MemStorage();
        final adapter = _FakeAdapter(
          (options) async => _json(200, {'ok': true}),
        );
        final api = _api(adapter, storage);

        await api.teacherAction({'action': 'rotate_code', 'classId': 'c1'});

        final req = adapter.requests.single;
        expect(req.method, 'POST');
        expect(req.path, '/api/v1/teacher');
        expect(_body(req), {'action': 'rotate_code', 'classId': 'c1'});
      },
    );

    test('adminAction posts the action envelope to /api/v1/admin', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter((options) async => _json(200, {'ok': true}));
      final api = _api(adapter, storage);

      await api.adminAction({
        'action': 'set_flag',
        'flagKey': 'x',
        'enabled': false,
      });

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/api/v1/admin');
      expect(_body(req)['action'], 'set_flag');
    });
  });

  group('role gates', () {
    test(
      'teachers and developers reach Teaching; only developers reach Admin',
      () {
        expect(staffCanTeach('teacher'), isTrue);
        expect(staffCanTeach('developer'), isTrue);
        expect(staffCanTeach('student'), isFalse);
        expect(staffCanTeach(null), isFalse);
        expect(staffCanAdmin('developer'), isTrue);
        expect(staffCanAdmin('teacher'), isFalse);
        expect(staffCanAdmin('student'), isFalse);
      },
    );
  });

  group('staffAction', () {
    test('the success note survives the post-write reload', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter((options) async {
        if (options.method == 'POST') return _json(200, {'ok': true});
        if (options.path == '/api/v1/content') {
          return _json(200, {'topics': <dynamic>[]});
        }
        return _json(200, {'classes': <dynamic>[], 'subjects': <dynamic>[]});
      });
      final api = _api(adapter, storage);
      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          authProvider.overrideWith((ref) => AuthNotifier(api)),
        ],
      );
      addTearDown(container.dispose);

      await container
          .read(staffControllerProvider.notifier)
          .staffAction(
            admin: false,
            body: {'action': 'rotate_code', 'classId': 'c1'},
            okMsg: 'Join code rotated.',
          );

      final state = container.read(staffControllerProvider);
      expect(state.staffNote, 'Join code rotated.');
      expect(state.staffBusy, isFalse);
      expect(state.staffError, isNull);
    });
  });

  group('staffWhenLabel', () {
    test('renders relative time like the web', () {
      final past = DateTime.now()
          .subtract(const Duration(minutes: 5))
          .toIso8601String();
      expect(staffWhenLabel(past), '5m ago');
      expect(staffWhenLabel(null), '–');
      expect(staffWhenLabel(''), '–');
      expect(staffWhenLabel('not a date'), '–');
    });
  });
}
