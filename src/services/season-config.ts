import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { seasons } from '@/db/schema';
import { seasonConfigs, type SeasonConfig } from '@/domain/seasons';

/**
 * The configured seasons, from the PRIMARY.
 *
 * Read from the primary rather than the replica on purpose. Season boundaries
 * are the input to every XP aggregate in the product — the wrong window does not
 * show a slightly stale rank, it shows the *wrong rank* — and an admin edit to a
 * date has to be in force the moment the panel saved it, not whenever the
 * nightly drain next runs.
 *
 * The rows are small and heavily cached: seasons change a handful of times a
 * season, so the whole table is worth holding for the length of a request burst.
 * The cache is deliberately short (30s) so an admin edit is picked up quickly
 * without every request re-querying, and an admin write clears it outright.
 */
const CACHE_MS = Number(process.env.SEASONS_CACHE_MS ?? 30_000);

declare global {
  // eslint-disable-next-line no-var
  var __revisioSeasonsCache: { at: number; configs: SeasonConfig[] } | undefined;
}

export async function loadSeasonConfigs(): Promise<SeasonConfig[]> {
  const cached = globalThis.__revisioSeasonsCache;
  // The fallback list is never cached: it is what an unconfigured database
  // returns, and caching it would pin the app to the epoch schedule after the
  // table is seeded until the process happens to restart.
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS && cached.configs.length > 0) return cached.configs;

  const rows = await db.select().from(seasons).orderBy(asc(seasons.number));
  const configs = seasonConfigs(rows);
  globalThis.__revisioSeasonsCache = { at: now, configs };
  return configs;
}

/** Drop the cache. Called after any admin write so a new date is in force now. */
export function invalidateSeasonCache(): void {
  globalThis.__revisioSeasonsCache = undefined;
}

/** The one configured row for a season number, or null. */
export async function loadSeasonConfig(number: number): Promise<SeasonConfig | null> {
  const [row] = await db.select().from(seasons).where(eq(seasons.number, number)).limit(1);
  if (!row) return null;
  return seasonConfigs([row])[0] ?? null;
}