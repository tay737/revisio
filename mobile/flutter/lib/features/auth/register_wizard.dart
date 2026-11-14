/// Registration wizard: role → study(subjects) → account → profile → review.
///
/// No education level — dropped server-side per DPO (UK GDPR Art 5(1)(c);
/// migration 0015 removes the column).
///
/// Follows `docs/MOBILE-AUTH-API.md` and `docs/MOBILE-UX-PLAN.md` §5:
/// per-field error slots, focus moves to first failing field, inputs preserved
/// on error, guardian-consent step only on server `403 age_consent_required`.
library revisio.features.auth.register_wizard;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../design/design.dart';
import '../auth/auth_provider.dart';

enum WizardStep { role, study, account, profile, review }

final List<WizardStep> _studentSteps = [
  WizardStep.role,
  WizardStep.study,
  WizardStep.account,
  WizardStep.profile,
  WizardStep.review,
];

final List<WizardStep> _teacherSteps = [
  WizardStep.role,
  WizardStep.account,
  WizardStep.profile,
  WizardStep.review,
];

class RegisterWizard extends ConsumerStatefulWidget {
  const RegisterWizard({super.key});

  @override
  ConsumerState<RegisterWizard> createState() => _RegisterWizardState();
}

class _RegisterWizardState extends ConsumerState<RegisterWizard> {
  WizardStep _step = WizardStep.role;
  String _role = 'student';

  // Account
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _nameFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _classCodeController = TextEditingController();
  final _noteController = TextEditingController();

  // Profile
  final _dob = TextEditingController();
  final _dobFocus = FocusNode();
  String? _dateOfBirth;
  bool _guardianConsent = false;
  bool _guardianConsentRequired = false;

  // Study
  List<Map<String, dynamic>> _subjects = [];
  bool _subjectsLoading = true;
  bool _subjectsFailed = false;
  List<String> _subjectIds = [];
  String _classCode = '';

  bool _loading = false;
  String? _error;
  String? _fieldError;
  String? _fieldErrorText;
  String? _success;

  @override
  void initState() {
    super.initState();
    _classCodeController.addListener(() {
      _classCode = _classCodeController.text.toUpperCase();
    });
    _loadSubjects();
  }

  Future<void> _loadSubjects() async {
    setState(() {
      _subjectsLoading = true;
      _subjectsFailed = false;
    });
    try {
      final subjects = await ref.read(apiClientProvider).publicSubjects();
      if (!mounted) return;
      setState(() {
        _subjects = subjects;
        _subjectsLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _subjectsLoading = false;
        _subjectsFailed = true;
      });
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _nameFocus.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    _classCodeController.dispose();
    _noteController.dispose();
    _dob.dispose();
    _dobFocus.dispose();
    super.dispose();
  }

  bool get _isStudent => _role == 'student';
  List<WizardStep> get _steps => _isStudent ? _studentSteps : _teacherSteps;
  bool get _isLast => _step == _steps.last;

  bool get _requiresGuardianConsent =>
      _isStudent && (_getGuardianRequired() || _guardianConsentRequired);

  void _clearErrors() {
    _error = null;
    _fieldError = null;
    _fieldErrorText = null;
    _success = null;
  }

  WizardStep _stepForField(String? field) {
    switch (field) {
      case 'name':
      case 'email':
      case 'password':
        return WizardStep.account;
      case 'dateOfBirth':
      case 'ageConsent':
      case 'note':
        return WizardStep.profile;
      case 'role':
        return WizardStep.role;
      case 'subjectIds':
      case 'classCode':
        return WizardStep.study;
      default:
        return _step;
    }
  }

  FocusNode? _focusForField(String? field) {
    switch (field) {
      case 'name':
        return _nameFocus;
      case 'email':
        return _emailFocus;
      case 'password':
        return _passwordFocus;
      case 'dateOfBirth':
        return _dobFocus;
      default:
        return null;
    }
  }

  void _focusField(String? field) {
    final node = _focusForField(field);
    if (node == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) node.requestFocus();
    });
  }

  String get _stepTitle {
    switch (_step) {
      case WizardStep.role:
        return 'Your role';
      case WizardStep.study:
        return 'What you study';
      case WizardStep.account:
        return 'Your account';
      case WizardStep.profile:
        return 'About you';
      case WizardStep.review:
        return 'Confirm';
    }
  }

  String get _stepHeading {
    switch (_step) {
      case WizardStep.role:
        return 'How will you use Revisio?';
      case WizardStep.study:
        return 'What are you studying?';
      case WizardStep.account:
        return 'Create your sign-in';
      case WizardStep.profile:
        return 'A little about you';
      case WizardStep.review:
        return 'Check and create';
    }
  }

  bool _getGuardianRequired() {
    if (_dateOfBirth == null) return false;
    try {
      final dob = DateTime.parse(_dateOfBirth!);
      final now = DateTime.now();
      final age = now.year - dob.year -
          (now.month < dob.month || (now.month == dob.month && now.day < dob.day)
              ? 1
              : 0);
      return age < 13;
    } catch (_) {
      return false;
    }
  }

  String? _validate(WizardStep key) {
    if (key == WizardStep.account) {
      if (_name.text.trim().isEmpty) {
        return 'Add your name so your teacher or classmates can recognise you.';
      }
      final email = _email.text.trim();
      if (email.isEmpty) {
        return 'Enter an email address you can receive mail at.';
      }
      if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
        return 'Enter a valid email address.';
      }
      if (_password.text.length < 8) {
        return 'Use at least 8 characters for your password.';
      }
    }
    if (key == WizardStep.profile && _isStudent) {
      if (_dateOfBirth == null || _dateOfBirth!.isEmpty) {
        return 'Enter your date of birth.';
      }
      try {
        final dob = DateTime.parse(_dateOfBirth!);
        if (dob.isAfter(DateTime.now())) {
          return 'Enter a valid date of birth that is not in the future.';
        }
      } catch (_) {
        return 'Enter a valid date of birth.';
      }
      if (_requiresGuardianConsent && !_guardianConsent) {
        return 'A parent or guardian must confirm consent before continuing.';
      }
    }
    return null;
  }

  void _goTo(WizardStep step) {
    setState(() {
      _step = step;
      _clearErrors();
    });
  }

  void _next() {
    final problem = _validate(_step);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    final idx = _steps.indexOf(_step);
    if (idx < _steps.length - 1) {
      setState(() {
        _step = _steps[idx + 1];
        _clearErrors();
      });
    }
  }

  void _back() {
    final idx = _steps.indexOf(_step);
    if (idx > 0) {
      setState(() {
        _step = _steps[idx - 1];
        _clearErrors();
      });
    }
  }

  Future<void> _submit() async {
    // Re-check every earlier step.
    for (int i = 0; i < _steps.length - 1; i++) {
      final problem = _validate(_steps[i]);
      if (problem != null) {
        setState(() {
          _error = problem;
          _step = _steps[i];
        });
        return;
      }
    }

    setState(() {
      _loading = true;
      _clearErrors();
    });

    final notifier = ref.read(authProvider.notifier);
    await notifier.register(
      email: _email.text.trim(),
      password: _password.text,
      name: _name.text.trim(),
      role: _isStudent ? 'student' : 'teacher',
      note: _isStudent ? null : _noteController.text.trim(),
      subjectIds: _isStudent ? _subjectIds : null,
      classCode: _isStudent && _classCode.isNotEmpty ? _classCode : null,
      dateOfBirth: _isStudent ? _dateOfBirth : null,
      ageConsent: _isStudent && _requiresGuardianConsent ? _guardianConsent : null,
    );

    setState(() => _loading = false);
    if (!mounted) return;

    final state = ref.read(authProvider);
    if (state is AuthError) {
      _applyRegisterError(state);
    } else if (state is AuthRegistered) {
      setState(() => _success = state.message);
    }
  }

  void _applyRegisterError(AuthError state) {
    final field = state.field;
    final needsGuardianConsent =
        state.code == 'age_consent_required' || field == 'ageConsent';

    setState(() {
      if (needsGuardianConsent) {
        _guardianConsentRequired = true;
        _step = WizardStep.profile;
        _error = null;
        _fieldError = 'ageConsent';
        _fieldErrorText = state.message;
        _success = null;
      } else if (field != null) {
        _step = _stepForField(field);
        _error = null;
        _fieldError = field;
        _fieldErrorText = state.message;
        _success = null;
      } else {
        _error = state.message;
        _fieldError = null;
        _fieldErrorText = null;
        _success = null;
      }
    });
    _focusField(field);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      body: SafeArea(
        child: Column(
          children: [
            // Progress bar
            Container(
              height: 4,
              width: double.infinity,
              color: context.border,
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: (_steps.indexOf(_step) + 1) / _steps.length,
                child: Container(color: context.primary),
              ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                'Step ${_steps.indexOf(_step) + 1} of ${_steps.length} · ${_stepTitle.toUpperCase()}',
                style: TypeScale.caption.copyWith(color: context.mutedForeground),
              ),
            ),
            const SizedBox(height: 24),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _stepHeading,
                      style: TypeScale.display.copyWith(color: context.foreground, fontSize: 24),
                    ),
                    const SizedBox(height: 8),
                    if (_step == WizardStep.role) _buildRoleStep(),
                    if (_step == WizardStep.study) _buildStudyStep(),
                    if (_step == WizardStep.account) _buildAccountStep(),
                    if (_step == WizardStep.profile) _buildProfileStep(),
                    if (_step == WizardStep.review) _buildReviewStep(),
                    if (_success?.isNotEmpty == true) ...[
                      const SizedBox(height: 16),
                      RevisioNotice(tone: NoticeTone.note, show: true, child: Text(_success!)),
                    ],
                    if (_error?.isNotEmpty == true) ...[
                      const SizedBox(height: 16),
                      RevisioNotice(tone: NoticeTone.bad, show: true, child: Text(_error!)),
                    ],
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        if (_steps.indexOf(_step) > 0)
                          Expanded(
                            child: RevisioSecondaryButton(
                              onPressed: _loading ? null : _back,
                              child: const Text(
                                'Back',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                              ),
                            ),
                          ),
                        if (_steps.indexOf(_step) > 0) const SizedBox(width: 12),
                        Expanded(
                          child: SizedBox(
                            height: kTouchTarget,
                            child: RevisioButton(
                              onPressed: _loading ? null : (_isLast ? _submit : _next),
                              child: _loading
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : Text(
                                      _isLast ? 'Create account' : 'Continue',
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Center(
                      child: RevisioGhostButton(
                        onPressed: () => context.push('/login'),
                        child: const Text('Already registered? Sign in'),
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoleStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _RoleChoice(
                value: 'student',
                label: 'Student',
                hint: 'Study my own subjects, at my own pace',
                selected: _role == 'student',
                onTap: () => setState(() => _role = 'student'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _RoleChoice(
                value: 'teacher',
                label: 'Teacher',
                hint: 'Run classes and share content',
                selected: _role == 'teacher',
                onTap: () => setState(() => _role = 'teacher'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStudyStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Text('Subjects', style: TypeScale.label.copyWith(color: context.mutedForeground)),
        const SizedBox(height: 8),
        if (_subjectsLoading)
          Text(
            'Loading subjects…',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          )
        else if (_subjectsFailed)
          Row(
            children: [
              Expanded(
                child: Text(
                  'Subjects did not load. Check your connection and try again.',
                  style: TypeScale.caption.copyWith(color: context.mutedForeground),
                ),
              ),
              TextButton(
                onPressed: _loadSubjects,
                child: const Text('Retry'),
              ),
            ],
          )
        else if (_subjects.isEmpty)
          Text(
            'No subjects are published yet. You can choose them later.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _subjects.map((s) {
              final id = s['id'] as String;
              final name = s['name'] as String;
              final on = _subjectIds.contains(id);
              return FilterChip(
                label: Text(name),
                selected: on,
                onSelected: (_) => setState(() {
                  if (on) {
                    _subjectIds.remove(id);
                  } else {
                    if (_subjectIds.length >= 12) return;
                    _subjectIds.add(id);
                  }
                }),
                selectedColor: context.primary,
                checkmarkColor: context.primaryForeground,
                backgroundColor: context.card,
                side: BorderSide(color: on ? context.primary : context.border),
                labelStyle: TextStyle(
                  color: on ? context.primaryForeground : context.foreground,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              );
            }).toList(),
          ),
        if (_fieldError == 'subjectIds' && _fieldErrorText?.isNotEmpty == true) ...[
          const SizedBox(height: 8),
          Text(
            _fieldErrorText!,
            style: TypeScale.fine.copyWith(color: context.destructiveInk, height: 1.35),
          ),
        ],
        const SizedBox(height: 16),
        RevisioField(
          label: 'Class code (optional)',
          errorText: _fieldError == 'classCode' ? _fieldErrorText : null,
          child: RevisioTextInput(
            controller: _classCodeController,
            placeholder: 'B7K2QM',
            textCapitalization: TextCapitalization.characters,
            maxLength: 6,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Optional — join a teacher’s class. You can change this later.',
          style: TypeScale.caption.copyWith(color: context.mutedForeground),
        ),
      ],
    );
  }

  Widget _buildAccountStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        RevisioField(
          label: 'Full name',
          icon: Icons.person_outline,
          errorText: _fieldError == 'name' ? _fieldErrorText : null,
          child: RevisioTextInput(
            controller: _name,
            focusNode: _nameFocus,
            placeholder: 'you@example.com',
            autofillHints: AutofillHints.name,
            textCapitalization: TextCapitalization.words,
          ),
        ),
        const SizedBox(height: 20),
        RevisioField(
          label: 'Email',
          icon: Icons.mail_outline,
          errorText: _fieldError == 'email' ? _fieldErrorText : null,
          child: RevisioTextInput(
            controller: _email,
            focusNode: _emailFocus,
            placeholder: 'you@example.com',
            keyboardType: TextInputType.emailAddress,
            autofillHints: AutofillHints.email,
          ),
        ),
        const SizedBox(height: 20),
        RevisioField(
          label: 'Password',
          icon: Icons.lock_outline,
          errorText: _fieldError == 'password' ? _fieldErrorText : null,
          child: RevisioPasswordInput(
            controller: _password,
            focusNode: _passwordFocus,
            placeholder: 'At least 8 characters',
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _passwordStrength(_password.text),
          style: TypeScale.fine.copyWith(color: context.mutedForeground),
        ),
      ],
    );
  }

  Widget _buildProfileStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        if (_isStudent) ...[
          RevisioField(
            label: 'Your date of birth',
            icon: Icons.cake_outlined,
            errorText: _fieldError == 'dateOfBirth' ? _fieldErrorText : null,
            child: RevisioTextInput(
              controller: _dob,
              focusNode: _dobFocus,
              placeholder: 'YYYY-MM-DD',
              keyboardType: TextInputType.datetime,
              onChanged: (value) {
                final v = value.trim();
                setState(() => _dateOfBirth = v.isEmpty ? null : v);
              },
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  firstDate: DateTime(1900),
                  lastDate: DateTime.now(),
                );
                if (picked != null && mounted) {
                  final iso = picked.toIso8601String().substring(0, 10);
                  setState(() {
                    _dob.text = iso;
                    _dateOfBirth = iso;
                  });
                }
              },
            ),
          ),
          const SizedBox(height: 8),
          if (_dateOfBirth != null) ...[
            Text(
              _requiresGuardianConsent
                  ? 'A parent or legal guardian must complete this registration.'
                  : 'We use this only to check whether guardian consent is required.',
              style: TypeScale.caption.copyWith(color: context.mutedForeground),
            ),
            const SizedBox(height: 8),
          ],
        ] else ...[
          RevisioField(
            label: 'Why do you need a staff account?',
            errorText: _fieldError == 'note' ? _fieldErrorText : null,
            child: RevisioTextInput(
              controller: _noteController,
              placeholder: 'Team, role, what you need access to…',
              maxLines: 3,
              maxLength: 500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Optional — staff accounts are reviewed before they are activated.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
          ),
        ],
        if (_requiresGuardianConsent) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.secondary,
              borderRadius: BorderRadius.circular(RadiusTokens.md),
              border: Border.all(color: context.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Checkbox(
                  value: _guardianConsent,
                  onChanged: (v) => setState(() {
                    _guardianConsent = v ?? false;
                    if (_guardianConsent) {
                      _fieldError = null;
                      _fieldErrorText = null;
                    }
                  }),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'I am this learner\'s parent or guardian, and I agree to Revisio using their details to run their account. Contact support to withdraw this.',
                    style: TypeScale.caption.copyWith(color: context.foreground, height: 1.43),
                  ),
                ),
              ],
            ),
          ),
          if (!_guardianConsent || _fieldError == 'ageConsent') ...[
            const SizedBox(height: 8),
            Text(
              _fieldError == 'ageConsent' && _fieldErrorText?.isNotEmpty == true
                  ? _fieldErrorText!
                  : 'A parent or guardian must confirm consent before continuing.',
              style: TypeScale.fine.copyWith(
                color: context.destructiveInk,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildReviewStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        _ReviewRow(
          label: 'Role',
          value: _role == 'student' ? 'Student' : 'Teacher',
          onEdit: () => _goTo(WizardStep.role),
        ),
        if (_isStudent) ...[
          if (_subjectIds.isNotEmpty)
            _ReviewRow(
              label: 'Subjects',
              value: _subjectIds.map((id) {
                final s = _subjects.firstWhere((x) => x['id'] == id, orElse: () => {});
                return s['name'] ?? id;
              }).join(', '),
              onEdit: () => _goTo(WizardStep.study),
            ),
          if (_classCode.isNotEmpty)
            _ReviewRow(
              label: 'Class code',
              value: _classCode,
              onEdit: () => _goTo(WizardStep.study),
            ),
        ],
        _ReviewRow(
          label: 'Name',
          value: _name.text.trim(),
          onEdit: () => _goTo(WizardStep.account),
        ),
        _ReviewRow(
          label: 'Email',
          value: _email.text.trim(),
          onEdit: () => _goTo(WizardStep.account),
        ),
        if (_isStudent && _dateOfBirth != null)
          _ReviewRow(
            label: 'Date of birth',
            value: _dateOfBirth!,
            onEdit: () => _goTo(WizardStep.profile),
          ),
        if (!_isStudent && _noteController.text.trim().isNotEmpty)
          _ReviewRow(
            label: 'Reason',
            value: _noteController.text.trim(),
            onEdit: () => _goTo(WizardStep.profile),
          ),
      ],
    );
  }

  String _passwordStrength(String pw) {
    if (pw.isEmpty) return '';
    if (pw.length < 8) return 'Needs at least 8 characters';
    final score = [
      pw.length >= 12,
      RegExp(r'[a-z]').hasMatch(pw) && RegExp(r'[A-Z]').hasMatch(pw),
      RegExp(r'\d').hasMatch(pw),
      RegExp(r'[^A-Za-z0-9]').hasMatch(pw),
    ].where((e) => e).length;
    return score >= 3 ? 'Strong' : score == 2 ? 'Good' : 'Fair';
  }
}

class _RoleChoice extends StatelessWidget {
  final String value;
  final String label;
  final String hint;
  final bool selected;
  final VoidCallback onTap;

  const _RoleChoice({
    required this.value,
    required this.label,
    required this.hint,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? context.card : context.secondary,
          borderRadius: BorderRadius.circular(RadiusTokens.xxl),
          border: Border.all(
            color: selected ? context.primary : context.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: selected ? context.primary : context.card,
                shape: BoxShape.circle,
              ),
              child: Icon(
                selected ? Icons.check : value == 'student' ? Icons.person : Icons.school,
                color: selected ? context.primaryForeground : context.foreground,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: context.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    hint,
                    style: TypeScale.caption.copyWith(color: context.mutedForeground),
                  ),
                ],
              ),
            ),
            if (selected)
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: context.primary,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check, size: 12, color: Colors.white),
              ),
          ],
        ),
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onEdit;

  const _ReviewRow({required this.label, required this.value, required this.onEdit});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: context.border),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TypeScale.caption.copyWith(color: context.mutedForeground),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: TypeScale.body.copyWith(
                    color: context.foreground,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onEdit,
            child: Text(
              'Edit',
              style: TextStyle(
                color: context.primary,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
