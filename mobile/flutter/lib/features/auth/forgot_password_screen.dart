/// Forgot-password screen: asks the server to mail a reset link.
///
/// The server answers with the same neutral copy whether or not the address
/// holds an account, so the success state never confirms an account exists.
/// The reset itself completes on the web — the mailed link opens the browser.
library revisio.features.auth.forgot_password_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../design/design.dart';
import '../../services/api_client.dart';
import 'auth_provider.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _loading = false;
  bool _sent = false;
  String? _message;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _sendReset() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final message = await ref
          .read(apiClientProvider)
          .requestPasswordReset(email: _email.text.trim());
      if (!mounted) return;
      setState(() {
        _sent = true;
        _message = message;
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() => _message = e.message);
    } on DioException {
      if (!mounted) return;
      setState(() => _message = 'We could not reach the server. Check your connection and try again.');
    } catch (_) {
      if (!mounted) return;
      setState(() => _message = 'Something went wrong. Try again shortly.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
                'Reset your password',
                style: TypeScale.title.copyWith(color: context.foreground),
              ),
              const SizedBox(height: 6),
              Text(
                _sent
                    ? 'Check your inbox — the link expires in 30 minutes.'
                    : 'We will email you a link to choose a new password.',
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
                        textInputAction: TextInputAction.done,
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
                        onSubmitted: (_) => _sendReset(),
                      ),
                    ),
                    if (_message != null && _message!.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      RevisioNotice(
                        tone: _sent ? NoticeTone.note : NoticeTone.bad,
                        show: true,
                        child: Text(_message!),
                      ),
                    ],
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: kTouchTarget,
                      child: RevisioButton(
                        onPressed: _loading ? null : _sendReset,
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Text(
                                _sent ? 'Send again' : 'Send reset link',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Center(
                child: RevisioGhostButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('Back to sign in'),
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
