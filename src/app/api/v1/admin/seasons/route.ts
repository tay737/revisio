import { NextRequest } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { seasons, seasonResults } from '@/db/schema';
import { ok, requireUser, route, ApiError } from '@/services/api';
import { isDeveloper } from '@/services/roles';

/**
 * GET /api/v1/admin/seasons — the configured seasons, for the admin panel.
 *
 * Separate from `GET /api/v1/seasons` on purpose: that one is the *player's*
 * view of the season they are in (their rank, the board, their showcase), and it
 * has to work on a replica that is allowed to be a day stale. This one is
 * operator tooling, so it reads the primary and returns the raw rows including
 * the things a learner must never see — the operator note, the draft seasons
 * that have not opened, and how many results each season carries.
 *
 * `results` rides along so the panel can refuse a delete *before* the operator
 * presses it, instead of answering with a 409 after they have.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!isDeveloper(user)) throw new ApiError(403, 'forbidden', 'Developers only.');

  const rows = await db.select().from(seasons).orderBy(asc(seasons.number));

  // One grouped query rather than a per-season count: the panel renders every
  // configured season at once, and N+1 against a table an operator opens once a
  // season is the wrong trade for a few rows.
  const counts = await db
    .select({ seasonNumber: seasonResults.seasonNumber, c: sql<number>`count(*)::int` })
    .from(seasonResults)
    .groupBy(seasonResults.seasonNumber);
  const byNumber = new Map(counts.map((c) => [c.seasonNumber, Number(c.c)]));

  return ok({
    seasons: rows.map((r) => ({
      number: r.number,
      name: r.name,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      state: r.state,
      note: r.note,
      rewards: r.rewards,
      results: byNumber.get(r.number) ?? 0,
    })),
  });
});