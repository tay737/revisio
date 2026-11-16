import { NextRequest } from 'next/server';
import { ok, route } from '@/services/api';
import { referralCodeValid } from '@/services/acquisition';

/**
 * GET /referrals/validate?code=… — public existence check for the register
 * form's "a friend invited you" field. Deliberately returns no identity: a
 * valid code must not reveal who shared it.
 */
export const GET = route(async (req: NextRequest) => {
  const code = req.nextUrl.searchParams.get('code');
  return ok({ valid: await referralCodeValid(code) });
});
