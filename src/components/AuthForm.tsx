'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken, ApiClientError } from '@/lib/api';

type LoginResponse = {
  accessToken?: string;
  user?: { id: string; role: string };
  mfaRequired?: boolean;
  verifyUrl?: string;
  pendingApproval?: boolean;
};

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
    // subjects list for the registration picker
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
        const data = await api.post<LoginResponse>('/api/v1/auth/login', { email, password, totp: totp || undefined });
        if (data.mfaRequired) {
          setMfaStage(true);
          setInfo('Enter the 6-digit code from your authenticator app.');
          return;
        }
        setToken(data.accessToken ?? null);
        router.replace('/dashboard');
      } else {
        const data = await api.post<LoginResponse>(staff ? '/api/v1/auth/register' : '/api/v1/auth/register', {
          email, password, name,
          requestedRole: staff ? 'developer' : role,
          note: staff ? note : undefined,
          subjectIds: role === 'student' ? subjectIds : undefined,
          classCode: classCode || undefined,
        });
        if (data.pendingApproval) {
          setInfo('Account created. A developer must approve staff accounts before first sign-in.');
          return;
        }
        if (data.verifyUrl) {
          // Mail provider not configured: show the link directly (dev/self-host).
          setInfo('Email delivery is not configured on this deployment. Verify with this link:');
          setDevLink(data.verifyUrl);
          return;
        }
        setInfo('Account created! Check your inbox for a verification link, then sign in.');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'email_unverified') setUnverifiedEmail(email);
      else setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setInfo('');
    setBusy(true);
    try {
      await api.put('/api/v1/auth/verify-email', { email: unverifiedEmail });
      setInfo(`Verification link re-sent to ${unverifiedEmail}. Check your inbox.`);
    } catch {
      setError('Could not re-send right now — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">
        {mode === 'login' ? (staff ? 'Staff sign in' : 'Welcome back') : staff ? 'Staff registration' : 'Create your account'}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === 'login'
          ? staff ? 'Teachers and developers only.' : 'Sign in to continue your streak.'
          : staff ? 'Developer accounts require approval before activation.' : 'Pick your subjects and start learning.'}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'register' && (
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ada Lovelace" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@school.edu" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" />
        </div>

        {mode === 'register' && !staff && (
          <>
            <div className="flex gap-2 text-sm">
              {(['student', 'teacher'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`flex-1 rounded-xl border px-3 py-2 font-medium capitalize transition-colors ${role === r ? 'border-accent bg-accent/10 text-accent' : 'border-edge'}`}>
                  {r}
                </button>
              ))}
            </div>
            {role === 'student' && (
              <>
                <div>
                  <span className="label">Subjects</span>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <button key={s.id} type="button"
                        onClick={() => setSubjectIds((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                        className={`chip transition-colors ${subjectIds.includes(s.id) ? '!border-accent !text-accent' : ''}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="classCode">Class code (optional)</label>
                  <input id="classCode" className="input uppercase" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} maxLength={6} placeholder="e.g. B7K2QM" />
                </div>
              </>
            )}
            {role === 'teacher' && (
              <div>
                <label className="label" htmlFor="note">Why do you need a teacher account?</label>
                <textarea id="note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="School, role, subjects…" />
                <p className="mt-1 text-xs text-muted">Teacher accounts are approved by a developer before activation.</p>
              </div>
            )}
          </>
        )}

        {mode === 'login' && staff && (
          <div>
            <label className="label" htmlFor="note">Staff note (registration)</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only needed when registering" />
          </div>
        )}

        {mfaStage && (
          <div>
            <label className="label" htmlFor="totp">Two-factor code</label>
            <input id="totp" className="input tracking-[0.4em]" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} maxLength={6} inputMode="numeric" autoFocus />
          </div>
        )}

        {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {unverifiedEmail && (
          <button type="button" onClick={resendVerification} disabled={busy} className="text-sm font-medium text-accent hover:underline">
            Re-send verification email
          </button>
        )}
        {info && <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent">{info}</p>}
        {devLink && (
          <a href={devLink} className="block break-all rounded-xl bg-edge/60 px-3 py-2 text-sm text-accent underline">
            {devLink}
          </a>
        )}

        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? '…' : mode === 'login' ? (mfaStage ? 'Verify & sign in' : 'Sign in') : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {mode === 'login' ? (
          <>No account? <Link href={staff ? '/staff/register' : '/register'} className="font-medium text-accent hover:underline">{staff ? 'Register (approval required)' : 'Create one'}</Link></>
        ) : (
          <>Already registered? <Link href={staff ? '/staff/login' : '/login'} className="font-medium text-accent hover:underline">Sign in</Link></>
        )}
      </p>
    </div>
  );
}
