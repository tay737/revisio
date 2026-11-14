import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
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
  group('ApiError.fromResponse', () {
    test('preserves code, message and field', () {
      final response = Response<dynamic>(
        requestOptions: RequestOptions(path: '/x'),
        statusCode: 422,
        data: {
          'error': {
            'code': 'validation_failed',
            'message': 'That email is already taken.',
            'field': 'email',
          },
        },
      );

      final error = ApiError.fromResponse(response);

      expect(error.status, 422);
      expect(error.code, 'validation_failed');
      expect(error.message, 'That email is already taken.');
      expect(error.field, 'email');
    });
  });

  group('refreshOutcome', () {
    test('returns RefreshRenewed with rotated tokens on success', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter((_) async => _json(200, {
            'accessToken': 'access-2',
            'refreshToken': 'refresh-2',
          }));
      final api = _api(adapter, storage);

      final outcome = await api.refreshOutcome(refreshToken: 'refresh-1');

      expect(outcome, isA<RefreshRenewed>());
      final renewed = outcome as RefreshRenewed;
      expect(renewed.accessToken, 'access-2');
      expect(renewed.refreshToken, 'refresh-2');
      final sent = _body(adapter.requests.single);
      expect(sent['client'], 'native');
      expect(sent['refreshToken'], 'refresh-1');
    });

    test('returns RefreshRejected on an explicit 401', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter((_) async => _json(401, {
            'error': {'code': 'unauthorized', 'message': 'Session expired.'},
          }));
      final api = _api(adapter, storage);

      final outcome = await api.refreshOutcome(refreshToken: 'refresh-1');

      expect(outcome, isA<RefreshRejected>());
    });

    test('returns RefreshUnavailable on a 5xx', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter((_) async => _json(503, {
            'error': {'code': 'unavailable', 'message': 'Try again later.'},
          }));
      final api = _api(adapter, storage);

      final outcome = await api.refreshOutcome(refreshToken: 'refresh-1');

      expect(outcome, isA<RefreshUnavailable>());
    });

    test('returns RefreshUnavailable on a transport failure', () async {
      final storage = _MemStorage();
      final adapter = _FakeAdapter((options) async => throw DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
            error: 'offline',
          ));
      final api = _api(adapter, storage);

      final outcome = await api.refreshOutcome(refreshToken: 'refresh-1');

      expect(outcome, isA<RefreshUnavailable>());
    });
  });

  group('register', () {
    test('sends ageConsent and never sends an education level', () async {
      final storage = _MemStorage();
      Map<String, dynamic>? sent;
      final adapter = _FakeAdapter((options) async {
        sent = _body(options);
        return _json(201, {'ok': true});
      });
      final api = _api(adapter, storage);

      await api.register(
        email: 'a@b.co',
        password: 'password123',
        name: 'A Learner',
        dateOfBirth: '2015-01-01',
        ageConsent: true,
      );

      expect(sent?['ageConsent'], isTrue);
      expect(sent?['dateOfBirth'], '2015-01-01');
      expect(sent?.containsKey('level'), isFalse);
      expect(sent?.containsKey('educationLevel'), isFalse);
    });
  });
}
