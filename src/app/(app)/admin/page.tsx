'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/useSession';

type AdminData = {
  approvals: { id: string; name: string; email: string; roleRequested: string; note: string; status: string; createdAt: string }[];
  flags: { key: string; description: string; enabled: boolean }[];
  algorithms: { name: string; description: string; defaultParams: Record<string, number> }[];
  users: { id: string; email: string; name: string; role: string; status: string; totpEnabled: boolean; createdAt: string }[];
  pendingTopics: { id: string; name: string; ownerId: string | null; createdAt: string }[];
  audit: { id: string; action: string; target: string; createdAt: string }[];
};

export default function AdminPage() {
  const { user, loading } = useSession();
  const [data, setData] = useState<AdminData | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [algoParams, setAlgoParams] = useState('');

  const load = () => api.get<AdminData>('/api/v1/admin').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    if (!loading && user?.role === 'developer') load();
  }, [user, loading]);

  if (!loading && user?.role !== 'developer') {
    return <p className="card text-sm text-bad">Developers only.</p>;
  }

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setError(''); setMessage('');
    try {
      await api.post('/api/v1/admin', body);
      setMessage(okMsg);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Developer admin</h1>
        <p className="text-sm text-muted">Approvals, feature flags, SRS algorithms, users and the publishing queue.</p>
      </header>

      {message && <p className="rounded-xl bg-good/10 px-3 py-2 text-sm text-good">{message}</p>}
      {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

      <section className="card">
        <h2 className="font-semibold">Approval requests</h2>
        {data?.approvals.length === 0 && <p className="mt-2 text-sm text-muted">Nothing pending.</p>}
        <div className="mt-3 space-y-2">
          {data?.approvals.filter((a) => a.status === 'pending').map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge px-4 py-3 text-sm">
              <div>
                <span className="font-medium">{a.name}</span> <span className="text-muted">({a.email})</span>
                <span className="chip ml-2 capitalize">{a.roleRequested}</span>
                {a.note && <p className="mt-1 text-xs text-muted">{a.note}</p>}
              </div>
              <div className="flex gap-2">
                <button className="btn-primary !px-3 !py-1 text-xs" onClick={() => act({ action: 'approve_request', approvalId: a.id }, 'Approved.')}>Approve</button>
                <button className="btn-danger !px-3 !py-1 text-xs" onClick={() => act({ action: 'reject_request', approvalId: a.id }, 'Rejected.')}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold">Publishing queue</h2>
        {data?.pendingTopics.length === 0 && <p className="mt-2 text-sm text-muted">No topics awaiting review.</p>}
        <div className="mt-3 space-y-2">
          {data?.pendingTopics.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-edge px-4 py-2.5 text-sm">
              <span className="font-medium">{t.name}</span>
              <div className="flex gap-2">
                <button className="btn-primary !px-3 !py-1 text-xs" onClick={() => act({ action: 'review_topic', topicId: t.id, approveTopic: true }, 'Published.')}>Approve</button>
                <button className="btn-danger !px-3 !py-1 text-xs" onClick={() => act({ action: 'review_topic', topicId: t.id, approveTopic: false }, 'Rejected back to private.')}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold">SRS algorithms</h2>
        <div className="mt-3 space-y-2">
          {data?.algorithms.map((a) => (
            <div key={a.name} className="rounded-xl border border-edge px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">{a.name}</span>
                <button className="btn-ghost !px-3 !py-1 text-xs"
                  onClick={() => {
                    const params = algoParams.trim() ? JSON.parse(algoParams) : undefined;
                    act({ action: 'update_algorithm', algorithm: a.name, params }, `Default algorithm set to ${a.name}.`);
                  }}>
                  Set as default
                </button>
              </div>
              <p className="text-xs text-muted">{a.description}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">{JSON.stringify(a.defaultParams)}</p>
            </div>
          ))}
        </div>
        <textarea className="input mt-3 font-mono text-xs" rows={2} value={algoParams} onChange={(e) => setAlgoParams(e.target.value)}
          placeholder='Optional param overrides JSON, e.g. {"learningStepMinutes": 5}' />
      </section>

      <section className="card">
        <h2 className="font-semibold">Feature flags</h2>
        <div className="mt-3 space-y-2">
          {data?.flags.map((f) => (
            <div key={f.key} className="flex items-center justify-between rounded-xl border border-edge px-4 py-2.5 text-sm">
              <div>
                <span className="font-mono font-medium">{f.key}</span>
                <p className="text-xs text-muted">{f.description}</p>
              </div>
              <button className={f.enabled ? 'btn-primary !px-3 !py-1 text-xs' : 'btn-ghost !px-3 !py-1 text-xs'}
                onClick={() => act({ action: 'set_flag', flagKey: f.key, enabled: !f.enabled }, 'Flag updated.')}>
                {f.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold">Users</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2">User</th><th className="py-2">Role</th><th className="py-2">Status</th><th className="py-2">2FA</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id} className="border-t border-edge">
                  <td className="py-2.5">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </td>
                  <td className="py-2.5 capitalize">{u.role}</td>
                  <td className="py-2.5">
                    <span className={`chip ${u.status === 'active' ? '!text-good' : u.status === 'suspended' ? '!text-bad' : ''}`}>{u.status}</span>
                  </td>
                  <td className="py-2.5">{u.totpEnabled ? '✓' : '—'}</td>
                  <td className="py-2.5 text-right">
                    <button className="btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => act({ action: u.status === 'suspended' ? 'activate_user' : 'suspend_user', userId: u.id }, 'User updated.')}>
                      {u.status === 'suspended' ? 'Activate' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data && data.audit.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Audit log</h2>
          <div className="mt-3 space-y-1 font-mono text-xs text-muted">
            {data.audit.map((a) => (
              <div key={a.id}>{new Date(a.createdAt).toLocaleString()} — {a.action} → {a.target}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
