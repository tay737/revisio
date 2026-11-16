// Browser-side persistence for the consent choice, shared by the banner, the
// settings page and the analytics gate so all three read the same record.
// Pure client helpers: every function guards on `window`/`localStorage` so the
// module is safe to import from server-rendered trees.

import { blankConsent, consentFromBlob, type ConsentState } from '@/lib/consent';

export const CONSENT_STORAGE_KEY = 'revisio.cookie-consent';

/** Fired on `window` whenever the stored choice changes, so listeners
 *  (analytics, the banner) can re-read without polling. */
export const CONSENT_CHANGE_EVENT = 'revisio:consent-change';

export interface StoredConsentRecord {
  version: number;
  decidedAt: string;
  consent: ConsentState;
}

export function readStoredConsent(): { consent: ConsentState; decidedAt: string | null; failed: boolean } {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
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

export function writeConsentRecord(consent: ConsentState, decidedAt = consent.updatedAt): boolean {
  try {
    const record: StoredConsentRecord = { version: 1, decidedAt, consent };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Tell same-tab listeners the choice changed. `storage` events only fire in
 *  *other* tabs, so the tab that wrote needs its own signal. */
export function notifyConsentChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

export function subscribeConsentChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONSENT_STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
