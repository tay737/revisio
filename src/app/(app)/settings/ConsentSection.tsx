'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { applyConsentChange, blankConsent, consentFromBlob, type ConsentKey, type ConsentState } from '@/lib/consent';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';

const PURPOSES: { key: Exclude<ConsentKey, 'essential'>; label: string; description: string }[] = [
  { key: 'preferences', label: 'Preferences', description: 'Appearance, accessibility and app behaviour.' },
  { key: 'analytics', label: 'Analytics', description: 'Anonymous usage and product analytics to improve the service.' },
  { key: 'marketing', label: 'Marketing', description: 'Product updates and promotional messages.' },
  { key: 'notifications', label: 'Notifications', description: 'Non-essential in-app and email notifications.' },
  { key: 'profile', label: 'Profile fields', description: 'Which profile fields may appear on your public profile.' },
  { key: 'school', label: 'School / account data', description: 'Class and account data held for you or your child’s schooling.' },
  { key: 'research', label: 'Research', description: 'Anonymised product research and improvement.' },
];

export function ConsentSection() {
  const { me, loading } = useMe();
  const [state, setState] = useState<ConsentState>(blankConsent);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me) return;
    let active = true;
    void api.get<{ consent: unknown }>('/api/v1/consent').then((result) => {
      if (active) setState(consentFromBlob(result.consent));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'We could not load your saved choices.');
    });
    return () => { active = false; };
  }, [me?.id]);

  const change = (key: Exclude<ConsentKey, 'essential'>, value: boolean) => {
    setState((current) => applyConsentChange(current, { [key]: value }));
    setSaved(false);
    setError('');
  };

  const save = async () => {
    if (!me) return;
    setSaving(true);
    setError('');
    try {
      const next = { ...state, updatedAt: new Date().toISOString() };
      const result = await api.patch<{ consent: unknown }>('/api/v1/consent', {
        version: next.version,
        updatedAt: next.updatedAt,
        choices: next.choices,
      });
      setState(consentFromBlob(result.consent));
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not save your choices.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !me) return <div className="card p-5"><div className="h-4 w-24 rounded bg-secondary" /></div>;

  return (
    <section className="card p-5" aria-labelledby="how-we-use-your-data">
      <h2 id="how-we-use-your-data" className="t-strong">How we use your data</h2>
      <p className="t-caption mt-1 text-muted-foreground">
        Essential cookies, sessions and security are always on. You can change your other choices at any time.
      </p>
      <div className="mt-4 divide-y divide-border">
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-[14px] font-semibold">Essential</p>
            <p className="t-caption text-muted-foreground">Strictly necessary for sessions, security and the account.</p>
          </div>
          <span className="t-caption shrink-0">Always on</span>
        </div>
        {PURPOSES.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <label htmlFor={`consent-${key}`} className="text-[14px] font-semibold">{label}</label>
              <p className="t-caption text-muted-foreground">{description}</p>
            </div>
            <button
              id={`consent-${key}`}
              type="button"
              role="switch"
              aria-checked={state.choices[key]}
              aria-label={label}
              onClick={() => change(key, !state.choices[key])}
              className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors ${state.choices[key] ? 'bg-good' : 'bg-border-strong'}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm ${state.choices[key] ? 'left-[22px]' : 'left-0.5'}`} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save choices'}
        </Button>
      </div>
      <p className="t-fine mt-3 text-muted-foreground">
        Your choices are stored on your account and apply wherever you sign in.
      </p>
      {saved && <p className="t-fine mt-2 text-muted-foreground" role="status">Your consent choices have been saved.</p>}
      <Notice tone="bad" show={!!error}>{error}</Notice>
    </section>
  );
}
