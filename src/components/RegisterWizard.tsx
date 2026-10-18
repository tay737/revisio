'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { MagicCard } from '@/components/ui/magic-card';
import { Notice } from '@/components/Notice';
import { Field } from '@/components/AuthForm';
import { DUR, EASE, SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { isUnderAge, isValidDateOfBirth } from '@/lib/age';

type Role = 'student' | 'teacher';
type StepKey = 'role' | 'account' | 'profile' | 'subjects' | 'review';
type Subject = { id: string; name: string };

const STEP_TITLES: Record<StepKey, { label: string; title: string }> = {
  role: { label: 'Role', title: 'How will you use Revisio?' },
  account: { label: 'Account', title: 'Create your sign-in' },
  profile: { label: 'About you', title: 'A little about you' },
  subjects: { label: 'Subjects', title: 'What are you studying?' },
  review: { label: 'Review', title: 'Check and create' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The steps a role walks through. Teachers skip subjects and a class code. */
function stepsFor(role: Role): StepKey[] {
  return role === 'student'
    ? ['role', 'account', 'profile', 'subjects', 'review']
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
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [classCode, setClassCode] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; devLink?: string } | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const steps = useMemo(() => stepsFor(role), [role]);
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

  /** Returns the first problem with a step, or null when it may be left. */
  const validate = (key: StepKey): string | null => {
    if (key === 'account') {
      if (!name.trim()) return 'Add your name so your teacher or classmates can recognise you.';
      if (!EMAIL_RE.test(email.trim())) return 'Enter an email address you can receive mail at.';
      if (password.length < 8) return 'Use at least 8 characters for your password.';
    }
    if (key === 'profile' && role === 'student') {
      if (!isValidDateOfBirth(dateOfBirth)) return 'Enter a valid date of birth that is not in the future.';
      if (underConsentAge && !guardianConsent) return 'A parent or guardian must confirm consent before continuing.';
    }
    return null;
  };

  const goTo = (index: number) => {
    setError('');
    setDirection(index > stepIndex ? 1 : -1);
    setStepIndex(index);
  };

  const next = () => {
    const problem = validate(step);
    if (problem) {
      setError(problem);
      return;
    }
    goTo(stepIndex + 1);
  };

  const back = () => goTo(Math.max(0, stepIndex - 1));

  /** Re-checks every earlier step, so an edit made on the review screen can't slip past. */
  const submit = async () => {
    for (let i = 0; i < steps.length - 1; i++) {
      const problem = validate(steps[i]);
      if (problem) {
        setError(problem);
        goTo(i);
        return;
      }
    }
    setError('');
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
      setError(err instanceof Error ? err.message : 'Something went wrong on our side. Try again in a moment.');
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
      <div className="card p-6 shadow-[var(--shadow-card)] sm:p-7">
        <h1 className="t-tagline">You are in</h1>
        <Notice tone="note" show className="mt-5">
          <span>{result.message}</span>
          {result.devLink && (
            <a href={result.devLink} className="mt-1 block break-all text-primary underline">
              {result.devLink}
            </a>
          )}
        </Notice>
        <Link href="/login" className="btn btn-primary mt-6 w-full">
          Go to sign in
        </Link>
      </div>
    );
  }

  const subjectNames = subjects.filter((s) => subjectIds.includes(s.id)).map((s) => s.name);

  return (
    <div className="card p-6 shadow-[var(--shadow-card)] sm:p-7">
      <h1 className="t-tagline">Create your account</h1>

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
                className="t-title font-semibold outline-none"
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
                      <MagicCard key={option.value} className="rounded-2xl p-0">
                        <button
                          type="button"
                          onClick={() => setRole(option.value)}
                          aria-pressed={selected}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-[colors,transform] duration-150 active:scale-[0.98]',
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
                      </MagicCard>
                    );
                  })}
                </fieldset>
              )}

              {step === 'account' && (
                <>
                  <Field icon="person" label="Full name" htmlFor="name">
                    <input
                      id="name"
                      className="input pl-11"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="Ada Lovelace"
                    />
                  </Field>
                  <Field icon="mail" label="Email" htmlFor="email">
                    <input
                      id="email"
                      type="email"
                      className="input pl-11"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="you@school.edu"
                    />
                  </Field>
                  <div>
                    <Field icon="secure" label="Password" htmlFor="password">
                      <input
                        id="password"
                        type="password"
                        className="input pl-11"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        aria-describedby="password-strength"
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
                  <Field icon="person" label="Learner’s date of birth" htmlFor="dateOfBirth">
                    <input
                      id="dateOfBirth"
                      type="date"
                      className="input pl-11"
                      value={dateOfBirth}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => {
                        setDateOfBirth(event.target.value);
                        setGuardianConsent(false);
                      }}
                      required
                      autoComplete="bday"
                      aria-describedby="age-consent-hint"
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
                          type="checkbox"
                          className="mt-1 h-5 w-5 shrink-0"
                          checked={guardianConsent}
                          onChange={(event) => setGuardianConsent(event.target.checked)}
                          required
                        />
                        <span className="t-caption">
                          I am the parent or legal guardian creating this learner’s account, and I consent to Revisio processing their information to provide the service. I can withdraw this consent by contacting support.
                        </span>
                      </motion.label>
                    )}
                  </AnimatePresence>
                </>
              )}

              {step === 'profile' && role === 'teacher' && (
                <div>
                  <label className="label" htmlFor="note">
                    Why do you need a teacher account?
                  </label>
                  <textarea
                    id="note"
                    className="input min-h-[96px]"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="School, role, subjects you teach…"
                  />
                  <p className="t-caption mt-1.5 text-muted-foreground">A developer reads this before activating the account.</p>
                </div>
              )}

              {step === 'subjects' && (
                <>
                  <div>
                    <span className="label">Subjects</span>
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
                    <input
                      id="classCode"
                      className="input pl-11 uppercase tracking-[0.2em]"
                      value={classCode}
                      onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      placeholder="B7K2QM"
                    />
                  </Field>
                </>
              )}

              {step === 'review' && (
                <dl className="divide-y divide-border rounded-2xl border border-border">
                  <ReviewRow label="Role" value={role === 'student' ? 'Student' : 'Teacher'} onEdit={() => goTo(0)} />
                  <ReviewRow label="Name" value={name.trim()} onEdit={() => goTo(1)} />
                  <ReviewRow label="Email" value={email.trim()} onEdit={() => goTo(1)} />
                  {role === 'student' ? (
                    <>
                      <ReviewRow label="Date of birth" value={dateOfBirth} onEdit={() => goTo(2)} />
                      <ReviewRow
                        label="Subjects"
                        value={subjectNames.length ? subjectNames.join(', ') : 'None yet'}
                        onEdit={() => goTo(3)}
                      />
                      {classCode && <ReviewRow label="Class code" value={classCode} onEdit={() => goTo(3)} />}
                    </>
                  ) : (
                    note.trim() && <ReviewRow label="Reason" value={note.trim()} onEdit={() => goTo(2)} />
                  )}
                </dl>
              )}

              <Notice tone="bad" show={!!error}>
                {error}
              </Notice>

              <div className="flex items-center gap-3 pt-2">
                {stepIndex > 0 && (
                  <button type="button" onClick={back} disabled={busy} className="btn btn-secondary shrink-0 active:scale-[0.98] transition-transform">
                    Back
                  </button>
                )}
                {isLast ? (
                  <ShimmerButton type="submit" disabled={busy} className="w-full">
                    <span className="text-sm font-medium">{busy ? 'Just a moment…' : 'Create account'}</span>
                  </ShimmerButton>
                ) : (
                  <button type="submit" className="btn btn-primary flex-1 gap-2 active:scale-[0.98] transition-transform">
                    Continue
                    <Icon name="next" size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </form>

      <p className="t-caption mt-5 text-center text-muted-foreground">
        Already registered?{' '}
        <Link href="/login" className="text-primary underline underline-offset-4 hover:text-primary/80">
          Sign in
        </Link>
      </p>
    </div>
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
        <dd className="mt-0.5 break-words text-[15px] font-medium">{value}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-[13px] font-medium text-primary hover:underline">
        Edit<span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}
