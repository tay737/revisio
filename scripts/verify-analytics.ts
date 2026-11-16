/**
 * Proves the analytics write path — lazy table creation, allowlist filtering
 * and the insert itself — against the live primary, then removes every row it
 * wrote. Same receipt style as verify:season-write: the failure this catches
 * (RLS/privileges on a lazily created table) is invisible until a real event
 * tries to land.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { recordAnalyticsEvents, recordServerEvent } from '../src/services/analytics';

const MARK = '/__analytics-verify__';
const SELF_USER = 'analytics-selftest';

// The first write creates the table lazily, so no pre-cleanup DELETE — it
// would hit 42P01 on a database that has never seen an event.
const accepted = await recordAnalyticsEvents([
  { name: 'page_view', path: MARK, anonymousId: 'verify-anon-0001', props: { path: MARK } },
  { name: 'not_a_real_event', path: MARK }, // must be dropped by the allowlist
  { name: 'cta_click', path: MARK, props: { target: 'register', section: 'hero' } },
], null);
console.log('batch accepted:', accepted, '(expect 2)');

await recordServerEvent('first_review_completed', SELF_USER, { note: 'selftest' });
console.log('server event sent');

const countRes = await db.execute(sql`
  SELECT count(*)::int AS c FROM analytics_events WHERE path = ${MARK} OR user_id = ${SELF_USER}
`);
const rows = (countRes as unknown as { rows: { c: number }[] }).rows;
console.log('rows landed:', rows[0]?.c, '(expect 3)');

await db.execute(sql`DELETE FROM analytics_events WHERE path = ${MARK} OR user_id = ${SELF_USER}`);
const after = await db.execute(sql`
  SELECT count(*)::int AS c FROM analytics_events WHERE path = ${MARK} OR user_id = ${SELF_USER}
`);
const left = (after as unknown as { rows: { c: number }[] }).rows;
console.log('cleanup ok:', left[0]?.c === 0);
