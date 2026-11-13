'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { applyConsentChange, blankConsent, consentFromBlob, purposeDescription, type ConsentKey, type ConsentState } from '@/lib/consent';
import { api, getToken } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';

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
 * Appears on first visit; hidden after the user makes a choice. Nothing is
 * loaded until the user acts.
 *
 * At rest it is a compact bar: heading, one line of policy, and the three
 * decisions a visitor actually came to make (accept all / reject all /
 * customise). The seven per-purpose controls live behind the `Customise`
 * disclosure, because they are the *detail* of a decision, not the decision —
 * showing them all at once made the bar 344px tall on desktop and ~the whole
 * screen at 320px, which is a wall, not a question. The privacy link rides in
 * the caption so it costs no extra row.
 */
export function CookieConsentBanner() {
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState<UserConsent>(blankConsent);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dismissedForSession = useRef(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const exempt = isBannerExempt(pathname ?? '');

  /**
   * Publish the bar's height as `--consent-h` for as long as it is on screen.
   *
   * The banner is `fixed` to the bottom of the viewport, so while it is up the
   * page has less room than `100vh`. Shells size to `min-h-viewport` (which
   * subtracts this variable) and `body` reserves the same height as scrollable
   * tail space; without both, the banner sits on top of whatever the page put
   * at the bottom. Measured on /login: it covered the `Sign in` button and the
   * click never landed.
   */
  useEffect(() => {
    const root = document.documentElement;
    const node = bannerRef.current;
    if (!node) {
      root.style.removeProperty('--consent-h');
      return;
    }
    const publish = () => {
      root.style.setProperty('--consent-h', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--consent-h');
    };
  }, [exempt, loaded, dismissed, syncError]);

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
      <div ref={bannerRef} className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-float)] pb-safe" role="status">
        <p className="t-caption min-w-0 flex-1">Your choice is saved on this device. Account sync is still pending.</p>
        <Button variant="secondary" size="sm" type="button" onClick={() => void retrySync()}>Retry sync</Button>
      </div>
    ) : null;
  }

  const choices = saved.choices;
  const purposesId = 'consent-purposes';
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
      ref={bannerRef}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center bg-background/95 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm sm:px-6"
      role="region"
      aria-label="Cookie consent"
    >
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-float)] sm:p-6">
          <h2 className="t-strong">Cookies on Revisio</h2>
          <p className="t-caption mt-1 text-muted-foreground">
            Essential cookies keep Revisio running. Optional ones stay off until you choose.{' '}
            <Link
              href="/privacy#your-rights"
              className="tap-link underline decoration-border underline-offset-2 hover:text-foreground"
            >
              Privacy details
            </Link>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary"
              type="button"
              onClick={() => void commit(applyConsentChange(saved, Object.fromEntries(NON_ESSENTIAL.map(({ key }) => [key, true]))))}
            >
              Accept all
            </Button>
            <Button variant="secondary"
              type="button"
              onClick={() => void commit(applyConsentChange(saved, Object.fromEntries(NON_ESSENTIAL.map(({ key }) => [key, false]))))}
            >
              Reject all
            </Button>
            {/* A disclosure, not a dialog: `aria-expanded` is what tells a
                screen reader that the purposes below it come and go. */}
            <Button variant="secondary"
              type="button"
              aria-expanded={expanded}
              aria-controls={purposesId}
              onClick={() => setExpanded((current) => !current)}
            >
              Customise
              <Icon name="collapse" size={15} className={expanded ? 'rotate-180' : undefined} />
            </Button>
          </div>

          {expanded && (
            <div id={purposesId} className="mt-3 border-t border-border pt-3">
              {/* The list is its own scroll container, capped in viewport units
                  and rem: on a short phone the purposes scroll while the
                  decisions above and the summary below stay put. */}
              <div
                className="max-h-[min(38dvh,15rem)] overflow-y-auto overscroll-contain pr-1"
                tabIndex={0}
                aria-label="Optional consent purposes"
              >
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

              {/* Saving a partial choice is only meaningful once the purposes
                  are on screen, so it lives with them. */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button variant="secondary" type="button" onClick={() => void commit(saved)}>
                  Save choices
                </Button>
                <p className="t-fine min-w-0 text-muted-foreground" aria-live="polite">
                  {allOn ? 'All optional purposes selected.' : allOff ? 'All optional purposes are off.' : 'Choose only the purposes you want.'}
                </p>
              </div>
            </div>
          )}

          {error && <div className="mt-2 flex flex-wrap items-center justify-between gap-2" role="alert">
            <p className="t-fine text-destructive-ink">{error}</p>
            {storageError && <Button variant="ghost" size="sm" type="button" onClick={() => { dismissedForSession.current = true; setDismissed(true); }}>Continue for now</Button>}
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

