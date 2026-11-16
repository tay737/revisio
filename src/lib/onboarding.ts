'use client';

/**
 * First-run onboarding state, kept on the device.
 *
 * The checklist is a *nudge*, not a record: every step that matters is already
 * knowable from `/me` (subjects followed, cards graded). What the server
 * cannot see is "I opened the notes" and "I asked you to stop showing this",
 * so those two bits live in localStorage under the user's id — the same
 * pattern `revisio.noteDensity` already uses for a per-device preference.
 * Multi-device students simply see the checklist again elsewhere; nothing is
 * lost, because completion is re-derived from the account on every visit.
 */

export type OnboardingState = {
  dismissed: boolean;
  notesRead: boolean;
};

const EMPTY: OnboardingState = { dismissed: false, notesRead: false };

function key(userId: string): string {
  return `revisio.onboarding.${userId}`;
}

export function readOnboarding(userId: string): OnboardingState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return { dismissed: parsed.dismissed === true, notesRead: parsed.notesRead === true };
  } catch {
    return EMPTY;
  }
}

function write(userId: string, patch: Partial<OnboardingState>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(userId), JSON.stringify({ ...readOnboarding(userId), ...patch }));
  } catch {
    // Private mode or a full quota: the checklist simply reappears next visit.
  }
}

/** Called when a topic's notes screen mounts — "read the notes" is done. */
export function markNotesRead(userId: string) {
  write(userId, { notesRead: true });
}

/** "Not now" on the checklist. Persists for this device and account. */
export function dismissOnboarding(userId: string) {
  write(userId, { dismissed: true });
}
