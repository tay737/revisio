'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { applyConsentChange, blankConsent, consentFromBlob, purposeDescription, type ConsentKey, type ConsentState } from '@/lib/consent';
import { api, getToken } from '@/lib/api';

// A consent manager that is pure and server-safe so the banner and the route
// layer can never disagree about what is on or off. The banner only renders
// when a guard says it is safe to do so, and it never makes a network call to
// decide what to show.

/** The user's saved choices, or the empty state if none are stored yet. */
export type UserConsent = ConsentState;

/**
 * Decision of whether the banner may render now.
 *
 * - `show=false`  — the user has already made a choice, so the banner is not
 *   re-posed; the settings page holds the detail.
 * - `show=true`   — the user has never chosen, so the banner is the first
 *   meaningful privacy UX on the page.
 * - `hide=true`   — the page is exempt from consent (e.g. a doc page or a
 *   public asset); the banner must not appear at all.
 *
 * The guard is read from localStorage so it works before any fetch; it never
 * gates access to the Service — it only gates the *banner*.
 */
const BANNER_KEY = 'revisio.cookie-consent';

interface StoredConsentRecord {
  version: number;
  decidedAt: string;
  consent: UserConsent;
}

/** True when the current path is explicitly exempt from the consent banner. */
function isBannerExempt(path: string): boolean {
  return (
    path.startsWith('/privacy') ||
    path.startsWith('/cookie-policy') ||
    path.startsWith('/terms') ||
    path.startsWith('/accessibility')
  );
}

function readStoredConsent(): { consent: UserConsent; decidedAt: string | null; failed: boolean } {
  try {
    const raw = localStorage.getItem(BANNER_KEY);
    if (!raw) return { consent: blankConsent(), decidedAt: null, failed: false };
    const record = JSON.parse(raw) as { consent?: unknown; choices?: unknown; decidedAt?: unknown; show?: unknown };
    const consent = consentFromBlob(record.consent ?? record.choices ?? record);
    const decidedAt = typeof record.decidedAt === 'string'
      ? record.decidedAt
      : record.show === false
        ? consent.updatedAt
        : null;
    return { consent, decidedAt, failed: false };
  } catch {
    return { consent: blankConsent(), decidedAt: null, failed: true };
  }
}

function writeConsentRecord(consent: UserConsent, decidedAt = consent.updatedAt): boolean {
  try {
    const record: StoredConsentRecord = { version: 1, decidedAt, consent };
    localStorage.setItem(BANNER_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * A choice for one purpose. `required` means it must be visible as a
 * separate, explicit control so the user is not coaxed into batching.
 */
export interface ConsentChoice {
  key: ConsentKey;
  label: string;
  description: string;
  required: boolean;
}

/** One line per purpose, for the banner legend. */
export function purposeLine(key: ConsentKey): string {
  return purposeDescription(key);
}

/**
 * The cookie-consent banner.
 *
 * Appears on first visit; hidden after the user makes a choice. The banner
 * presents Essential always-on, then one explicit control per non-essential
 * purpose, then an accept/reject of all. Nothing is loaded until the user
 * acts.
 */
export function CookieConsentBanner() {
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState<UserConsent>(blankConsent);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const dismissedForSession = useRef(false);
  const exempt = isBannerExempt(pathname ?? '');

  useEffect(() => {
    let active = true;
    const local = readStoredConsent();
    const localDecisionAt = local.decidedAt;
    setSaved(local.consent);
    setDismissed(!!localDecisionAt || dismissedForSession.current);
    if (local.failed) {
      setStorageError(true);
      setError('Your browser could not read saved consent. Choices may not be saved on this device.');
    } else {
      setStorageError(false);
      setError('');
    }
    setLoaded(true);

    if (getToken()) {
      void api.get<{ consent: unknown; decidedAt?: string | null }>('/api/v1/consent').then(async (remote) => {
        if (!active) return;
        if (remote.decidedAt) {
          const next = consentFromBlob(remote.consent);
          setSaved(next);
          setDismissed(true);
          writeConsentRecord(next, remote.decidedAt);
          setSyncError(false);
        } else if (localDecisionAt) {
          await api.patch('/api/v1/consent', {
            version: local.consent.version,
            updatedAt: local.consent.updatedAt,
            choices: local.consent.choices,
            decidedAt: localDecisionAt,
          });
          if (active) setSyncError(false);
        }
      }).catch(() => {
        if (active) setSyncError(true);
      });
    }
    return () => { active = false; };
  }, [pathname]);

  const retrySync = async () => {
    if (!getToken()) return;
    try {
      await api.patch('/api/v1/consent', {
        version: saved.version,
        updatedAt: saved.updatedAt,
        choices: saved.choices,
        decidedAt: saved.updatedAt,
      });
      setSyncError(false);
    } catch {
      setSyncError(true);
    }
  };

  if (!loaded || exempt) return null;
  if (dismissed) {
    return syncError ? (
      <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-float)] pb-safe" role="status">
        <p className="t-caption min-w-0 flex-1">Your choice is saved on this device. Account sync is still pending.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void retrySync()}>Retry sync</button>
      </div>
    ) : null;
  }

  const choices = saved.choices;
  const allOn = NON_ESSENTIAL.every(({ key }) => choices[key]);
  const allOff = NON_ESSENTIAL.every(({ key }) => !choices[key]);

  const commit = async (next: UserConsent) => {
    setSaved(next);
    setError('');
    if (!writeConsentRecord(next)) {
      setStorageError(true);
      setError('Your browser blocked storage. These choices are active for this visit only; allow site storage to keep them.');
      return;
    }
    setStorageError(false);
    setDismissed(true);
    setSyncError(false);
    if (getToken()) {
      try {
        await api.patch('/api/v1/consent', {
          version: next.version,
          updatedAt: next.updatedAt,
          choices: next.choices,
          decidedAt: next.updatedAt,
        });
      } catch {
        setSyncError(true);
      }
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center bg-background/95 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm sm:px-6"
      role="region"
      aria-label="Cookie consent"
    >
      <div className="w-full max-w-2xl">
        <div className="flex max-h-[calc(100dvh-env(safe-area-inset-bottom)-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-float)] sm:p-6">
          <h2 className="t-strong shrink-0">Cookies on Revisio</h2>
          <p className="t-caption mt-1 shrink-0 text-muted-foreground">
            Essential operation is always on. Optional purposes are off unless you choose them.
          </p>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" tabIndex={0} aria-label="Optional consent purposes">
          {/* Essential — always on. */}
          <div className="border-b border-border pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="t-fine">Essential</p>
                <p className="t-caption text-muted-foreground">
                  Strictly necessary for the Service to work and to keep your
                  account secure. Cannot be switched off.
                </p>
              </div>
              {/* `bg-good` under `text-good-strong` measured 2.43:1 (axe); the
                  soft pairing is the legible one and matches the rest of the app. */}
              <span className="shrink-0 rounded-full bg-good-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-good-strong">
                Always on
              </span>
            </div>
          </div>

          {/* Non-essential — one control per purpose. */}
          <div className="mt-3 space-y-2">
            {NON_ESSENTIAL.map((c) => (
              <label
                key={c.key}
                className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-2.5"
              >
                <input
                  type="checkbox"
                  checked={saved.choices[c.key]}
                  onChange={(e) => setSaved((current) => applyConsentChange(current, { [c.key]: e.target.checked }))}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-border text-primary focus:ring-1 focus:ring-ring"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.label}</p>
                  <p className="t-fine text-muted-foreground">{c.description}</p>
                </div>
              </label>
            ))}
          </div>

          </div>

          {/* Actions remain visible while the purpose list scrolls. */}
          <div className="mt-3 flex shrink-0 flex-wrap gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void commit(applyConsentChange(saved, Object.fromEntries(NON_ESSENTIAL.map(({ key }) => [key, true]))))}
            >
              Accept all
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void commit(applyConsentChange(saved, Object.fromEntries(NON_ESSENTIAL.map(({ key }) => [key, false]))))}
            >
              Reject all
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void commit(saved)}>Save choices</button>
            <Link href="/privacy#your-rights" className="btn btn-ghost">Privacy details</Link>
          </div>

          {/* Summary. */}
          <p className="t-fine mt-2 shrink-0 text-muted-foreground" aria-live="polite">
            {allOn ? 'All optional purposes selected.' : allOff ? 'All optional purposes are off.' : 'Choose only the purposes you want.'}
          </p>

          {error && <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2" role="alert">
            <p className="t-fine text-destructive-ink">{error}</p>
            {storageError && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { dismissedForSession.current = true; setDismissed(true); }}>Continue for now</button>}
          </div>}
        </div>
      </div>
    </div>
  );
}

const NON_ESSENTIAL: ConsentChoice[] = [
  { key: 'preferences', label: 'Preferences', description: purposeLine('preferences'), required: false },
  { key: 'analytics', label: 'Analytics', description: purposeLine('analytics'), required: false },
  { key: 'marketing', label: 'Marketing', description: purposeLine('marketing'), required: false },
  { key: 'notifications', label: 'Notifications', description: purposeLine('notifications'), required: false },
  { key: 'research', label: 'Research', description: purposeLine('research'), required: false },
  { key: 'school', label: 'School / account data', description: purposeLine('school'), required: false },
  { key: 'profile', label: 'Profile fields', description: purposeLine('profile'), required: false },
];

