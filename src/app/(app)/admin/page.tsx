'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/blur-fade';
import { ContentManager } from './ContentManager';
import { ClozeMarking } from '../library/ClozeMarking';
import PageSkeleton from '@/components/PageSkeleton';

type AdminData = {
  approvals: {
    id: string;
    userId: string;
    name: string;
    email: string;
    roleRequested: string;
    note: string;
    status: string;
    createdAt: string;
  }[];
  flags: { key: string; description: string; enabled: boolean }[];
  algorithms: { name: string; description: string; defaultParams: Record<string, number> }[];
  users: { id: string; email: string; name: string; role: string; status: string; emailVerifiedAt: string | null; totpEnabled: boolean; createdAt: string }[];
  userBadges: { userId: string; badgeId: string }[];
  userAchievements: { userId: string; achievementId: string }[];
  pendingTopics: { id: string; name: string; ownerId: string | null; createdAt: string }[];
  audit: { id: string; action: string; target: string; createdAt: string }[];
  contentStats: {
    topics: number;
    publicTopics: number;
    lessons: number;
    cards: number;
    publicCards: number;
    emptyTopics: number;
  };
  subjects: { id: string; name: string; slug: string; mathsEnabled: boolean }[];
  badges: { id: string; slug: string; label: string; icon: string; color: string; grants: number }[];
  manualAchievements: { id: string; name: string; description: string; icon: string }[];
  classes: {
    id: string;
    name: string;
    joinCode: string;
    teacherId: string;
    teacherName: string;
    subjectId: string;
    members: { classId: string; userId: string; name: string; email: string }[];
  }[];
};

const ROLES = ['student', 'teacher', 'developer'] as const;

/**
 * Developer admin.
 *
 * Unchanged in behaviour; the sections now read as a control panel rather than
 * eight identical stacks of bordered boxes. Each block states what it governs
 * and, where it can, what state it is currently in ("2 pending", "3 enabled"),
 * so a developer can triage from the top of the page without opening anything.
 */
export default function AdminPage() {
  const { me, loading } = useMe();
  const [data, setData] = useState<AdminData | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [algoParams, setAlgoParams] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [renameTo, setRenameTo] = useState<Record<string, string>>({});
  // Badge minting form state.
  const [badgeLabel, setBadgeLabel] = useState('');
  const [badgeIcon, setBadgeIcon] = useState('');
  const [badgeColor, setBadgeColor] = useState<'gold' | 'primary' | 'good' | 'rose'>('gold');
  // Per-user pickers, held open one user at a time.
  const [badgePickerFor, setBadgePickerFor] = useState<string | null>(null);
  // Class picker follows the same one-open-at-a-time rule as the badge picker;
  // the per-class rename inputs live here too.
  const [classPickerFor, setClassPickerFor] = useState<string | null>(null);
  const [classRenameTo, setClassRenameTo] = useState<Record<string, string>>({});

  const load = () =>
    api
      .get<AdminData>('/api/v1/admin')
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (!loading && me?.role === 'developer') load();
  }, [me, loading]);

  if (loading) return <PageSkeleton />;

  if (me?.role !== 'developer') {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <Icon name="private" size={22} />
        </span>
        <h1 className="t-tagline mt-4">Developers only</h1>
        <p className="t-caption mt-2 text-muted-foreground">
          Algorithms, feature flags, approvals and user management live behind this door.
        </p>
      </div>
    );
  }

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setError('');
    setMessage('');
    try {
      await api.post('/api/v1/admin', body);
      setMessage(okMsg);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That action did not go through.');
    }
  };

  const pendingApprovals = data?.approvals.filter((a) => a.status === 'pending') ?? [];
  const enabledFlags = data?.flags.filter((f) => f.enabled).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="admin"
        title="Developer admin"
        subtitle="Users, content and flags."
      />

      <Notice tone="good" show={Boolean(message)}>{message}</Notice>
      <Notice tone="bad" show={Boolean(error)}>{error}</Notice>

      {/* ── The shape of the library ─────────────────────────────────────── */}
      {data?.contentStats && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Topics" value={data.contentStats.topics} note={`${data.contentStats.publicTopics} public`} />
          <Stat label="Note sets" value={data.contentStats.lessons} />
          <Stat
            label="Questions"
            value={data.contentStats.cards}
            note={`${data.contentStats.publicCards} public`}
            alarm={data.contentStats.publicCards === 0 || data.contentStats.cards === 0}
          />
          <Stat
            label="Empty topics"
            value={data.contentStats.emptyTopics}
            note="no questions"
            alarm={data.contentStats.emptyTopics > 0}
          />
        </section>
      )}

      {/* ── Content manager ──────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Content</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Every topic with its counts. Publish, withdraw, open it, or merge two together.
        </p>
        <div className="mt-5">
          <ContentManager />
        </div>
      </section>

      {/* ── Approvals ────────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Approval requests</h2>
          <span className={`chip ${pendingApprovals.length > 0 ? 'chip-active' : ''}`}>
            {pendingApprovals.length === 0 ? 'Nothing waiting' : `${pendingApprovals.length} pending`}
          </span>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Teacher and developer accounts cannot sign in until someone here approves them.
        </p>

        {pendingApprovals.length === 0 ? (
          <p className="t-caption mt-3 text-muted-foreground">The queue is empty.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pendingApprovals.map((a) => (
              <div key={a.id} className="inset flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <span className="t-strong">{a.name}</span>
                  <span className="t-caption ml-2 text-muted-foreground">{a.email}</span>
                  <span className="chip ml-2 capitalize">{a.roleRequested}</span>
                  {a.note && <p className="t-caption mt-1 text-muted-foreground">{a.note}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1.5"
                    onClick={() => act({ action: 'approve_request', approvalId: a.id }, `${a.name} approved.`)}
                  >
                    <Icon name="checked" size={14} />
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger gap-1.5"
                    onClick={() => act({ action: 'reject_request', approvalId: a.id }, `${a.name} rejected.`)}
                  >
                    <Icon name="close" size={14} />
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost gap-1.5"
                    onClick={() => act({ action: 'verify_user_email', userId: a.userId }, `${a.name}'s email marked verified.`)}
                  >
                    <Icon name="mail" size={14} />
                    Verify email
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Publishing queue ─────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Publishing queue</h2>
          <span className={`chip ${(data?.pendingTopics.length ?? 0) > 0 ? 'chip-active' : ''}`}>
            {data?.pendingTopics.length ?? 0} awaiting review
          </span>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Topics students submitted for public publishing. Approving makes them visible to everyone.
        </p>

        {(data?.pendingTopics.length ?? 0) === 0 ? (
          <p className="t-caption mt-3 text-muted-foreground">Nothing awaiting review.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {data?.pendingTopics.map((t) => (
              <div key={t.id} className="inset flex items-center justify-between gap-3 px-4 py-3">
                <span className="t-strong flex min-w-0 items-center gap-2">
                  <Icon name="topic" size={15} className="shrink-0 text-primary" />
                  <span className="truncate">{t.name}</span>
                </span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1.5"
                    onClick={() => act({ action: 'review_topic', topicId: t.id, approveTopic: true }, 'Published.')}
                  >
                    <Icon name="publish" size={14} />
                    Publish
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger gap-1.5"
                    onClick={() =>
                      act({ action: 'review_topic', topicId: t.id, approveTopic: false }, 'Sent back to private.')
                    }
                  >
                    <Icon name="close" size={14} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Subjects ─────────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Subjects</h2>
          <span className="chip">{data?.subjects.length ?? 0}</span>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          The course a topic hangs from. Renaming keeps its topics; deleting removes everything under it. Maths practice is a standalone tool — turning it on opens /practice for that subject and changes nothing about reviews or XP.
        </p>
        <div className="mt-3 space-y-2">
          {data?.subjects.map((s) => (
            <div key={s.id} className="inset flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="t-strong min-w-0 flex-1 truncate">{s.name}</span>
              <button
                type="button"
                className={`btn btn-sm shrink-0 ${s.mathsEnabled ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => act({ action: 'set_subject_maths', subjectId: s.id, enabled: !s.mathsEnabled }, `Maths practice ${s.mathsEnabled ? 'off' : 'on'} for ${s.name}.`)}
              >
                <Icon name="practice" size={14} />
                Maths {s.mathsEnabled ? 'on' : 'off'}
              </button>
              <input
                className="input sm:max-w-[220px]"
                value={renameTo[s.id] ?? ''}
                onChange={(e) => setRenameTo((prev) => ({ ...prev, [s.id]: e.target.value }))}
                placeholder="Rename to…"
                aria-label={`New name for ${s.name}`}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm shrink-0"
                disabled={!renameTo[s.id]?.trim()}
                onClick={() => act({ action: 'rename_subject', subjectId: s.id, name: renameTo[s.id]!.trim() }, `${s.name} renamed.`)}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm shrink-0 text-destructive"
                onClick={() => {
                  if (window.confirm(`Delete “${s.name}” and every topic, lesson and question inside it? This cannot be undone.`)) {
                    act({ action: 'delete_subject', subjectId: s.id }, `${s.name} deleted.`);
                  }
                }}
              >
                <Icon name="remove" size={14} />
                Delete
              </button>
            </div>
          ))}
          {data?.subjects.length === 0 && <p className="t-caption text-muted-foreground">No subjects yet.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="input sm:max-w-[220px]"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="New subject"
            aria-label="New subject name"
          />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            disabled={!newSubject.trim()}
            onClick={() => act({ action: 'create_subject', name: newSubject.trim() }, `${newSubject.trim()} created.`).then(() => setNewSubject(''))}
          >
            Create
          </button>
        </div>
      </section>

      {/* ── Cloze marking ────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Cloze marking</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          How strictly fill-the-blank answers are marked across the platform. A similar-but-wrong answer stays wrong —
          the learner is warned how close it was. Teachers can override this per subject or topic.
        </p>
        <div className="mt-5">
          <ClozeMarking isDeveloper />
        </div>
      </section>

      {/* ── Algorithms ───────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Scheduling algorithms</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Which scheduler produces intervals. Changing this creates a new default for future reviews; existing
          cards keep their state.
        </p>
        <div className="mt-3 space-y-2">
          {data?.algorithms.map((a) => (
            <div key={a.name} className="inset px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[14px] font-semibold">{a.name}</span>
                <button
                  type="button"
                  className="btn btn-ghost gap-1.5"
                  onClick={() => {
                    let params: unknown;
                    try {
                      params = algoParams.trim() ? JSON.parse(algoParams) : undefined;
                    } catch {
                      setError('Those parameter overrides are not valid JSON.');
                      return;
                    }
                    act({ action: 'update_algorithm', algorithm: a.name, params }, `${a.name} is now the default.`);
                  }}
                >
                  <Icon name="checked" size={14} />
                  Set as default
                </button>
              </div>
              <p className="t-caption mt-1 text-muted-foreground">{a.description}</p>
              <p className="t-fine mt-1 break-all font-mono text-muted-foreground">{JSON.stringify(a.defaultParams)}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="algo-params">
            Optional parameter overrides (JSON)
          </label>
          <textarea
            id="algo-params"
            className="input t-fine min-h-[60px] font-mono"
            rows={2}
            value={algoParams}
            onChange={(e) => setAlgoParams(e.target.value)}
            placeholder='{"learningStepMinutes": 5}'
          />
        </div>
      </section>

      {/* ── Feature flags ────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Feature flags</h2>
          <span className="chip">
            {enabledFlags} of {data?.flags.length ?? 0} enabled
          </span>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Flags reach the client through the <code>/me</code> payload and are cached for 30 seconds.
        </p>
        <div className="mt-3 space-y-2">
          {data?.flags.map((f) => (
            <div key={f.key} className="inset flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <span className="font-mono text-[14px]">{f.key}</span>
                <p className="t-caption text-muted-foreground">{f.description}</p>
              </div>
              <button
                type="button"
                className={f.enabled ? 'btn btn-primary btn-sm shrink-0' : 'btn btn-ghost shrink-0'}
                onClick={() => act({ action: 'set_flag', flagKey: f.key, enabled: !f.enabled }, `${f.key} ${f.enabled ? 'disabled' : 'enabled'}.`)}
              >
                {f.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Badges ──────────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Profile badges</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Chips that ride beside the role badge on a profile — a {'<3'}, an Alpha Tester, whatever you mint.
          Grant them per user below; deleting one removes it from every profile wearing it.
        </p>

        {data?.badges.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.badges.map((b) => (
              <span key={b.id} className="chip chip-active gap-2">
                {b.icon && <Icon name={b.icon as never} size={12} />}
                {b.label}
                <span className="num text-[11px] text-muted-foreground">×{b.grants}</span>
                <button
                  type="button"
                  aria-label={`Delete badge ${b.label}`}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Delete "${b.label}"? It disappears from all ${b.grants} profile(s) wearing it.`)) {
                      act({ action: 'delete_badge', badgeId: b.id }, `Badge "${b.label}" deleted.`);
                    }
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="t-caption mt-3 text-muted-foreground">No badges minted yet.</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            className="input max-w-[180px]"
            placeholder="Label — e.g. <3"
            value={badgeLabel}
            maxLength={24}
            onChange={(e) => setBadgeLabel(e.target.value)}
            aria-label="Badge label"
          />
          <input
            className="input max-w-[140px]"
            placeholder="Icon (optional)"
            value={badgeIcon}
            onChange={(e) => setBadgeIcon(e.target.value)}
            aria-label="Badge icon name"
          />
          <select
            className="input max-w-[110px]"
            value={badgeColor}
            aria-label="Badge colour"
            onChange={(e) => setBadgeColor(e.target.value as typeof badgeColor)}
          >
            <option value="gold">gold</option>
            <option value="primary">ink</option>
            <option value="good">green</option>
            <option value="rose">rose</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!badgeLabel.trim()}
            onClick={() => {
              const slug = badgeLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `badge-${Date.now().toString(36)}`;
              void act({ action: 'create_badge', slug, label: badgeLabel.trim(), icon: badgeIcon.trim(), color: badgeColor }, `Badge "${badgeLabel.trim()}" minted.`).then(() => {
                setBadgeLabel('');
                setBadgeIcon('');
              });
            }}
          >
            <Icon name="add" size={14} />
            Mint badge
          </button>
        </div>
      </section>

      {/* ── Users ────────────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="t-strong">Users</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          {data?.users.length ?? 0} accounts. Suspending revokes access immediately; nothing is deleted.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">All user accounts with role, status and two-factor state</caption>
            <thead>
              <tr className="t-eyebrow">
                <th scope="col" className="pb-2 pr-3 font-semibold">User</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Role</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Badges</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Classes</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Status</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">2FA</th>
                <th scope="col" className="pb-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id} className="border-t border-border/60">
                  <td className="py-3 pr-3">
                    <div className="t-strong">{u.name}</div>
                    <div className="t-fine text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="py-3 pr-3">
                    {/* The action existed in the API with no way to reach it. */}
                    <select
                      className="input max-w-[130px] capitalize"
                      value={u.role}
                      aria-label={`Role for ${u.name}`}
                      onChange={(e) => act({ action: 'set_user_role', userId: u.id, role: e.target.value }, `${u.name} is now ${e.target.value}.`)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-3">
                    {(() => {
                      const worn = data?.userBadges.filter((g) => g.userId === u.id) ?? [];
                      const open = badgePickerFor === u.id;
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {worn.map((g) => {
                              const b = data?.badges.find((x) => x.id === g.badgeId);
                              if (!b) return null;
                              return (
                                <button
                                  key={g.badgeId}
                                  type="button"
                                  title={`Revoke "${b.label}"`}
                                  className="chip chip-active gap-1"
                                  onClick={() => act({ action: 'revoke_badge', userId: u.id, badgeId: b.id }, `Badge "${b.label}" revoked from ${u.name}.`)}
                                >
                                  {b.label}
                                  <Icon name="close" size={10} />
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              aria-label={`Badges for ${u.name}`}
                              aria-expanded={open}
                              className="chip gap-1"
                              onClick={() => setBadgePickerFor(open ? null : u.id)}
                            >
                              <Icon name={open ? 'collapse' : 'add'} size={10} />
                            </button>
                          </div>
                          {open && (
                            <div className="inset space-y-2 rounded-md p-2.5">
                              <div className="flex flex-wrap gap-1">
                                {(data?.badges.length ?? 0) === 0 && <span className="t-fine text-muted-foreground">Mint a badge first.</span>}
                                {data?.badges.filter((b) => !worn.some((g) => g.badgeId === b.id)).map((b) => (
                                  <button
                                    key={b.id}
                                    type="button"
                                    className="chip gap-1"
                                    onClick={() => act({ action: 'grant_badge', userId: u.id, badgeId: b.id }, `"${b.label}" granted to ${u.name}.`)}
                                  >
                                    <Icon name="add" size={10} />
                                    {b.label}
                                  </button>
                                ))}
                              </div>
                              {(data?.manualAchievements.length ?? 0) > 0 && (
                                <div className="flex flex-wrap gap-1 border-t border-border/60 pt-2">
                                  {data!.manualAchievements.map((a) => {
                                    const held = data?.userAchievements.some((g) => g.userId === u.id && g.achievementId === a.id);
                                    return (
                                      <button
                                        key={a.id}
                                        type="button"
                                        disabled={held}
                                        title={a.description}
                                        className={`chip gap-1 ${held ? 'chip-active' : ''}`}
                                        onClick={() => act({ action: 'grant_achievement', userId: u.id, achievementId: a.id }, `${a.name} granted to ${u.name}.`)}
                                      >
                                        {held ? <Icon name="reviewed" size={10} /> : <Icon name="add" size={10} />}
                                        {a.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 pr-3">
                    {(() => {
                      // Membership chips behave exactly like the badge chips
                      // beside them: click a chip to remove, open the picker
                      // to add. Only classes the account is not in are listed.
                      const inClasses = data?.classes.filter((c) => c.members.some((m) => m.userId === u.id)) ?? [];
                      const open = classPickerFor === u.id;
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {inClasses.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                title={`Remove ${u.name} from ${c.name}`}
                                className="chip chip-active gap-1"
                                onClick={() => act({ action: 'remove_class_member', classId: c.id, userId: u.id }, `${u.name} removed from ${c.name}.`)}
                              >
                                {c.name}
                                <Icon name="close" size={10} />
                              </button>
                            ))}
                            <button
                              type="button"
                              aria-label={`Classes for ${u.name}`}
                              aria-expanded={open}
                              className="chip gap-1"
                              onClick={() => setClassPickerFor(open ? null : u.id)}
                            >
                              <Icon name={open ? 'collapse' : 'add'} size={10} />
                            </button>
                          </div>
                          {open && (
                            <div className="inset flex flex-wrap gap-1 rounded-md p-2.5">
                              {(data?.classes.length ?? 0) === 0 && <span className="t-fine text-muted-foreground">No classes exist yet — a teacher can create one.</span>}
                              {data?.classes
                                .filter((c) => !c.members.some((m) => m.userId === u.id))
                                .map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    title={`${c.teacherName} · code ${c.joinCode}`}
                                    className="chip gap-1"
                                    onClick={() => act({ action: 'add_class_member', classId: c.id, userId: u.id }, `${u.name} added to ${c.name}.`)}
                                  >
                                    <Icon name="class" size={10} />
                                    {c.name}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={`chip ${
                        u.status === 'active' ? 'chip-active' : u.status === 'suspended' ? 'border-destructive/50 text-destructive' : ''
                      }`}
                    >
                      {u.status === 'pending' && !u.emailVerifiedAt ? 'unverified' : u.status}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <Icon
                      name={u.totpEnabled ? 'secure' : 'close'}
                      size={16}
                      className={u.totpEnabled ? 'text-good' : 'text-muted-foreground'}
                    />
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {!u.emailVerifiedAt && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => act({ action: 'verify_user_email', userId: u.id }, `${u.name}'s email marked verified.`)}
                        >
                          Verify email
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          if (window.confirm(`Sign ${u.name} out of every device? They can sign back in.`)) {
                            act({ action: 'revoke_sessions', userId: u.id }, `${u.name} signed out everywhere.`);
                          }
                        }}
                      >
                        Sign out everywhere
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          act(
                            {
                              action: u.status === 'suspended' ? 'activate_user' : 'suspend_user',
                              userId: u.id,
                            },
                            `${u.name} ${u.status === 'suspended' ? 'reactivated' : 'suspended'}.`,
                          )
                        }
                      >
                        {u.status === 'suspended' ? 'Activate' : 'Suspend'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Classes (all of them, any owner) ────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Classes</h2>
          <span className="chip">{data?.classes.length ?? 0} on the platform</span>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Every class with its owner and code. Rename, retune owner or subject, remove members — teachers manage their own from Teaching.
        </p>
        {(data?.classes.length ?? 0) === 0 ? (
          <p className="t-caption mt-3 text-muted-foreground">No classes exist yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {data?.classes.map((c) => (
              <div key={c.id} className="inset px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="t-strong flex items-center gap-2">
                      <Icon name="class" size={15} className="shrink-0 text-primary" />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="t-caption mt-0.5 block text-muted-foreground">
                      {c.teacherName} · {c.members.length} {c.members.length === 1 ? 'member' : 'members'} · code{' '}
                      <code className="font-mono tracking-[0.15em]">{c.joinCode}</code>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm gap-1.5"
                      aria-expanded={classRenameTo[c.id] !== undefined}
                      onClick={() => {
                        const next = { ...classRenameTo };
                        if (next[c.id] !== undefined) delete next[c.id];
                        else next[c.id] = c.name;
                        setClassRenameTo(next);
                      }}
                    >
                      <Icon name="edit" size={13} />
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm gap-1.5 text-destructive"
                      onClick={() => {
                        if (window.confirm(`Delete "${c.name}"? Its ${c.members.length} ${c.members.length === 1 ? 'member' : 'members'} lose the class; questions and XP are untouched.`)) {
                          void act({ action: 'delete_class', classId: c.id }, `Class "${c.name}" deleted.`);
                        }
                      }}
                    >
                      <Icon name="remove" size={13} />
                      Delete
                    </button>
                  </div>
                </div>

                {classRenameTo[c.id] !== undefined && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <input
                      className="input flex-1 sm:min-w-[200px]"
                      value={classRenameTo[c.id]}
                      onChange={(e) => setClassRenameTo({ ...classRenameTo, [c.id]: e.target.value })}
                      aria-label={`New name for ${c.name}`}
                      maxLength={80}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm shrink-0"
                      disabled={!classRenameTo[c.id].trim()}
                      onClick={() =>
                        void act({ action: 'rename_class', classId: c.id, name: classRenameTo[c.id].trim() }, 'Class renamed.').then(() => {
                          const next = { ...classRenameTo };
                          delete next[c.id];
                          setClassRenameTo(next);
                        })
                      }
                    >
                      Save
                    </button>
                  </div>
                )}

                {/* Owner + subject rows — selects, because the honest control
                    for "point this at someone else" is a pick list. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select
                    className="input max-w-[220px]"
                    value={c.teacherId}
                    aria-label={`Owner of ${c.name}`}
                    onChange={(e) => act({ action: 'set_class_teacher', classId: c.id, teacherId: e.target.value }, `${c.name} now belongs to a new owner.`)}
                  >
                    {data?.users
                      .filter((u) => u.role !== 'student')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    {/* Always include the current owner even if they no longer
                        appear in the staff filter (stale data, demotion). */}
                    {!data?.users.some((u) => u.id === c.teacherId && u.role !== 'student') && (
                      <option value={c.teacherId}>{c.teacherName}</option>
                    )}
                  </select>
                  <select
                    className="input max-w-[200px]"
                    value={c.subjectId}
                    aria-label={`Subject of ${c.name}`}
                    onChange={(e) => act({ action: 'set_class_subject', classId: c.id, subjectId: e.target.value }, `${c.name} subject updated.`)}
                  >
                    <option value="">No subject</option>
                    {data?.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Roster — same chip grammar as the Users table. */}
                {c.members.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1">
                    {c.members.map((m) => (
                      <button
                        key={m.userId}
                        type="button"
                        title={`Remove ${m.name} from ${c.name}`}
                        className="chip gap-1"
                        onClick={() => act({ action: 'remove_class_member', classId: c.id, userId: m.userId }, `${m.name} removed from ${c.name}.`)}
                      >
                        {m.name}
                        <Icon name="close" size={10} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Audit ────────────────────────────────────────────────────────── */}
      {(data?.audit.length ?? 0) > 0 && (
        <BlurFade inView>
          <section className="card">
            <h2 className="t-strong">Audit log</h2>
            <p className="t-caption mt-1 text-muted-foreground">Every administrative action, newest first.</p>
            <div className="mt-3 space-y-1.5">
              {data?.audit.map((a) => (
                <div key={a.id} className="t-fine flex flex-wrap gap-x-2 font-mono text-muted-foreground">
                  <span className="tabular-nums">{new Date(a.createdAt).toLocaleString()}</span>
                  <span className="text-foreground">{a.action}</span>
                  <span>→ {a.target}</span>
                </div>
              ))}
            </div>
          </section>
        </BlurFade>
      )}
    </div>
  );
}

/**
 * One number with its label. `alarm` marks a count that means something is
 * wrong rather than merely small — a library with no public question in it, or
 * a topic nobody can practise.
 */
function Stat({ label, value, note, alarm }: { label: string; value: number; note?: string; alarm?: boolean }) {
  return (
    <div className="card p-4">
      <span className="t-caption text-muted-foreground">{label}</span>
      <div className={`t-display-sm num mt-1 ${alarm ? 'text-destructive' : ''}`}>{value}</div>
      {note && <span className="t-fine mt-0.5 block text-muted-foreground">{note}</span>}
    </div>
  );
}
