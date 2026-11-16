// First-party product analytics, gated on the `analytics` consent purpose.
//
// Privacy posture (docs/ANALYTICS-EVENTS.md has the full list):
//   • Nothing is sent until the visitor grants the Analytics purpose — the
//     same choice the cookie banner and Settings → How we use your data write.
//   • No fingerprinting, no third-party script, no cookies. The only
//     identifier is a random UUID in localStorage, created on first consented
//     event and meaningless outside this site.
//   • Events are small, named and allowlisted on both sides; props are
//     primitives only. No form contents, no answers, no free text.
//   • Delivery is best-effort: `fetch` with `keepalive` (which survives page
//     unload), and every failure is swallowed — analytics must never break
//     or slow the product.

import { readStoredConsent, subscribeConsentChange } from '@/lib/consent-storage';
import { getToken } from '@/lib/api';

export const ANALYTICS_ENDPOINT = '/api/v1/events';
const ANONYMOUS_ID_KEY = 'revisio.analytics-id';

/** Event names the server accepts. Keep in sync with
 *  `src/services/analytics.ts` (ANALYTICS_EVENTS) — the route drops anything
 *  else, so a typo here fails silently rather than polluting the funnel. */
export const ANALYTICS_EVENTS = [
  'page_view',
  'cta_click',
  'demo_review_submit',
  'demo_review_complete',
  'demo_curve_rate',
  'signup_started',
  'signup_completed',
  'first_review_completed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
export type AnalyticsProps = Record<string, string | number | boolean | null>;

/** True only when the stored choice explicitly grants analytics. A missing
 *  record, a denied choice and a storage failure all read as "no". */
export function analyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return readStoredConsent().consent.choices.analytics === true;
  } catch {
    return false;
  }
}

function anonymousId(): string | null {
  try {
    let id = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANONYMOUS_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function cleanProps(props: AnalyticsProps | undefined): AnalyticsProps | undefined {
  if (!props) return undefined;
  const out: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props).slice(0, 12)) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Record one funnel event. No-op unless analytics consent is granted *right
 * now* — a visitor who revokes mid-session stops emitting immediately, and
 * events queued before the grant are never replayed.
 */
export function track(name: AnalyticsEventName, props?: AnalyticsProps): void {
  if (typeof window === 'undefined' || !analyticsAllowed()) return;
  const payload = JSON.stringify({
    events: [{
      name,
      props: cleanProps(props),
      path: window.location.pathname.slice(0, 300),
      anonymousId: anonymousId(),
      at: new Date().toISOString(),
    }],
  });
  try {
    // `keepalive` survives page unload, so a beacon fired on the way out still
    // lands. The bearer token rides along when a session exists — that is how
    // post-signup events get stitched to the account server-side.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers,
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics is best-effort by design.
  }
}

/** Re-runs `listener` whenever the consent choice changes in this tab, in
 *  another tab, or in Settings. Returns the unsubscribe function. */
export function onConsentChange(listener: () => void): () => void {
  return subscribeConsentChange(listener);
}
