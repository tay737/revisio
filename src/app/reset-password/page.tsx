'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { AuthShell } from '@/components/AuthShell';

type LoginResponse = { accessToken?: string };

function ResetPasswordInner() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const usable = !!token && password.length >= 8 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usable) return;
    setError('');
    setBusy(true);
    try {
      const data = await api.post<LoginResponse>('/api/v1/auth/password-reset/confirm', {
        token,
        password,
      });
      if (data.accessToken) setToken(data.accessToken);
      // The reset revoked every refresh token server-side, including any this
      // browser held, so a stale cookie must not resurrect an old session.
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That link did not work. Request a fresh one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell footer={<Link href="/login" className="transition-colors hover:text-foreground">Back to sign in</Link>}>
      <div className="card p-6 sm:p-7">
        {!token ? (
          <>
            <h1 className="t-tagline">That link is missing its token</h1>
            <p className="t-caption mt-2 text-muted-foreground">
              Open the reset link from your email, or start again.
            </p>
            <Link href="/forgot-password" className="btn btn-primary mt-5 w-full">
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="t-tagline">Choose a new password</h1>
            <p className="t-caption mt-1.5 text-muted-foreground">
              At least 8 characters. Saving it signs out every other device.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="new-password">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  autoFocus
                />
              </div>
              <div>
                <label className="label" htmlFor="confirm-password">
                  Repeat it
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-invalid={mismatch}
                  placeholder="Same again"
                />
                {mismatch && (
                  <p className="t-fine mt-1 text-destructive">The two don&apos;t match yet.</p>
                )}
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2.5 text-[14px] text-destructive" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={!usable || busy}>
                {busy ? 'Saving…' : 'Save and sign in'}
              </button>
            </form>

            <p className="t-caption mt-5 text-muted-foreground">
              Your work — streak, XP, schedule — is untouched. Only the password changes.
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <p className="px-6 py-10 text-center text-[14px] text-muted-foreground" role="status">
          Loading…
        </p>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
