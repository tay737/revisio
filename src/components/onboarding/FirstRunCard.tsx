'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/lib/button-variants';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { setQuietMode } from '@/lib/quiet';
import { dismissOnboarding, readOnboarding, type OnboardingState } from '@/lib/onboarding';
import { topicSortKey, type Topic } from '@/app/(app)/learn/[subjectId]/shared';
import type { Me } from '@/lib/useMe';
import { cn } from '@/lib/utils';

type ContentTopic = Topic & { cards?: number; lessons?: number };
type Starter = { id: string; name: string; subjectId: string };

/**
 * The first-run checklist — ticket #10.
 *
 * A new student used to land on a dashboard that said "ten minutes on one
 * topic is enough" and then offered a catalogue to browse. This card is the
 * guided version of that sentence: three steps, one recommended topic picked
 * from the subjects they chose at sign-up, and a single tap into a first
 * exposure session (`/review?topic=` already pairs the cards with the notes,
 * so "read, then answer" is one destination rather than two decisions).
 *
 * When it shows: students only, until the account has graded its first card
 * (`srs.totalCards` counts scheduler states, which only a submitted review
 * creates). "Not now" persists per device; every other step re-derives from
 * `/me`, so the card can never claim progress the account does not have.
 */
export function FirstRunCard({ me }: { me: Me }) {
  const [flags, setFlags] = useState<OnboardingState | null>(null);
  const [starter, setStarter] = useState<Starter | null>(null);
  // Comfort offers (audit #84): quiet mode and session length are decided
  // before the first session, not discovered later in Settings. Local state
  // mirrors the pref so the control responds instantly; the PATCH is the
  // record.
  const [quiet, setQuiet] = useState(me.prefs?.quietMode ?? false);
  const [sessionLen, setSessionLen] = useState<5 | 10 | 20>(me.prefs?.sessionLength ?? 20);
  const [focus, setFocus] = useState(me.prefs?.focusMode ?? false);
  const [breaks, setBreaks] = useState(me.prefs?.breakReminders ?? true);

  // `/me` refreshes can land after a toggle; keep the controls honest with
  // whatever the account actually holds.
  useEffect(() => {
    setQuiet(me.prefs?.quietMode ?? false);
    setSessionLen(me.prefs?.sessionLength ?? 20);
    setFocus(me.prefs?.focusMode ?? false);
    setBreaks(me.prefs?.breakReminders ?? true);
  }, [me.prefs?.quietMode, me.prefs?.sessionLength, me.prefs?.focusMode, me.prefs?.breakReminders]);

  const saveComfort = (patch: Record<string, unknown>) => {
    void api.patch('/api/v1/me', { prefs: patch }).catch(() => undefined);
  };

  const eligible =
    me.role === 'student' && me.srs.totalCards === 0 && (flags ? !flags.dismissed : true);

  // Device flags load after mount (localStorage is not available during SSR,
  // and reading it in a state initialiser would hydrate-mismatch).
  useEffect(() => {
    setFlags(readOnboarding(me.id));
  }, [me.id]);

  // The recommended starter: the first topic with questions under the first
  // followed subject that has any — subject order is the order the student
  // picked at sign-up, so the suggestion is theirs, not ours.
  const subjectKey = me.subjects.map((s) => s.id).join(',');
  useEffect(() => {
    // `flags` must be loaded first: until then `eligible` cannot know the
    // card was dismissed, and the fetch below would fire for it anyway.
    if (!eligible || !flags || me.subjects.length === 0) return;
    let alive = true;
    void (async () => {
      for (const subject of me.subjects.slice(0, 3)) {
        try {
          const d = await api.get<{ topics: ContentTopic[] }>(
            `/api/v1/content?subjectId=${encodeURIComponent(subject.id)}`,
          );
          const withCards = d.topics.filter((t) => (t.cards ?? 0) > 0);
          const pool = withCards.length > 0 ? withCards : d.topics;
          if (pool.length === 0) continue;
          const best = [...pool].sort(topicSortKey)[0];
          if (alive) {
            setStarter({ id: best.id, name: best.name, subjectId: subject.id });
            return;
          }
        } catch {
          // A subject that fails to load just moves the search to the next one.
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subjectKey stands in for the ids array
  }, [eligible, flags, subjectKey, me.id]);

  if (!eligible || !flags) return null;

  const notesHref = starter ? `/learn/${starter.subjectId}/${starter.id}` : '/learn';
  const reviewHref = starter ? `/review?topic=${starter.id}` : '/review';

  const steps = [
    {
      done: me.subjects.length > 0,
      title: me.subjects.length > 0 ? 'Subjects picked' : 'Pick your subjects',
      hint:
        me.subjects.length > 0
          ? me.subjects.map((s) => s.name).join(', ')
          : 'Choose what you are studying so the queue has material.',
      href: '/learn',
      cta: 'Browse',
    },
    {
      done: flags.notesRead,
      title: 'Read the notes',
      hint: starter ? `Start with “${starter.name}”.` : 'Open a topic and read before you guess.',
      href: notesHref,
      cta: 'Read',
    },
    {
      done: me.srs.totalCards > 0,
      title: 'Do your first review',
      hint: starter
        ? 'Its questions come with the notes beside them.'
        : 'Answer a few cards to start your schedule.',
      href: reviewHref,
      cta: starter ? 'Start now' : 'Start',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="p-5 sm:p-6" aria-labelledby="first-run-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow">Getting started</p>
          <h2 id="first-run-title" className="t-strong mt-1">
            Your first session
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissOnboarding(me.id);
            setFlags({ ...flags, dismissed: true });
          }}
          aria-label="Hide the getting started checklist"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-(--dur-out) hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-valuetext={`${doneCount} of ${steps.length} steps done`}
        className="mt-4 h-1 overflow-hidden rounded-full bg-border"
      >
        <div
          // Progress-meter sweep: transform, but a 90ms snap would read as a
          // flicker — 300ms matches DUR.base, the meter tempo in lib/motion.
          className="h-full origin-left bg-foreground transition-transform duration-300"
          style={{ transform: `scaleX(${doneCount / steps.length})` }}
        />
      </div>
      <p className="t-fine mt-2 text-muted-foreground">
        {doneCount} of {steps.length} done
      </p>

      <ol className="mt-4 space-y-1">
        {steps.map((step, i) => (
          <li key={step.title} className="flex items-center gap-3 py-2">
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                step.done ? 'bg-good-soft text-good-strong' : 'bg-secondary text-muted-foreground',
              )}
              aria-hidden
            >
              {step.done ? <Icon name="correct" size={15} /> : <span className="t-caption font-semibold num">{i + 1}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('t-strong block', step.done && 'text-muted-foreground')}>{step.title}</span>
              <span className="t-caption block truncate text-muted-foreground">{step.hint}</span>
            </span>
            {!step.done && (
              <Link
                href={step.href}
                className={buttonVariants({
                  variant: i === steps.length - 1 ? 'primary' : 'secondary',
                  size: 'sm',
                  className: 'shrink-0',
                })}
              >
                {step.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {/* Comfort offers — before the first session is the moment a student
          decides how the app should feel, not after they have bounced off it. */}
      <div className="mt-4 border-t border-border pt-4">
        <p className="t-fine font-semibold text-muted-foreground">Make it yours</p>
        <div className="mt-1 divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <label htmlFor="firstrun-quiet" className="t-caption font-semibold">Quiet mode</label>
              <p className="t-fine text-muted-foreground">Calmer colours, no confetti.</p>
            </div>
            <Switch
              id="firstrun-quiet"
              on={quiet}
              onToggle={() => {
                const next = !quiet;
                setQuiet(next);
                setQuietMode(next);
                saveComfort({ quietMode: next });
              }}
              label="Quiet mode"
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <label htmlFor="firstrun-session-len" className="t-caption font-semibold">Cards per session</label>
              <p className="t-fine text-muted-foreground">Five is a gentle start.</p>
            </div>
            <NativeSelect
              id="firstrun-session-len"
              className="max-w-[110px]"
              value={String(sessionLen)}
              onChange={(e) => {
                const next = Number(e.target.value) as 5 | 10 | 20;
                setSessionLen(next);
                saveComfort({ sessionLength: next });
              }}
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </NativeSelect>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <label htmlFor="firstrun-focus" className="t-caption font-semibold">Focus sessions</label>
              <p className="t-fine text-muted-foreground">Hide everything but the card while you review.</p>
            </div>
            <Switch
              id="firstrun-focus"
              on={focus}
              onToggle={() => {
                const next = !focus;
                setFocus(next);
                saveComfort({ focusMode: next });
              }}
              label="Focus sessions"
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <label htmlFor="firstrun-breaks" className="t-caption font-semibold">Break reminders</label>
              <p className="t-fine text-muted-foreground">A nudge every 10 cards.</p>
            </div>
            <Switch
              id="firstrun-breaks"
              on={breaks}
              onToggle={() => {
                const next = !breaks;
                setBreaks(next);
                saveComfort({ breakReminders: next });
              }}
              label="Break reminders"
            />
          </div>
        </div>
      </div>

      <p className="t-fine mt-3 border-t border-border pt-3 text-muted-foreground">
        Your queue is the cards you are about to forget. A few each day keeps them fresh.
      </p>
    </Card>
  );
}
