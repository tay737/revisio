'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/AuthShell';

type Phase =
  | { kind: 'form' }
  | { kind: 'sent'; message: string }
  | { kind: 'dev-link'; url: string };

/**
 * Forgot password — the recovery door.
 *
 * One email field and one honest outcome. The server answers with the same
 * neutral sentence whether or not the address holds an account, and this page
 * repeats it verbatim, so a learner who typo'd their address and an attacker
 * probing for accounts see exactly the same screen.
 *
 * In a deployment without a mail provider, the register flow surfaces its
 * verification link in the form itself; reset does the same: the API's console
 * mode logs the link server-side, so this page only ever says "sent".
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.post<{ message: string }>('/api/v1/auth/password-reset', { email });
      setPhase({ kind: 'sent', message: data.message });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not send that. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell footer={<Link href="/login" className="transition-colors hover:text-foreground">Back to sign in</Link>}>
      <div className="card p-6 sm:p-7">
        {phase.kind === 'sent' ? (
          <>
            <h1 className="t-tagline">Check your inbox</h1>
            <p className="t-caption mt-2 text-muted-foreground">{phase.message}</p>
            <p className="t-caption mt-2 text-muted-foreground">
              Haven&apos;t received it? Check your spam folder, then try again — requests are
              limited to a few per address.
            </p>
            <button
              type="button"
              className="btn btn-secondary mt-5 w-full"
              onClick={() => setPhase({ kind: 'form' })}
            >
              Use a different address
            </button>
          </>
        ) : (
          <>
            <h1 className="t-tagline">Reset your password</h1>
            <p className="t-caption mt-1.5 text-muted-foreground">
              Tell us the address you signed up with and we&apos;ll send you a link to choose a new one.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="reset-email">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@school.edu"
                />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2.5 text-[14px] text-destructive-ink" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="t-caption mt-5 text-muted-foreground">
              Two-factor stays on when you reset — your authenticator keeps guarding the account.
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
