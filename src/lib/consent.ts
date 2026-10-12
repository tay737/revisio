// Context-aware consent values; pure and client-safe so the settings form,
// the banner and the server layer can never disagree about what is on/off.
// Source of truth for *what* is consented to. The server stores the same
// shape for the audit trail and for the data-protection records.
//
// Each key maps to something a UK GDPR controller must be able to describe
// and revoke granularly: purpose-level, not a single "I agree to everything"
// blob. The boolean shape is what the settings form renders; the selector
// colour/legend lives in the banner.

export type ConsentKey =
  | 'essential' // strictly necessary: session, security, cookies that cannot be disabled
  | 'preferences' // appearance / accessibility choices
  | 'analytics' // product analytics and usage metrics
  | 'marketing' // product updates and promotional messages
  | 'notifications' // in-app and email notifications (non-essential)
  | 'profile' // profile fields shown on the public profile (privacy toggles)
  | 'school' // class/account data a parent/guardian consents to for a learner
  | 'research'; // anonymised product research and improvement

export type ConsentChoice = Record<ConsentKey, boolean>;

export type ConsentChoiceUpdates = Partial<ConsentChoice>;

export interface ConsentState {
  version: number;
  updatedAt: string;
  choices: ConsentChoice;
  /** Read-only for the controlling party: a summary suitable for a record.
   *  `null` means the user has not yet given any consent beyond essential.
   */
  summary: string | null;
  /** Whether the user has consented to *any* non-essential purpose. */
  hasNonEssential: boolean;
  /** Whether everything that can be disabled is disabled. */
  isMinimal: boolean;
}

export const CONSENT_VERSION = 1;

/** Empty / nothing-but-essential state. */
export const EMPTY_CONSENT: ConsentState = {
  version: CONSENT_VERSION,
  updatedAt: new Date().toISOString(),
  choices: {
    essential: true,
    preferences: false,
    analytics: false,
    marketing: false,
    notifications: false,
    profile: false,
    school: false,
    research: false,
  },
  summary: null,
  hasNonEssential: false,
  isMinimal: true,
};

export function blankConsent(): ConsentState {
  return {
    ...EMPTY_CONSENT,
    updatedAt: new Date().toISOString(),
    summary: null,
    hasNonEssential: false,
    isMinimal: true,
  };
}

/** One human-readable, controller-facing line per purpose. */
export function purposeDescription(key: ConsentKey): string {
  switch (key) {
    case 'essential':
      return 'Strictly necessary cookies, sessions and security functions that make the service work.';
    case 'preferences':
      return 'Your appearance, accessibility and how the app behaves for you.';
    case 'analytics':
      return 'Anonymous usage and product analytics to help us improve the service.';
    case 'marketing':
      return 'Revisio product updates and promotional messages about the service.';
    case 'notifications':
      return 'In-app and email notifications that are not strictly necessary.';
    case 'profile':
      return 'Which of your profile fields may be shown on your public profile.';
    case 'school':
      return 'Class and account data we hold for your or your child\'s schooling.';
    case 'research':
      return 'Anonymised product research and improvement.';
  }
}

/** Deterministic summary string for a consent state (audit/records). */
export function consentSummary(state: ConsentState): string {
  const parts = [
    state.choices.essential ? 'essential=granted' : 'essential=denied',
    state.choices.analytics ? 'analytics=granted' : 'analytics=denied',
    state.choices.marketing ? 'marketing=granted' : 'marketing=denied',
    state.choices.notifications ? 'notifications=granted' : 'notifications=denied',
    state.choices.preferences ? 'preferences=granted' : 'preferences=denied',
    state.choices.profile ? 'profile=granted' : 'profile=denied',
    state.choices.school ? 'school=granted' : 'school=denied',
    state.choices.research ? 'research=granted' : 'research=denied',
  ];
  return `consent-${state.version}-${parts.join(',')}-${state.updatedAt}`;
}

/** Merge a frontend change into an existing state without clobbering other keys. */
export function applyConsentChange(
  prev: ConsentState,
  changes: Partial<ConsentChoice>,
): ConsentState {
  const next = {
    ...prev,
    choices: { ...prev.choices, ...changes },
    updatedAt: new Date().toISOString(),
  };
  next.summary = consentSummary(next);
  next.hasNonEssential = Object.entries(next.choices).some(([k, v]) => !!v && k !== 'essential');
  next.isMinimal = !next.hasNonEssential;
  return next;
}

/** Split a stored blob back into a state. Used when restoring from storage. */
export function consentFromBlob(blob: unknown): ConsentState {
  if (!blob || typeof blob !== 'object') return blankConsent();

  const record = blob as Record<string, unknown>;
  const rawChoices = record.choices && typeof record.choices === 'object'
    ? record.choices as Record<string, unknown>
    : record;
  const choices: ConsentChoice = { ...EMPTY_CONSENT.choices };
  for (const key of Object.keys(choices) as ConsentKey[]) {
    if (typeof rawChoices[key] === 'boolean') choices[key] = rawChoices[key] as boolean;
  }
  choices.essential = true;

  const state: ConsentState = {
    version: CONSENT_VERSION,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    choices,
    summary: null,
    hasNonEssential: false,
    isMinimal: true,
  };
  state.summary = consentSummary(state);
  state.hasNonEssential = Object.entries(choices).some(([key, value]) => value && key !== 'essential');
  state.isMinimal = !state.hasNonEssential;
  return state;
}
