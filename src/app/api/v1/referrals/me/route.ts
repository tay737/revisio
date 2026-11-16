import { NextRequest } from 'next/server';
import { ok, requireUser, route } from '@/services/api';
import { myReferralCode, rotateReferralCode } from '@/services/acquisition';

/** GET /referrals/me — the learner's shareable code, share URL and invite count. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok({ referral: await myReferralCode(user.id) });
});

/** POST /referrals/me — rotate the code (e.g. after it leaked). History is kept. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok({ referral: await rotateReferralCode(user.id) });
});
