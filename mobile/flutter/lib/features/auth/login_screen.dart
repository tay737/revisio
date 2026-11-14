/// Sign-in screen: email + password, mandatory TOTP step for enrolled accounts,
/// unverified-email resend, and forgot-password link.
///
/// Follows `docs/MOBILE-AUTH-API.md` and `docs/MOBILE-UX-PLAN.md` §5.
library revisio.features.auth.login_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../design/design.dart';
import '../auth/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _totp = TextEditingController();
  final _recovery = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _mfaStage = false;
  bool _useRecovery = false;
  bool _loading = false;
  String? _error;
  String? _info;
  String? _unverifiedEmail;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _totp.dispose();
    _recovery.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
      _info = null;
      _unverifiedEmail = null;
    });

    final notifier = ref.read(authProvider.notifier);
    await notifier.signIn(
      email: _email.text.trim(),
      password: _password.text,
      totp: _mfaStage && !_useRecovery ? _totp.text.trim() : null,
      recoveryCode: _mfaStage && _useRecovery ? _recovery.text.trim() : null,
    );

    setState(() => _loading = false);
    if (!mounted) return;
    final state = ref.read(authProvider);
    if (state is AuthMfaRequired) {
      setState(() {
        _mfaStage = true;
        _useRecovery = false;
        _info = 'Enter the six-digit code from your authenticator app.';
      });
    } else if (state is AuthError) {
      setState(() {
        _error = state.message;
        if (state.code == 'email_unverified') {
          _unverifiedEmail = _email.text.trim();
        }
      });
    }
  }

  Future<void> _resendVerification() async {
    if (_unverifiedEmail == null || _unverifiedEmail!.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
      _info = null;
    });
    try {
      await ref.read(apiClientProvider).resendVerification(email: _unverifiedEmail!);
      setState(() => _info = 'Sent again to $_unverifiedEmail. It can take a minute to arrive.');
    } catch (e) {
      setState(() => _error = 'We could not re-send that right now. Try again shortly.');
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authProvider);
    final error = state is AuthError ? state.message : _error;

    return Scaffold(
      backgroundColor: context.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 24),
              Text(
                'Welcome back',
                style: TypeScale.title.copyWith(color: context.foreground),
              ),
              const SizedBox(height: 6),
              Text(
                'Your queue is where you left it.',
                style: TypeScale.body.copyWith(color: context.mutedForeground),
              ),
              const SizedBox(height: 32),
              Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    RevisioField(
                      label: 'Email',
                      icon: 'mail',
                      child: RevisioTextInput(
                        controller: _email,
                        placeholder: 'you@example.com',
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: AutofillHints.email,
                        enabled: !_loading,
                        validator: (v) {
                          final v2 = v?.trim() ?? '';
                          if (v2.isEmpty) return 'Enter an email address you can receive mail at.';
                          if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v2)) {
                            return 'Enter a valid email address.';
                          }
                          return null;
                        },
                        onSubmitted: (_) => FocusScope.of(context).nextFocus(),
                      ),
                    ),
                    const SizedBox(height: 20),
                    RevisioField(
                      label: 'Password',
                      icon: 'secure',
                      child: RevisioPasswordInput(
                        controller: _password,
                        placeholder: 'Your password',
                        enabled: !_loading,
                        onSubmitted: (_) {
                          _signIn();
                        },
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_mfaStage) ...[
                      RevisioField(
                        label: _useRecovery ? 'Recovery code' : 'Two-factor code',
                        icon: 'private',
                        child: RevisioTextInput(
                          controller: _useRecovery ? _recovery : _totp,
                          placeholder: _useRecovery ? 'Recovery code' : '000000',
                          keyboardType: _useRecovery ? TextInputType.text : TextInputType.number,
                          maxLength: _useRecovery ? null : 6,
                          autofillHints: AutofillHints.oneTimeCode,
                          enabled: !_loading,
                          onSubmitted: (_) {
                            _signIn();
                          },
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: RevisioGhostButton(
                          onPressed: _loading
                              ? null
                              : () => setState(() {
                                    _useRecovery = !_useRecovery;
                                    _info = _useRecovery
                                        ? 'Enter one of your saved recovery codes.'
                                        : 'Enter the six-digit code from your authenticator app.';
                                  }),
                          child: Text(_useRecovery ? 'Use an authenticator code' : 'Use a recovery code'),
                        ),
                      ),
                    ],
                    if (error != null && error.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      RevisioNotice(tone: NoticeTone.bad, show: true, child: Text(error)),
                    ],
                    if (_info != null && _info!.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      RevisioNotice(tone: NoticeTone.note, show: true, child: Text(_info!)),
                    ],
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: kTouchTarget,
                      child: RevisioButton(
                        onPressed: _loading ? null : _signIn,
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text(
                                'Sign in',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              if (_unverifiedEmail != null && _unverifiedEmail!.isNotEmpty) ...[
                SizedBox(
                  width: double.infinity,
                  height: kTouchTarget,
                  child: RevisioSecondaryButton(
                    onPressed: _loading ? null : _resendVerification,
                    child: const Text(
                      'Re-send the verification email',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Center(
                child: RevisioGhostButton(
                  onPressed: () => context.push('/forgot-password'),
                  child: const Text('Forgot your password?'),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Divider(height: 1, color: context.border),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      'New to Revisio?',
                      style: TypeScale.caption.copyWith(color: context.mutedForeground),
                    ),
                  ),
                  Expanded(
                    child: Divider(height: 1, color: context.border),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: kTouchTarget,
                child: RevisioSecondaryButton(
                  onPressed: () => context.push('/register'),
                  child: const Text(
                    'Start free',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                  ),
                ),
              ),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

}
