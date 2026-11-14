'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/Notice';
import { Field } from '@/components/AuthForm';
import { DUR, EASE, SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { isUnderAge, isValidDateOfBirth } from '@/lib/age';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { buttonVariants } from '@/lib/button-variants';
// education-level collection removed: no feature consumed the field, so there
// was no lawful basis for holding it (UK GDPR Art 5(1)(c)). Re-add alongside a
// consumer if one is ever wired up.

type Role = 'student' | 'teacher';
type StepKey = 'role' | 'study' | 'account' | 'profile' | 'review';
type Subject = { id: string; name: string };

const STEP_TITLES: Record<StepKey, { label: string; title: string }> = {
  role: { label: 'Role', title: 'Your role' },
  study: { label: 'Study', title: 'What you study' },
  account: { label: 'Account', title: 'Your account' },
  profile: { label: 'About you', title: 'About you' },
  review: { label: 'Review', title: 'Confirm' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The steps a role walks through. Motivation is highest before the friction:
 * a learner names what they study before being asked for an email and password.
 * Teachers skip the study step and a class code.
 */
function stepsFor(role: Role): StepKey[] {
  return role === 'student'
    ? ['role', 'study', 'account', 'profile', 'review']
    : ['role', 'account', 'profile', 'review'];
}

/** Rule-based strength, matching the server floor of 8 characters. */
function passwordStrength(pw: string): { score: number; label: string } {
  if (pw.length < 8) return { score: 0, label: 'Needs at least 8 characters' };
  const score = [
    pw.length >= 12,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ].filter(Boolean).length;
  const label = score >= 3 ? 'Strong' : score === 2 ? 'Good' : 'Fair';
  return { score: Math.max(1, score), label };
}

/**
 * Public sign-up as a guided, multi-step wizard. Each step owns one decision,
 * validates before the learner can leave it, and the last step shows what will
 * be created before anything is sent. Enter advances the step (it is one form),
 * so keyboard users never need the mouse to move through it.
 */
export default function RegisterWizard() {
  const [role, setRole] = useState<Role>('student');
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [note, setNote] = useState('');
  // education-level state removed (see note above).
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [classCode, setClassCode] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState('');
  // A problem the server pinned to one control, rendered beneath that control
  // instead of at the bottom of the step.
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; devLink?: string } | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const steps = useMemo(() => stepsFor(role), [role]);
  /** Where a step sits for this role, so the review screen's links cannot drift. */
  const at = (key: StepKey) => steps.indexOf(key);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex === steps.length - 1;
  const underConsentAge = isUnderAge(dateOfBirth);
  const strength = passwordStrength(password);

  useEffect(() => {
    fetch('/api/v1/auth/subjects-public')
      .then((r) => (r.ok ? r.json() : { subjects: [] }))
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => undefined);
  }, []);

  // Move focus to the new step's heading so a screen reader announces it and
  // the keyboard starts where the learner is. Skipped on first paint.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [stepIndex]);

  /** Returns the first problem with a step, or null when it may be left. Each
   *  problem names the control it belongs to, so the error renders under that
   *  control (UI-SYSTEM §8.3) instead of in a single notice at the bottom. */
  const validate = (key: StepKey): { field: string; message: string } | null => {
    if (key === 'account') {
      if (!name.trim()) return { field: 'name', message: 'Add your name so your teacher or classmates can recognise you.' };
      if (!EMAIL_RE.test(email.trim())) return { field: 'email', message: 'Enter an email address you can receive mail at.' };
      if (password.length < 8) return { field: 'password', message: 'Use at least 8 characters for your password.' };
    }
    if (key === 'profile' && role === 'student') {
      if (!isValidDateOfBirth(dateOfBirth)) return { field: 'dateOfBirth', message: 'Enter a valid date of birth that is not in the future.' };
      if (underConsentAge && !guardianConsent) return { field: 'ageConsent', message: 'A parent or guardian must confirm consent before continuing.' };
    }
    return null;
  };

  /** The step that owns a server-named field, so its message is on screen. */
  const stepForField = (field: string): StepKey | null => {
    // 'level' field no longer exists; removed.
    if (field === 'dateOfBirth' || field === 'ageConsent') return 'profile';
    if (field === 'name' || field === 'email' || field === 'password') return 'account';
    return null;
  };

  const goTo = (index: number) => {
    setError('');
    setFieldError(null);
    setDirection(index > stepIndex ? 1 : -1);
    setStepIndex(index);
  };

  const next = () => {
    const problem = validate(step);
    if (problem) {
      setFieldError(problem);
      setError('');
      // Focus the first failing control so keyboard and screen-reader users
      // land on it (UI-SYSTEM §8.3).
      requestAnimationFrame(() => {
        const id = problem.field === 'ageConsent' ? 'guardianConsent' : problem.field;
        const target = document.getElementById(id);
        target?.focus();
      });
      return;
    }
    setFieldError(null);
    goTo(stepIndex + 1);
  };

  const back = () => goTo(Math.max(0, stepIndex - 1));

  /** Re-checks every earlier step, so an edit made on the review screen can't slip past. */
  const submit = async () => {
    for (let i = 0; i < steps.length - 1; i++) {
      const problem = validate(steps[i]);
      if (problem) {
        setFieldError(problem);
        setError('');
        goTo(i);
        requestAnimationFrame(() => {
          const id = problem.field === 'ageConsent' ? 'guardianConsent' : problem.field;
          const target = document.getElementById(id);
          target?.focus();
        });
        return;
      }
    }
    setError('');
    setFieldError(null);
    setBusy(true);
    try {
      const student = role === 'student';
      const data = await api.post<{ verifyUrl?: string }>('/api/v1/auth/register', {
        email: email.trim(),
        password,
        name: name.trim(),
        requestedRole: role,
        role,
        note: student ? undefined : note,
        subjectIds: student ? subjectIds : undefined,
        classCode: student && classCode ? classCode : undefined,
        dateOfBirth: student ? dateOfBirth : undefined,
        ageConsent: student && underConsentAge ? guardianConsent : undefined,
      });
      setResult(
        data.verifyUrl
          ? {
              message: 'Email delivery is not configured on this deployment, so here is your verification link.',
              devLink: data.verifyUrl,
            }
          : { message: 'Account created. Check your inbox for the verification link, then sign in.' },
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.field) {
        const owner = stepForField(err.field);
        setFieldError({ field: err.field, message: err.message });
        setError('');
        if (owner) goTo(at(owner));
        // The control may mount with the step, so wait for that paint.
        requestAnimationFrame(() => {
          const id = err.field === 'ageConsent' ? 'guardianConsent' : err.field!;
          const target = document.getElementById(id) ?? document.getElementById('level-group') ?? headingRef.current;
          target?.focus();
        });
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong on our side. Try again in a moment.');
      }
    } finally {
      setBusy(false);
    }
  };

  const onFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isLast) void submit();
    else next();
  };

  if (result) {
    return (
      <Card className="p-6 shadow-[var(--shadow-card)] sm:p-7">
        <h1 className="t-title">{result.devLink ? 'You are in' : 'Check your inbox'}</h1>
        <Notice tone="note" show className="mt-5">
          <span>{result.message}</span>
          {result.devLink && (
            <a href={result.devLink} className="mt-1 block break-all text-foreground underline">
              {result.devLink}
            </a>
          )}
        </Notice>
        <Link href="/login" className={cn(buttonVariants({ variant: 'primary' }), 'mt-6 w-full')}>
          Go to sign in
        </Link>
      </Card>
    );
  }

  const subjectNames = subjects.filter((s) => subjectIds.includes(s.id)).map((s) => s.name);

  return (
    <Card className="p-6 shadow-[var(--shadow-card)] sm:p-7">
      <h1 className="t-title">Create your account</h1>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-label="Sign-up progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
          aria-valuetext={`Step ${stepIndex + 1} of ${steps.length}: ${STEP_TITLES[step].label}`}
          className="h-1 overflow-hidden rounded-full bg-border"
        >
          <motion.div
            className="h-full origin-left bg-foreground"
            initial={false}
            animate={{ scaleX: (stepIndex + 1) / steps.length }}
            transition={SPRING.meter}
          />
        </div>
        <p className="t-caption mt-2 text-muted-foreground" aria-hidden="true">
          Step {stepIndex + 1} of {steps.length} · {STEP_TITLES[step].label}
        </p>
      </div>

      <form onSubmit={onFormSubmit} className="mt-6" aria-labelledby="wizard-step-title">
        <div className="grid overflow-hidden">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="col-start-1 row-start-1 space-y-4"
            >
              <h2
                id="wizard-step-title"
                ref={headingRef}
                tabIndex={-1}
                className="t-display-sm outline-none"
              >
                {STEP_TITLES[step].title}
              </h2>

              {step === 'role' && (
                <fieldset className="m-0 space-y-2 border-0 p-0">
                  <legend className="sr-only">I am joining as</legend>
                  {(
                    [
                      { value: 'student', label: 'Student', icon: 'start', hint: 'Study my own subjects, at my own pace' },
                      { value: 'teacher', label: 'Teacher', icon: 'teacher', hint: 'Run classes and share content' },
                    ] as const
                  ).map((option) => {
                    const selected = role === option.value;
                    return (
                      <button
                          key={option.value}
                          type="button"
                          onClick={() => setRole(option.value)}
                          aria-pressed={selected}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors duration-150',
                            selected ? 'border-foreground bg-card' : 'border-border bg-card hover:border-foreground/40',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full',
                              selected ? 'bg-foreground text-background' : 'bg-secondary text-foreground',
                            )}
                          >
                            <Icon name={option.icon} size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{option.label}</span>
                            <span className="t-caption mt-0.5 block text-muted-foreground">{option.hint}</span>
                          </span>
                          {selected && (
                            <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-foreground text-background">
                              <Icon name="correct" size={12} />
                            </span>
                          )}
                        </button>
                    );
                  })}
                </fieldset>
              )}

              {step === 'account' && (
                <>
                  <Field
                    icon="person"
                    label="Full name"
                    htmlFor="name"
                    error={fieldError?.field === 'name' ? fieldError.message : undefined}
                    errorId="name-error"
                  >
                    <Input
                      id="name"
                      className="pl-11"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="Your name"
                      aria-invalid={fieldError?.field === 'name' || undefined}
                      aria-describedby={fieldError?.field === 'name' ? 'name-error' : undefined}
                    />
                  </Field>
                  <Field
                    icon="mail"
                    label="Email"
                    htmlFor="email"
                    error={fieldError?.field === 'email' ? fieldError.message : undefined}
                    errorId="email-error"
                  >
                    <Input
                      id="email"
                      type="email"
                      className="pl-11"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      spellCheck={false}
                      autoCapitalize="none"
                      placeholder="you@example.com"
                      aria-invalid={fieldError?.field === 'email' || undefined}
                      aria-describedby={fieldError?.field === 'email' ? 'email-error' : undefined}
                    />
                  </Field>
                  <div>
                    <Field
                      icon="secure"
                      label="Password"
                      htmlFor="password"
                      error={fieldError?.field === 'password' ? fieldError.message : undefined}
                      errorId="password-error"
                    >
                      <Input
                        id="password"
                        type="password"
                        className="pl-11"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        aria-invalid={fieldError?.field === 'password' || undefined}
                        aria-describedby={
                          fieldError?.field === 'password' ? 'password-strength password-error' : 'password-strength'
                        }
                      />
                    </Field>
                    <div className="mt-2 flex items-center gap-2" id="password-strength" aria-live="polite">
                      <div className="flex flex-1 gap-1" aria-hidden="true">
                        {[1, 2, 3, 4].map((n) => (
                          <span
                            key={n}
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors duration-200',
                              password.length > 0 && n <= strength.score ? 'bg-foreground' : 'bg-border',
                            )}
                          />
                        ))}
                      </div>
                      <span className="t-fine text-muted-foreground">{password ? strength.label : ''}</span>
                    </div>
                  </div>
                </>
              )}

              {step === 'profile' && role === 'student' && (
                <>
                  <Field
                    icon="person"
                    label="Your date of birth"
                    htmlFor="dateOfBirth"
                    error={fieldError?.field === 'dateOfBirth' ? fieldError.message : undefined}
                    errorId="dateOfBirth-error"
                  >
                    <Input
                      id="dateOfBirth"
                      type="date"
                      className="pl-11"
                      value={dateOfBirth}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => {
                        setDateOfBirth(event.target.value);
                        setGuardianConsent(false);
                      }}
                      required
                      autoComplete="bday"
                      aria-invalid={fieldError?.field === 'dateOfBirth' || undefined}
                      aria-describedby={
                        fieldError?.field === 'dateOfBirth'
                          ? 'age-consent-hint dateOfBirth-error'
                          : 'age-consent-hint'
                      }
                    />
                  </Field>
                  <p id="age-consent-hint" className="t-fine text-muted-foreground">
                    {underConsentAge
                      ? 'A parent or legal guardian must complete this registration.'
                      : 'We use this only to check whether guardian consent is required; it is not stored for learners aged 13 or older.'}
                  </p>
                  <AnimatePresence initial={false}>
                    {underConsentAge && (
                      <motion.label
                        key="consent"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={SPRING.soft}
                        className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3"
                      >
                        <input
                          id="guardianConsent"
                          type="checkbox"
                          className="mt-1 h-5 w-5 shrink-0"
                          checked={guardianConsent}
                          onChange={(event) => setGuardianConsent(event.target.checked)}
                          required
                          aria-invalid={fieldError?.field === 'ageConsent' || undefined}
                          aria-describedby={fieldError?.field === 'ageConsent' ? 'ageConsent-error' : undefined}
                        />
                        <span className="t-caption">
                          I am this learner's parent or guardian, and I agree to Revisio using their details to run their account.
                          <a href="mailto:tayyab@outlook.jp" className="mt-1 block underline underline-offset-4">Contact support to withdraw this.</a>
                        </span>
                      </motion.label>
                    )}
                  </AnimatePresence>
                  {underConsentAge && fieldError?.field === 'ageConsent' && (
                    <p id="ageConsent-error" role="alert" className="t-fine font-medium text-destructive-ink">
                      {fieldError.message}
                    </p>
                  )}
                </>
              )}

              {step === 'profile' && role === 'teacher' && (
                <div>
                  <Label htmlFor="note">
                    Why do you need a teacher account?
                  </Label>
                  <Textarea
                    id="note"
                    className="min-h-[96px]"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="School, role, subjects you teach…"
                  />
                  <p className="t-caption mt-1.5 text-muted-foreground">A developer reads this before activating the account.</p>
                </div>
              )}

              {step === 'study' && (
                <>
                  <div>
                    <Label>Subjects</Label>
                    {subjects.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {subjects.map((s) => {
                          const on = subjectIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setSubjectIds((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                              className={`chip transition-colors duration-150 ${on ? 'chip-active' : ''}`}
                            >
                              {on && <Icon name="correct" size={13} />}
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="t-caption text-muted-foreground">No subjects are published yet. You can choose them later.</p>
                    )}
                    <p className="t-caption mt-2 text-muted-foreground">You can change these at any time.</p>
                  </div>
                  <Field icon="join" label="Class code (optional)" htmlFor="classCode">
                    <Input
                      id="classCode"
                      className="pl-11 uppercase tracking-[0.2em]"
                      value={classCode}
                      onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      placeholder="B7K2QM"
                    />
                  </Field>
                </>
              )}

              {step === 'review' && (
                <dl className="divide-y divide-border rounded-lg border border-border">
                  <ReviewRow label="Role" value={role === 'student' ? 'Student' : 'Teacher'} onEdit={() => goTo(at('role'))} />
                  {role === 'student' && (
                    <>
                      <ReviewRow
                        label="Subjects"
                        value={subjectNames.length ? subjectNames.join(', ') : 'None yet'}
                        onEdit={() => goTo(at('study'))}
                      />
                      {classCode && (
                        <ReviewRow label="Class code" value={classCode} onEdit={() => goTo(at('study'))} />
                      )}
                    </>
                  )}
                  <ReviewRow label="Name" value={name.trim()} onEdit={() => goTo(at('account'))} />
                  <ReviewRow label="Email" value={email.trim()} onEdit={() => goTo(at('account'))} />
                  {role === 'student'
                    ? dateOfBirth && (
                        <ReviewRow label="Date of birth" value={dateOfBirth} onEdit={() => goTo(at('profile'))} />
                      )
                    : note.trim() && (
                        <ReviewRow label="Reason" value={note.trim()} onEdit={() => goTo(at('profile'))} />
                      )}
                </dl>
              )}

              <Notice tone="bad" show={!!error}>
                {error}
              </Notice>

              <div className="flex items-center gap-3 pt-2">
                {stepIndex > 0 && (
                  <Button variant="secondary" type="button" onClick={back} disabled={busy} className="shrink-0">
                    Back
                  </Button>
                )}
                {isLast ? (
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? 'Creating your account…' : 'Create account'}
                  </Button>
                ) : (
                  <Button type="submit" className="flex-1 gap-2">
                    Continue
                    <Icon name="next" size={16} />
                  </Button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </form>

      <p className="t-caption mt-5 text-center text-muted-foreground">
        Already registered?{' '}
        <Link href="/login" className="tap-link text-foreground underline underline-offset-4 hover:text-primary/80">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

/** Directional slide: forward enters from the right, back from the left. */
const stepVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0, transition: SPRING.settle },
  exit: (d: number) => ({ opacity: 0, x: d * -28, transition: { duration: DUR.quick, ease: EASE.in } }),
};

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <dt className="t-caption text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words t-body font-medium">{value}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 t-caption font-medium text-foreground hover:underline">
        Edit<span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}
