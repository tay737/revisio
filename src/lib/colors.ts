// Colour palettes shared by client and server. `server-only` modules import
// from here for PATCH validation; the avatar component re-exports the same
// constants so the settings form and the API can never disagree about what a
// valid colour is — one list, two consumers, no drift.

export const AVATAR_COLORS = ['ink', 'moss', 'bee', 'dawn', 'sky'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

/**
 * Banner washes, in priority order after an uploaded image. Each renders as a
 * two-stop gradient between design tokens, so both light and dark themes get
 * a banner that reads as deliberate rather than tinted.
 */
export const BANNER_COLORS = ['dusk', 'rose', 'sea', 'moss', 'bee', 'ember'] as const;
export type BannerColor = (typeof BANNER_COLORS)[number];
