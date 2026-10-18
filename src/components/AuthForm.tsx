'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { api, setToken, ApiClientError } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/icons';
import { SPRING } from '@/lib/motion';
import { Notice } from '@/components/Notice';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { MagicCard } from '@/components/ui/magic-card';

type LoginResponse = {
  accessToken?: string;
  user?: { id: string; role: string };
  mfaRequired?: boolean;
  verifyUrl?: string;
  pendingApproval?: boolean;
};

/**
 * Sign in, and staff registration. Public student/teacher sign-up is the
 * multi-step RegisterWizard; this form stays a single screen because staff
 * access asks for one justification, not a journey.
 *
 * Every response — 2FA, unverified email, pending approval — lands in the same
 * place and explains what happens next, instead of only appearing after a
 * failed submit.
 */
export default function AuthForm({ mode, staff }: { mode: 'login' | 'register'; staff?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaStage, setMfaStage] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [devLink, setDevLink] = useState('');

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
          requestedRole: 'developer',
          note,
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
    mode === 'login' ? (staff ? 'Staff sign in' : 'Welcome back') : 'Staff registration';

  const subtitle =
    mode === 'login'
      ? staff
        ? 'For teachers and developers.'
        : 'Your queue is where you left it.'
      : 'Developer accounts are approved before activation.';

  return (
    <MagicCard className="rounded-2xl p-0">
      <div className="card p-6 shadow-[var(--shadow-card)] sm:p-7">
      <h1 className="t-tagline">{title}</h1>
      <p className="t-caption mt-1.5 text-muted-foreground">{subtitle}</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
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

        {mode === 'register' && (
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

        <Notice tone="note" show={!!info}>
          <span>{info}</span>
          {devLink && (
            <a href={devLink} className="mt-1 block break-all text-primary underline">
              {devLink}
            </a>
          )}
        </Notice>

        {unverifiedEmail && (
          <button
            type="button"
            onClick={resendVerification}
            disabled={busy}
            className="btn btn-secondary w-full gap-2"
          >
            <Icon name="rotate" size={16} />
            Re-send the verification email
          </button>
        )}

        <ShimmerButton type="submit" disabled={busy} className="w-full">
          <span className="text-sm font-medium">
            {busy ? 'Just a moment…' : mode === 'login' ? (mfaStage ? 'Verify and sign in' : 'Sign in') : 'Create account'}
          </span>
        </ShimmerButton>
      </form>

      <p className="t-caption mt-5 text-center text-muted-foreground">
        {mode === 'login' ? (
          <>
            No account yet?{' '}
            <Link href="/staff/register" className="text-primary underline underline-offset-4 hover:text-primary/80">
              Request staff access
            </Link>
          </>
        ) : (
          <>
            Already registered?{' '}
            <Link href="/staff/login" className="text-primary underline underline-offset-4 hover:text-primary/80">
              Sign in
            </Link>
          </>
        )}
      </p>

      {/* The recovery path lives under the password field, where a locked-out
          learner is actually looking, not only in the footer. */}
      {mode === 'login' && (
        <p className="t-caption mt-1.5 text-center">
          <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
            Forgot your password?
          </Link>
        </p>
      )}
      </div>
    </MagicCard>
  );
}

/**
 * Label + leading glyph + control. The glyph is positioned against the control
 * itself (not the whole field) so it stays centred in the pill whatever the
 * label above it does.
 */
export function Field({
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
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Icon name={icon} size={17} />
        </span>
        {children}
      </div>
    </div>
  );
}
