import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { buildOfflinePack } from '@/services/offline';

/**
 * The session the app takes with it when it loses the network.
 *
 * Kept separate from `/queue/today` on purpose: the daily queue is fetched
 * constantly and must not carry answer keys, while this is fetched rarely,
 * deliberately, and only by a client that intends to review without a server.
 * Conflating them would quietly ship the whole key with every queue read.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 20);
  const pack = await buildOfflinePack(user.id, Math.min(Math.max(1, limit), 100));
  return ok(pack);
});
