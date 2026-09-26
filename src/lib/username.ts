// Username rules — pure and client-safe, so the settings form can give the
// same feedback the server enforces. The server module (services/profile.ts)
// imports from here; the two can never disagree about what a username is.

/** 3–20 chars, starts with a letter or digit; lowercase letters/digits/_/- . */
export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,19}$/;

/** Routes and product words a profile address must never squat on. */
export const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'u', 'me', 'login', 'register', 'logout', 'settings', 'dashboard',
  'review', 'learn', 'progress', 'cram', 'exam', 'library', 'teacher', 'staff',
  'verify-email', 'profile', 'account', 'auth', 'static', 'public', 'about',
  'help', 'support', 'revisio', 'dev', 'root', 'sys', 'system', 'null', 'undefined',
]);
