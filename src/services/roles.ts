import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import type { Role, SessionUser } from '@/services/auth';

/** Role helpers — the single authorization seam used by API routes.
 *  Teachers and developers can author/manage public content. */
export function canManageContent(user: SessionUser): boolean {
  return user.role === 'teacher' || user.role === 'developer';
}

export function isDeveloper(user: SessionUser): boolean {
  return user.role === 'developer';
}

/** Fetch a fresh role/status snapshot (used by admin actions). */
export async function getRole(userId: string): Promise<Role | null> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role ?? null;
}
