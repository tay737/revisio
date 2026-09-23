import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';

// Bootstrap seed: system configuration only (achievements, feature flags) plus
// one developer account for initial admin access. No demo/sample content.
// Subjects, topics, lessons, cards and classes are created through the app by
// teachers/developers; students register via /register.
//
// Idempotent: safe to run repeatedly. Does NOT delete existing users or
// content — use the admin portal for that. Set BOOTSTRAP_DEV_EMAIL /
// BOOTSTRAP_DEV_PASSWORD to override the dev account credentials.

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL ?? '').includes('localhost') ? undefined : { rejectUnauthorized: false },
  max: 4,
});
const db = drizzle(pool, { schema });

const hash = (pw: string) => bcrypt.hashSync(pw, 10);

// ── System config ───────────────────────────────────────────────────────────

await db
  .insert(schema.achievements)
  .values([
    { id: 'first-review', name: 'First Steps', description: 'Complete your first review', icon: '🌱', rule: { kind: 'review_count', threshold: 1 } },
    { id: 'reviews-50', name: 'Half Century', description: 'Complete 50 reviews', icon: '⚡', rule: { kind: 'review_count', threshold: 50 } },
    { id: 'reviews-250', name: 'Grindmaster', description: 'Complete 250 reviews', icon: '🔥', rule: { kind: 'review_count', threshold: 250 } },
    { id: 'streak-7', name: 'Week Warrior', description: 'Reach a 7-day streak', icon: '📅', rule: { kind: 'streak', threshold: 7 } },
    { id: 'streak-30', name: 'Month Monk', description: 'Reach a 30-day streak', icon: '🗓️', rule: { kind: 'streak', threshold: 30 } },
    { id: 'xp-1000', name: 'Kilo-XP', description: 'Earn 1,000 XP total', icon: '💎', rule: { kind: 'xp_total', threshold: 1000 } },
    { id: 'perfect-session', name: 'Flawless', description: 'Finish a session with 100% accuracy (10+ reviews)', icon: '🎯', rule: { kind: 'perfect_session', threshold: 10 } },
  ])
  .onConflictDoNothing();

await db
  .insert(schema.featureFlags)
  .values([
    { key: 'exam_simulator', description: 'Past-paper exam simulator', enabled: true },
    { key: 'leaderboards', description: 'Daily/weekly/monthly leaderboards + leagues', enabled: true },
    { key: 'cram_mode', description: 'Cram sessions (bypass SRS scheduling)', enabled: true },
    { key: 'streak_freeze', description: 'Streak freeze tokens', enabled: false },
    { key: 'experimental_mcq_shuffle', description: 'Shuffle MCQ options per attempt', enabled: false },
    {
      key: 'srs_algorithms',
      description: JSON.stringify({ default: 'sm2', params: {} }),
    },
  ])
  .onConflictDoNothing();

// ── Bootstrap developer account ─────────────────────────────────────────────

const devEmail = (process.env.BOOTSTRAP_DEV_EMAIL ?? 'dev@revisio.app').toLowerCase();
const devPassword = process.env.BOOTSTRAP_DEV_PASSWORD ?? 'ChangeMeNow!24';

const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, devEmail)).limit(1);
if (existing) {
  await db.update(schema.users).set({ role: 'developer', status: 'active', emailVerifiedAt: existing.emailVerifiedAt ?? new Date() }).where(eq(schema.users.id, existing.id));
  console.log(`Dev account exists — ensured role/status: ${devEmail}`);
} else {
  await db.insert(schema.users).values({
    id: crypto.randomUUID(),
    email: devEmail,
    name: 'Revisio Admin',
    passwordHash: hash(devPassword),
    role: 'developer',
    status: 'active',
    emailVerifiedAt: new Date(),
  });
  console.log(`Created dev account: ${devEmail} / ${devPassword}`);
}

console.log('Bootstrap complete: achievements, feature flags, developer account.');
console.log('Next: sign in as the dev account → create subjects/topics, or register teachers at /staff/register.');

await pool.end();
