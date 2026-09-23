import { NextRequest } from 'next/server';
import { db } from '@/db/client';
import { subjects } from '@/db/schema';
import { ok, route } from '@/services/api';

/** GET /auth/subjects-public — id/name list for the registration form (no auth). */
export const GET = route(async (_req: NextRequest) => {
  const rows = await db.select({ id: subjects.id, name: subjects.name }).from(subjects);
  return ok({ subjects: rows });
});
