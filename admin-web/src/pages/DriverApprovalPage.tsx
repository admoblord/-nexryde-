import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api';
import { DataTable, KpiCard, PageHeader } from '@/components/ui';

type Verification = Record<string, unknown> & {
  id: string;
  user_name: string;
  user_phone?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  status: string;
  verification_score: number;
  risk: { emoji: string; label: string; band: string };
};

type QueueResponse = {
  verifications: Verification[];
  dashboard_cards: Record<string, number>;
};

type Toast = { kind: 'success' | 'error'; message: string };

const PAGE_SIZE = 25;
const FILTERS = ['pending', 'under_review', 'approved', 'rejected'] as const;

export function DriverApprovalPage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [filter, setFilter] = useState<string>('pending');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // id of the row whose approve/reject request is in flight — guards double-submit.
  const [actingId, setActingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((kind: Toast['kind'], message: string) => {
    setToast({ kind, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api<QueueResponse>(
        `/admin/driver-approval-queue?status=${filter}&limit=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`,
      );
      setData(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the approval queue');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (id: string) => {
    if (actingId) return;
    setActingId(id);
    try {
      try {
        await api(`/admin/verifications/${id}/approve?force=false`, { method: 'POST' });
      } catch (e) {
        // Backend blocks approval when required documents are missing (400 +
        // "Use force=true to override"). Offer the admin an explicit override.
        const msg = e instanceof Error ? e.message : '';
        if (/force=true/i.test(msg) || /missing required documents/i.test(msg)) {
          if (!window.confirm(`${msg}\n\nForce-approve this driver anyway?`)) {
            return;
          }
          await api(`/admin/verifications/${id}/approve?force=true`, { method: 'POST' });
          showToast('success', 'Driver force-approved (some documents were missing).');
          await load();
          return;
        }
        throw e;
      }
      showToast('success', 'Driver approved.');
      await load();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not approve driver.');
    } finally {
      setActingId(null);
    }
  };

  const reject = async (id: string) => {
    if (actingId) return;
    const reason = prompt('Rejection reason for driver:');
    // prompt() returns null on cancel — abort instead of rejecting with a default.
    if (reason === null) return;
    setActingId(id);
    try {
      await api(`/admin/driver-approval/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || 'Documents require attention' }),
      });
      showToast('success', 'Driver rejected — they have been notified.');
      await load();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not reject driver.');
    } finally {
      setActingId(null);
    }
  };

  const cards = data?.dashboard_cards ?? {};
  const rows = (data?.verifications ?? []) as Record<string, unknown>[];
  const hasNext = rows.length >= PAGE_SIZE;

  return (
    <div>
      <PageHeader title="Driver Approval & Verification" desc="Review queue with risk scoring" />

      {toast ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm font-semibold ${
            toast.kind === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <KpiCard label="Pending" value={cards.pending ?? 0} tone="amber" />
        <KpiCard label="Approved Today" value={cards.approved_today ?? 0} tone="green" />
        <KpiCard label="Rejected Today" value={cards.rejected_today ?? 0} tone="red" />
        <KpiCard label="Avg Review (hrs)" value={cards.avg_review_time_hrs ?? '—'} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn-ghost capitalize ${filter === s ? 'border-emerald-500/50 text-emerald-400' : ''}`}
            onClick={() => { setPage(0); setFilter(s); }}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
        {loading ? <span className="text-xs text-slate-400">Loading…</span> : null}
      </div>

      {loadError ? (
        <div className="card flex items-center justify-between gap-4 border-red-500/30 bg-red-500/5">
          <span className="text-sm text-red-300">{loadError}</span>
          <button type="button" className="btn-ghost text-xs" onClick={() => void load()}>Retry</button>
        </div>
      ) : loading && !data ? (
        <div className="card py-12 text-center text-slate-400">Loading approval queue…</div>
      ) : (
        <DataTable
          columns={[
            { key: 'risk', label: 'Risk', render: (r) => <span>{(r.risk as { emoji: string }).emoji} {(r.risk as { label: string }).label}</span> },
            { key: 'user_name', label: 'Driver', render: (r) => (
              <Link to={`/drivers/${r.user_id}`} className="font-semibold text-emerald-400">{String(r.user_name)}</Link>
            )},
            { key: 'user_phone', label: 'Phone' },
            { key: 'nin_masked', label: 'NIN', render: (r) => r.nin_masked ? <span className="font-mono">{String(r.nin_masked)}</span> : <span className="text-slate-500">Missing</span> },
            { key: 'vehicle_model', label: 'Vehicle' },
            { key: 'vehicle_plate', label: 'Plate' },
            { key: 'verification_score', label: 'Score' },
            { key: 'status', label: 'Status' },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => {
                const id = String(r.id);
                const acting = actingId === id;
                const disabled = actingId !== null;
                return (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs font-bold text-emerald-400 disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => void approve(id)}
                    >
                      {acting ? '…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-bold text-red-400 disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => void reject(id)}
                    >
                      {acting ? '…' : 'Reject'}
                    </button>
                  </div>
                );
              },
            },
          ]}
          rows={rows}
          empty="No applications in this queue"
        />
      )}

      {(page > 0 || hasNext) && !loadError ? (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="btn-ghost text-xs disabled:opacity-40"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Previous
          </button>
          <span className="text-xs text-slate-400">Page {page + 1}</span>
          <button
            type="button"
            className="btn-ghost text-xs disabled:opacity-40"
            disabled={!hasNext || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
