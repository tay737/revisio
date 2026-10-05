'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/Notice';
import { DEFAULT_CLOZE_POLICY, type ClozeMarkPolicy } from '@/domain/grading';
import { gradeClozeWithPolicy } from '@/domain/grading';

type PolicyPayload = {
  default: ClozeMarkPolicy;
  scopes: { scope: { type: 'subject'; subjectId: string } | { type: 'topic'; topicId: string }; policy: ClozeMarkPolicy }[];
  subjects: { id: string; name: string }[];
  topics: { id: string; name: string; subjectId: string }[];
};

/**
 * Who may save what: developers write every scope; other staff (teachers)
 * write subject and topic scopes only. The server enforces this too — this
 * gate only decides which controls render.
 */
export function ClozeMarking({ isDeveloper }: { isDeveloper: boolean }) {
  const [data, setData] = useState<PolicyPayload | null>(null);
  const [scopeType, setScopeType] = useState<'global' | 'subject' | 'topic'>('global');
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [policy, setPolicy] = useState<ClozeMarkPolicy>(DEFAULT_CLOZE_POLICY);
  const [synonyms, setSynonyms] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<PolicyPayload>('/api/v1/grading-policy')
      .then((d) => {
        setData(d);
        setPolicy({ ...DEFAULT_CLOZE_POLICY, ...d.default });
        setSynonyms((d.default.extraSynonyms ?? []).map((g) => g.join(', ')).join('\n'));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load marking settings.'));
  }, []);

  /** Load the selected scope's stored policy into the form. */
  useEffect(() => {
    if (!data) return;
    const entry =
      scopeType === 'subject' && subjectId
        ? data.scopes.find((s) => s.scope.type === 'subject' && s.scope.subjectId === subjectId)
        : scopeType === 'topic' && topicId
          ? data.scopes.find((s) => s.scope.type === 'topic' && s.scope.topicId === topicId)
          : undefined;
    const next = entry ? { ...DEFAULT_CLOZE_POLICY, ...entry.policy } : { ...DEFAULT_CLOZE_POLICY, ...data.default };
    setPolicy(next);
    setSynonyms((next.extraSynonyms ?? []).map((g) => g.join(', ')).join('\n'));
  }, [scopeType, subjectId, topicId, data]);

  const topicsForSubject = useMemo(
    () => (data && subjectId ? data.topics.filter((t) => t.subjectId === subjectId) : []),
    [data, subjectId],
  );

  const parseSynonyms = (): string[][] | undefined => {
    const groups = synonyms
      .split('\n')
      .map((line) => line.split(',').map((w) => w.trim()).filter(Boolean))
      .filter((g) => g.length >= 2);
    return groups.length > 0 ? groups : undefined;
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const scope =
        scopeType === 'subject' && subjectId
          ? { type: 'subject', subjectId }
          : scopeType === 'topic' && topicId
            ? { type: 'topic', topicId }
            : { type: 'global' };
      const body: ClozeMarkPolicy = { ...policy };
      const extra = parseSynonyms();
      if (extra) body.extraSynonyms = extra;
      await api.post('/api/v1/grading-policy', { scope, policy: body });
      setMessage('Marking settings saved.');
      const d = await api.get<PolicyPayload>('/api/v1/grading-policy');
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save marking settings.');
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => {
    const answer = 'encryption';
    const attempts: { attempt: string; expect: string }[] = [
      { attempt: 'encryption', expect: 'exact' },
      { attempt: 'encrypton', expect: 'typo' },
      { attempt: 'encode', expect: 'synonym' },
      { attempt: 'data security', expect: 'unrelated' },
    ];
    return attempts.map(({ attempt, expect }) => {
      const v = gradeClozeWithPolicy(attempt, [{ id: 'x', text: answer, isPrimary: true }], policy);
      return { attempt, expect, correct: v.correct, relation: v.similarity?.relation ?? (v.correct ? 'exact' : 'wrong') };
    });
  }, [policy]);

  const target =
    scopeType === 'subject' ? data?.subjects.find((s) => s.id === subjectId)?.name
    : scopeType === 'topic' ? data?.topics.find((t) => t.id === topicId)?.name
    : 'every subject and topic';

  return (
    <div className="space-y-4">
      <Notice tone="bad" show={Boolean(error)}>{error}</Notice>
      <Notice tone="good" show={Boolean(message)}>{message}</Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="label">Applies to</span>
          <div className="flex gap-1 rounded-[11px] border border-border/70 bg-card/60 p-1">
            {(['global', 'subject', 'topic'] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={t === 'global' && !isDeveloper}
                onClick={() => setScopeType(t)}
                aria-pressed={scopeType === t}
                className={`segment flex-1 capitalize ${scopeType === t ? 'segment-active' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {scopeType === 'subject' && (
          <div>
            <label className="label" htmlFor="marking-subject">Subject</label>
            <select
              id="marking-subject"
              className="input"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Choose a subject…</option>
              {data?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {scopeType === 'topic' && (
          <div>
            <label className="label" htmlFor="marking-subject2">Subject</label>
            <select id="marking-subject2" className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }}>
              <option value="">Choose a subject…</option>
              {data?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <label className="label mt-2" htmlFor="marking-topic">Topic</label>
            <select id="marking-topic" className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">Choose a topic…</option>
              {topicsForSubject.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <span className="label">Strictness</span>
        <div className="flex gap-1 rounded-[11px] border border-border/70 bg-card/60 p-1">
          <button
            type="button"
            onClick={() => setPolicy((p) => ({ ...p, mode: 'legacy' }))}
            aria-pressed={policy.mode === 'legacy'}
            className={`segment flex-1 ${policy.mode === 'legacy' ? 'segment-active' : ''}`}
          >
            Exact
          </button>
          <button
            type="button"
            onClick={() => setPolicy((p) => ({ ...p, mode: 'similar' }))}
            aria-pressed={policy.mode === 'similar'}
            className={`segment flex-1 ${policy.mode === 'similar' ? 'segment-active' : ''}`}
          >
            Warn on similar
          </button>
        </div>
        <p className="t-caption mt-1.5 text-muted-foreground">
          {policy.mode === 'legacy'
            ? 'A near-miss is simply wrong — no warning, exactly as marking works today.'
            : 'A near-miss is still marked wrong, but the learner is told how close it was and shown the exact answer.'}
        </p>
      </div>

      {policy.mode === 'similar' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="typo-threshold">
              Typo strictness — {policy.typoThreshold ?? DEFAULT_CLOZE_POLICY.typoThreshold}
            </label>
            <input
              id="typo-threshold"
              type="range"
              min={0.75}
              max={0.95}
              step={0.01}
              value={policy.typoThreshold ?? DEFAULT_CLOZE_POLICY.typoThreshold}
              onChange={(e) => setPolicy((p) => ({ ...p, typoThreshold: Number(e.target.value) }))}
              className="w-full"
            />
            <p className="t-caption mt-1 text-muted-foreground">
              Higher accepts fewer typos. Words under five letters always need a closer match.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="synonym-groups">Same-meaning words (one group per line)</label>
            <textarea
              id="synonym-groups"
              className="input min-h-[86px] font-mono text-[13px]"
              placeholder={'phishing, fraud\ndata, information'}
              value={synonyms}
              onChange={(e) => setSynonyms(e.target.value)}
            />
            <p className="t-caption mt-1 text-muted-foreground">
              Comma-separated words that mean the same in this subject. Words not listed are never treated as synonyms.
            </p>
          </div>
        </div>
      )}

      {policy.mode === 'similar' && (
        <div className="inset rounded-[11px] px-3 py-2.5">
          <span className="t-micro uppercase tracking-[0.08em] text-muted-foreground">How “encryption” would be marked</span>
          <div className="mt-1.5 space-y-1">
            {preview.map((p) => (
              <div key={p.attempt} className="flex items-center gap-2 text-[13px]">
                <Icon
                  name={p.relation === 'exact' ? 'correct' : 'close'}
                  size={13}
                  className={p.relation === 'exact' ? 'text-good-strong' : p.relation === 'wrong' ? 'text-muted-foreground' : 'text-gold-ink'}
                />
                <span className="font-mono">“{p.attempt}”</span>
                <span className="ml-auto text-muted-foreground">{p.relation === 'exact' ? 'correct' : p.relation === 'wrong' ? 'wrong' : `wrong · ${p.relation} warning`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy || (scopeType === 'subject' && !subjectId) || (scopeType === 'topic' && !topicId)} onClick={save}>
          {busy ? 'Saving…' : 'Save marking settings'}
        </button>
        <span className="t-caption text-muted-foreground">
          {scopeType === 'global' ? 'Applies everywhere a subject or topic does not override it.' : `Overrides the wider setting for ${target ?? '—'}.`}
        </span>
      </div>
    </div>
  );
}
