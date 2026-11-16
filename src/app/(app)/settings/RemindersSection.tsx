'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

type Prefs = {
  enabled: boolean;
  localTime: string;
  timezone: string;
  quietStart: string | null;
  quietEnd: string | null;
  triggers: Record<string, boolean>;
  channel: string;
  updatedAt: string | null;
};

type PrefsResponse = {
  prefs: Prefs;
  email: string | null;
  consentNotifications: boolean;
};

const TRIGGERS: { key: string; label: string; hint: string }[] = [
  { key: 'dueCards', label: 'Cards due', hint: 'A nudge when reviews are waiting.' },
  { key: 'streakRisk', label: 'Streak at risk', hint: 'When a day is about to slip.' },
  { key: 'seasonEnding', label: 'Season ending', hint: 'Before the weekly lobby closes.' },
  { key: 'achievement', label: 'Achievements', hint: 'When you earn a badge.' },
  { key: 'weeklyRecap', label: 'Weekly recap', hint: 'A Monday summary of your week — counts only, no content.' },
  { key: 'leagueEnding', label: 'League week ending', hint: 'Before your league week closes.' },
  { key: 'examCountdown', label: 'Exam countdown', hint: 'As a saved exam date gets close.' },
];

function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Reminder preferences (#11) — the opt-in surface for the retention emails the
 * cron sends. Everything here is off by default and the master switch is the
 * only thing that turns reminders on; the per-trigger rows fine-tune *what*
 * gets sent, never whether you are chased.
 *
 * Enabling requires the `notifications` consent purpose — the API refuses
 * with a 409 rather than half-enabling, so the section explains the gate
 * instead of letting the save fail silently.
 */
export function RemindersSection() {
  const [data, setData] = useState<PrefsResponse | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [consentNeeded, setConsentNeeded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = () => {
    setLoadFailed(false);
    setError('');
    void api
      .get<PrefsResponse>('/api/v1/notifications/prefs')
      .then((result) => {
        setData(result);
        // A learner who never saved prefs gets their own timezone prefilled —
        // the server default is UTC, which is rarely where they live.
        const next = { ...result.prefs };
        if (next.updatedAt === null) next.timezone = detectedTimezone();
        setPrefs(next);
      })
      .catch((cause) => {
        setLoadFailed(true);
        setError(cause instanceof Error ? cause.message : 'We could not load your reminder settings.');
      });
  };

  useEffect(load, []);

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC'];
    }
  }, []);

  if (!prefs) {
    if (loadFailed) {
      return (
        <Card as="section" className="p-6 text-center" aria-labelledby="reminders">
          <h2 id="reminders" className="t-strong">Reminders</h2>
          <p className="t-caption mt-2 text-muted-foreground">
            We couldn’t load your reminder settings. Check your connection and try again.
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={load}>
            Try again
          </Button>
        </Card>
      );
    }
    return (
      <Card as="section" className="p-5">
        <div className="h-4 w-32 rounded bg-secondary" />
      </Card>
    );
  }

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
    setSaved(false);
    setError('');
    setConsentNeeded(false);
  };

  const quietOn = prefs.quietStart !== null || prefs.quietEnd !== null;
  const setQuiet = (on: boolean) => {
    setPrefs((p) =>
      p
        ? { ...p, quietStart: on ? (p.quietStart ?? '22:00') : null, quietEnd: on ? (p.quietEnd ?? '08:00') : null }
        : p,
    );
    setSaved(false);
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError('');
    setConsentNeeded(false);
    try {
      const result = await api.put<PrefsResponse>('/api/v1/notifications/prefs', {
        enabled: prefs.enabled,
        localTime: prefs.localTime,
        timezone: prefs.timezone,
        quietStart: prefs.quietStart,
        quietEnd: prefs.quietEnd,
        triggers: prefs.triggers,
        // Preserved verbatim — there is no channel UI until push exists.
        channel: prefs.channel,
      });
      setPrefs(result.prefs);
      setData(result);
      setSaved(true);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 409) {
        setConsentNeeded(true);
      } else {
        setError(cause instanceof Error ? cause.message : 'We could not save your reminder settings.');
      }
    } finally {
      setSaving(false);
    }
  };

  const consentOff = data ? !data.consentNotifications : false;

  return (
    <Card as="section" className="p-5" aria-labelledby="reminders">
      <h2 id="reminders" className="t-strong">Reminders</h2>
      <p className="t-caption mt-1 text-muted-foreground">
        A gentle nudge when cards are due or your streak is at risk. Off unless you switch it on.
      </p>

      <div className="mt-4 divide-y divide-border">
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <label htmlFor="reminders-enabled" className="t-caption font-semibold">Email me reminders</label>
            <p className="t-caption text-muted-foreground">
              {data?.email ? `Sent to ${data.email}.` : 'Uses the email on your account.'}
            </p>
          </div>
          <button
            id="reminders-enabled"
            type="button"
            role="switch"
            aria-checked={prefs.enabled}
            aria-label="Email me reminders"
            onClick={() => set('enabled', !prefs.enabled)}
            className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-150 ${prefs.enabled ? 'bg-good' : 'bg-border-strong'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150 ease-[var(--ease-out)] ${prefs.enabled ? 'translate-x-5' : 'translate-x-0'}`}
              aria-hidden
            />
          </button>
        </div>

        {consentOff && (
          <div className="py-3">
            <Notice tone="note">
              Reminders need notification consent. Turn on{' '}
              <a href="#how-we-use-your-data" className="font-semibold underline underline-offset-2">
                Notifications
              </a>{' '}
              under How we use your data, save, then come back here.
            </Notice>
          </div>
        )}
        {consentNeeded && (
          <div className="py-3">
            <Notice tone="bad">
              The server still sees notifications as off — enable{' '}
              <a href="#how-we-use-your-data" className="font-semibold underline underline-offset-2">
                Notifications
              </a>{' '}
              under How we use your data first.
            </Notice>
          </div>
        )}

        <div className="grid gap-4 py-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="reminders-time">Send at</Label>
            <Input
              id="reminders-time"
              type="time"
              className="mt-1"
              value={prefs.localTime}
              onChange={(e) => set('localTime', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="reminders-tz">Timezone</Label>
            <NativeSelect
              id="reminders-tz"
              className="mt-1 w-full"
              value={prefs.timezone}
              onChange={(e) => set('timezone', e.target.value)}
            >
              {!timezones.includes(prefs.timezone) && <option value={prefs.timezone}>{prefs.timezone}</option>}
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <label htmlFor="reminders-quiet" className="t-caption font-semibold">Quiet hours</label>
            <p className="t-caption text-muted-foreground">No reminders while you sleep or study.</p>
          </div>
          <button
            id="reminders-quiet"
            type="button"
            role="switch"
            aria-checked={quietOn}
            aria-label="Quiet hours"
            onClick={() => setQuiet(!quietOn)}
            className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-150 ${quietOn ? 'bg-good' : 'bg-border-strong'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150 ease-[var(--ease-out)] ${quietOn ? 'translate-x-5' : 'translate-x-0'}`}
              aria-hidden
            />
          </button>
        </div>

        {quietOn && (
          <div className="grid gap-4 pb-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reminders-quiet-start">From</Label>
              <Input
                id="reminders-quiet-start"
                type="time"
                className="mt-1"
                value={prefs.quietStart ?? '22:00'}
                onChange={(e) => set('quietStart', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reminders-quiet-end">Until</Label>
              <Input
                id="reminders-quiet-end"
                type="time"
                className="mt-1"
                value={prefs.quietEnd ?? '08:00'}
                onChange={(e) => set('quietEnd', e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="py-3">
          <p className="t-caption font-semibold">What to remind me about</p>
          <div className="mt-2 divide-y divide-border/60">
            {TRIGGERS.map((t) => {
              const on = prefs.triggers[t.key] !== false;
              return (
                <div key={t.key} className="flex items-center justify-between gap-4 py-2.5">
                  <div>
                    <label htmlFor={`reminders-trigger-${t.key}`} className="t-caption font-medium">
                      {t.label}
                    </label>
                    <p className="t-fine text-muted-foreground">{t.hint}</p>
                  </div>
                  <button
                    id={`reminders-trigger-${t.key}`}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={t.label}
                    onClick={() => set('triggers', { ...prefs.triggers, [t.key]: !on })}
                    className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-150 ${on ? 'bg-good' : 'bg-border-strong'}`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150 ease-[var(--ease-out)] ${on ? 'translate-x-5' : 'translate-x-0'}`}
                      aria-hidden
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* No channel picker: delivery is email today and every reminder also
            lands in the in-app centre — a "push" or "in-app only" option would
            promise routing the backend does not have yet. */}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save reminders'}
        </Button>
        {saved && <span className="t-fine text-muted-foreground" role="status">Saved.</span>}
      </div>
      <Notice tone="bad" show={!!error}>{error}</Notice>
    </Card>
  );
}
