import { useEffect, useState } from 'react';
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

export function DriverApprovalPage() {
  const [data, setData] = useState<{ verifications: Verification[]; dashboard_cards: Record<string, number> } | null>(null);
  const [filter, setFilter] = useState('pending');

  const load = () => api<{ verifications: Verification[]; dashboard_cards: Record<string, number> }>(
    `/admin/driver-approval-queue?status=${filter}`,
  ).then(setData);

  useEffect(() => { load(); }, [filter]);

  const approve = async (id: string) => {
    await api(`/admin/verifications/${id}/approve?force=false`, { method: 'POST' });
    load();
  };

  const reject = async (id: string) => {
    const reason = prompt('Rejection reason for driver:') || 'Documents require attention';
    await api(`/admin/driver-approval/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    load();
  };

  const cards = data?.dashboard_cards ?? {};

  return (
    <div>
      <PageHeader title="Driver Approval & Verification" desc="Review queue with risk scoring" />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <KpiCard label="Pending" value={cards.pending ?? 0} tone="amber" />
        <KpiCard label="Approved Today" value={cards.approved_today ?? 0} tone="green" />
        <KpiCard label="Rejected Today" value={cards.rejected_today ?? 0} tone="red" />
        <KpiCard label="Avg Review (hrs)" value={cards.avg_review_time_hrs ?? '—'} />
      </div>
      <div className="mb-4 flex gap-2">
        {['pending', 'under_review', 'approved', 'rejected'].map((s) => (
          <button key={s} type="button" className={`btn-ghost capitalize ${filter === s ? 'border-emerald-500/50 text-emerald-400' : ''}`} onClick={() => setFilter(s)}>{s.replace('_', ' ')}</button>
        ))}
      </div>
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
            render: (r) => (
              <div className="flex gap-2">
                <button type="button" className="text-xs font-bold text-emerald-400" onClick={() => approve(String(r.id))}>Approve</button>
                <button type="button" className="text-xs font-bold text-red-400" onClick={() => reject(String(r.id))}>Reject</button>
              </div>
            ),
          },
        ]}
        rows={(data?.verifications ?? []) as Record<string, unknown>[]}
        empty="No applications in this queue"
      />
    </div>
  );
}
