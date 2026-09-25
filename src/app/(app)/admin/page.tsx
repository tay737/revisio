'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { BlurFade } from '@/components/ui/blur-fade';
import { ContentManager } from './ContentManager';
import PageSkeleton from '@/components/PageSkeleton';

type AdminData = {
  approvals: {
    id: string;
    name: string;
    email: string;
    roleRequested: string;
    note: string;
    status: string;
    createdAt: string;
  }[];
  flags: { key: string; description: string; enabled: boolean }[];
  algorithms: { name: string; description: string; defaultParams: Record<string, number> }[];
  users: { id: string; email: string; name: string; role: string; status: string; totpEnabled: boolean; createdAt: string }[];
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
  subjects: { id: string; name: string; slug: string }[];
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
          The course a topic hangs from. Renaming one keeps its topics.
        </p>
        <div className="mt-3 space-y-2">
          {data?.subjects.map((s) => (
            <div key={s.id} className="inset flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="t-strong min-w-0 flex-1 truncate">{s.name}</span>
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
                    <span
                      className={`chip ${
                        u.status === 'active' ? 'chip-active' : u.status === 'suspended' ? 'border-destructive/50 text-destructive' : ''
                      }`}
                    >
                      {u.status}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
