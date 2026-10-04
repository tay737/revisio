'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { InlineConfirm } from '@/components/ui/inline-confirm';
import { tierColor, TIER_ORDER, type Tier } from '@/domain/ranked';
import { rewardLadder, type SeasonReward } from '@/domain/seasons';

/**
 * Season configuration.
 *
 * Seasons used to be ninety days counted from a constant, which meant the only
 * things anyone could do with them were none. This panel is where an operator
 * opens the next season, stretches one over a holiday, renames it, or pays a
 * different reward for a tier — the four things that come up in the first week
 * of running a competitive season and were impossible before.
 *
 * ── What the panel deliberately does not do ────────────────────────────────
 *
 * It does not let you create two overlapping windows. Two live windows would
 * leave every XP aggregate in the product claiming the same days and
 * `seasonAt` picking a winner silently; the API refuses the write with the
 * number of the season it collides with, which is a better answer than a
 * button that appears to work.
 *
 * ── Rewards are sparse ─────────────────────────────────────────────────────
 *
 * The reward editor starts from the built-in ladder and only sends the tiers
 * you actually changed. An operator renaming the Gold reward should not have to
 * restate the other nine, and a season with no overrides must keep paying
 * exactly what the shipped design says it pays.
 */

type SeasonRow = {
  number: number;
  name: string | null;
  startsAt: string;
  endsAt: string;
  state: 'draft' | 'active' | 'closed';
  grandfatherRp: boolean;
  note: string | null;
  rewards: Record<string, { name: string; detail: string; icon: string }> | null;
  /** Learners with a recorded result — blocks a delete. */
  results: number;
};

type Draft = {
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  note: string;
  state: 'draft' | 'active' | 'closed';
  grandfatherRp: boolean;
  rewards: Record<string, { name: string; detail: string; icon: string }>;
};

const ICONS: SeasonReward['icon'][] = ['climb', 'crown', 'rank', 'league'];

/** `Date` → the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants, in UTC. */
function toLocalInput(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 16);
}

function toDraft(row: SeasonRow): Draft {
  return {
    number: row.number,
    name: row.name ?? '',
    startsAt: toLocalInput(row.startsAt),
    endsAt: toLocalInput(row.endsAt),
    note: row.note ?? '',
    state: row.state,
    grandfatherRp: row.grandfatherRp,
    // Seed the editor from the built-in ladder so an untouched reward is
    // visibly the shipped one; only genuinely-overridden tiers are sent.
    rewards: Object.fromEntries(
      rewardLadder().map((r) => [r.tier, { ...(row.rewards?.[r.tier] ?? r.reward) }]),
    ),
  };
}

/** Ninety days from the end of the last season, as the default for a new one. */
function proposeNext(latest: SeasonRow | undefined): Draft {
  const base = latest ? new Date(latest.endsAt) : new Date();
  const end = new Date(base.getTime() + 90 * 86_400_000);
  return {
    number: (latest?.number ?? 0) + 1,
    name: '',
    startsAt: toLocalInput(base),
    endsAt: toLocalInput(end),
    note: '',
    state: 'draft',
    // A new season must NOT grandfather: that is what makes it a season rather
    // than a continuation of the one before.
    grandfatherRp: false,
    rewards: Object.fromEntries(rewardLadder().map((r) => [r.tier, { ...r.reward }])),
  };
}

export function SeasonManager() {
  const { data, error: loadError, isLoading, mutate } = useSWR<{ seasons: SeasonRow[] }>(
    '/api/v1/admin/seasons',
    api.get,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [editing, setEditing] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const rows = useMemo(() => data?.seasons ?? [], [data]);
  const latest = useMemo(() => rows[rows.length - 1], [rows]);
  const active = useMemo(() => rows.find((r) => r.state === 'active'), [rows]);

  // The clock on the live season, recomputed on a timer rather than only on
  // render — an operator leaving this panel open across a boundary should see
  // the season roll over without reloading.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const save = async (draft: Draft) => {
    setError('');
    setMessage('');
    // Only send rewards that differ from the built-in ladder, so an untouched
    // tier costs the operator nothing and a future default change reaches every
    // season that never overrode it.
    const base = new Map(rewardLadder().map((r) => [r.tier, r.reward]));
    const rewards: Record<string, { name: string; detail: string; icon: string }> = {};
    for (const [tier, reward] of Object.entries(draft.rewards)) {
      const b = base.get(tier as Tier);
      if (!b || b.name !== reward.name || b.detail !== reward.detail || b.icon !== reward.icon) {
        rewards[tier] = reward;
      }
    }

    try {
      await api.post('/api/v1/admin', {
        action: 'upsert_season',
        seasonNumber: draft.number,
        seasonName: draft.name.trim() || null,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        note: draft.note.trim() || null,
        rewards: Object.keys(rewards).length > 0 ? rewards : null,
        seasonState: draft.state,
        grandfatherRp: draft.grandfatherRp,
      });
      setMessage(`Season ${draft.number} saved. It is live for everyone on the next request.`);
      setEditing(null);
      void mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That season did not save.');
    }
  };

  const setState = async (row: SeasonRow, state: SeasonRow['state']) => {
    setError('');
    setMessage('');
    try {
      await api.post('/api/v1/admin', {
        action: 'set_season_state',
        seasonNumber: row.number,
        seasonState: state,
      });
      setMessage(`Season ${row.number} is now ${state}.`);
      void mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change did not go through.');
    }
  };

  const remove = async (row: SeasonRow) => {
    setError('');
    setMessage('');
    try {
      await api.post('/api/v1/admin', { action: 'delete_season', seasonNumber: row.number });
      setMessage(`Season ${row.number} deleted.`);
      void mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That season could not be deleted.');
    }
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Notice tone="good" show={!!message}>{message}</Notice>
      <Notice tone="bad" show={!!error || !!loadError}>
        {error || (loadError instanceof Error ? loadError.message : '')}
      </Notice>

      {editing && (
        <SeasonEditor
          draft={editing}
          onCancel={() => setEditing(null)}
          onSave={save}
          busy={false}
        />
      )}

      {!editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm gap-2"
            onClick={() => setEditing(proposeNext(latest))}
          >
            <Icon name="add" size={15} />
            New season
          </button>
          {active && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditing(toDraft(active))}
            >
              Edit {active.name || `season ${active.number}`}
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            No seasons configured. Until one exists the app falls back to a fixed ninety-day schedule from
            5 January 2026, so the rank still works — it just cannot be moved.
          </p>
        )}
        {rows.map((row) => {
          const start = new Date(row.startsAt);
          const end = new Date(row.endsAt);
          const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
          const live = row.state === 'active';
          const overrides = Object.keys(row.rewards ?? {}).length;
          return (
            <div
              key={row.number}
              className={
                'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3.5 ' +
                (live ? 'border-foreground bg-secondary' : 'border-border')
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="t-caption-s">{row.name || `Season ${row.number}`}</span>
                  <span
                    className={
                      'badge badge-quiet capitalize' + (live ? ' border-foreground text-foreground' : '')
                    }
                  >
                    {row.state}
                  </span>
                  {row.grandfatherRp && (
                    <span
                      className="badge badge-quiet"
                      title="XP earned before this season opened still counts toward it"
                    >
                      Counts all past XP
                    </span>
                  )}
                  {overrides > 0 && (
                    <span className="badge badge-quiet" title="This season overrides the default rewards">
                      {overrides} reward{overrides === 1 ? '' : 's'} custom
                    </span>
                  )}
                </div>
                <p className="t-fine mt-1 text-muted-foreground">
                  <span className="num">
                    {start.toISOString().slice(0, 10)} → {end.toISOString().slice(0, 10)}
                  </span>{' '}
                  · {days} days
                  {live && (
                    <>
                      {' '}
                      · day{' '}
                      {Math.min(
                        days,
                        Math.max(1, Math.floor((Date.now() - start.getTime()) / 86_400_000) + 1),
                      )}{' '}
                      of {days}
                    </>
                  )}
                </p>
                {row.note && <p className="t-fine mt-1 text-muted-foreground">{row.note}</p>}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(toDraft(row))}>
                  Edit
                </button>
                {!live && row.state !== 'active' && (
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => setState(row, 'active')}
                    disabled={row.results > 0 && row.number !== active?.number}
                  >
                    Make active
                  </button>
                )}
                {live && (
                  <button type="button" className="btn btn-subtle btn-sm" onClick={() => setState(row, 'closed')}>
                    Close
                  </button>
                )}
                <InlineConfirm
                  label="Delete"
                  title={`Season ${row.number} loses its window, its name and its rewards.`}
                  message={
                    row.results > 0
                      ? `Blocked: ${row.results} learner(s) have a recorded result in it. Close it instead.`
                      : 'Closed seasons with results cannot be deleted.'
                  }
                  confirmLabel="Delete season"
                  onConfirm={() => remove(row)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── the editor ──────────────────────────────────────────────────────────────

function SeasonEditor({
  draft,
  onCancel,
  onSave,
  busy,
}: {
  draft: Draft;
  onCancel: () => void;
  onSave: (draft: Draft) => void;
  busy: boolean;
}) {
  const [d, setD] = useState(draft);
  const [showRewards, setShowRewards] = useState(
    Object.keys(draft.rewards).length !== TIER_ORDER.length,
  );
  const days = Math.max(
    0,
    Math.round(
      (new Date(`${d.endsAt}Z`).getTime() - new Date(`${d.startsAt}Z`).getTime()) / 86_400_000,
    ),
  );

  return (
    <div className="rounded-lg border border-border bg-secondary p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="t-strong">
          Season {d.number}
          {d.name && <span className="font-normal text-muted-foreground"> — {d.name}</span>}
        </h3>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || days <= 0}
            onClick={() => onSave(d)}
          >
            {busy ? 'Saving…' : 'Save season'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="t-caption-s">Season number</span>
          <input
            type="number"
            min={1}
            value={d.number}
            onChange={(e) => setD({ ...d, number: Number(e.target.value) })}
            className="input mt-1.5"
          />
        </label>
        <label className="block">
          <span className="t-caption-s">Name</span>
          <input
            type="text"
            value={d.name}
            placeholder={`Season ${d.number}`}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            className="input mt-1.5"
          />
          <span className="t-fine mt-1 block text-muted-foreground">
            Leave empty to show &ldquo;Season {d.number}&rdquo;.
          </span>
        </label>
        <label className="block">
          <span className="t-caption-s">Starts (UTC)</span>
          <input
            type="datetime-local"
            value={d.startsAt}
            onChange={(e) => setD({ ...d, startsAt: e.target.value })}
            className="input mt-1.5"
          />
        </label>
        <label className="block">
          <span className="t-caption-s">Ends (UTC)</span>
          <input
            type="datetime-local"
            value={d.endsAt}
            onChange={(e) => setD({ ...d, endsAt: e.target.value })}
            className="input mt-1.5"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="t-caption-s">Operator note</span>
          <input
            type="text"
            value={d.note}
            placeholder="Why this window is what it is"
            onChange={(e) => setD({ ...d, note: e.target.value })}
            className="input mt-1.5"
          />
        </label>
        <label className="block">
          <span className="t-caption-s">State</span>
          <select
            value={d.state}
            onChange={(e) => setD({ ...d, state: e.target.value as Draft['state'] })}
            className="input mt-1.5"
          >
            <option value="draft">Draft — not yet live</option>
            <option value="active">Active — the live season</option>
            <option value="closed">Closed — finished, kept for the record</option>
          </select>
        </label>
        <div className="flex items-end">
          <p className="t-fine text-muted-foreground">
            {days > 0 ? `${days} days long.` : 'The end date has to be after the start date.'} Marking a
            season active closes whichever one was live.
          </p>
        </div>
      </div>

      {/* The one switch on this panel that can change somebody's rank, so it
          says plainly what it does. Season 1 has it on: everyone keeps the RP
          they have actually earned. Turning it on for a later season would
          mean the reset never happens. */}
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-border px-3.5 py-3">
        <input
          type="checkbox"
          checked={d.grandfatherRp}
          onChange={(e) => setD({ ...d, grandfatherRp: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
        />
        <span className="min-w-0">
          <span className="t-caption-s block">Count XP earned before this season</span>
          <span className="t-fine mt-0.5 block text-muted-foreground">
            On, a learner&apos;s rank for this season is everything they have ever earned, so editing the
            start date cannot take their progress away. Off, XP only counts from the start date onward —
            which is what makes a new season a reset. Right for season 1; wrong for every season after it.
          </span>
        </span>
      </label>

      <div className="mt-4 border-t border-border pt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setShowRewards((v) => !v)}
          aria-expanded={showRewards}
        >
          <span>
            <span className="t-caption-s">Rewards</span>
            <span className="t-fine mt-0.5 block text-muted-foreground">
              Paid on the tier a learner finishes in. Leave these alone unless this season pays
              something different.
            </span>
          </span>
          <Icon name={showRewards ? 'close' : 'next'} size={16} className="shrink-0 text-muted-foreground" />
        </button>

        {showRewards && (
          <ul className="mt-3 space-y-2">
            {rewardLadder().map(({ tier, name, reward }) => {
              const r = d.rewards[tier] ?? { name: reward.name, detail: reward.detail, icon: reward.icon };
              const changed = r.name !== reward.name || r.detail !== reward.detail || r.icon !== reward.icon;
              return (
                <li
                  key={tier}
                  className={
                    'rounded-md border px-3.5 py-3 ' + (changed ? 'border-foreground' : 'border-border')
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: tierColor(tier) }}
                      aria-hidden
                    />
                    <span className="t-caption-s">{name}</span>
                    {changed && <span className="badge badge-quiet ml-auto">Custom</span>}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      type="text"
                      value={r.name}
                      aria-label={`${name} reward name`}
                      onChange={(e) =>
                        setD({ ...d, rewards: { ...d.rewards, [tier]: { ...r, name: e.target.value } } })
                      }
                      className="input"
                    />
                    <input
                      type="text"
                      value={r.detail}
                      aria-label={`${name} reward detail`}
                      onChange={(e) =>
                        setD({ ...d, rewards: { ...d.rewards, [tier]: { ...r, detail: e.target.value } } })
                      }
                      className="input"
                    />
                    <select
                      value={r.icon}
                      aria-label={`${name} reward icon`}
                      onChange={(e) =>
                        setD({
                          ...d,
                          rewards: {
                            ...d.rewards,
                            [tier]: { ...r, icon: e.target.value as SeasonReward['icon'] },
                          },
                        })
                      }
                      className="input"
                    >
                      {ICONS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
