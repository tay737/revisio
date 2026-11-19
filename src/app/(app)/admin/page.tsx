'use client';

import { Fragment, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { InlineConfirm } from '@/components/ui/inline-confirm';
import { ContentManager } from './ContentManager';
import { SeasonManager } from './SeasonManager';
import { ClozeMarking } from '../library/ClozeMarking';
import PageSkeleton from '@/components/PageSkeleton';
import { StudentProgressPanel } from '@/components/staff/StudentProgressPanel';
import { SRS_LADDER } from '@/domain/srs';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/lib/button-variants';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

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
  coveredTopics: { id: string; name: string; cardCount: number; lessonCount: number; hasNotes: number }[];
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
  /** Whose progress sheet is open — developers may inspect any account. */
  const [progressFor, setProgressFor] = useState<{ id: string; name: string; siblings?: { id: string; name: string }[] } | null>(null);
  /** Name/email filter for the users table. */
  const [userFilter, setUserFilter] = useState('');
  /** Per-user badges/classes management, disclosed one row at a time. */
  const [manageFor, setManageFor] = useState<string | null>(null);
  /** Uncommitted role picks — a select alone must not retier an account. */
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  const load = () =>
    api
      .get<AdminData>('/api/v1/admin')
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (!loading && me?.role === 'developer') load();
  }, [me, loading]);

  if (loading) return <PageSkeleton variant="list" />;

  if (me?.role !== 'developer') {
    return (
      <Card className="p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive-ink">
          <Icon name="private" size={22} />
        </span>
        <h1 className="t-tagline mt-4">Developers only</h1>
        <p className="t-caption mt-2 text-muted-foreground">
          Algorithms, feature flags, approvals and user management live behind this door.
        </p>
      </Card>
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
  const userQuery = userFilter.trim().toLowerCase();
  const visibleUsers = (data?.users ?? []).filter(
    (u) => !userQuery || u.name.toLowerCase().includes(userQuery) || u.email.toLowerCase().includes(userQuery),
  );


  type AdminUser = AdminData['users'][number];

  /** Status chip — shared by the sm+ table cell and the mobile card header. */
  const statusChip = (u: AdminUser) => (
    <span
      className={`chip ${
        u.status === 'active' ? 'chip-active' : u.status === 'suspended' ? 'border-destructive/50 text-destructive-ink' : ''
      }`}
    >
      {u.status === 'pending' && !u.emailVerifiedAt ? 'unverified' : u.status}
    </span>
  );

  /** 2FA state — icon + word, same pairing in both renderings. */
  const twoFactor = (u: AdminUser) => (
    <span className="flex items-center gap-1.5">
      <Icon
        name={u.totpEnabled ? 'secure' : 'close'}
        size={16}
        className={u.totpEnabled ? 'text-good-strong' : 'text-muted-foreground'}
      />
      <span className="t-fine text-muted-foreground">{u.totpEnabled ? 'On' : 'Off'}</span>
    </span>
  );

  /** Role select + pending-save row. The action existed in the API with no way
   *  to reach it — and a bare select fired it on one stray change, so the pick
   *  waits for an explicit Save. Shared so table and card cannot drift. */
  const roleControl = (u: AdminUser) => {
    const rolePending = roleDraft[u.id];
    return (
      <>
        <NativeSelect
          className="max-w-[130px] capitalize"
          value={rolePending ?? u.role}
          aria-label={`Role for ${u.name}`}
          onChange={(e) => {
            const next = e.target.value;
            setRoleDraft((prev) => {
              const draft = { ...prev };
              if (next === u.role) delete draft[u.id];
              else draft[u.id] = next;
              return draft;
            });
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </NativeSelect>
        {rolePending && rolePending !== u.role && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button
              type="button"
              variant="ghost" size="sm" className="shrink-0"
              onClick={() => {
                const role = rolePending;
                setRoleDraft((prev) => {
                  const draft = { ...prev };
                  delete draft[u.id];
                  return draft;
                });
                void act({ action: 'set_user_role', userId: u.id, role }, `${u.name} is now ${role}.`);
              }}
            >
              Save role
            </Button>
            <span className="t-fine text-muted-foreground">
              {rolePending === 'developer'
                ? 'Developer gets admin access.'
                : rolePending === 'teacher'
                  ? 'Can create and run classes.'
                  : 'Loses staff access.'}
            </span>
          </div>
        )}
      </>
    );
  };

  /** The per-row action cluster — Progress, Manage disclosure, Verify email,
   *  Sign out everywhere, Suspend/Activate. Wrappers differ per rendering
   *  (end-aligned in the table, wrapping in the card); the buttons are shared. */
  const userActionButtons = (u: AdminUser) => {
    const managing = manageFor === u.id;
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setProgressFor({ id: u.id, name: u.name, siblings: visibleUsers.map((x) => ({ id: x.id, name: x.name })) })}
          aria-label={`View progress for ${u.name}`}
        >
          Progress
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={managing}
          onClick={() => setManageFor(managing ? null : u.id)}
        >
          <Icon name={managing ? 'collapse' : 'expand'} size={13} className="mr-1" />
          Manage
        </Button>
        {!u.emailVerifiedAt && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => act({ action: 'verify_user_email', userId: u.id }, `${u.name}'s email marked verified.`)}
          >
            Verify email
          </Button>
        )}
        <InlineConfirm
          label="Sign out everywhere"
          title={`Sign ${u.name} out of every device?`}
          message="They can sign back in."
          confirmLabel="Sign out"
          onConfirm={() => act({ action: 'revoke_sessions', userId: u.id }, `${u.name} signed out everywhere.`)}
        />
        <InlineConfirm
          label={u.status === 'suspended' ? 'Activate' : 'Suspend'}
          title={u.status === 'suspended' ? `Reactivate ${u.name}?` : `Suspend ${u.name}?`}
          message={u.status === 'suspended' ? 'They can sign in again.' : 'They lose access immediately; nothing is deleted.'}
          confirmLabel={u.status === 'suspended' ? 'Activate' : 'Suspend'}
          onConfirm={() =>
            act(
              {
                action: u.status === 'suspended' ? 'activate_user' : 'suspend_user',
                userId: u.id,
              },
              `${u.name} ${u.status === 'suspended' ? 'reactivated' : 'suspended'}.`,
            )
          }
        />
      </>
    );
  };

  /** The badges/classes management panel — one implementation shared by the
   *  sm+ table's expanded row and the mobile card, so the two renderings
   *  cannot drift. */
  const managePanel = (u: AdminUser) => {
    const badgeOpen = badgePickerFor === u.id;
    const classOpen = classPickerFor === u.id;
    const worn = data?.userBadges.filter((g) => g.userId === u.id) ?? [];
    const inClasses = data?.classes.filter((c) => c.members.some((m) => m.userId === u.id)) ?? [];
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Badges — worn chips display state; removing one
            confirms, same as everywhere else on this page. */}
        <div>
          <span className="t-eyebrow">Badges</span>
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {worn.map((g) => {
                const b = data?.badges.find((x) => x.id === g.badgeId);
                if (!b) return null;
                return (
                  <span key={g.badgeId} className="flex items-center gap-1">
                    <span className="chip chip-active gap-1">{b.label}</span>
                    <InlineConfirm
                      label="Remove"
                      icon="remove"
                      ariaLabel={`Revoke badge ${b.label} from ${u.name}`}
                      title={`Revoke "${b.label}" from ${u.name}?`}
                      message="It disappears from their profile."
                      confirmLabel="Revoke"
                      onConfirm={() => act({ action: 'revoke_badge', userId: u.id, badgeId: b.id }, `Badge "${b.label}" revoked from ${u.name}.`)}
                    />
                  </span>
                );
              })}
              <Button variant="chip"
                type="button"
                aria-label={`Badges for ${u.name}`}
                aria-expanded={badgeOpen}
                className="gap-1"
                onClick={() => setBadgePickerFor(badgeOpen ? null : u.id)}
              >
                <Icon name={badgeOpen ? 'collapse' : 'add'} size={10} />
              </Button>
            </div>
            {badgeOpen && (
              <div className="inset space-y-2 rounded-md p-2.5">
                <div className="flex flex-wrap gap-1">
                  {(data?.badges.length ?? 0) === 0 && <span className="t-fine text-muted-foreground">Mint a badge first.</span>}
                  {data?.badges.filter((b) => !worn.some((g) => g.badgeId === b.id)).map((b) => (
                    <Button variant="chip"
                      key={b.id}
                      type="button"
                      className="gap-1"
                      onClick={() => act({ action: 'grant_badge', userId: u.id, badgeId: b.id }, `"${b.label}" granted to ${u.name}.`)}
                    >
                      <Icon name="add" size={10} />
                      {b.label}
                    </Button>
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
                          aria-disabled={held}
                          title={held ? `${a.name}: already granted` : a.description}
                          className={`chip gap-1 ${held ? 'chip-active' : ''}`}
                          onClick={() => {
                            if (held) return;
                            act({ action: 'grant_achievement', userId: u.id, achievementId: a.id }, `${a.name} granted to ${u.name}.`);
                          }}
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
        </div>
        {/* Classes — same grammar: chips display, removal confirms. */}
        <div>
          <span className="t-eyebrow">Classes</span>
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {inClasses.map((c) => (
                <span key={c.id} className="flex items-center gap-1">
                  <span className="chip chip-active gap-1">{c.name}</span>
                  <InlineConfirm
                    label="Remove"
                    icon="remove"
                    ariaLabel={`Remove ${u.name} from ${c.name}`}
                    title={`Remove ${u.name} from ${c.name}?`}
                    message="They can rejoin with the join code."
                    confirmLabel="Remove"
                    onConfirm={() => act({ action: 'remove_class_member', classId: c.id, userId: u.id }, `${u.name} removed from ${c.name}.`)}
                  />
                </span>
              ))}
              <Button variant="chip"
                type="button"
                aria-label={`Classes for ${u.name}`}
                aria-expanded={classOpen}
                className="gap-1"
                onClick={() => setClassPickerFor(classOpen ? null : u.id)}
              >
                <Icon name={classOpen ? 'collapse' : 'add'} size={10} />
              </Button>
            </div>
            {classOpen && (
              <div className="inset flex flex-wrap gap-1 rounded-md p-2.5">
                {(data?.classes.length ?? 0) === 0 && <span className="t-fine text-muted-foreground">No classes exist yet. A teacher can create one.</span>}
                {data?.classes
                  .filter((c) => !c.members.some((m) => m.userId === u.id))
                  .map((c) => (
                    <Button variant="chip"
                      key={c.id}
                      type="button"
                      title={`${c.teacherName} · code ${c.joinCode}`}
                      className="gap-1"
                      onClick={() => act({ action: 'add_class_member', classId: c.id, userId: u.id }, `${u.name} added to ${c.name}.`)}
                    >
                      <Icon name="class" size={10} />
                      {c.name}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

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
      <Card as="section">
        <h2 className="t-strong">Content</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Every topic with its counts. Publish, withdraw, open it, or merge two together.
        </p>
        <div className="mt-5">
          <ContentManager />
        </div>
      </Card>

      {/* ── Approvals ────────────────────────────────────────────────────── */}
      <Card as="section">
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
                  <Badge variant="chip" className="ml-2 capitalize">{a.roleRequested}</Badge>
                  {a.note && <p className="t-caption mt-1 text-muted-foreground">{a.note}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="primary" size="sm" className="gap-1.5"
                    onClick={() => act({ action: 'approve_request', approvalId: a.id }, `${a.name} approved.`)}
                  >
                    <Icon name="checked" size={14} />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="danger" className="gap-1.5"
                    onClick={() => act({ action: 'reject_request', approvalId: a.id }, `${a.name} rejected.`)}
                  >
                    <Icon name="close" size={14} />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant="ghost" className="gap-1.5"
                    onClick={() => act({ action: 'verify_user_email', userId: a.userId }, `${a.name}'s email marked verified.`)}
                  >
                    <Icon name="mail" size={14} />
                    Verify email
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Publishing queue ─────────────────────────────────────────────── */}
      <Card as="section">
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
                  <Icon name="topic" size={15} className="shrink-0 text-foreground" />
                  <span className="truncate">{t.name}</span>
                </span>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="primary" size="sm" className="gap-1.5"
                    onClick={() => act({ action: 'review_topic', topicId: t.id, approveTopic: true }, 'Published.')}
                  >
                    <Icon name="publish" size={14} />
                    Publish
                  </Button>
                  <Button
                    type="button"
                    variant="danger" className="gap-1.5"
                    onClick={() =>
                      act({ action: 'review_topic', topicId: t.id, approveTopic: false }, 'Sent back to private.')
                    }
                  >
                    <Icon name="close" size={14} />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Covered this week ──────────────────────────────────────────────── */}
      {data?.coveredTopics.length ? (
        <Card as="section">
          <div className="flex items-center justify-between gap-3">
            <h2 className="t-strong">Covered this week</h2>
            <span className={`chip ${data?.coveredTopics.length > 0 ? 'chip-active' : ''}`}>
              {data?.coveredTopics.filter((c) => c.cardCount === 0).length} without questions
            </span>
          </div>
          <p className="t-caption mt-1 text-muted-foreground">
            Topics that were covered in class this week (notes exist) but still need studyable questions. Pick one and generate a first batch of cloze, flashcards and multiple-choice from its notes.
          </p>

          <div className="mt-3 space-y-2">
            {data?.coveredTopics
              .filter((c) => c.cardCount === 0)
              .map((c) => (
                <div key={c.id} className="inset flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="t-strong">{c.name}</span>
                    <span className="t-fine ml-2 text-muted-foreground">
                      {c.lessonCount} {c.lessonCount === 1 ? 'note' : 'notes'} · no {c.cardCount === 0 ? 'questions' : 'enough questions'} yet
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="primary" size="sm" className="gap-1.5"
                    onClick={() =>
                      void act(
                        { action: 'generate_from_notes', topicId: c.id, maxCloze: 12, maxFlashcards: 6, maxMcq: 6 },
                        `Generated questions for ${c.name}.`,
                      ).then(() => {
                        // refresh data so the new card counts are visible
                        load();
                      })
                    }
                  >
                    <Icon name="xp" size={13} />
                    Generate questions
                  </Button>
                </div>
              ))}
            {data?.coveredTopics.filter((c) => c.cardCount === 0).length === 0 && (
              <p className="t-caption text-muted-foreground">Every covered topic already has questions.</p>
            )}
          </div>
        </Card>
      ) : (
        <Card as="section">
          <h2 className="t-strong">Covered this week</h2>
          <p className="t-caption mt-1 text-muted-foreground">
            Topics covered in class this week that still need questions are listed here once the approval queue builds up.
          </p>
          <p className="t-caption mt-3 text-muted-foreground">Nothing yet.</p>
        </Card>
      )}

      {/* ── Seasons ──────────────────────────────────────────────────────── */}
      <Card as="section">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Seasons</h2>
          <Badge variant="chip">rank resets here</Badge>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          The windows every learner&apos;s rank is measured inside. Open the next one, stretch this one over
          a holiday, rename it, or pay a different reward. The rank follows whatever these say.
        </p>
        <div className="mt-5">
          <SeasonManager />
        </div>
      </Card>

      {/* ── Subjects ─────────────────────────────────────────────────────── */}
      <Card as="section">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Subjects</h2>
          <Badge variant="chip">{data?.subjects.length ?? 0}</Badge>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          The course a topic hangs from. Renaming keeps its topics; deleting removes everything under it. Maths practice is a standalone tool. Turning it on opens /practice for that subject and changes nothing about reviews or XP.
        </p>
        <div className="mt-3 space-y-2">
          {data?.subjects.map((s) => (
            <div key={s.id} className="inset flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="t-strong min-w-0 flex-1 truncate">{s.name}</span>
              <button
                type="button"
                className={buttonVariants({ variant: s.mathsEnabled ? 'primary' : 'ghost', size: 'sm', className: 'shrink-0' })}
                onClick={() => act({ action: 'set_subject_maths', subjectId: s.id, enabled: !s.mathsEnabled }, `Maths practice ${s.mathsEnabled ? 'off' : 'on'} for ${s.name}.`)}
              >
                <Icon name="practice" size={14} />
                Maths {s.mathsEnabled ? 'on' : 'off'}
              </button>
              <Input
                className="sm:max-w-[220px]"
                value={renameTo[s.id] ?? ''}
                onChange={(e) => setRenameTo((prev) => ({ ...prev, [s.id]: e.target.value }))}
                placeholder="Rename to…"
                aria-label={`New name for ${s.name}`}
              />
              <Button
                type="button"
                variant="ghost" size="sm" className="shrink-0"
                disabled={!renameTo[s.id]?.trim()}
                onClick={() => act({ action: 'rename_subject', subjectId: s.id, name: renameTo[s.id]!.trim() }, `${s.name} renamed.`)}
              >
                Rename
              </Button>
              <InlineConfirm
                label="Delete"
                icon="remove"
                title={`Delete “${s.name}”?`}
                message="Every topic, lesson and question inside it goes too. This cannot be undone."
                onConfirm={() => act({ action: 'delete_subject', subjectId: s.id }, `${s.name} deleted.`)}
              />
            </div>
          ))}
          {data?.subjects.length === 0 && <p className="t-caption text-muted-foreground">No subjects yet.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            className="sm:max-w-[220px]"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="New subject"
            aria-label="New subject name"
          />
          <Button
            type="button"
            variant="primary" className="shrink-0"
            disabled={!newSubject.trim()}
            onClick={() => act({ action: 'create_subject', name: newSubject.trim() }, `${newSubject.trim()} created.`).then(() => setNewSubject(''))}
          >
            Create
          </Button>
        </div>
      </Card>

      {/* ── Cloze marking ────────────────────────────────────────────────── */}
      <Card as="section">
        <h2 className="t-strong">Cloze marking</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          How strictly fill-the-blank answers are marked across the platform. A similar-but-wrong answer stays wrong, and the learner is warned how close it was. Teachers can override this per subject or topic.
        </p>
        <div className="mt-5">
          <ClozeMarking isDeveloper />
        </div>
      </Card>

      {/* ── Algorithms ───────────────────────────────────────────────────── */}
      <Card as="section">
        <h2 className="t-strong">Scheduling algorithms</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Which scheduler produces intervals. Changing this creates a new default for future reviews; existing
          cards keep their state.
        </p>
        <div className="mt-3 space-y-2">
          {data?.algorithms.map((a) => (
            <div key={a.name} className="inset px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono t-caption font-semibold">{a.name}</span>
                <Button
                  type="button"
                  variant="ghost" className="gap-1.5"
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
                </Button>
              </div>
              <p className="t-caption mt-1 text-muted-foreground">{a.description}</p>
              <p className="t-fine mt-1 break-all font-mono text-muted-foreground">{JSON.stringify(a.defaultParams)}</p>
            </div>
          ))}
        </div>

        {/* The strength ladder is scheduler-agnostic — every algorithm maps onto
            the same 12 rungs, so changing the scheduler never changes what a
            learner (or a teacher) is told their cards are worth. */}
        <div className="mt-4 border-t border-border/60 pt-4">
          <span className="t-eyebrow">Strength ladder (shared by every algorithm)</span>
          <p className="t-caption mt-1 text-muted-foreground">
            Each card is ranked 1–12 by the interval it currently holds. Level 12 is complete/burned.
          </p>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {SRS_LADDER.map((rung) => (
              <li key={rung.level} className="inset flex items-center justify-between gap-2 px-3 py-2">
                <span className="num t-caption font-semibold">
                  <span className="text-muted-foreground">Lv {rung.level}</span> · {rung.label}
                </span>
                <span className="t-fine num shrink-0 text-muted-foreground">{rung.interval ?? 'complete'}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4">
          <Label htmlFor="algo-params">
            Optional parameter overrides (JSON)
          </Label>
          <Textarea
            id="algo-params"
            className="t-fine min-h-[60px] font-mono"
            rows={2}
            value={algoParams}
            onChange={(e) => setAlgoParams(e.target.value)}
            placeholder='{"learningStepMinutes": 5}'
          />
        </div>
      </Card>

      {/* ── Feature flags ────────────────────────────────────────────────── */}
      <Card as="section">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Feature flags</h2>
          <Badge variant="chip">
            {enabledFlags} of {data?.flags.length ?? 0} enabled
          </Badge>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Flags reach the client through the <code>/me</code> payload and are cached for 30 seconds.
        </p>
        <div className="mt-3 space-y-2">
          {data?.flags.map((f) => (
            <div key={f.key} className="inset flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <span className="font-mono t-caption">{f.key}</span>
                <p className="t-caption break-all text-muted-foreground">{f.description}</p>
              </div>
              <button
                type="button"
                className={buttonVariants({ variant: f.enabled ? 'primary' : 'ghost', size: f.enabled ? 'sm' : undefined, className: 'shrink-0' })}
                onClick={() => act({ action: 'set_flag', flagKey: f.key, enabled: !f.enabled }, `${f.key} ${f.enabled ? 'disabled' : 'enabled'}.`)}
              >
                {f.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Badges ──────────────────────────────────────────────────────── */}
      <Card as="section">
        <h2 className="t-strong">Profile badges</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Chips that ride beside the role badge on a profile: a {'<3'}, an Alpha Tester, whatever you mint.
          Grant them per user below; deleting one removes it from every profile wearing it.
        </p>

        {data?.badges.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.badges.map((b) => (
              <span key={b.id} className="flex flex-wrap items-center gap-1.5">
                <Badge variant="chip-active" className="gap-2">
                  {b.icon && <Icon name={b.icon as never} size={12} />}
                  {b.label}
                  <span className="num t-fine text-background/60">×{b.grants}</span>
                </Badge>
                <InlineConfirm
                  label="Remove"
                  icon="remove"
                  ariaLabel={`Remove badge ${b.label}`}
                  title={`Remove badge “${b.label}”?`}
                  message={`It disappears from all ${b.grants} profile(s) wearing it.`}
                  confirmLabel="Remove"
                  onConfirm={() => act({ action: 'delete_badge', badgeId: b.id }, `Badge "${b.label}" deleted.`)}
                />
              </span>
            ))}
          </div>
        ) : (
          <p className="t-caption mt-3 text-muted-foreground">No badges minted yet.</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-[180px]"
            placeholder="Label, e.g. <3"
            value={badgeLabel}
            maxLength={24}
            onChange={(e) => setBadgeLabel(e.target.value)}
            aria-label="Badge label"
          />
          <Input
            className="max-w-[140px]"
            placeholder="Icon (optional)"
            value={badgeIcon}
            onChange={(e) => setBadgeIcon(e.target.value)}
            aria-label="Badge icon name"
          />
          <NativeSelect
            className="max-w-[110px]"
            value={badgeColor}
            aria-label="Badge colour"
            onChange={(e) => setBadgeColor(e.target.value as typeof badgeColor)}
          >
            <option value="gold">gold</option>
            <option value="primary">ink</option>
            <option value="good">green</option>
            <option value="rose">rose</option>
          </NativeSelect>
          <Button
            type="button"
            variant="secondary"
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
          </Button>
        </div>
      </Card>

      {/* ── Users ────────────────────────────────────────────────────────── */}
      <Card as="section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="t-strong">Users</h2>
            <p className="t-caption mt-1 text-muted-foreground">
              {data?.users.length ?? 0} accounts. Suspending revokes access immediately; nothing is deleted.
            </p>
          </div>
          <Input
            className="sm:max-w-[240px]"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Filter by name or email"
            aria-label="Filter users"
          />
        </div>
        {/* The five-column table is the sm+ rendering; below it each user is a
            card — same content via the shared helpers, actions wrap instead of
            stacking 44px buttons inside a horizontally scrolling cell. */}
        <div className="mt-3 hidden overflow-x-auto sm:block">
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
              {visibleUsers.map((u) => {
                const managing = manageFor === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr className="border-t border-border/60">
                      <td className="py-3 pr-3">
                        <div className="t-strong">{u.name}</div>
                        <div className="t-fine text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="py-3 pr-3">{roleControl(u)}</td>
                      <td className="py-3 pr-3">{statusChip(u)}</td>
                      <td className="py-3 pr-3">{twoFactor(u)}</td>
                      <td className="py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">{userActionButtons(u)}</div>
                      </td>
                    </tr>
                    {managing && (
                      <tr className="border-t border-border/60">
                        <td colSpan={5} className="px-3 py-3">
                          {managePanel(u)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Below sm each user is a card in the Classes-section grammar — the
            table's five columns do not survive a 360px viewport. Every control
            is the same shared helper, so nothing is table-only. */}
        <div className="mt-3 space-y-2 sm:hidden">
          {visibleUsers.map((u) => {
            const managing = manageFor === u.id;
            return (
              <div key={u.id} className="inset px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <div className="min-w-0">
                    <span className="t-strong block truncate">{u.name}</span>
                    <span className="t-fine block truncate text-muted-foreground">{u.email}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusChip(u)}
                    {twoFactor(u)}
                  </div>
                </div>
                <div className="mt-2.5">{roleControl(u)}</div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">{userActionButtons(u)}</div>
                {managing && (
                  <div className="mt-3 border-t border-border/60 pt-3">{managePanel(u)}</div>
                )}
              </div>
            );
          })}
        </div>
        {userQuery && visibleUsers.length === 0 && (
          <p className="t-caption mt-3 text-muted-foreground">No accounts match “{userFilter.trim()}”.</p>
        )}
      </Card>

      {/* ── Classes (all of them, any owner) ────────────────────────────── */}
      <Card as="section">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-strong">Classes</h2>
          <Badge variant="chip">{data?.classes.length ?? 0} on the platform</Badge>
        </div>
        <p className="t-caption mt-1 text-muted-foreground">
          Every class with its owner and code. Rename, retune owner or subject, remove members. Teachers manage their own from Teaching.
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
                      <Icon name="class" size={15} className="shrink-0 text-foreground" />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="t-caption mt-0.5 block text-muted-foreground">
                      {c.teacherName} · {c.members.length} {c.members.length === 1 ? 'member' : 'members'} · code{' '}
                      <code className="font-mono tracking-[0.15em]">{c.joinCode}</code>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost" size="sm" className="gap-1.5"
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
                    </Button>
                    <InlineConfirm
                      label="Delete"
                      icon="remove"
                      title={`Delete “${c.name}”?`}
                      message={`Its ${c.members.length} ${c.members.length === 1 ? 'member' : 'members'} lose the class; questions and XP are untouched.`}
                      onConfirm={() => void act({ action: 'delete_class', classId: c.id }, `Class "${c.name}" deleted.`)}
                    />
                  </div>
                </div>

                {classRenameTo[c.id] !== undefined && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Input
                      className="flex-1 sm:min-w-[200px]"
                      value={classRenameTo[c.id]}
                      onChange={(e) => setClassRenameTo({ ...classRenameTo, [c.id]: e.target.value })}
                      aria-label={`New name for ${c.name}`}
                      maxLength={80}
                    />
                    <Button
                      type="button"
                      variant="primary" size="sm" className="shrink-0"
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
                    </Button>
                  </div>
                )}

                {/* Owner + subject rows — selects, because the honest control
                    for "point this at someone else" is a pick list. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <NativeSelect
                    className="max-w-[220px]"
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
                  </NativeSelect>
                  <NativeSelect
                    className="max-w-[200px]"
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
                  </NativeSelect>
                </div>

                {/* Roster — chips display membership; removal confirms. */}
                {c.members.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {c.members.map((m) => (
                      <span key={m.userId} className="flex items-center gap-1">
                        <span className="chip gap-1">{m.name}</span>
                        <InlineConfirm
                          label="Remove"
                          icon="close"
                          ariaLabel={`Remove ${m.name} from ${c.name}`}
                          title={`Remove ${m.name} from ${c.name}?`}
                          message="They can rejoin with the code."
                          confirmLabel="Remove"
                          onConfirm={() => act({ action: 'remove_class_member', classId: c.id, userId: m.userId }, `${m.name} removed from ${c.name}.`)}
                        />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Audit ────────────────────────────────────────────────────────── */}
      {(data?.audit.length ?? 0) > 0 && (
        
          <Card as="section">
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
          </Card>
        
      )}

      {/* ── Student progress sheet ──────────────────────────────────────── */}
      {progressFor && (
        <StudentProgressPanel
          userId={progressFor.id}
          name={progressFor.name}
          siblings={progressFor.siblings}
          onNavigate={(u) => setProgressFor({ ...u, siblings: progressFor.siblings })}
          onClose={() => setProgressFor(null)}
        />
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
    <Card className="p-4">
      <span className="t-caption text-muted-foreground">{label}</span>
      <div className={`t-display-sm num mt-1 ${alarm ? 'text-destructive-ink' : ''}`}>{value}</div>
      {note && <span className="t-fine mt-0.5 block text-muted-foreground">{note}</span>}
    </Card>
  );
}
