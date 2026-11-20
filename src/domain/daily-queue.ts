/** Daily queue policy: reviewed cards keep their normal due rule; brand-new
 * cards enter on a fixed daily allowance so following a big subject cannot dump
 * the whole catalogue into today's session (#78). */
export const DAILY_NEW_CARD_LIMIT = 15;

export function newCardsAvailableToday(introducedToday: number, unseenTotal: number): number {
  return Math.max(0, Math.min(unseenTotal, DAILY_NEW_CARD_LIMIT - introducedToday));
}
