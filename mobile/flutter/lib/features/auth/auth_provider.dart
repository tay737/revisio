/// Auth state management with Riverpod.
///
/// - Access token lives in memory only (this notifier).
/// - Refresh token lives in `flutter_secure_storage`.
/// - A refused refresh is a sign-out with a reason, never a stuck screen.
library revisio.features.auth.auth_provider;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_client.dart';

/// The current auth state.
sealed class AuthState {}
class AuthInitial extends AuthState {} // not yet loaded from storage
class AuthLoading extends AuthState {} // restoring session
class AuthAuthenticated extends AuthState {
  final AuthSession session;
  AuthAuthenticated({required this.session});
}
class AuthUnauthenticated extends AuthState {
  final String? reason; // why the session ended, if known
  AuthUnauthenticated({this.reason});
}
class AuthMfaRequired extends AuthState {
  final String email;
  final String password;
  AuthMfaRequired({required this.email, required this.password});
}
class AuthError extends AuthState {
  final String message;
  final String? code;
  final String? field;
  AuthError({required this.message, this.code, this.field});
}

/// Registration succeeded; the account still needs email verification.
class AuthRegistered extends AuthState {
  final String message;
  final String? verifyUrl;
  AuthRegistered({required this.message, this.verifyUrl});
}

/// Notifier that owns the session lifecycle.
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._api) : super(AuthInitial()) {
    _restore();
  }

  final RevisioApi _api;

  Future<void> _restore() async {
    state = AuthLoading();
    final session = await _api.storage.read();
    if (session == null) {
      state = AuthUnauthenticated();
      return;
    }
    state = AuthAuthenticated(session: session);
  }

  /// Sign in with email + password. Sets `AuthMfaRequired` when TOTP is needed.
  Future<void> signIn({
    required String email,
    required String password,
    String? totp,
    String? recoveryCode,
  }) async {
    state = AuthLoading();
    try {
      final data = await _api.login(
        email: email,
        password: password,
        totp: totp,
        recoveryCode: recoveryCode,
      );

      if (data['mfaRequired'] == true) {
        state = AuthMfaRequired(email: email, password: password);
        return;
      }

      final accessToken = data['accessToken'] as String?;
      final refreshToken = data['refreshToken'] as String?;
      final user = (data['user'] as Map?)?.cast<String, dynamic>() ?? {};

      if (accessToken == null || refreshToken == null) {
        state = AuthError(message: 'The server did not return a session.');
        return;
      }

      final session = AuthSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: user,
      );
      await _api.storage.write(session);
      state = AuthAuthenticated(session: session);
    } on ApiError catch (e) {
      state = AuthError(message: e.message, code: e.code, field: e.field);
    } catch (e) {
      state = AuthError(message: e.toString());
    }
  }

  /// Submit the TOTP code (second step of sign-in).
  Future<void> submitTotp({required String totp}) async {
    if (state case AuthMfaRequired(:final email, :final password)) {
      await signIn(email: email, password: password, totp: totp);
    }
  }

  /// Register an account. On `403 age_consent_required`, the caller should
  /// show the guardian-consent step and re-register with `ageConsent: true`.
  Future<void> register({
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
    state = AuthLoading();
    try {
      final data = await _api.register(
        email: email,
        password: password,
        name: name,
        role: role,
        note: note,
        subjectIds: subjectIds,
        classCode: classCode,
        dateOfBirth: dateOfBirth,
        ageConsent: ageConsent,
      );

      // Staff requests sit pending human approval — no verification email is
      // involved, so the copy must not mention one. String is verbatim from
      // src/components/AuthForm.tsx (copy parity).
      if (data['pendingApproval'] == true) {
        state = AuthRegistered(
          message:
              'Account created. A developer reviews staff accounts before the first sign-in. You will get an email once it is approved.',
        );
        return;
      }

      // Registration never returns a session — account is `pending` until
      // email verification. Surface what to do next without an error tone.
      final verifyUrl = data['verifyUrl'] as String?;
      final message = verifyUrl != null
          ? 'Check your inbox for the verification link, then sign in.'
          : 'Account created. Check your inbox for the verification link, then sign in.';
      state = AuthRegistered(message: message, verifyUrl: verifyUrl);
    } on ApiError catch (e) {
      state = AuthError(message: e.message, code: e.code, field: e.field);
    } catch (e) {
      state = AuthError(message: e.toString());
    }
  }

  /// Refresh the session and update storage. Returns false when the session
  /// could not be renewed; only a server rejection signs the user out.
  Future<bool> refreshSession() async {
    final current = state;
    if (current case AuthAuthenticated(:final session)) {
      final outcome = await _api.refreshOutcome(refreshToken: session.refreshToken);
      if (outcome is RefreshRenewed) {
        final updated = AuthSession(
          accessToken: outcome.accessToken,
          refreshToken: outcome.refreshToken,
          user: session.user,
        );
        await _api.storage.write(updated);
        state = AuthAuthenticated(session: updated);
        return true;
      }
      if (outcome is RefreshRejected) {
        await _logout();
        state = AuthUnauthenticated(reason: 'Your session has ended. Sign in again.');
      }
      return false;
    }
    return false;
  }

  /// Sign out — clear local storage; server revocation is best-effort.
  Future<void> signOut() async {
    await _logout();
    state = AuthUnauthenticated();
  }

  Future<void> _logout() async {
    // The stored refresh token is what the server revokes; the in-memory
    // session may already be gone, so read storage rather than state.
    final stored = await _api.storage.read();
    try {
      await _api.logout(refreshToken: stored?.refreshToken);
    } catch (_) {
      // best effort
    }
    await _api.storage.clear();
  }

  /// Clear a transient error.
  void clearError() {
    if (state is AuthError) state = AuthUnauthenticated();
  }
}

/// Provider for the auth notifier.
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(RevisioApi(storage: SessionStorage()));
});

/// Provider for the API client (useful for screens that call routes directly).
final apiClientProvider = Provider<RevisioApi>((ref) {
  return RevisioApi(storage: SessionStorage());
});
