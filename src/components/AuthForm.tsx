'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { api, setToken, ApiClientError } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/icons';
import { GlassCard } from '@/components/ui/motion/glass-card';
import { SPRING } from '@/lib/motion';

type LoginResponse = {
  accessToken?: string;
  user?: { id: string; role: string };
  mfaRequired?: boolean;
  verifyUrl?: string;
  pendingApproval?: boolean;
};

/**
 * Sign in / create account.
 *
 * Changes that matter to the person using it:
 *   • fields carry a leading glyph (the spec sanctions this on its own search
 *     input), so the form is scannable rather than a stack of grey pills;
 *   • the student/teacher choice is two labelled options with meaning, not a
 *     pair of bare buttons that require guessing;
 *   • every response — 2FA, unverified email, pending approval — lands in the
 *     same place and explains what happens next, instead of only appearing
 *     after a failed submit.
 */
export default function AuthForm({ mode, staff }: { mode: 'login' | 'register'; staff?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [classCode, setClassCode] = useState('');
  const [note, setNote] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaStage, setMfaStage] = useState(false);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [devLink, setDevLink] = useState('');

  useEffect(() => {
    fetch('/api/v1/auth/subjects-public')
      .then((r) => (r.ok ? r.json() : { subjects: [] }))
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const data = await api.post<LoginResponse>('/api/v1/auth/login', {
          email,
          password,
          totp: totp || undefined,
        });
        if (data.mfaRequired) {
          setMfaStage(true);
          setInfo('Enter the six-digit code from your authenticator app.');
          return;
        }
        setToken(data.accessToken ?? null);
        router.replace('/dashboard');
      } else {
        const data = await api.post<LoginResponse>('/api/v1/auth/register', {
          email,
          password,
          name,
          requestedRole: staff ? 'developer' : role,
          note: staff ? note : undefined,
          subjectIds: role === 'student' && !staff ? subjectIds : undefined,
          classCode: classCode || undefined,
        });
        if (data.pendingApproval) {
          setInfo('Account created. A developer reviews staff accounts before the first sign-in — you will get an email once it is approved.');
          return;
        }
        if (data.verifyUrl) {
          setInfo('Email delivery is not configured on this deployment, so here is your verification link.');
          setDevLink(data.verifyUrl);
          return;
        }
        setInfo('Account created. Check your inbox for the verification link, then sign in.');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'email_unverified') setUnverifiedEmail(email);
      else setError(err instanceof Error ? err.message : 'Something went wrong on our side. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setInfo('');
    setError('');
    setBusy(true);
    try {
      await api.put('/api/v1/auth/verify-email', { email: unverifiedEmail });
      setInfo(`Sent again to ${unverifiedEmail}. It can take a minute to arrive.`);
    } catch {
      setError('We could not re-send that right now. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'login'
      ? staff
        ? 'Staff sign in'
        : 'Welcome back'
      : staff
        ? 'Staff registration'
        : 'Create your account';

  const subtitle =
    mode === 'login'
      ? staff
        ? 'For teachers and developers.'
        : 'Your queue is where you left it.'
      : staff
        ? 'Developer accounts are approved before activation.'
        : 'Choose your subjects now — you can change them later.';

  return (
    <GlassCard tone="raised" className="p-6 sm:p-7">
      <h1 className="t-tagline">{title}</h1>
      <p className="t-caption mt-1.5 text-muted">{subtitle}</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'register' && !staff && (
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
        )}

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

        <Field icon="secure" label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            className="input pl-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
          />
        </Field>

        {mode === 'register' && !staff && (
          <>
            <fieldset>
              <legend className="label">I am joining as</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'student', label: 'Student', icon: 'start' as IconName, hint: 'Study my own subjects' },
                    { value: 'teacher', label: 'Teacher', icon: 'teacher' as IconName, hint: 'Run classes and share content' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value)}
                    aria-pressed={role === option.value}
                    className={`option ${role === option.value ? 'option-selected' : 'hover:bg-edge/20'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon name={option.icon} size={17} />
                      <span className="font-semibold">{option.label}</span>
                    </span>
                    <span className="t-caption mt-1 block text-muted">{option.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {role === 'student' && (
              <>
                {subjects.length > 0 && (
                  <div>
                    <span className="label">Subjects</span>
                    <div className="flex flex-wrap gap-2">
                      {subjects.map((s) => {
                        const on = subjectIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setSubjectIds((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))
                            }
                            className={`chip transition-colors duration-150 ${on ? 'chip-active' : ''}`}
                          >
                            {on && <Icon name="correct" size={13} />}
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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

            {role === 'teacher' && (
              <div>
                <label className="label" htmlFor="note">
                  Why do you need a teacher account?
                </label>
                <textarea
                  id="note"
                  className="input min-h-[80px]"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="School, role, subjects you teach…"
                />
                <p className="t-caption mt-1.5 text-muted">
                  A developer reads this before activating the account.
                </p>
              </div>
            )}
          </>
        )}

        {mode === 'register' && staff && (
          <div>
            <label className="label" htmlFor="staff-note">
              Why do you need a staff account?
            </label>
            <textarea
              id="staff-note"
              className="input min-h-[80px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Team, role, what you need access to…"
            />
          </div>
        )}

        <AnimatePresence initial={false}>
          {mfaStage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING.soft}
              className="overflow-hidden"
            >
              <Field icon="private" label="Two-factor code" htmlFor="totp">
                <input
                  id="totp"
                  className="input pl-11 tracking-[0.4em]"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  placeholder="000000"
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        <Notice tone="bad" show={!!error}>
          {error}
        </Notice>

        <Notice tone="accent" show={!!info}>
          <span>{info}</span>
          {devLink && (
            <a href={devLink} className="mt-1 block break-all text-accent underline">
              {devLink}
            </a>
          )}
        </Notice>

        {unverifiedEmail && (
          <button
            type="button"
            onClick={resendVerification}
            disabled={busy}
            className="btn-secondary w-full gap-2"
          >
            <Icon name="rotate" size={16} />
            Re-send the verification email
          </button>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Just a moment…' : mode === 'login' ? (mfaStage ? 'Verify and sign in' : 'Sign in') : 'Create account'}
        </button>
      </form>

      <p className="t-caption mt-5 text-center text-muted">
        {mode === 'login' ? (
          <>
            No account yet?{' '}
            <Link href={staff ? '/staff/register' : '/register'} className="text-accent hover:underline">
              {staff ? 'Request staff access' : 'Create one'}
            </Link>
          </>
        ) : (
          <>
            Already registered?{' '}
            <Link href={staff ? '/staff/login' : '/login'} className="text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </GlassCard>
  );
}

/**
 * Label + leading glyph + control. The glyph is positioned against the control
 * itself (not the whole field) so it stays centred in the pill whatever the
 * label above it does.
 */
function Field({
  icon,
  label,
  htmlFor,
  children,
}: {
  icon: IconName;
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-[13px] text-muted">
          <Icon name={icon} size={17} />
        </span>
        {children}
      </div>
    </div>
  );
}

function Notice({
  tone,
  show,
  children,
}: {
  tone: 'bad' | 'accent';
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.p
          role={tone === 'bad' ? 'alert' : 'status'}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={SPRING.soft}
          className={`t-caption rounded-[11px] px-3 py-2.5 ${
            tone === 'bad' ? 'bg-bad/10 text-bad' : 'bg-accent/10 text-accent'
          }`}
        >
          {children}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
