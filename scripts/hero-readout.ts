/**
 * #23 hero A/B readout — groups `analytics_events` by the `hero` prop so the
 * three headline variants (control / outcome / wedge) can be compared.
 *
 * Read-only. Run: `npm run hero:readout` (optionally `npm run hero:readout -- 60`
 * for a 60-day window; default 30).
 *
 * What the data can and cannot say:
 *   • `hero` is attached to cta_click, signup_started and signup_completed.
 *     page_view carries no prop, so there is NO exposure denominator — the
 *     funnel below is "of consented visitors who interacted", not "of all
 *     visitors who saw the headline". Variants are assigned uniformly at
 *     random, so relative conversion between arms is still meaningful.
 *   • `hero: 'none'` on signup events means the visitor registered without
 *     ever seeing the landing hero (direct link, bookmark) — reported
 *     separately, never counted toward an arm.
 *   • Post-signup activation joins signup_completed.user_id to
 *     first_review_completed.user_id. It only counts signups where the
 *     session token was already attached when the event fired.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

const days = Math.max(1, Number(process.argv[2] ?? 30) || 30);
const FUNNEL_EVENTS = ['cta_click', 'signup_started', 'signup_completed'] as const;

function rows<T>(res: unknown): T[] {
  return (res as { rows: T[] }).rows ?? [];
}

type FunnelRow = { hero: string; name: string; events: number; actors: number };
type CtaRow = { hero: string; target: string; section: string; clicks: number; actors: number };
type ActivationRow = { hero: string; signups: number; activated: number };

// 1 ── Funnel: events and distinct actors per variant per stage.
const funnel = rows<FunnelRow>(await db.execute(sql`
  SELECT COALESCE(props->>'hero', '(missing)') AS hero,
         name,
         count(*)::int AS events,
         count(DISTINCT COALESCE(anonymous_id, user_id, id))::int AS actors
  FROM analytics_events
  WHERE name IN ('cta_click', 'signup_started', 'signup_completed')
    AND created_at > now() - make_interval(days => ${days})
  GROUP BY 1, 2
  ORDER BY 1, 2
`));

// 2 ── CTA clicks broken down by target/section within each arm.
const cta = rows<CtaRow>(await db.execute(sql`
  SELECT COALESCE(props->>'hero', '(missing)') AS hero,
         COALESCE(props->>'target', '?') AS target,
         COALESCE(props->>'section', '?') AS section,
         count(*)::int AS clicks,
         count(DISTINCT COALESCE(anonymous_id, user_id, id))::int AS actors
  FROM analytics_events
  WHERE name = 'cta_click'
    AND created_at > now() - make_interval(days => ${days})
  GROUP BY 1, 2, 3
  ORDER BY 1, clicks DESC
`));

// 3 ── Post-signup activation: did the signup cohort come back for a review?
const activation = rows<ActivationRow>(await db.execute(sql`
  WITH signups AS (
    SELECT DISTINCT user_id, props->>'hero' AS hero
    FROM analytics_events
    WHERE name = 'signup_completed'
      AND user_id IS NOT NULL
      AND created_at > now() - make_interval(days => ${days})
  ),
  reviewed AS (
    SELECT DISTINCT user_id
    FROM analytics_events
    WHERE name = 'first_review_completed'
  )
  SELECT COALESCE(s.hero, '(missing)') AS hero,
         count(*)::int AS signups,
         count(r.user_id)::int AS activated
  FROM signups s
  LEFT JOIN reviewed r ON r.user_id = s.user_id
  GROUP BY 1
  ORDER BY 1
`));

// ── Print ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('en-GB');

console.log(`Hero A/B readout — last ${days} days\n`);

console.log('Funnel by variant (actors = distinct anonymous_id/user_id):');
console.log('  hero      stage               events   actors');
for (const r of funnel) {
  console.log(`  ${r.hero.padEnd(9)} ${r.name.padEnd(18)} ${fmt(r.events).padStart(7)} ${fmt(r.actors).padStart(7)}`);
}

const arms = ['control', 'outcome', 'wedge'];
console.log('\nStage-to-stage conversion (distinct actors):');
for (const arm of [...arms, 'none', '(missing)']) {
  const at = (name: string) => funnel.find((r) => r.hero === arm && r.name === name)?.actors ?? 0;
  const clicks = at('cta_click');
  const started = at('signup_started');
  const completed = at('signup_completed');
  if (!clicks && !started && !completed) continue;
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
  console.log(
    `  ${arm.padEnd(9)} click→start ${pct(started, clicks).padStart(6)}   start→complete ${pct(completed, started).padStart(6)}   click→complete ${pct(completed, clicks).padStart(6)}`,
  );
}

console.log('\nCTA clicks by target/section:');
console.log('  hero      target/section            clicks   actors');
for (const r of cta) {
  console.log(`  ${r.hero.padEnd(9)} ${`${r.target} @ ${r.section}`.padEnd(24)} ${fmt(r.clicks).padStart(7)} ${fmt(r.actors).padStart(7)}`);
}

console.log('\nPost-signup activation (user_id join):');
console.log('  hero      signups   activated   rate');
for (const r of activation) {
  const rate = r.signups ? `${((r.activated / r.signups) * 100).toFixed(1)}%` : '—';
  console.log(`  ${r.hero.padEnd(9)} ${fmt(r.signups).padStart(8)} ${fmt(r.activated).padStart(10)} ${rate.padStart(7)}`);
}

console.log('\nNote: no exposure denominator — page_view is untagged. Compare arms, not absolute rates.');
