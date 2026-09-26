import 'server-only';
import { eq } from 'drizzle-orm';
import { readReplica } from '@/db/replica';
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
  // Role *checks* for authoring read the replica — a role change landing a few
  // seconds late is harmless; the JWT in flight is the real gate. (Login and
  // refresh, the paths that mint authority, stay on the primary.)
  const rows = await readReplica((rdb) =>
    rdb.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
  );
  return rows[0]?.role ?? null;
}
