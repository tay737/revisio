'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  cachedPack,
  dropCardFromPack,
  enqueueReview,
  pendingCount,
  previewVerdict,
  primaryAnswer,
  savePack,
  syncOutbox,
  type OfflineCard,
  type OfflinePack,
} from '@/lib/offline';
import { useMe } from '@/lib/useMe';
import { useQuietMode } from '@/lib/quiet';
import { useRanked } from '@/lib/useRanked';
import { Icon, achievementIcon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { TilePanel } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/lib/button-variants';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { NumberTicker } from '@/components/ui/number-ticker';
import { SPRING, transition } from '@/lib/motion';
import { emptyQueueLine, sessionSummary } from '@/lib/profile';
import { rankChange, reviewsForRp, type Rank } from '@/domain/ranked';
import PageSkeleton from '@/components/PageSkeleton';
import { Markdown } from '@/components/Markdown';
import { ListenButton } from '@/components/listen-button';
import { ReferenceLink } from '@/components/reference-link';
import { cardSpeechText, markdownSpeechText } from '@/lib/speak';
import { whyHint } from '@/lib/why-hint';
import { useReviewSession } from '@/components/ReviewSessionContext';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type QueueCard = {
  id: string;
  kind: 'cloze' | 'flashcard' | 'mcq';
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  /** F7 deep-link targets. Optional: packs cached before the fields shipped
   *  simply render no link (honest absence). */
  lessonId?: string | null;
  lessonTitle?: string | null;
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
  stage: string;
  /** Strength rung 1–12 from the 12-level SRS ladder (domain/srs). Optional:
   *  sessions cached before this field existed still have to render. */
  srsLevel?: number;
  srsLabel?: string;
  /** Scheduler state behind "why is this due" (#18). Absent on packs cached
   *  before the fields existed — the reason line simply does not render. */
  dueAt?: string | null;
  lastReviewedAt?: string | null;
  reps?: number;
  lapses?: number;
  /** F10: set when the learner flagged this card "still confused" in an
   *  earlier session — seeds the verdict toggle's pressed state. Optional:
   *  packs cached before the field shipped have none. */
  confusedAt?: string | null;
};

type Verdict = {
  correct: boolean;
  feedbackKind: string;
  note?: string;
  matchedPhrases?: string[];
  missedPhrases?: string[];
};

type ReviewResult = {
  verdict: Verdict;
  primaryAnswer?: string;
  modelAnswer?: string;
  explanation?: string;
  xpAwarded: number;
  totalXp: number;
  level: number;
  streak: number;
  newAchievements: { id: string; name: string; icon: string; description: string }[];
  /** Strength rung after grading (absent for offline-queued answers). */
  srsLevel?: number;
  srsLabel?: string;
  /** Graded here and owed to the server — XP arrives when it lands. */
  queued?: boolean;
};

const KIND_LABEL: Record<QueueCard['kind'], string> = {
  cloze: 'Fill the blank',
  flashcard: 'Flashcard',
  mcq: 'Choose one',
};

/** "Why is this card here" (#18) — one plain line built from the scheduler
 *  state the queue already carries, so the answer is never a mystery. */
function dueReason(card: QueueCard, learnMode: boolean): string | null {
  if (learnMode) return 'First exposure. The notes are beside the card';
  const seen = (card.reps ?? 0) > 0 || !!card.lastReviewedAt;
  if (!seen) return 'New card. This first review starts its schedule';
  const bits: string[] = [];
  if (card.dueAt) {
    const diff = new Date(card.dueAt).getTime() - Date.now();
    if (diff <= 0) bits.push('was due');
    else bits.push(`next due in ${Math.max(1, Math.round(diff / 86_400_000))}d`);
  }
  if (card.lapses) bits.push(`${card.lapses} lapse${card.lapses === 1 ? '' : 's'}`);
  if (card.lastReviewedAt) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(card.lastReviewedAt).getTime()) / 60_000));
    const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
    bits.push(`last review ${ago}`);
  }
  return bits.length ? bits.join(' · ') : null;
}

type Note = { id: string; title: string; detailedMd: string; summaryMd: string; specRefs: string };
type FirstExposure = {
  topic: { id: string; name: string; description: string; subjectId: string; subjectName: string };
  notes: Note[];
  batch: QueueCard[];
  progress: { met: number; total: number; remaining: number };
};

/**
 * Daily review — the loop the whole product exists for.
 *
 * **The one design rule this screen follows:** green means you are earning
 * something. Everything you press *inside* a session is green with a flat bottom
 * lip that compresses under your thumb (docs/UI-SYSTEM.md), and every
 * action that navigates *away* from the session is ink. That single split is
 * what makes a review feel like a game round rather than a form, and it is why
 * the old `btn btn-primary` blue-on-everything version read as flat.
 *
 * The rest is the loop itself, unchanged and now much quieter: one card, one
 * question at display size, one uppercase action, and a verdict that lands as a
 * full-width band — green with a check, or red with the model answer. Enter
 * advances, so a session can be run without the mouse. Confetti is the local
 * ui/confetti wrapper, fired from a ref; it is the only celebratory effect in the app and it is
 * reserved for a correct answer and for a promotion.
 */
export default function ReviewClient() {
  // Sharing the shell's cache entries lets the empty state quote a real streak
  // and lets the session report know the rank it started from.
  const { me, loading: meLoading, refresh: refreshMe } = useMe();
  const { refresh: refreshRanked } = useRanked('weekly');
  const { setActive: setReviewActive, setFocus: setReviewFocus } = useReviewSession();
  // `?topic=` turns the same loop into first exposure. The card surface, the
  // grading and the report are identical; what changes is *which* cards are
  // chosen and that the notes are on screen while you answer.
  const topicId = useSearchParams().get('topic');
  // `?topicId=` scopes the ordinary due queue to one topic — the one-tap
  // "review this" action on a weak-topic recommendation (#18). Distinct from
  // `?topic=`, which is first exposure with notes alongside.
  const reviewTopicId = useSearchParams().get('topicId');
  // `?deal=N` is a one-session deal override ("Or start with 3 cards" on the
  // dashboard). Daily queue only — learn/cram keep their own sizing — and it
  // never writes the sessionLength pref: the promise is "just N", not "always N".
  const dealParam = useSearchParams().get('deal');
  const [session, setSession] = useState<FirstExposure | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  /** F5: pre-answer self-report. Metadata only in v1 — stored on
   *  review_logs.confidence, never fed to grading, XP, SRS or streaks. */
  const [confidence, setConfidence] = useState<'knew' | 'guessed' | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** True when the typed cloze answer is already exactly right — the input
   *  ticks green and Enter becomes "continue" instead of "check". */
  const [autoMark, setAutoMark] = useState(false);
  // Offline belongs to the *session*, not to a request: once a session is being
  // graded locally it stays local until it ends, so a verdict the learner has
  // already read cannot change underneath them mid-session.
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  // The rank report needs both ends of the session: the XP held before the first
  // card and after the last. Both come off the server's own totals rather than
  // being accumulated locally, so the report cannot disagree with `/me`.
  const [startXp, setStartXp] = useState<number | null>(null);
  const [latestXp, setLatestXp] = useState<number | null>(null);
  /** Set when the learner ends the session early — the summary still shows,
   *  and every answered card's XP and count is already banked, so nothing is
   *  lost; the remaining cards simply stay due. */
  const [ended, setEnded] = useState(false);
  const startRef = useRef<number>(Date.now());
  const confettiRef = useRef<ConfettiRef>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  // The cached pack's cards by id: the answer keys that make a local preview
  // possible. Held in a ref because it is looked up per keystroke-free submit
  // and never rendered.
  const offlineCards = useRef<Map<string, OfflineCard>>(new Map());

  // ── Session autonomy (#19) ──────────────────────────────────────────────
  // Three device-local choices: how many cards a session deals (5/10/20),
  // whether the chrome steps back (focus), and whether a nudge appears every
  // ten cards. The offline pack is deliberately untouched — it still caches
  // the full 20-card session, so a short session loses nothing it could have
  // dealt and "just one more" can reach the rest of the pack.
  const [dealSize, setDealSize] = useState(20);
  const [poolCount, setPoolCount] = useState(0);
  const [focus, setFocus] = useState(false);
  const [breaks, setBreaks] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [breakAck, setBreakAck] = useState(0);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const dealSizeRef = useRef(20);
  const poolRef = useRef<QueueCard[]>([]);
  /** Set once from `?deal=` — beats both the localStorage cache and the server
   *  pref for this session's first deal, and is never persisted. */
  const dealOverrideRef = useRef<number | null>(null);
  /** Server prefs are applied exactly once, on first `/me` arrival. */
  const serverPrefsApplied = useRef(false);

  // Device prefs load after mount (localStorage is unavailable during SSR).
  // The queue load waits for them so the first deal honours the saved length.
  useEffect(() => {
    try {
      const len = window.localStorage.getItem('revisio.sessionLength');
      if (len === '5' || len === '10' || len === '20') {
        dealSizeRef.current = Number(len);
        setDealSize(Number(len));
      }
      setFocus(window.localStorage.getItem('revisio.focusMode') === '1');
      setBreaks(window.localStorage.getItem('revisio.breakReminders') !== '0');
      // `?deal=` wins over the cached length for this session only.
      if (!topicId && dealParam) {
        const d = Number(dealParam);
        if (Number.isInteger(d) && d > 0) {
          dealOverrideRef.current = d;
          dealSizeRef.current = d;
          setDealSize(d);
        }
      }
    } catch {
      // Private mode or a full quota: the defaults stand.
    }
    setPrefsLoaded(true);
  }, [topicId, dealParam]);

  // Server-side source of truth for the three session prefs (F2): the
  // localStorage keys above are only the first-paint cache. Applied once,
  // only for keys the server actually sent, and before the first deal lands —
  // `load()` waits on `!meLoading`, so the deal below already honours these.
  useEffect(() => {
    const p = me?.prefs;
    if (serverPrefsApplied.current || !p) return;
    serverPrefsApplied.current = true;
    const write = (key: string, value: string) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Private mode: the pref still applies to this session.
      }
    };
    if (p.sessionLength === 5 || p.sessionLength === 10 || p.sessionLength === 20) {
      if (dealOverrideRef.current == null) {
        dealSizeRef.current = p.sessionLength;
        setDealSize(p.sessionLength);
      }
      write('revisio.sessionLength', String(p.sessionLength));
    }
    if (typeof p.focusMode === 'boolean') {
      setFocus(p.focusMode);
      write('revisio.focusMode', p.focusMode ? '1' : '0');
    }
    if (typeof p.breakReminders === 'boolean') {
      setBreaks(p.breakReminders);
      write('revisio.breakReminders', p.breakReminders ? '1' : '0');
    }
  }, [me?.prefs]);

  // Mirror the focus preference into the shell while a card is on screen.
  useEffect(() => {
    setReviewFocus(focus);
    return () => setReviewFocus(false);
  }, [focus, setReviewFocus]);

  /** One burst helper, so every celebration in this file is the same gesture. */
  const burst = useCallback((particleCount: number, y = 0.5) => {
    void confettiRef.current?.fire({
      particleCount,
      spread: 70,
      origin: { x: 0.5, y },
      startVelocity: 34,
      scalar: 0.9,
      disableForReducedMotion: true,
    });
  }, []);

  /** Keep the keys from a pack the server just gave us, so a session that loses
   * the network halfway through can still be finished. */
  const rememberPack = useCallback((pack: OfflinePack) => {
    savePack(pack);
    offlineCards.current = new Map(pack.cards.map((c) => [c.id, c]));
  }, []);

  const load = useCallback(async () => {
    setError('');
    let cards: QueueCard[] | null = null;
    let firstExposure: FirstExposure | null = null;
    let fromCache = false;

    if (topicId) {
      // First exposure reads a live topic alongside its notes; a card met for
      // the first time without the reading is a guess, so it stays a
      // connected-only session rather than a degraded offline one.
      try {
        firstExposure = await api.get<FirstExposure>(`/api/v1/learn?topicId=${encodeURIComponent(topicId)}&batch=4`);
        cards = firstExposure.batch;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load your queue.');
        cards = [];
      }
    } else {
      try {
        const data = await api.get<{ queue: QueueCard[] }>(
          `/api/v1/queue/today?limit=20${reviewTopicId ? `&topicId=${encodeURIComponent(reviewTopicId)}` : ''}`,
        );
        cards = data.queue;
        // Take a session with us for next time. Failing to cache is not failing
        // to load, so this never blocks the queue already on screen.
        try {
          rememberPack(await api.get<OfflinePack>('/api/v1/offline/pack?limit=20'));
        } catch {
          // keep the queue we have
        }
      } catch {
        // No server. Fall back to the session cached while online — the whole
        // point of having taken one — and grade it here.
        const pack = cachedPack();
        if (pack) {
          cards = pack.cards;
          offlineCards.current = new Map(pack.cards.map((c) => [c.id, c]));
          fromCache = true;
        } else {
          setError(
            'You are offline and no session is saved on this device yet. Open Revisio once with a connection and one will be waiting next time.',
          );
          cards = [];
        }
      }
    }

    setSession(firstExposure);
    // Deal only the chosen session length; the rest waits in the pool for
    // "just one more" or the next "Load more". First-exposure batches are
    // already small, so the slice is a no-op there.
    const dealt = cards.slice(0, dealSizeRef.current);
    poolRef.current = cards.slice(dealt.length);
    setPoolCount(poolRef.current.length);
    setQueue(dealt);
    setOffline(fromCache);
    setPending(pendingCount());
    setIdx(0);
    setSessionXp(0);
    setDone(0);
    setCorrect(0);
    setStartXp(null);
    setLatestXp(null);
    setEnded(false);
    setResult(null);
    setInput('');
    setSelected(null);
    setConfidence(null);
    setNotesOpen(false);
    setAutoMark(false);
    setBreakAck(0);
    setReviewActive(false);
    startRef.current = Date.now();
  }, [topicId, reviewTopicId, rememberPack, setReviewActive]);

  // Wait for the device prefs *and* `/me` so the first deal honours the
  // server-side session length; a failed `/me` resolves loading too, leaving
  // the localStorage cache as the fallback.
  useEffect(() => {
    if (prefsLoaded && !meLoading) void load();
  }, [prefsLoaded, meLoading, load]);

  // Hand back anything the server has not seen: once when this screen opens, and
  // again the moment the connection returns. This is the only place the outbox
  // is drained, so two callers can never send the same review.
  useEffect(() => {
    let disposed = false;
    const flush = async () => {
      if (pendingCount() === 0) return;
      const { sent } = await syncOutbox();
      if (disposed || sent === 0) return;
      setPending(pendingCount());
      refreshMe();
      refreshRanked();
    };
    void flush();
    window.addEventListener('online', flush);
    return () => {
      disposed = true;
      window.removeEventListener('online', flush);
    };
  }, [refreshMe, refreshRanked]);

  // `ended` collapses the active card to null, which is what makes the report the
  // destination for *both* ways out of a session — running the queue dry, and
  // pressing "End session". Testing `!card` on its own (which is what this did)
  // left `ended` setting a flag, firing the refresh effects, and then rendering
  // the very same card: the button looked broken because nothing on screen ever
  // changed.
  const card = ended ? null : queue?.[idx] ?? null;
  const progress = useMemo(
    () => (queue && queue.length > 0 ? Math.round((done / queue.length) * 100) : 0),
    [done, queue],
  );

  // Instant marking: while a cloze answer is being typed, grade it with the
  // same rules the server will apply (the pack already carries the answer keys
  // for exactly this). The moment it is right the input ticks green — the
  // learner stops typing and presses Enter once to move on. First-exposure
  // sessions carry no keys by design (the notes are on screen; a first attempt
  // is a guess), so there the button flow is unchanged. Wrong answers never
  // auto-mark: nothing red appears until the learner actually submits.
  useEffect(() => {
    if (!card || result || busy || card.kind !== 'cloze' || !input.trim()) {
      setAutoMark(false);
      return;
    }
    const key = offlineCards.current.get(card.id);
    if (!key) {
      setAutoMark(false);
      return;
    }
    setAutoMark(previewVerdict(key, { answer: input }).correct);
  }, [input, card, result, busy]);

  /** Grade this card. Resolves with the recorded result — server or local —
   *  or null when the answer never landed, so a caller that wants to advance
   *  on a correct answer can read the verdict it just produced. */
  const submit = useCallback(async (): Promise<ReviewResult | null> => {
    if (!card || busy || result) return null;
    const current = card;
    setBusy(true);
    setError('');

    const durationMs = Date.now() - startRef.current;
    const mode = topicId ? 'learn' : 'daily';

    /**
     * Grade this card here and owe the server the answer. Returns the local
     * result, or null when we hold no key for the card — the one case where
     * finishing offline is genuinely impossible.
     */
    const answerLocally = (): ReviewResult | null => {
      const local = offlineCards.current.get(current.id);
      if (!local) return null;
      const verdict = previewVerdict(local, { answer: input, selectedOptionId: selected ?? undefined });
      enqueueReview({
        cardId: current.id,
        answer: input,
        selectedOptionId: selected ?? undefined,
        durationMs,
        mode,
        confidence,
      });
      // XP is deliberately not invented here. The server awards it when the
      // review lands, and a number the learner was shown but never earned is
      // worse than one that arrives late.
      const localResult: ReviewResult = {
        verdict,
        primaryAnswer: primaryAnswer(local),
        xpAwarded: 0,
        totalXp: latestXp ?? 0,
        level: 0,
        streak: me?.gamification.streak ?? 0,
        newAchievements: [],
        queued: true,
      };
      setResult(localResult);
      setPending(pendingCount());
      setDone((d) => d + 1);
      if (verdict.correct) {
        setCorrect((c) => c + 1);
        burst(46, 0.46);
      }
      setOffline(true);
      return localResult;
    };

    if (offline) {
      const localResult = answerLocally();
      setBusy(false);
      return localResult;
    }

    try {
      const body =
        current.kind === 'mcq'
          ? { cardId: current.id, selectedOptionId: selected ?? '' }
          : { cardId: current.id, answer: input };
      const res = await api.post<ReviewResult>('/api/v1/reviews', { ...body, durationMs, mode, confidence });
      // LANDED: the server has graded and scheduled it, so it must not be dealt
      // again from the cached pack.
      dropCardFromPack(current.id);
      offlineCards.current.delete(current.id);
      setResult(res);
      setSessionXp((x) => x + res.xpAwarded);
      setStartXp((s) => s ?? Math.max(0, res.totalXp - res.xpAwarded));
      setLatestXp(res.totalXp);
      setDone((d) => d + 1);
      if (res.verdict.correct) {
        setCorrect((c) => c + 1);
        burst(46, 0.46); // small and off-centre: a reward, not a firework display
      }
      return res;
    } catch (e) {
      // The connection can drop mid-session — a tunnel, a train. If we hold the
      // key, finish the card offline rather than stranding the answer that was
      // just typed.
      const localResult = answerLocally();
      setBusy(false);
      return localResult;
    } finally {
      setBusy(false);
    }
  }, [card, busy, result, selected, input, confidence, burst, topicId, offline, latestXp, me]);

  const next = useCallback(() => {
    setResult(null);
    setInput('');
    setSelected(null);
    setConfidence(null);
    setError('');
    setAutoMark(false);
    startRef.current = Date.now();
    setIdx((i) => i + 1);
  }, []);

  /** Move up to `n` fetched-but-undealt cards into the session. */
  const dealFromPool = useCallback((n: number) => {
    const take = poolRef.current.slice(0, n);
    poolRef.current = poolRef.current.slice(take.length);
    setPoolCount(poolRef.current.length);
    if (take.length > 0) setQueue((q) => [...(q ?? []), ...take]);
  }, []);

  /** Fetch the next page of due cards into the undealt pool. */
  const fetchMore = useCallback(async (): Promise<QueueCard[]> => {
    try {
      const data = await api.get<{ queue: QueueCard[] }>(
        `/api/v1/queue/today?limit=20${reviewTopicId ? `&topicId=${encodeURIComponent(reviewTopicId)}` : ''}`,
      );
      const known = new Set([...(queue ?? []), ...poolRef.current].map((c) => c.id));
      const fresh = data.queue.filter((c) => !known.has(c.id));
      if (fresh.length > 0) {
        poolRef.current = [...poolRef.current, ...fresh];
        setPoolCount(poolRef.current.length);
      }
      try {
        rememberPack(await api.get<OfflinePack>('/api/v1/offline/pack?limit=20'));
      } catch {
        // keep the queue we have
      }
      return fresh;
    } catch {
      return [];
    }
  }, [queue, reviewTopicId, rememberPack]);

  /** "Just one more": deal a single card past the session's chosen length.
   *  Works after "End session" too — the summary is a waypoint, not a door. */
  const justOneMore = useCallback(async () => {
    setEnded(false);
    if (poolRef.current.length === 0) await fetchMore();
    dealFromPool(1);
  }, [fetchMore, dealFromPool]);

  /** Re-size the deal before the first answer. Locked afterwards — extending
   *  mid-session is what "just one more" is for. */
  const setLength = useCallback(
    (n: number) => {
      if (n === dealSizeRef.current || done > 0) return;
      dealSizeRef.current = n;
      setDealSize(n);
      try {
        window.localStorage.setItem('revisio.sessionLength', String(n));
      } catch {
        // Private mode: the choice still applies to this session.
      }
      // F2: the pref is the source of truth now; localStorage is the cache.
      void api.patch('/api/v1/me', { prefs: { sessionLength: n } }).then(() => refreshMe()).catch(() => undefined);
      const all = [...(queue ?? []), ...poolRef.current];
      const next = all.slice(0, n);
      poolRef.current = all.slice(n);
      setPoolCount(poolRef.current.length);
      setQueue(next);
    },
    [queue, done, refreshMe],
  );

  const toggleFocus = useCallback(() => {
    setFocus((f) => {
      const next = !f;
      try {
        window.localStorage.setItem('revisio.focusMode', next ? '1' : '0');
      } catch {}
      void api.patch('/api/v1/me', { prefs: { focusMode: next } }).then(() => refreshMe()).catch(() => undefined);
      return next;
    });
  }, [refreshMe]);

  const toggleBreaks = useCallback(() => {
    setBreaks((b) => {
      const next = !b;
      try {
        window.localStorage.setItem('revisio.breakReminders', next ? '1' : '0');
      } catch {}
      void api.patch('/api/v1/me', { prefs: { breakReminders: next } }).then(() => refreshMe()).catch(() => undefined);
      return next;
    });
  }, [refreshMe]);

  // Escape closes the session-options panel.
  useEffect(() => {
    if (!optionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOptionsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [optionsOpen]);

  // The session has ended — every card answered, or the learner chose "End
  // session" early. Either way the summary is the destination: XP is already
  // banked per answer, so stopping now forfeits nothing earned. `card` already
  // folds `ended` in (above), so `!card` is the whole test.
  const finished = queue !== null && queue.length > 0 && !card;

  // Break reminder: a quiet nudge every ten answered cards, dismissible per
  // milestone. Daily sessions only — a first-exposure batch is already short.
  const showBreak = !session && breaks && done > 0 && done % 10 === 0 && done !== breakAck;

  useEffect(() => {
    setReviewActive(!!card && !finished);
    return () => setReviewActive(false);
  }, [card, finished, setReviewActive]);

  const change =
    finished && startXp !== null && latestXp !== null ? rankChange(startXp, latestXp) : null;

  useEffect(() => {
    if (!finished) return;
    refreshMe();
    refreshRanked();
  }, [finished, refreshMe, refreshRanked]);

  // A promotion outranks the per-card flicker: a full, slow burst.
  useEffect(() => {
    if (change?.promoted) burst(140, 0.3);
  }, [change?.promoted, burst]);

  // On a phone the verdict lands below the fold, which puts the one control
  // that moves the session forward behind the tab bar — the user answers, then
  // has to go looking for how to continue. Bring it to them, but only when it
  // is actually out of sight: on a screen that fits it all, moving the page
  // would be motion for its own sake.
  useEffect(() => {
    if (!result) return;
    const el = verdictRef.current;
    if (el && el.getBoundingClientRect().bottom > window.innerHeight - 8) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [result]);

  // Enter advances once a verdict is on screen, so a session is keyboard-only.
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, next]);

  if (queue === null) return <PageSkeleton variant="reader" />;

  if (queue.length === 0) {
    // First exposure that has run out of new cards is a good outcome, not an
    // empty queue — saying so is the difference between finishing a topic and
    // being told there is nothing to do.
    const allMet = session && session.progress.total > 0 && session.progress.remaining === 0;
    if (session) {
      return (
        <Card className="mx-auto max-w-md p-7 text-center">
          <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full bg-good-soft text-good-strong`}>
            <Icon name={allMet ? 'reviewed' : 'notes'} size={22} />
          </span>
          <h1 className="t-display-sm mt-4">
            {allMet ? 'Every question met' : 'No questions here yet'}
          </h1>
          <p className="mt-2 t-caption leading-relaxed text-muted-foreground">
            {allMet
              ? `You have now seen all ${session.progress.total} ${
                  session.progress.total === 1 ? 'question' : 'questions'
                } in “${session.topic.name}”. They will come back on their own schedule from here.`
              : `“${session.topic.name}” has no questions attached. Its notes are still worth reading.`}
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            {/* Deep-link to the reading screen itself — /learn?topic= was never
                consumed by the catalogue, so the button led to a page that
                ignored it (docs/UX-AUDIT P3-2). */}
            <Link href={`/learn/${session.topic.subjectId}/${session.topic.id}`} className={buttonVariants({ variant: 'secondary' })}>
              Read the notes
            </Link>
            <Link href="/review" className={buttonVariants({ variant: 'primary' })}>
              Back to reviews
            </Link>
          </div>
        </Card>
      );
    }
    return (
      <Card className="mx-auto max-w-md p-7 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-good-soft text-good-strong">
          <Icon name="reviewed" size={22} />
        </span>
        <h1 className="t-display-sm mt-4">Nothing due</h1>
        <p className="mt-2 t-caption leading-relaxed text-muted-foreground">
          {emptyQueueLine(0, me?.gamification.streak ?? 0)}
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/cram" className={buttonVariants({ variant: 'secondary' })}>
            Cram a topic
          </Link>
          <Link href="/learn" className={buttonVariants({ variant: 'primary' })}>
            Read ahead
          </Link>
        </div>
      </Card>
    );
  }

  // The report is the destination for *both* ways out of a session: running the
  // queue dry (`idx` past the end) and pressing "End session" (`card` collapsed
  // to null above). One test covers both because the two cases are now the same
  // case.
  if (!card) {
    return (
      <div className="relative">
        <Confetti ref={confettiRef} className="pointer-events-none absolute inset-0 z-10" />
        {session ? (
          <FirstExposureReport
            session={session}
            correct={correct}
            done={done}
            sessionXp={sessionXp}
            onAgain={load}
          />
        ) : (
          <SessionReport
            correct={correct}
            done={done}
            sessionXp={sessionXp}
            change={change}
            ended={ended}
            leftDue={poolCount + Math.max(0, (queue?.length ?? 0) - done)}
            canExtend={!session && (poolCount > 0 || !offline)}
            onJustOneMore={justOneMore}
            onAgain={load}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Confetti ref={confettiRef} className="pointer-events-none fixed inset-0 z-[60]" />

      {/* First exposure puts the reading beside the question. A first attempt at
          material you have not met is a guess, so the notes are one tap away.
          They start collapsed so the question owns the screen, but the pulsing
          dot on the summary makes the affordance unmissable — the web comment
          once claimed "open by default" while the code said closed; the pulsing
          affordance is the honest resolution of the two. */}
      {session && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="t-eyebrow">First look · {session.topic.subjectName}</span>
            <Badge variant="quiet" className="num">
              <Icon name="notes" size={12} />
              {session.progress.met} / {session.progress.total} met
            </Badge>
          </div>
          <h1 className="t-title">{session.topic.name}</h1>

          {session.notes.length > 0 && (
            <details className="card p-0" open={notesOpen} onToggle={(e) => setNotesOpen((e.target as HTMLDetailsElement).open)}>
              <summary className="flex cursor-pointer items-center gap-2.5 px-4 py-3.5">
                <Icon name="notes" size={16} className="shrink-0" />
                <span className="t-strong">Read first</span>
                {!notesOpen && (
                  <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
                  </span>
                )}
                <Badge variant="chip" className="ml-auto shrink-0">{session.notes.length}</Badge>
                <Icon name="collapse" size={15} className="shrink-0 text-muted-foreground" />
              </summary>
              <div className="space-y-2 border-t border-border/70 px-4 py-4">
                {session.notes.map((n) => (
                  <article key={n.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="t-strong">{n.title}</h2>
                      {n.specRefs && <Badge variant="chip">{n.specRefs}</Badge>}
                    </div>
                    <Markdown text={n.summaryMd || n.detailedMd} className="mt-2 t-body" />
                  </article>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {showBreak && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3" role="status">
          <Icon name="clock" size={16} className="shrink-0 text-muted-foreground" />
          <p className="t-caption flex-1 text-muted-foreground">
            {done} cards down. A short break is fair. Your queue will wait.
          </p>
          <button
            type="button"
            onClick={() => setBreakAck(done)}
            className="shrink-0 t-caption font-semibold underline underline-offset-4"
          >
            Keep going
          </button>
        </div>
      )}

      {/* The session's own progress readout. Green, because you are earning. */}
      <div className="mb-2 flex items-center justify-between">
        <span className="num t-caption font-semibold text-muted-foreground">
          {done} / {queue.length}
        </span>
        <span className="flex items-center gap-2">
          {offline && (
            <Badge variant="quiet" title="Saved on this device and sent when you reconnect">
              <Icon name="clock" size={12} />
              {pending > 0 ? `${pending} saved` : 'Offline'}
            </Badge>
          )}
          {!focus && (
            <Badge variant="quiet" className="num">
              <Icon name="xp" size={12} />+{sessionXp} XP
            </Badge>
          )}
          {/* Session autonomy: length, focus and break reminders. Daily
              sessions only — a first-exposure batch is already sized. */}
          {!session && (
            <span className="relative">
              <button
                type="button"
                aria-expanded={optionsOpen}
                aria-haspopup="true"
                onClick={() => setOptionsOpen((o) => !o)}
                className={cn(
                  't-caption-s flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors',
                  optionsOpen
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon name="schedule" size={12} />
                Session
              </button>
              {optionsOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOptionsOpen(false)} />
                  <div
                    role="group"
                    aria-label="Session options"
                    className="card absolute right-0 top-full z-20 mt-1 w-60 p-3"
                  >
                    <p className="t-fine font-semibold text-muted-foreground">
                      Cards per session
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Session length">
                      {[5, 10, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={done > 0}
                          aria-pressed={dealSize === n}
                          onClick={() => setLength(n)}
                          className={cn(
                            't-strong num rounded-md border px-2 py-1.5 transition-colors disabled:opacity-50',
                            dealSize === n
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border bg-card hover:border-border-strong',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {done > 0 && (
                      <p className="t-fine mt-1.5 text-muted-foreground">
                        Locked once you start. “just one more” extends.
                      </p>
                    )}
                    <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                      <OptionRow
                        label="Focus mode"
                        hint="Hide everything but the card"
                        on={focus}
                        onToggle={toggleFocus}
                      />
                      <OptionRow
                        label="Break reminders"
                        hint="A nudge every 10 cards"
                        on={breaks}
                        onToggle={toggleBreaks}
                      />
                    </div>
                    {/* F3 copy: the listen control's contract, stated once where
                        session choices live. */}
                    <p className="t-fine mt-3 border-t border-border pt-3 text-muted-foreground">
                      The speaker icon reads the question aloud. Answers stay quiet until you check.
                    </p>
                  </div>
                </>
              )}
            </span>
          )}
          {/* Ink, not green — leaving is not something to celebrate. Ending a
              session keeps every point already earned; the summary opens and
              the remaining cards stay due. */}
          {reviewTopicId && (
            <Link
              href="/review"
              className="t-caption-s flex items-center gap-1 rounded-full px-2.5 py-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Icon name="back" size={12} />
              All topics
            </Link>
          )}
          <button
            type="button"
            onClick={() => setEnded(true)}
            className="t-caption-s flex items-center gap-1 rounded-full px-2.5 py-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Icon name="signOut" size={12} />
            End session
          </button>
        </span>
      </div>

      <div className="meter mb-4 h-2">
        <motion.div
          className="meter-fill"
          animate={{ width: `${progress}%` }}
          transition={SPRING.meter}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.id + (result ? ':verdict' : ':question')}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={transition.quick}
        >
          <Card>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <Badge variant="quiet">
                  <Icon
                    name={card.kind === 'cloze' ? 'notes' : card.kind === 'mcq' ? 'target' : 'learn'}
                    size={13}
                  />
                  {KIND_LABEL[card.kind]}
                </Badge>
                {card.srsLevel != null && !focus && (
                  <Badge variant="quiet" className="num" title={`Strength: ${card.srsLabel} (level ${card.srsLevel} of 12)`}>
                    Lv {card.srsLevel}
                  </Badge>
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1">
                {!focus && (
                  <span className="truncate t-fine text-muted-foreground">
                    {card.subjectName} · {card.topicName}
                  </span>
                )}
                {/* F3: card content, not chrome — stays visible in Focus
                    sessions. Speaks the question side only; the verdict remount
                    below swaps it for the explanation-side controls. */}
                <ListenButton text={cardSpeechText(card)} />
              </span>
            </div>

            {/* Why this card is here (#18): scheduler facts, not a label. */}
            {!focus && dueReason(card, !!topicId) && (
              <p className="t-fine mt-1 text-muted-foreground">{dueReason(card, !!topicId)}</p>
            )}

            <div className="mt-5 t-display-sm font-bold leading-[1.35] reading-prose">
              {card.kind === 'cloze' && (
                <ClozePrompt
                  text={card.textWithBlank ?? ''}
                  answer={result && card.kind === 'cloze' ? (result.primaryAnswer ?? null) : null}
                  revealed={!!result}
                />
              )}
              {card.kind === 'flashcard' && card.prompt}
              {card.kind === 'mcq' && card.question}
            </div>

            {/* ── Answering ───────────────────────────────────────────────── */}
            {!result && card.kind === 'mcq' && (
              <div className="mt-5 space-y-2.5">
                {card.options?.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={selected === o.id}
                    onClick={() => setSelected(o.id)}
                    className={`option ${selected === o.id ? 'option-selected font-bold' : ''}`}
                  >
                    <span className="flex-1">{o.text}</span>
                    {selected === o.id && <Icon name="reviewed" size={18} />}
                  </button>
                ))}
                <ConfidencePicker value={confidence} onChange={setConfidence} disabled={busy} />
                <Button
                  variant="good"
                  size="lg"
                  className="mt-1.5 gap-2"
                  disabled={!selected || busy}
                  onClick={submit}
                >
                  {busy ? 'Marking…' : 'Check'}
                </Button>
                <p className="text-center t-fine text-muted-foreground">One attempt only</p>
              </div>
            )}

            {!result && card.kind !== 'mcq' && (
              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  // One Enter does the whole loop on a correct cloze: the
                  // keystrokes already marked it green, so this submit records
                  // the answer and advances in the same press. Wrong or
                  // unfinished answers stop at the verdict as before.
                  void (async () => {
                    const recorded = await submit();
                    if (recorded?.verdict.correct && card.kind === 'cloze') next();
                  })();
                }}
              >
                {card.kind === 'cloze' ? (
                  <input
                    type="text"
                    className={`input ${autoMark ? 'border-good text-good-strong' : ''}`}
                    placeholder="Type the missing word"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    aria-label="Your answer"
                  />
                ) : (
                  // A textarea swallows Enter as a newline, so the hint below
                  // promised something the form never did: the answer sat there
                  // unchecked. Enter now checks; Shift+Enter is the line break.
                  <Textarea
                    className="min-h-[110px]"
                    placeholder="What do you remember? Key ideas count, not wording."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    autoFocus
                    aria-label="Your answer"
                  />
                )}
                <ConfidencePicker value={confidence} onChange={setConfidence} disabled={busy} />
                <Button
                  type="submit"
                  variant="good"
                  size="lg"
                  className="mt-3"
                  disabled={!input.trim() || busy}
                >
                  {busy ? 'Marking…' : autoMark ? 'Correct, press Enter' : 'Check'}
                </Button>
                <p className="mt-2 text-center t-fine text-muted-foreground">
                  {card.kind === 'cloze'
                    ? autoMark
                      ? 'Enter to continue'
                      : 'Enter to check'
                    : 'Enter to check · Shift + Enter for a new line'}
                </p>
              </form>
            )}

            {/* ── Verdict ────────────────────────────────────────────────── */}
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={SPRING.soft}
                className="overflow-hidden"
              >
                <div ref={verdictRef}>
                  <VerdictPanel result={result} card={card} confidence={confidence} />
                  <Button size="lg" className="mt-3 gap-2" onClick={next}>
                    Continue
                    <Icon name="next" size={17} />
                  </Button>
                  <p className="mt-2 text-center t-fine text-muted-foreground">Enter for next</p>
                </div>
              </motion.div>
            )}

            {error && (
              <p
                className="mt-3 rounded-md bg-destructive/10 px-3 py-2 t-caption text-destructive-ink"
                role="alert"
              >
                {error}
              </p>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * The first-exposure report.
 *
 * Different question from the ranked report: not "how did that go" but "how
 * much of this topic have I actually met now". `progress` was read before the
 * batch was answered, so the batch is added to it here rather than being
 * re-fetched — the number on screen should move the moment the last card lands.
 */
function FirstExposureReport({
  session,
  correct,
  done,
  sessionXp,
  onAgain,
}: {
  session: FirstExposure;
  correct: number;
  done: number;
  sessionXp: number;
  onAgain: () => void;
}) {
  const met = session.progress.met + done;
  const remaining = Math.max(0, session.progress.total - met);

  return (
    <TilePanel tone="dark" className="text-center">
      <Badge variant="quiet">
        <Icon name="learn" size={13} />
        First look
      </Badge>

      <h1 className="t-display mt-4">
        {remaining === 0 ? 'That is the whole topic' : `${done} new ${done === 1 ? 'question' : 'questions'} met`}
      </h1>

      <p className="mx-auto mt-2 max-w-md t-body leading-relaxed text-muted-foreground">
        {remaining === 0
          ? `You have met all ${session.progress.total} questions in “${session.topic.name}”. They now come back on their own schedule, so you do not need to chase them.`
          : `${met} of ${session.progress.total} met in “${session.topic.name}”. ${remaining} still to meet. They will keep.`}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Badge variant="chip" className="num">
          <Icon name="xp" size={14} className="text-gold-ink" />+{sessionXp} XP
        </Badge>
        <Badge variant="chip" className="num">
          <Icon name="reviewed" size={14} className="text-good" />
          {correct}/{done}
        </Badge>
        <Badge variant="chip" className="num">
          <Icon name="notes" size={14} className="text-muted-foreground" />
          {met}/{session.progress.total} met
        </Badge>
      </div>

      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        {remaining > 0 ? (
          <Button variant="secondary" className="gap-2" onClick={onAgain}>
            Meet {Math.min(4, remaining)} more
            <Icon name="next" size={16} />
          </Button>
        ) : (
          <Link href={`/cram?topic=${session.topic.id}`} className={buttonVariants({ variant: 'secondary' })}>
            Practise this topic
          </Link>
        )}
        <Link href="/review" className={buttonVariants({ variant: 'primary', className: 'gap-2' })}>
          Back to reviews
          <Icon name="next" size={16} />
        </Link>
      </div>
    </TilePanel>
  );
}

/**
 * The session report — where the work lands.
 *
 * This is the moment the ranked system exists for: a session ends and the
 * numbers have to *move*. It is a near-black band because it is the headline,
 * and it names the rank rather than shoving a bar at you: "Promoted to Silver II"
 * is a sentence you can repeat, and a bar filling by four percent is not.
 *
 * Promotion gets the crest, the animation and the confetti. Staying put gets the
 * exact distance to the next rung, because "40 RP short" is a reason to come back
 * tomorrow and "good job" is not.
 */
function SessionReport({
  correct,
  done,
  sessionXp,
  change,
  ended,
  leftDue,
  canExtend,
  onJustOneMore,
  onAgain,
}: {
  correct: number;
  done: number;
  sessionXp: number;
  change: ReturnType<typeof rankChange> | null;
  ended: boolean;
  /** Cards still due after an early end: undealt pool plus unanswered dealt
   *  cards. Only rendered when the learner stopped before the queue ran dry. */
  leftDue: number;
  /** Daily sessions only, and only while more due cards can be dealt. */
  canExtend: boolean;
  onJustOneMore: () => void;
  onAgain: () => void;
}) {
  const rank: Rank | null = change?.after ?? null;
  const quiet = useQuietMode();

  return (
    <TilePanel tone="dark" className="text-center">
      {rank && (
        <motion.div
          className="mx-auto w-fit"
          initial={quiet ? false : { scale: 0.7, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={SPRING.pop}
        >
          <RankCrest rank={rank} size={92} animate={!quiet} />
        </motion.div>
      )}

      <h1 className="t-display mt-4">
        {change?.promoted ? `Promoted to ${change.after.label}` : ended ? 'Session ended' : 'Session complete'}
      </h1>

      <p className="mx-auto mt-2 max-w-md t-body leading-relaxed text-muted-foreground">
        {change?.promoted
          ? change.tierChanged
            ? `${correct} of ${done} correct, and that carried you into a new tier. Everything above this is harder, and worth more.`
            : `${correct} of ${done} correct, and the crest moved with it.`
          : sessionSummary(correct, done)}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Badge variant="chip" className="num">
          <Icon name="xp" size={14} className="text-gold-ink" />+{sessionXp} XP
        </Badge>
        <Badge variant="chip" className="num">
          <Icon name="reviewed" size={14} className="text-good" />
          {correct}/{done}
        </Badge>
        {rank && (
          <Badge variant="chip" className="num">
            <Icon name="rank" size={14} className="text-muted-foreground" />
            {rank.points.toLocaleString()} RP
          </Badge>
        )}
      </div>

      {rank && !rank.isApex && (
        <p className="mt-3 t-caption text-muted-foreground">
          {rank.remaining} rank points (RP) to the next rung · about {reviewsForRp(rank.remaining)} more reviews.
        </p>
      )}

      {ended && leftDue > 0 && (
        <p className="mt-3 t-caption text-muted-foreground">
          {leftDue} {leftDue === 1 ? 'card' : 'cards'} still due. They will be here tomorrow.
        </p>
      )}

      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        {canExtend && (
          <Button variant="secondary" onClick={onJustOneMore}>
            Just one more
          </Button>
        )}
        <Button variant="ghost" onClick={onAgain}>
          Load more
        </Button>
        <Link href="/progress" className={buttonVariants({ variant: 'primary', className: 'gap-2' })}>
          See the ladder
          <Icon name="next" size={16} />
        </Link>
      </div>
    </TilePanel>
  );
}

/** A labelled on/off row inside the session-options panel. */
function OptionRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="t-strong block">{label}</span>
        <span className="t-fine block text-muted-foreground">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150',
          on ? 'bg-foreground' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-all duration-150',
            on ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

/**
 * The pre-answer confidence tap (F5): "did you know it?" — two chips, nothing
 * selected by default, APG radiogroup semantics (role=radiogroup, role=radio,
 * arrow keys move and select). v1 stores the answer without acting on it, so
 * the copy stays silent about effects — scaffolding, not a lever.
 */
function ConfidencePicker({
  value,
  onChange,
  disabled,
}: {
  value: 'knew' | 'guessed' | null;
  onChange?: (v: 'knew' | 'guessed') => void;
  disabled?: boolean;
}) {
  const options = [
    { v: 'knew' as const, label: 'I knew it' },
    { v: 'guessed' as const, label: 'I guessed' },
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (v: 'knew' | 'guessed') => {
    if (disabled) return;
    onChange?.(v);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.v === value);
    const next = options[(Math.max(i, 0) + delta + options.length) % options.length];
    pick(next.v);
    refs.current[(Math.max(i, 0) + delta + options.length) % options.length]?.focus();
  };

  return (
    <div className="mt-3" role="radiogroup" aria-label="Before you check: did you know it?" onKeyDown={onKeyDown}>
      <p className="t-fine mb-1.5 text-muted-foreground">Before you check: did you know it?</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = value === o.v;
          return (
            <button
              key={o.v}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (value === null && i === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => pick(o.v)}
              className={cn('chip min-h-11 transition-colors', on && 'chip-active', disabled && 'opacity-60')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The blank in a cloze prompt. Fills with the answer once the verdict lands. */
function ClozePrompt({ text, answer, revealed }: { text: string; answer: string | null; revealed: boolean }) {
  const [before, after] = text.split('____');
  return (
    <span>
      {before}
      <span
        className={`mx-1 inline-block min-w-[6rem] border-b-2 px-2 text-center font-bold ${
          !revealed
            ? 'border-border-strong text-muted-foreground'
            : answer
              ? 'border-good text-good-strong'
              : 'border-destructive-ink text-destructive-ink'
        }`}
      >
        {answer ?? '\u00A0'.repeat(8)}
      </span>
      {after}
    </span>
  );
}

/**
 * The verdict.
 *
 * Correct answers get the green wash from the Duolingo component set; wrong ones
 * get the cardinal wash, the model answer, and — when the grader found phrases
 * the learner did hit — the partial credit spelled out rather than implied.
 */
function VerdictPanel({
  result,
  card,
  confidence,
}: {
  result: ReviewResult;
  card: QueueCard;
  /** F5: the choice locked at submit — echoed disabled so the record of what
   *  was claimed stays visible next to the verdict it described. */
  confidence?: 'knew' | 'guessed' | null;
}) {
  const { verdict } = result;
  const quiet = useQuietMode();
  const good = verdict.correct;
  const softened = verdict.feedbackKind !== 'correct' && good;

  return (
    <div
      aria-live="polite"
      className={`mt-5 rounded-md px-4 py-3.5 ${good ? 'bg-good-soft' : 'bg-destructive/10'}`}
    >
      <div
        className={`flex items-center gap-2.5 t-lead-airy font-bold ${
          good ? 'text-good-strong' : 'text-destructive-ink'
        }`}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center">
          <Icon name={good ? 'correct' : 'close'} size={16} strokeWidth={3} />
        </span>
        {good ? (softened ? 'Correct, with a nudge' : 'Correct') : 'Not quite'}
        {result.xpAwarded > 0 && (
          <span className="num ml-auto t-caption font-semibold text-good-strong">
            +{result.xpAwarded} XP
          </span>
        )}
      </div>

      {/* Where the card now sits on the 12-level strength ladder. The level it
          held before the answer comes from the card itself; an offline-queued
          answer has no server verdict yet, so the line stays silent. */}
      {result.srsLevel != null && (
        <p className="num mt-2 t-caption font-semibold text-muted-foreground" aria-live="polite">
          Strength: {result.srsLabel} · level {result.srsLevel} of 12
          {card.srsLevel != null && result.srsLevel > card.srsLevel && (
            <span className="ml-1.5 text-good-strong">↑ level up</span>
          )}
          {card.srsLevel != null && result.srsLevel < card.srsLevel && (
            <span className="ml-1.5 text-destructive-ink">↓ dropped from {card.srsLabel}</span>
          )}
        </p>
      )}
      {verdict.note && <p className="mt-2 t-caption text-foreground">{verdict.note}</p>}

      {confidence && (
        <div className="mt-2">
          <ConfidencePicker value={confidence} disabled />
        </div>
      )}

        {result.queued && (
          <p className="mt-2 t-caption text-muted-foreground">
            Saved on this device. It is graded again by the server when you reconnect, and your XP
            and schedule land then.
          </p>
        )}

      {verdict.matchedPhrases && verdict.matchedPhrases.length > 0 && (
        <p className="mt-2 t-caption text-foreground">
          <span className="font-bold">You had: </span>
          {verdict.matchedPhrases.join(', ')}
        </p>
      )}
      {verdict.missedPhrases && verdict.missedPhrases.length > 0 && (
        <p className="mt-1 t-caption text-foreground">
          <span className="font-bold text-destructive-ink">Missing: </span>
          {verdict.missedPhrases.join(', ')}
        </p>
      )}

      {card.kind === 'flashcard' && result.modelAnswer && (
        <div className="mt-2.5 rounded-md bg-card/70 px-3 py-2">
          <span className="flex items-center justify-between gap-2">
            <span className="t-fine font-semibold text-muted-foreground">Model answer</span>
            <ListenButton
              text={markdownSpeechText(result.modelAnswer)}
              label="Listen to the model answer"
              className="-my-1.5"
            />
          </span>
          <p className="mt-0.5 t-caption reading-prose text-foreground">{result.modelAnswer}</p>
        </div>
      )}

      {/* F9: the Why is a disclosure, and only on non-correct verdicts —
          correct needs no explanation and the panel stays quiet. Cards the
          learner has missed before open by default with a one-sentence hint
          peeled from the explanation's first block. */}
      {!good && result.explanation && (
        <WhyDisclosure explanation={result.explanation} lapsed={(card.lapses ?? 0) >= 1} />
      )}

      {/* F10: the learner's own "still confused" mark. Visible to them here
          and on their insights surface, and to teachers through the same
          buildInsights aggregation — the copy says who sees it (D9). */}
      <ConfusedFlag key={card.id} cardId={card.id} initialFlagged={!!card.confusedAt} />

      {/* F7: the lesson link sits under the Why (or in its place when the card
          has no explanation). Non-correct verdicts only — a correct answer
          does not need the reading. */}
      {!good && (
        <div className="mt-2.5">
          <ReferenceLink
            subjectId={card.subjectId}
            topicId={card.topicId}
            lessonId={card.lessonId}
            lessonTitle={card.lessonTitle}
          />
        </div>
      )}

      {result.newAchievements.map((a) =>
        quiet ? (
          <div
            key={a.id}
            className="mt-2.5 flex items-center gap-2 rounded-md bg-card/70 px-3 py-2"
          >
            <Icon name={achievementIcon(a.id, a.icon)} size={16} className="text-gold-ink" />
            <span className="t-caption font-semibold">{a.name} unlocked</span>
          </div>
        ) : (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING.soft}
            className="mt-2.5 flex items-center gap-2 rounded-md bg-card/70 px-3 py-2"
          >
            <Icon name={achievementIcon(a.id, a.icon)} size={16} className="text-gold-ink" />
            <span className="t-caption font-semibold">{a.name} unlocked</span>
          </motion.div>
        ),
      )}
    </div>
  );
}

/**
 * F10 "Still confused" — a ghost toggle on the verdict panel. The flag is the
 * learner's own mark (`card_user_states.confused_at`): it shows on their
 * insights surface and to teachers through the same aggregation, so the copy
 * names who sees it rather than implying a hidden signal. Toggling again
 * clears it. A failed write says so — a flag that silently did not save
 * would be a lie.
 */
function ConfusedFlag({ cardId, initialFlagged }: { cardId: string; initialFlagged: boolean }) {
  const [flagged, setFlagged] = useState(initialFlagged);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !flagged;
    setBusy(true);
    setFailed(false);
    try {
      await api.post('/api/v1/confused', { cardId, flagged: next });
      setFlagged(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2.5">
      <button
        type="button"
        aria-pressed={flagged}
        disabled={busy}
        onClick={toggle}
        className={cn(
          'chip min-h-11 gap-1.5 transition-colors',
          flagged && 'chip-active',
          busy && 'opacity-60',
        )}
      >
        <Icon name="flag" size={14} />
        {flagged ? 'Flagged' : 'Still confused'}
      </button>
      <p className="t-fine mt-1 text-muted-foreground">
        {failed
          ? 'That did not save. Try again when you are back online.'
          : flagged
            ? 'Flagged. You and your teacher can see this on your progress.'
            : 'Marks this card as one you are still unsure about.'}
      </p>
    </div>
  );
}

/**
 * The progressive "Why" (F9). `explanation_md` is markdown — the body renders
 * through <Markdown>, never as raw text. A card the learner has missed before
 * (`lapsed`) opens by default and shows the first sentence peeled as a hint;
 * everything else stays one tap away. `<details>` carries the keyboard and
 * screen-reader semantics for free.
 */
function WhyDisclosure({ explanation, lapsed }: { explanation: string; lapsed: boolean }) {
  const hint = lapsed ? whyHint(explanation) : null;
  return (
    <div className="mt-2.5 rounded-md bg-card/70 px-3 py-2">
      {hint && <p className="t-caption reading-prose text-foreground">Hint: {hint}</p>}
      <details className="group" open={lapsed || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="t-fine font-semibold text-muted-foreground">Why</span>
          <Icon
            name="collapse"
            size={14}
            className="text-muted-foreground transition-transform group-open:rotate-180"
          />
          <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
            <ListenButton
              text={markdownSpeechText(explanation)}
              label="Listen to the explanation"
              className="-my-1.5"
            />
          </span>
        </summary>
        <Markdown text={explanation} className="mt-1.5 t-caption reading-prose text-foreground" />
      </details>
    </div>
  );
}
