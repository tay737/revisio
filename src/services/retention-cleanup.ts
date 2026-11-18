import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { pruneAnalyticsEvents } from '@/services/analytics';
import { drainFailedMediaDeletions } from '@/services/media-erasure';
import { pruneRateLimits } from '@/services/rate-limit';

/**
 * #63 hygiene pass for lazy primary-only tables and low-risk append-only
 * notification rows. Every delete is bounded per call; the retention cron
 * repeats it, so a large backlog drains over several ticks instead of one
 * long transaction. User-visible history that needs product/privacy sign-off
 * (review_logs, xp_events, streak_events, exam_attempts, audit_log,
 * user_challenges, study_connections, guardian_links, _sync_events) is
 * intentionally untouched here.
 */

const DELIVERY_BATCH = 1000;
const NOTIFICATION_BATCH = 1000;
const DELIVERY_RETENTION_DAYS = 180;
const READ_NOTIFICATION_RETENTION_DAYS = 90;

function rowCount(result: unknown): number {
  return (result as { rowCount?: number }).rowCount ?? 0;
}

async function pruneTerminalDeliveries(cutoff: Date, batch: number): Promise<number> {
  try {
    const result = await db.execute(sql`
      DELETE FROM notification_deliveries
      WHERE id IN (
        SELECT id FROM notification_deliveries
        WHERE status IN ('sent', 'suppressed', 'failed')
          AND created_at < ${cutoff.toISOString()}
        ORDER BY created_at
        LIMIT ${batch}
      )
    `);
    return rowCount(result);
  } catch (e) {
    console.error('[retention-cleanup] notification_deliveries prune failed', e);
    return 0;
  }
}

async function pruneReadNotifications(cutoff: Date, batch: number): Promise<number> {
  try {
    const result = await db.execute(sql`
      DELETE FROM notifications
      WHERE id IN (
        SELECT id FROM notifications
        WHERE read_at IS NOT NULL
          AND created_at < ${cutoff.toISOString()}
        ORDER BY created_at
        LIMIT ${batch}
      )
    `);
    return rowCount(result);
  } catch (e) {
    console.error('[retention-cleanup] notifications prune failed', e);
    return 0;
  }
}

export async function runRetentionCleanup(now = new Date()) {
  const deliveryCutoff = new Date(now.getTime() - DELIVERY_RETENTION_DAYS * 86_400_000);
  const readNotificationCutoff = new Date(now.getTime() - READ_NOTIFICATION_RETENTION_DAYS * 86_400_000);

  const [rateLimits, analyticsEvents, notificationDeliveries, notifications, mediaDrain] = await Promise.all([
    pruneRateLimits(1000),
    pruneAnalyticsEvents(90, 5000),
    pruneTerminalDeliveries(deliveryCutoff, DELIVERY_BATCH),
    pruneReadNotifications(readNotificationCutoff, NOTIFICATION_BATCH),
    drainFailedMediaDeletions(),
  ]);

  return { rateLimits, analyticsEvents, notificationDeliveries, notifications, mediaDrain };
}
