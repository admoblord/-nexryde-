import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api';
import { DataTable, PageHeader } from '@/components/ui';

export function DriversPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    api<{ drivers: Record<string, unknown>[] }>(`/admin/drivers?limit=200`)
      .then((d) => setRows(d.drivers ?? []))
      .catch(() => api<{ drivers: Record<string, unknown>[] }>('/admin/drivers').then((x) => setRows(x.drivers ?? [])));
  }, [search]);

  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return [r.name, r.phone, r.email, r.id].some((v) => String(v ?? '').toLowerCase().includes(q));
      })
    : rows;

  return (
    <div>
      <PageHeader title="Driver Management" desc="Click any driver to open the full operations profile" actions={
        <input className="input max-w-xs" placeholder="Search drivers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      } />
      <DataTable
        columns={[
          { key: 'name', label: 'Name', render: (r) => <span className="font-semibold text-white">{String(r.name ?? '—')}</span> },
          { key: 'phone', label: 'Phone' },
          { key: 'nin_masked', label: 'NIN', render: (r) => r.nin_masked ? <span className="font-mono text-emerald-400">{String(r.nin_masked)}</span> : <span className="text-slate-500">—</span> },
          { key: 'email', label: 'Email' },
          { key: 'verification_status', label: 'Verification', render: (r) => <span className="badge-warn">{String(r.verification_status ?? 'pending')}</span> },
          { key: 'is_online', label: 'Online', render: (r) => (r.is_online ? <span className="badge-ok">Online</span> : <span className="text-slate-500">Offline</span>) },
          { key: 'total_trips', label: 'Trips' },
          { key: 'rating', label: 'Rating' },
          { key: 'subscription_status', label: 'Subscription' },
        ]}
        rows={filtered}
        onRowClick={(r) => nav(`/drivers/${r.id}`)}
        empty="No drivers registered yet"
      />
    </div>
  );
}

export function RidersPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const nav = useNavigate();
  useEffect(() => {
    api<{ riders: Record<string, unknown>[] }>('/admin/riders').then((d) => setRows(d.riders ?? []));
  }, []);
  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return [r.name, r.phone, r.email, r.id].some((v) => String(v ?? '').toLowerCase().includes(q));
      })
    : rows;
  return (
    <div>
      <PageHeader title="Rider Management" desc="Click any rider to open the full operations profile" actions={
        <input className="input max-w-xs" placeholder="Search riders…" value={search} onChange={(e) => setSearch(e.target.value)} />
      } />
      <DataTable         columns={[
          { key: 'name', label: 'Name', render: (r) => <span className="font-semibold text-white">{String(r.name ?? '—')}</span> },
          { key: 'phone', label: 'Phone' },
          { key: 'nin_masked', label: 'NIN', render: (r) => r.nin_masked ? <span className="font-mono text-emerald-400">{String(r.nin_masked)}</span> : <span className="text-slate-500">—</span> },
          { key: 'nin_verified', label: 'NIN ✓', render: (r) => r.nin_verified ? <span className="badge-ok">Yes</span> : <span className="text-slate-500">No</span> },
          { key: 'email', label: 'Email' },
        { key: 'total_trips', label: 'Trips' },
        { key: 'created_at', label: 'Joined' },
      ]} rows={filtered} onRowClick={(r) => nav(`/riders/${r.id}`)} empty="No riders registered yet" />
    </div>
  );
}

export function TripsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState('');
  const nav = useNavigate();
  useEffect(() => {
    const q = status ? `?status=${status}` : '';
    api<{ trips: Record<string, unknown>[] }>(`/admin/trips${q}`).then((d) => setRows(d.trips ?? []));
  }, [status]);
  return (
    <div>
      <PageHeader title="Trip Management" desc="Click any trip for full operations detail" actions={
        <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      } />
      <DataTable columns={[
        { key: 'id', label: 'Trip ID', render: (r) => String(r.id).slice(0, 8) },
        { key: 'status', label: 'Status' },
        { key: 'fare', label: 'Fare ₦' },
        { key: 'distance_km', label: 'Km' },
        { key: 'payment_method', label: 'Payment' },
        { key: 'created_at', label: 'Created' },
      ]} rows={rows} onRowClick={(r) => nav(`/trips/${r.id}`)} empty="No trips found" />
    </div>
  );
}
