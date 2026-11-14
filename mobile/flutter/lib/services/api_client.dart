/// HTTP client for the Revisio API, following `docs/MOBILE-AUTH-API.md`.
///
/// - Login/refresh send `"client": "native"` to receive a body refresh token.
/// - Refresh token rotates: persist the new one immediately.
/// - On 401, attempt one refresh dance, then retry; only log out on refresh failure.
/// - Field errors arrive with a `field` key — render under that field only.
library revisio.services.api_client;

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../engine/models.dart';

const String kBaseUrl = String.fromEnvironment(
  'REVISIO_API_BASE_URL',
  defaultValue: 'https://revisio-srs.vercel.app',
);

/// Error shape returned by every API route:
/// `{"error":{"code","message","details","field"}}`
class ApiError implements Exception {
  final int status;
  final String code;
  final String message;
  final String? field;

  ApiError({
    required this.status,
    required this.code,
    required this.message,
    this.field,
  });

  factory ApiError.fromResponse(Response<dynamic> response) {
    final body = response.data;
    final error = body is Map ? body['error'] : null;
    final code = error is Map ? error['code'] ?? 'error' : 'error';
    final message = error is Map ? error['message'] ?? 'Request failed.' : 'Request failed.';
    final field = error is Map ? error['field'] as String? : null;
    return ApiError(
      status: response.statusCode ?? 0,
      code: code.toString(),
      message: message.toString(),
      field: field,
    );
  }

  @override
  String toString() => 'ApiError($status $code: $message${field != null ? ' [field=$field]' : ''})';
}

/// Result of a refresh attempt.
sealed class RefreshOutcome {}
class RefreshRenewed extends RefreshOutcome {
  final String accessToken;
  final String refreshToken;
  RefreshRenewed({required this.accessToken, required this.refreshToken});
}
class RefreshRejected extends RefreshOutcome {} // server said no — session over
class RefreshUnavailable extends RefreshOutcome {} // offline / 5xx — keep session

/// Auth session persisted between launches.
class AuthSession {
  final String accessToken;
  final String refreshToken;
  final Map<String, dynamic> user;

  AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'user': user,
      };

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        user: (json['user'] as Map?)?.cast<String, dynamic>() ?? {},
      );
}

/// Storage seam for the refresh token (flutter_secure_storage — never shared prefs).
class SessionStorage {
  static const _kKey = 'revisio_session';
  final FlutterSecureStorage _storage;

  SessionStorage({FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();

  Future<AuthSession?> read() async {
    final raw = await _storage.read(key: _kKey);
    if (raw == null) return null;
    try {
      return AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(AuthSession session) async {
    await _storage.write(key: _kKey, value: jsonEncode(session.toJson()));
  }

  Future<void> clear() async {
    await _storage.delete(key: _kKey);
  }
}

/// The one door to the backend for the Flutter app.
class RevisioApi {
  RevisioApi({
    required this.storage,
    Dio? client,
  }) : _dio = client ?? Dio(BaseOptions(
          baseUrl: kBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
          headers: {'Content-Type': 'application/json'},
        )) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final session = await storage.read();
          if (session != null && options.path.startsWith('/api/v1/')) {
            options.headers['Authorization'] = 'Bearer ${session.accessToken}';
          }
          return handler.next(options);
        },
      ),
    );
  }

  final SessionStorage storage;
  final Dio _dio;

  Future<Response<T>> _request<T>(Future<Response<T>> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      final response = e.response;
      if (response != null) {
        throw ApiError.fromResponse(response);
      }
      rethrow;
    }
  }

  // ── auth ────────────────────────────────────────────────────────────────

  /// Sign in. Returns `mfaRequired: true` when the account has TOTP.
  /// With `client: 'native'` the body carries a refresh token.
  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    String? totp,
    String? recoveryCode,
  }) async {
    final response = await _request(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/login',
        data: {
          'email': email,
          'password': password,
          if (totp != null) 'totp': totp,
          if (recoveryCode != null) 'recoveryCode': recoveryCode,
          'client': 'native',
        },
      ),
    );
    return response.data!;
  }

  /// Rotate the refresh token. Persist the returned `refreshToken` immediately.
  Future<Map<String, dynamic>> refresh({required String refreshToken}) async {
    final response = await _request(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/refresh',
        data: {
          'refreshToken': refreshToken,
          'client': 'native',
        },
      ),
    );
    return response.data!;
  }

  /// Classify a refresh attempt without deciding what the UI should show.
  /// Only an explicit server rejection ends the session; transport failures and
  /// server errors keep the stored session so the user can retry later.
  Future<RefreshOutcome> refreshOutcome({required String refreshToken}) async {
    try {
      final data = await refresh(refreshToken: refreshToken);
      final accessToken = data['accessToken'] as String?;
      final rotatedRefreshToken = data['refreshToken'] as String?;
      if (accessToken == null || rotatedRefreshToken == null) {
        return RefreshUnavailable();
      }
      return RefreshRenewed(accessToken: accessToken, refreshToken: rotatedRefreshToken);
    } on ApiError catch (e) {
      if (e.status == 401 || e.status == 403) return RefreshRejected();
      return RefreshUnavailable();
    } on DioException {
      return RefreshUnavailable();
    } catch (_) {
      return RefreshUnavailable();
    }
  }

  /// Register an account (one-shot, validated as a wizard server-side).
  /// No `level` — removed server-side per DPO ruling.
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String name,
    String role = 'student',
    String? note,
    List<String>? subjectIds,
    String? classCode,
    String? dateOfBirth,
    bool? ageConsent,
  }) async {
    final response = await _request(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/register',
        data: {
          'email': email,
          'password': password,
          'name': name,
          'role': role,
          if (note != null) 'note': note,
          if (subjectIds != null) 'subjectIds': subjectIds,
          if (classCode != null) 'classCode': classCode,
          if (dateOfBirth != null) 'dateOfBirth': dateOfBirth,
          if (ageConsent != null) 'ageConsent': ageConsent,
        },
      ),
    );
    return response.data!;
  }

  /// Resend the verification email.
  Future<bool> resendVerification({required String email}) async {
    final response = await _request(
      () => _dio.put<Map<String, dynamic>>(
        '/api/v1/auth/verify-email?resend=1',
        data: {'email': email},
      ),
    );
    return response.data?['sent'] == true;
  }

  /// Start a password reset. The server answers with the same neutral copy
  /// whether or not the address holds an account — never branch on `sent`.
  Future<String> requestPasswordReset({required String email}) async {
    final response = await _request(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/password-reset',
        data: {'email': email},
      ),
    );
    return (response.data?['message'] as String?) ??
        'If that address has an account, a reset link is on its way.';
  }

  /// Verify an email token.
  Future<bool> verifyEmail({required String token}) async {
    final response = await _request(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/verify-email',
        data: {'token': token},
      ),
    );
    return response.data?['verified'] == true;
  }

  /// Log out — revokes this device's refresh token server-side when the
  /// contract's `{"refreshToken"}` body is sent (7066fc5); best-effort either
  /// way since local storage is cleared regardless.
  Future<void> logout({String? refreshToken}) async {
    try {
      await _request(
        () => _dio.post(
          '/api/v1/auth/logout',
          data: {if (refreshToken != null && refreshToken.isNotEmpty) 'refreshToken': refreshToken},
        ),
      );
    } catch (_) {
      // Best-effort; local token is cleared regardless.
    }
  }

  /// Public subjects for the register wizard picker (no auth).
  Future<List<Map<String, dynamic>>> publicSubjects() async {
    final response = await _request(
      () => _dio.get<Map<String, dynamic>>('/api/v1/auth/subjects-public'),
    );
    final subjects = (response.data?['subjects'] as List?) ?? [];
    return subjects.cast<Map<String, dynamic>>();
  }

  // ── signed-in reads (docs/MOBILE-DATA-API.md) ────────────────────────────

  Future<MeDetail> me() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/me'),
    );
    return MeDetail.fromJson(response.data ?? {});
  }

  Future<List<QueueCard>> queueToday({int limit = 20}) async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>(
        '/api/v1/queue/today',
        queryParameters: {'limit': limit},
      ),
    );
    return ((response.data?['queue'] as List?) ?? [])
        .map((c) => QueueCard.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  Future<OfflinePack> offlinePack({int limit = 20}) async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>(
        '/api/v1/offline/pack',
        queryParameters: {'limit': limit},
      ),
    );
    return OfflinePack.fromJson(response.data ?? {});
  }

  Future<List<Subject>> subjects() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/subjects'),
    );
    return ((response.data?['subjects'] as List?) ?? [])
        .map((s) => Subject.fromJson(s as Map<String, dynamic>))
        .toList();
  }

  /// Topics for one subject (`/content` spelling: cards/lessons).
  Future<List<Topic>> content({required String subjectId}) async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>(
        '/api/v1/content',
        queryParameters: {'subjectId': subjectId},
      ),
    );
    return ((response.data?['topics'] as List?) ?? [])
        .map((t) => Topic.fromJson(t as Map<String, dynamic>))
        .toList();
  }

  Future<List<Lesson>> lessons({required String topicId}) async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>(
        '/api/v1/lessons',
        queryParameters: {'topicId': topicId},
      ),
    );
    return ((response.data?['lessons'] as List?) ?? [])
        .map((l) => Lesson.fromJson(l as Map<String, dynamic>))
        .toList();
  }

  /// `GET /learn` — a topic's unseen batch plus its notes.
  Future<FirstExposure> learn({required String topicId, int batch = 10}) async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>(
        '/api/v1/learn',
        queryParameters: {'topicId': topicId, 'batch': batch},
      ),
    );
    return FirstExposure.fromJson(response.data ?? {});
  }

  /// Cram topic picker (`/cram` spelling: cardCount/lessonCount).
  Future<List<Topic>> cramTopics() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/cram'),
    );
    return ((response.data?['topics'] as List?) ?? [])
        .map((t) => Topic.fromJson(t as Map<String, dynamic>))
        .toList();
  }

  Future<CramSession> cramSession({
    required List<String> topicIds,
    int maxPerTopic = 20,
    String noteDensity = 'detailed',
  }) async {
    final response = await authenticated(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/cram',
        data: {
          'topicIds': topicIds,
          'maxPerTopic': maxPerTopic,
          'noteDensity': noteDensity,
        },
      ),
    );
    return CramSession.fromJson(response.data ?? {});
  }

  Future<GamificationPayload> gamification({String scope = 'weekly'}) async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>(
        '/api/v1/gamification',
        queryParameters: {'scope': scope},
      ),
    );
    return GamificationPayload.fromJson(response.data ?? {});
  }

  Future<Map<String, dynamic>> seasons() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/seasons'),
    );
    return response.data ?? {};
  }

  Future<Map<String, dynamic>> consent() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/consent'),
    );
    return response.data ?? {};
  }

  Future<Map<String, dynamic>> myClasses() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/classes/join'),
    );
    return response.data ?? {};
  }

  /// Launch check — unauthenticated, no rate-limit concerns.
  Future<Map<String, dynamic>> version() async {
    final response = await _request(
      () => _dio.get<Map<String, dynamic>>('/api/v1/version'),
    );
    return response.data ?? {};
  }

  /// `GET /api/v1/insights` — own-progress payload for a stats surface.
  Future<Map<String, dynamic>> insights() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/insights'),
    );
    return response.data ?? {};
  }

  // ── the review write ────────────────────────────────────────────────────

  /// The only write the review loop makes. The server re-grades: its verdict
  /// is authoritative and replaces any local preview.
  Future<Map<String, dynamic>> submitReview({
    required String cardId,
    String? answer,
    String? selectedOptionId,
    int? durationMs,
    String mode = 'daily',
    String? sessionId,
  }) async {
    final response = await authenticated(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/reviews',
        data: {
          'cardId': cardId,
          if (answer != null) 'answer': answer,
          if (selectedOptionId != null) 'selectedOptionId': selectedOptionId,
          if (durationMs != null) 'durationMs': durationMs,
          'mode': mode,
          if (sessionId != null) 'sessionId': sessionId,
        },
      ),
    );
    return response.data ?? {};
  }

  // ── settings writes ─────────────────────────────────────────────────────

  /// `PATCH /me` — identity, profile and preferences through one door.
  /// Send only what changed; absent keys keep their stored value.
  Future<bool> patchMe(Map<String, dynamic> patch) async {
    final response = await authenticated(
      () => _dio.patch<Map<String, dynamic>>('/api/v1/me', data: patch),
    );
    return response.data?['updated'] == true;
  }

  /// Enrol in a subject (idempotent). Un-enrolment is web-only for v1.
  Future<bool> enrollSubject(String subjectId) async {
    final response = await authenticated(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/subjects',
        data: {'subjectId': subjectId},
      ),
    );
    return response.data?['enrolled'] == true;
  }

  /// `PATCH /consent` — the server stamps `decidedAt` itself.
  Future<Map<String, dynamic>> patchConsent(Map<String, dynamic> choices) async {
    final response = await authenticated(
      () => _dio.patch<Map<String, dynamic>>(
        '/api/v1/consent',
        data: {'choices': choices},
      ),
    );
    return response.data ?? {};
  }

  /// Join a class by its six-character code.
  Future<Map<String, dynamic>> joinClass(String code) async {
    final response = await authenticated(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/classes/join',
        data: {'code': code},
      ),
    );
    return response.data ?? {};
  }

  /// `POST /me/email` — a *request*, not a write: the address moves only when
  /// the link mailed to the new address is clicked.
  Future<bool> changeEmail({required String password, required String newEmail}) async {
    final response = await authenticated(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/me/email',
        data: {'password': password, 'newEmail': newEmail},
      ),
    );
    return response.data?['pending'] == true;
  }

  /// `POST /me/password` — revokes EVERY refresh token, this device included.
  /// The caller must clear local state and route to login afterwards.
  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await authenticated(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/me/password',
        data: {'currentPassword': currentPassword, 'newPassword': newPassword},
      ),
    );
    return response.data?['changed'] == true;
  }

  /// Step 1 of the two-step deletion challenge — returns the confirmation
  /// token and the server's message to show verbatim.
  Future<Map<String, dynamic>> requestDataDeletion() async {
    final response = await authenticated(
      () => _dio.delete<Map<String, dynamic>>('/api/v1/data-deletion'),
    );
    return response.data ?? {};
  }

  /// Step 2 — repeats DELETE with the confirmation header.
  /// `403 deletion_confirmation_expired` → start over at step 1.
  Future<Map<String, dynamic>> confirmDataDeletion(String confirmationToken) async {
    final response = await authenticated(
      () => _dio.delete<Map<String, dynamic>>(
        '/api/v1/data-deletion',
        options: Options(headers: {'x-data-deletion-confirm': confirmationToken}),
      ),
    );
    return response.data ?? {};
  }

  /// `GET /consent` — the consent record lives here, not in `/me`.
  Future<Map<String, dynamic>> getConsent() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/consent'),
    );
    return response.data ?? {};
  }

  /// `PATCH /consent` — send only changed keys; `essential` is always true
  /// server-side. The server stamps `decidedAt` itself.
  Future<Map<String, dynamic>> updateConsent(Map<String, dynamic> choices) async {
    final response = await authenticated(
      () => _dio.patch<Map<String, dynamic>>(
        '/api/v1/consent',
        data: {'choices': choices},
      ),
    );
    return response.data ?? {};
  }

  /// The joined-class list behind the join-code field.
  Future<List<Map<String, dynamic>>> myClassesList() async {
    final response = await authenticated(
      () => _dio.get<Map<String, dynamic>>('/api/v1/classes/join'),
    );
    return ((response.data?['classes'] as List?) ?? []).cast<Map<String, dynamic>>();
  }

  /// `GET /version` — launch check, unauthenticated.
  Future<Map<String, dynamic>> appVersion() async {
    final response = await _request(
      () => _dio.get<Map<String, dynamic>>('/api/v1/version'),
    );
    return response.data ?? {};
  }

  // ── profile media (docs/MOBILE-MEDIA-API.md) ─────────────────────────────

  /// presign → raw PUT → confirm, in one call. Returns the app-proxied URL.
  /// `503 storage_unconfigured` propagates as ApiError — callers degrade to
  /// the colour+symbol avatar. `400 upload_missing`/`415` are retried once
  /// with a fresh presign, per the contract.
  Future<String> uploadAvatar({
    required String kind, // 'avatar' | 'banner'
    required List<int> bytes,
    required String contentType,
  }) async {
    for (var attempt = 0; attempt < 2; attempt++) {
      final presign = await authenticated(
        () => _dio.post<Map<String, dynamic>>(
          '/api/v1/media',
          data: {
            'action': 'presign',
            'kind': kind,
            'contentType': contentType,
            'sizeBytes': bytes.length,
          },
        ),
      );
      final key = presign.data?['key'] as String?;
      final url = presign.data?['url'] as String?;
      if (key == null || url == null) {
        throw ApiError(status: 0, code: 'bad_response', message: 'The upload could not be prepared.');
      }

      // The presigned PUT carries no auth — a bare client, not the session one.
      await Dio().put<void>(
        url,
        data: bytes,
        options: Options(
          contentType: contentType,
          headers: {'Content-Type': contentType},
        ),
      );

      try {
        final confirm = await authenticated(
          () => _dio.post<Map<String, dynamic>>(
            '/api/v1/media',
            data: {
              'action': 'confirm',
              'kind': kind,
              'key': key,
              'contentType': contentType,
              'sizeBytes': bytes.length,
            },
          ),
        );
        return confirm.data?['url'] as String? ?? '';
      } on ApiError catch (e) {
        // upload_missing → the PUT did not land; re-presign and retry once.
        if (e.code == 'upload_missing' && attempt == 0) continue;
        rethrow;
      }
    }
    throw ApiError(status: 0, code: 'upload_failed', message: 'The upload could not be confirmed.');
  }

  /// Clear the avatar/banner pointer server-side.
  Future<void> removeAvatar({required String kind}) async {
    await authenticated(
      () => _dio.post<Map<String, dynamic>>(
        '/api/v1/media',
        data: {'action': 'remove', 'kind': kind},
      ),
    );
  }

  /// Transcript download. `csv` returns text/csv with an attachment header —
  /// fetch to a file and hand to the OS share sheet.
  Future<Uint8List> exportTranscript({String format = 'csv'}) async {
    final response = await authenticated(
      () => _dio.get<List<int>>(
        '/api/v1/exports',
        queryParameters: {'format': format},
        options: Options(responseType: ResponseType.bytes),
      ),
    );
    return Uint8List.fromList(response.data ?? const []);
  }

  // ── authenticated helpers ───────────────────────────────────────────────

  /// Perform an authenticated request with one refresh dance on 401.
  /// A transport failure during refresh keeps the stored session; only an
  /// explicit 401/403 refresh answer clears it.
  Future<Response<T>> authenticated<T>(Future<Response<T>> Function() request) async {
    try {
      return await request();
    } on ApiError catch (e, st) {
      if (e.status == 401) {
        return _retryAfterRefresh(request, e, st);
      }
      rethrow;
    } on DioException catch (e, st) {
      if (e.response?.statusCode == 401) {
        return _retryAfterRefresh(request, e, st);
      }
      rethrow;
    }
  }

  Future<Response<T>> _retryAfterRefresh<T>(
    Future<Response<T>> Function() request,
    Object error,
    StackTrace stackTrace,
  ) async {
    final session = await storage.read();
    if (session == null) {
      await storage.clear();
      Error.throwWithStackTrace(error, stackTrace);
    }

    final outcome = await refreshOutcome(refreshToken: session.refreshToken);
    if (outcome is RefreshRenewed) {
      await storage.write(
        AuthSession(
          accessToken: outcome.accessToken,
          refreshToken: outcome.refreshToken,
          user: session.user,
        ),
      );
      return request();
    }
    if (outcome is RefreshRejected) {
      await storage.clear();
    }
    Error.throwWithStackTrace(error, stackTrace);
  }
}
