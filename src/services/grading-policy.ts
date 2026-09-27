import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { featureFlags } from '@/db/schema';
import { ApiError, type SessionUser } from '@/services/api';
import { canManageContent, isDeveloper } from '@/services/roles';
import { DEFAULT_CLOZE_POLICY, type ClozeMarkPolicy } from '@/domain/grading';

// ── Cloze marking policy ────────────────────────────────────────────────────
// One flag (`cloze_marking`) holds the whole configuration as JSON in the
// flag's description, the same home the SRS tuning uses (`srs_algorithms`).
// Scopes stack: an exact topic override beats its subject's, which beats the
// global default. Resolution happens server-side at grade time, and the
// resolved policy travels with the offline pack so previews grade by the same
// rules the server will apply.

const FLAG_KEY = 'cloze_marking';

export type ClozePolicyScope =
  | { type: 'global' }
  | { type: 'subject'; subjectId: string }
  | { type: 'topic'; topicId: string };

export type ClozePolicyEntry = { scope: ClozePolicyScope; policy: ClozeMarkPolicy };

type ClozeFlagPayload = {
  default: ClozeMarkPolicy;
  scopes: ClozePolicyEntry[];
};

const FALLBACK: ClozeFlagPayload = { default: { mode: 'legacy' }, scopes: [] };

/** Guard what we read out of the flag: a hand-edited payload must never be able
 *  to throw inside the grading path. Unknown modes fall back to legacy. */
function sanitizePolicy(raw: unknown): ClozeMarkPolicy {
  if (!raw || typeof raw !== 'object') return { mode: 'legacy' };
  const p = raw as Record<string, unknown>;
  const policy: ClozeMarkPolicy = { mode: p.mode === 'similar' ? 'similar' : 'legacy' };
  const num = (v: unknown, lo: number, hi: number): number | undefined => {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
  };
  const typo = num(p.typoThreshold, 0.5, 1);
  if (typo !== undefined) policy.typoThreshold = typo;
  const short = num(p.shortWordThreshold, 0.5, 1);
  if (short !== undefined) policy.shortWordThreshold = short;
  if (Array.isArray(p.extraSynonyms)) {
    const groups = p.extraSynonyms
      .filter((g): g is unknown[] => Array.isArray(g))
      .map((g) => g.filter((w): w is string => typeof w === 'string' && w.trim().length > 0 && w.trim().length <= 60).map((w) => w.trim()))
      .filter((g) => g.length >= 2)
      .slice(0, 100);
    if (groups.length > 0) policy.extraSynonyms = groups;
  }
  return policy;
}

function sanitizePayload(raw: unknown): ClozeFlagPayload {
  if (!raw || typeof raw !== 'object') return FALLBACK;
  const p = raw as Record<string, unknown>;
  const scopes: ClozePolicyEntry[] = Array.isArray(p.scopes)
    ? p.scopes
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s): ClozePolicyEntry | null => {
          // entries are stored as { scope, policy }; accept a bare scope too,
          // so a hand-edited payload cannot silently lose its overrides
          const inner = (s.scope ?? s) as Record<string, unknown>;
          if (inner.type === 'subject' && typeof inner.subjectId === 'string') {
            const scope: ClozePolicyScope = { type: 'subject', subjectId: inner.subjectId };
            return { scope, policy: sanitizePolicy(s.policy) };
          }
          if (inner.type === 'topic' && typeof inner.topicId === 'string') {
            const scope: ClozePolicyScope = { type: 'topic', topicId: inner.topicId };
            return { scope, policy: sanitizePolicy(s.policy) };
          }
          return null;
        })
        .filter((s): s is ClozePolicyEntry => s !== null)
        .slice(0, 500)
    : [];
  return { default: sanitizePolicy(p.default), scopes };
}

export async function getClozeMarkingPayload(): Promise<ClozeFlagPayload> {
  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, FLAG_KEY)).limit(1);
  if (!row) return FALLBACK;
  try {
    return sanitizePayload(JSON.parse(row.description));
  } catch {
    return FALLBACK;
  }
}

/** The effective policy for one card: topic override, else subject, else global.
 *  Pure so callers holding a payload (the offline pack builder) can resolve
 *  many cards without re-reading the flag. */
export function resolveFromPayload(payload: ClozeFlagPayload, subjectId: string | null, topicId: string | null): ClozeMarkPolicy {
  if (topicId) {
    const topic = payload.scopes.find((s) => s.scope.type === 'topic' && s.scope.topicId === topicId);
    if (topic) return topic.policy;
  }
  if (subjectId) {
    const subject = payload.scopes.find((s) => s.scope.type === 'subject' && s.scope.subjectId === subjectId);
    if (subject) return subject.policy;
  }
  return payload.default.mode === 'legacy' && !payload.default.extraSynonyms
    ? { ...DEFAULT_CLOZE_POLICY, ...payload.default }
    : payload.default;
}

/** The DB-reading wrapper for single-card paths (submitReview). */
export async function resolveClozeMarking(subjectId: string | null, topicId: string | null): Promise<ClozeMarkPolicy> {
  return resolveFromPayload(await getClozeMarkingPayload(), subjectId, topicId);
}

async function writePayload(payload: ClozeFlagPayload): Promise<void> {
  const description = JSON.stringify(payload);
  await db
    .insert(featureFlags)
    .values({ key: FLAG_KEY, description, enabled: true })
    .onConflictDoUpdate({ target: featureFlags.key, set: { description, enabled: true } });
}

/** Who may write which scope: developers anything, staff subject/topic scopes. */
function assertCanWriteScope(user: SessionUser, scope: ClozePolicyScope): void {
  if (scope.type === 'global') {
    if (!isDeveloper(user)) throw new ApiError(403, 'forbidden', 'Only developers set the default marking policy.');
    return;
  }
  if (!canManageContent(user)) throw new ApiError(403, 'forbidden', 'Staff only.');
}

export async function setClozeMarking(user: SessionUser, scope: ClozePolicyScope, policy: ClozeMarkPolicy): Promise<void> {
  assertCanWriteScope(user, scope);
  const clean = sanitizePolicy(policy);
  const payload = await getClozeMarkingPayload();
  if (scope.type === 'global') {
    payload.default = clean;
  } else {
    const key = scope.type === 'subject' ? scope.subjectId : scope.topicId;
    payload.scopes = payload.scopes.filter((s) => !(s.scope.type === scope.type && (s.scope.type === 'subject' ? s.scope.subjectId : s.scope.topicId) === key));
    payload.scopes.push({ scope, policy: clean });
  }
  await writePayload(payload);
}
