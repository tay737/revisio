'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/lib/button-variants';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { InlineConfirm } from '@/components/ui/inline-confirm';

const MAX_SOURCE = 24_000;

type TopicOption = { id: string; name: string; subjectName: string };

/** CardInput minus server-only fields we never edit, plus the review flag. */
type DraftCard = {
  kind: 'cloze' | 'flashcard' | 'mcq';
  keep: boolean;
  textWithBlank?: string;
  prompt?: string;
  question?: string;
  answers?: string[];
  options?: string[];
  correctIdx?: number;
  explanationMd?: string;
  keywords?: { required: boolean; phrase: string; synonyms?: string[] }[];
  minPoints?: number;
};
type Proposal = { draftId: string; model: string; promptVersion: string; cards: DraftCard[] };
type AcceptResult = { draftId: string; topicId: string; inserted: number; proposed: number; status: 'accepted' | 'partial' | 'rejected' };

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const join = (a?: string[]) => (a ?? []).join('\n');

const KIND_LABEL = { cloze: 'Fill the blank', flashcard: 'Flashcard', mcq: 'Multiple choice' } as const;

/**
 * AI-drafted cards, with the author in charge (#7).
 *
 * Paste a lesson's own text and the model proposes cloze, flashcard and
 * multiple-choice cards. Proposing writes nothing but the draft row: each card
 * can be kept, edited or discarded, and only the kept subset is sent to
 * accept — which is also how "edited" reaches the server. A refresh loses an
 * undecided proposal (there is no draft list endpoint yet), so the honest
 * states are: drafting, reviewing, accepted, discarded.
 */
export function DraftReview({ topics, onDone }: { topics: TopicOption[]; onDone: (message: string) => void }) {
  // The page's `topics` prop is the *mine* list — for non-developer staff it
  // misses ownerId-NULL topics they can still edit. `?editable=1` lists
  // everything the caller may actually edit; prefer it once it answers.
  const { data: editable } = useSWR<{ topics: TopicOption[] }>('/api/v1/content?editable=1', api.get, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const topicOptions = editable?.topics?.length ? editable.topics : topics;
  const [source, setSource] = useState('');
  const [topicId, setTopicId] = useState('');
  const [counts, setCounts] = useState({ cloze: 8, flashcard: 6, mcq: 4 });
  const [proposal, setProposal] = useState<Proposal | null>(null);
  // Field edits make the accept "edited" in the audit log — sending `cards`
  // verbatim vs the stored proposal is the only signal the server has.
  const [fieldsEdited, setFieldsEdited] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'accept' | 'reject' | ''>('');
  const [error, setError] = useState('');

  const picked = topicOptions.find((t) => t.id === topicId) ?? null;
  const kept = proposal?.cards.filter((c) => c.keep).length ?? 0;

  const fail = (e: unknown) => {
    if (e instanceof ApiClientError) {
      if (e.status === 403) setError('AI drafts are for teachers and developers.');
      else if (e.status === 429) setError('Too many drafts this hour. Try again later.');
      else if (e.status === 503) setError('AI drafting is not configured on this deployment.');
      else if (e.status === 502) setError('The model returned something unusable. Try again, or shorten the source.');
      else setError(e.message);
    } else {
      setError(e instanceof Error ? e.message : 'That did not go through.');
    }
  };

  const draft = async () => {
    setBusy('draft');
    setError('');
    try {
      const d = await api.post<Omit<Proposal, 'cards'> & { cards: Omit<DraftCard, 'keep'>[] }>('/api/v1/drafts', {
        sourceText: source.trim(),
        targetTopicId: topicId || undefined,
        counts,
      });
      setProposal({ ...d, cards: d.cards.map((c) => ({ ...c, keep: true })) });
      setFieldsEdited(false);
      if (d.cards.length === 0) setError('The model proposed no cards from that text. Try a longer or more specific source.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const patch = (i: number, next: Partial<DraftCard>) => {
    if (Object.keys(next).some((k) => k !== 'keep')) setFieldsEdited(true);
    setProposal((prev) => prev && { ...prev, cards: prev.cards.map((c, j) => (j === i ? { ...c, ...next } : c)) });
  };

  const payload = (c: DraftCard) => {
    const { keep: _keep, ...rest } = c;
    return rest;
  };

  const accept = async () => {
    if (!proposal) return;
    const cards = proposal.cards.filter((c) => c.keep).map(payload);
    if (cards.length === 0 || !topicId) return;
    setBusy('accept');
    setError('');
    try {
      const allKept = proposal.cards.every((c) => c.keep);
      // Omit `cards` for a verbatim accept so the audit log's `edited` flag is
      // honest; send the kept subset whenever anything was discarded or edited.
      const d = await api.post<AcceptResult>(`/api/v1/drafts/${proposal.draftId}/accept`, {
        topicId,
        ...(fieldsEdited || !allKept ? { cards } : {}),
      });
      onDone(
        d.status === 'accepted'
          ? `${d.inserted} ${d.inserted === 1 ? 'card' : 'cards'} added to “${picked?.name ?? 'the topic'}”.`
          : `${d.inserted} of ${d.proposed} proposed added to “${picked?.name ?? 'the topic'}”. The rest were discarded.`,
      );
      setProposal(null);
      setSource('');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const reject = async () => {
    if (!proposal) return;
    setBusy('reject');
    setError('');
    try {
      await api.post(`/api/v1/drafts/${proposal.draftId}/reject`, {});
      onDone('Draft discarded. Nothing was added.');
      setProposal(null);
      setSource('');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const overLimit = source.length > MAX_SOURCE;

  return (
    <div className="space-y-4">
      <Notice tone="bad" show={Boolean(error)}>{error}</Notice>

      <div>
        <Label htmlFor="draft-source">Source text</Label>
        <Textarea
          id="draft-source"
          className="mt-1"
          rows={6}
          value={source}
          onChange={(e) => { setSource(e.target.value); setProposal(null); setError(''); }}
          placeholder="Paste the lesson notes, a transcript, or the section the cards should come from."
        />
        <p className={`t-caption mt-1 ${overLimit ? 'text-destructive-ink' : 'text-muted-foreground'}`}>
          {source.length.toLocaleString()} / {MAX_SOURCE.toLocaleString()} characters. The model only uses this text.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor="draft-topic">Topic</Label>
          <NativeSelect id="draft-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Choose where accepted cards land…</option>
            {topicOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.subjectName ? `${t.subjectName}: ${t.name}` : t.name}</option>
            ))}
          </NativeSelect>
          <p className="t-caption mt-1.5 text-muted-foreground">
            {picked ? `Accepted cards join “${picked.name}” with its current visibility.` : 'Pick a topic before accepting. The draft itself does not need one.'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(['cloze', 'flashcard', 'mcq'] as const).map((k) => (
            <div key={k}>
              <Label htmlFor={`draft-count-${k}`}>{KIND_LABEL[k]}</Label>
              <Input
                id={`draft-count-${k}`}
                type="number"
                min={0}
                max={k === 'cloze' ? 30 : 20}
                value={counts[k]}
                onChange={(e) => setCounts((c) => ({ ...c, [k]: Math.max(0, Number(e.target.value) || 0) }))}
                className="mt-1 num"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!source.trim() || overLimit || busy !== '' || counts.cloze + counts.flashcard + counts.mcq === 0}
          onClick={() => void draft()}
        >
          <Icon name="xp" size={16} />
          {busy === 'draft' ? 'Drafting…' : 'Draft cards'}
        </Button>
        {proposal && kept > 0 && (
          <Button type="button" variant="primary" disabled={busy !== '' || !topicId} onClick={() => void accept()}>
            {busy === 'accept' ? 'Adding…' : `Add ${kept} ${kept === 1 ? 'card' : 'cards'}`}
          </Button>
        )}
        {proposal && (
          <InlineConfirm
            label="Discard draft"
            icon="remove"
            title="Discard this draft?"
            message="Nothing was added. The proposal cannot be reopened."
            confirmLabel="Discard"
            onConfirm={() => void reject()}
          />
        )}
      </div>
      {proposal && kept > 0 && !topicId && (
        <p className="t-caption text-muted-foreground">Choose a topic above to enable Add.</p>
      )}

      {proposal && (
        <p className="t-fine text-muted-foreground">
          Drafted by {proposal.model} · prompt v{proposal.promptVersion}. Edit or discard each card; only the kept ones are added.
        </p>
      )}

      {proposal && proposal.cards.length > 0 && (
        <div className="space-y-2">
          {proposal.cards.map((c, i) => (
            <div key={i} className={`inset px-4 py-3 ${c.keep ? '' : 'opacity-55'}`}>
              <div className="flex items-start justify-between gap-3">
                <Badge variant="chip" className="num shrink-0">{KIND_LABEL[c.kind]}</Badge>
                <button
                  type="button"
                  aria-pressed={c.keep}
                  aria-label={c.keep ? 'Discard this card' : 'Keep this card'}
                  onClick={() => patch(i, { keep: !c.keep })}
                  className={buttonVariants({ variant: 'ghost', size: 'sm', className: `shrink-0 ${c.keep ? 'text-good-strong' : ''}` })}
                >
                  <Icon name={c.keep ? 'correct' : 'close'} size={15} />
                  {c.keep ? 'Keeping' : 'Discarded'}
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {c.kind === 'cloze' && (
                  <>
                    <Textarea
                      rows={2}
                      value={c.textWithBlank ?? ''}
                      onChange={(e) => patch(i, { textWithBlank: e.target.value })}
                      aria-label="Question text with ____ for the blank"
                    />
                    <Textarea
                      rows={2}
                      value={join(c.answers)}
                      onChange={(e) => patch(i, { answers: lines(e.target.value) })}
                      aria-label="Accepted answers, one per line"
                      placeholder="Accepted answers: one per line"
                    />
                  </>
                )}
                {c.kind === 'flashcard' && (
                  <>
                    <Input
                      value={c.prompt ?? ''}
                      onChange={(e) => patch(i, { prompt: e.target.value })}
                      aria-label="Prompt"
                      placeholder="Prompt"
                    />
                    <Textarea
                      rows={2}
                      value={join(c.answers)}
                      onChange={(e) => patch(i, { answers: lines(e.target.value) })}
                      aria-label="Answer, one per line"
                      placeholder="Answer: the first line is the primary one"
                    />
                  </>
                )}
                {c.kind === 'mcq' && (
                  <>
                    <Input
                      value={c.question ?? ''}
                      onChange={(e) => patch(i, { question: e.target.value })}
                      aria-label="Question"
                      placeholder="Question"
                    />
                    <Textarea
                      rows={Math.min(6, (c.options?.length ?? 2) + 1)}
                      value={join(c.options)}
                      onChange={(e) => patch(i, { options: lines(e.target.value) })}
                      aria-label="Options, one per line"
                      placeholder="Options: one per line"
                    />
                    <NativeSelect
                      value={String(c.correctIdx ?? 0)}
                      onChange={(e) => patch(i, { correctIdx: Number(e.target.value) })}
                      aria-label="Correct option"
                    >
                      {(c.options ?? []).map((o, j) => (
                        <option key={j} value={j}>{j + 1}. {o || '(empty)'}</option>
                      ))}
                    </NativeSelect>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {proposal && proposal.cards.length > 0 && (
        <p className="t-caption text-muted-foreground">
          Cloze blanks use <span className="font-mono">____</span>; the first accepted answer is the primary one.
          Multiple-choice options and the correct pick are edited as a set. Keep them in step.
        </p>
      )}
    </div>
  );
}
