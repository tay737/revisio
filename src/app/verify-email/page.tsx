'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type State =
  | { kind: 'verifying' }
  | { kind: 'done' }
  | { kind: 'error'; message: string; email?: string };

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ kind: token ? 'verifying' : 'error', message: token ? '' : 'No verification token in link.' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setState({ kind: 'done' });
        else setState({ kind: 'error', message: data?.error?.message ?? 'Verification failed.' });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'Network error — please try again.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const resend = async () => {
    const email = window.prompt('Enter your account email to re-send the verification link:');
    if (!email) return;
    await fetch('/api/v1/auth/verify-email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setState({ kind: 'error', message: 'If that address has an unverified account, a new link is on its way.', email });
  };

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex items-center justify-center gap-2 text-xl font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-ink">R</span>
          Revisio
        </div>

        {state.kind === 'verifying' && <p className="animate-pulse text-muted">Verifying your email…</p>}

        {state.kind === 'done' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Email verified 🎉</h1>
            <p className="mt-2 text-muted">Your account is active. Time to learn it once.</p>
            <Link href="/login" className="btn-primary mt-6 inline-block px-6 py-2.5">Sign in</Link>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Verification problem</h1>
            <p className="mt-2 text-muted">{state.message}</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={resend} className="btn-ghost">Re-send email</button>
              <Link href="/login" className="btn-primary px-5 py-2.5">Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center"><p className="animate-pulse text-muted">Loading…</p></main>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
