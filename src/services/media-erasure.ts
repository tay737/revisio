import 'server-only';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { mediaAssets } from '@/db/schema';
import { deleteMediaObject } from '@/services/storage';

/**
 * Erasure media ledger (#58/#70). The anonymisation transaction stamps every
 * `media_assets` row `delete_failed_at`; that stamp IS the retry queue — a
 * row with it set names bytes that may still exist in the bucket. These
 * helpers are the only readers of the stamp: the per-account post-commit
 * delete and the cron drain.
 */

const DRAIN_BATCH = 100;

/**
 * Post-commit byte deletion for one erased account. The key set is read
 * AFTER the anonymisation transaction commits, straight from the stamped
 * rows — not from a list selected beforehand — so an asset confirmed
 * mid-flight (stamped by the tx but absent from an earlier snapshot) is
 * still covered. A ledger row is deleted only when the object is actually
 * gone; survivors keep their stamp for the drain.
 */
export async function deleteAccountMediaObjects(
  userId: string,
  remove: (key: string) => Promise<boolean> = deleteMediaObject,
): Promise<string[]> {
  const queued = await db
    .select({ key: mediaAssets.key })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.userId, userId), isNotNull(mediaAssets.deleteFailedAt)));
  const stranded: string[] = [];
  for (const { key } of queued) {
    const removed = (await remove(key)) || (await remove(key));
    if (!removed) {
      stranded.push(key);
      continue;
    }
    await db
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.key, key)));
  }
  return stranded;
}

/**
 * Cron drain for the ledger: oldest stamps first, bounded per tick so a big
 * backlog spreads over runs instead of one long request. One attempt per row
 * per tick — the erasure path already retried twice, and a persistently
 * failing bucket must not stall the batch. Returns counts for the cron
 * response; a select failure reports zeros like the other pruners.
 */
export async function drainFailedMediaDeletions(
  batch = DRAIN_BATCH,
  remove: (key: string) => Promise<boolean> = deleteMediaObject,
): Promise<{ attempted: number; removed: number; stranded: number }> {
  try {
    const rows = await db
      .select({ id: mediaAssets.id, key: mediaAssets.key })
      .from(mediaAssets)
      .where(isNotNull(mediaAssets.deleteFailedAt))
      .orderBy(asc(mediaAssets.deleteFailedAt))
      .limit(batch);
    let removed = 0;
    for (const row of rows) {
      if (await remove(row.key)) {
        await db.delete(mediaAssets).where(eq(mediaAssets.id, row.id));
        removed += 1;
      }
    }
    return { attempted: rows.length, removed, stranded: rows.length - removed };
  } catch (e) {
    console.error('[media-erasure] delete_failed_at drain failed', e);
    return { attempted: 0, removed: 0, stranded: 0 };
  }
}
