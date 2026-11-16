import { NextRequest } from 'next/server';
import { ok, route } from '@/services/api';
import { sampleDeck } from '@/services/acquisition';

/**
 * GET /sample — the try-before-signup deck. Public, read-only, and built
 * only from official public content; answer fields are never selected.
 */
export const GET = route(async (_req: NextRequest) => {
  const cards = await sampleDeck();
  return ok({ cards, count: cards.length }, { headers: { 'Cache-Control': 'public, max-age=300' } });
});
