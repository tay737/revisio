/// HTTP client for the Revisio API, following `docs/MOBILE-AUTH-API.md`.
///
/// - Login/refresh send `"client": "native"` to receive a body refresh token.
/// - Refresh token rotates: persist the new one immediately.
/// - On 401, attempt one refresh dance, then retry; only log out on refresh failure.
/// - Field errors arrive with a `field` key — render under that field only.
library revisio.services.api_client;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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

  /// Log out — revokes all refresh tokens server-side.
  Future<void> logout() async {
    try {
      await _request(() => _dio.post('/api/v1/auth/logout'));
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
