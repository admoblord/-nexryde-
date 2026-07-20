import { useEffect, useState } from 'react';
import { api } from '@/api';
import { DataTable, KpiCard, PageHeader } from '@/components/ui';
import { Timeline } from '@/components/Timeline';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api<Record<string, unknown>>('/admin/analytics?period=30d').then(setData); }, []);
  if (!data) return <div className="card">Loading analytics…</div>;
  const trips = (data.trips_per_day as { date: string; total: number }[]) ?? [];
  const peaks = (data.peak_hours as { hour: number; trips: number }[]) ?? [];
  return (
    <div>
      <PageHeader title="Analytics" desc="30-day platform insights" />
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <KpiCard label="Completion Rate" value={`${data.completion_rate_pct}%`} tone="green" />
        <KpiCard label="Cancellation Rate" value={`${data.cancellation_rate_pct}%`} tone="red" />
        <KpiCard label="Revenue (30d) ₦" value={Number(data.total_revenue_ngn).toLocaleString()} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card h-72"><h3 className="mb-2 font-bold">Trips / day</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={trips}><CartesianGrid stroke="#ffffff10" /><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} /><YAxis tick={{ fill: '#94a3b8' }} /><Tooltip /><Line type="monotone" dataKey="total" stroke="#00d084" /></LineChart></ResponsiveContainer></div>
        <div className="card h-72"><h3 className="mb-2 font-bold">Peak hours</h3><ResponsiveContainer width="100%" height="90%"><BarChart data={peaks}><CartesianGrid stroke="#ffffff10" /><XAxis dataKey="hour" tick={{ fill: '#94a3b8' }} /><YAxis tick={{ fill: '#94a3b8' }} /><Tooltip /><Bar dataKey="trips" fill="#0ea5e9" /></BarChart></ResponsiveContainer></div>
      </div>
    </div>
  );
}

export function SubscriptionIntelPage() {
  const [d, setD] = useState<Record<string, number> | null>(null);
  useEffect(() => { api<Record<string, number>>('/admin/subscription-intelligence').then(setD); }, []);
  if (!d) return <div className="card">Loading…</div>;
  return (
    <div>
      <PageHeader title="Subscription Intelligence" desc="MRR, churn, trial conversion" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Trial Drivers" value={d.trial_drivers} />
        <KpiCard label="Active" value={d.active_drivers} tone="green" />
        <KpiCard label="Expiring (7d)" value={d.expiring_next_7_days} tone="amber" />
        <KpiCard label="MRR ₦" value={d.monthly_recurring_revenue_ngn?.toLocaleString()} tone="green" />
        <KpiCard label="Renewal Rate" value={`${d.renewal_rate_pct}%`} />
        <KpiCard label="Churn Rate" value={`${d.churn_rate_pct}%`} tone="red" />
        <KpiCard label="Founding Drivers" value={d.founding_drivers} />
        <KpiCard label="Renewed This Month" value={d.renewed_this_month} />
      </div>
    </div>
  );
}

export function WithdrawalsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const load = () => api<{ withdrawals: Record<string, unknown>[]; counts: Record<string, number> }>('/admin/withdrawals').then((x) => { setRows(x.withdrawals); setCounts(x.counts); });
  useEffect(() => { load(); }, []);
  const act = async (id: string, action: 'approve' | 'reject') => {
    const note = prompt(`${action} withdrawal — optional note:`) || '';
    await api(`/admin/withdrawals/${id}/${action}`, { method: 'POST', body: JSON.stringify({ note }) });
    load();
  };
  return (
    <div>
      <PageHeader title="Withdrawals" desc="Approve, reject, export" />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Pending" value={counts.pending ?? 0} tone="amber" />
        <KpiCard label="Completed" value={counts.completed ?? 0} tone="green" />
        <KpiCard label="Failed" value={counts.failed ?? 0} tone="red" />
      </div>
      <DataTable columns={[
        { key: 'id', label: 'ID', render: (r) => String(r.id).slice(0, 10) },
        { key: 'user_id', label: 'User' },
        { key: 'amount', label: 'Amount ₦' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Date' },
        {
          key: 'actions', label: 'Actions', render: (r) => r.status === 'pending' || r.status === 'processing' ? (
            <div className="flex gap-2">
              <button type="button" className="text-xs font-bold text-emerald-400" onClick={() => act(String(r.id), 'approve')}>Approve</button>
              <button type="button" className="text-xs font-bold text-red-400" onClick={() => act(String(r.id), 'reject')}>Reject</button>
            </div>
          ) : '—',
        },
      ]} rows={rows} />
    </div>
  );
}

export function SystemHealthPage() {
  const [services, setServices] = useState<{ name: string; status: string; latency_ms: number }[]>([]);
  useEffect(() => {
    const load = () => api<{ services: typeof services }>('/admin/system-health').then((x) => setServices(x.services));
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  return (
    <div>
      <PageHeader title="System Health" desc="Real-time service monitoring" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <div key={s.name} className={`card ${s.status !== 'ok' ? 'border-red-500/40' : ''}`}>
            <div className="flex justify-between"><span className="font-bold">{s.name}</span><span className={s.status === 'ok' ? 'badge-ok' : 'badge-err'}>{s.status}</span></div>
            <p className="mt-2 text-sm text-slate-400">{s.latency_ms}ms latency</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditLogsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { api<{ logs: Record<string, unknown>[] }>('/admin/audit-logs?limit=200').then((x) => setRows(x.logs)); }, []);
  return (
    <div>
      <PageHeader title="Audit Logs" desc="Every admin action tracked with before/after values" />
      <DataTable columns={[
        { key: 'created_at', label: 'Time' },
        { key: 'admin_email', label: 'Admin' },
        { key: 'action', label: 'Action' },
        { key: 'target_type', label: 'Target Type' },
        { key: 'target_id', label: 'Target ID', render: (r) => String(r.target_id ?? '').slice(0, 12) },
        { key: 'ip_address', label: 'IP' },
        { key: 'details', label: 'Changes', render: (r) => {
          const d = r.details as Record<string, unknown> | undefined;
          return d ? <span className="text-xs text-slate-400">{JSON.stringify(d).slice(0, 80)}</span> : '—';
        }},
      ]} rows={rows} />
    </div>
  );
}

export function AnnouncementsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const load = () => api<{ announcements: Record<string, unknown>[] }>('/admin/announcements').then((x) => setRows(x.announcements));
  useEffect(() => { load(); }, []);
  const create = async () => {
    await api('/admin/announcements', { method: 'POST', body: JSON.stringify({ title, message, audience: 'all' }) });
    setTitle(''); setMessage('');
    load();
  };
  return (
    <div>
      <PageHeader title="Announcements & Maintenance" desc="In-app banners and maintenance windows" />
      <div className="card mb-6 space-y-3">
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input min-h-[100px]" placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button type="button" className="btn-primary" onClick={create}>Publish announcement</button>
      </div>
      <DataTable columns={[
        { key: 'title', label: 'Title' },
        { key: 'message', label: 'Message' },
        { key: 'audience', label: 'Audience' },
        { key: 'created_by', label: 'By' },
      ]} rows={rows} />
    </div>
  );
}

export function DispatchPage() {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [monitor, setMonitor] = useState<Record<string, unknown> | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const load = () => {
      Promise.all([
        api('/admin/dispatch'),
        api('/admin/dispatch/monitor'),
      ]).then(([legacy, mon]) => { setD(legacy as Record<string, unknown>); setMonitor(mon as Record<string, unknown>); });
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedTrip) { setEvents(null); return; }
    api<Record<string, unknown>>(`/admin/dispatch/events?trip_id=${selectedTrip}`).then(setEvents).catch(() => setEvents(null));
  }, [selectedTrip]);

  if (!d) return <div className="card">Loading dispatch…</div>;
  const counts = (monitor?.counts as Record<string, number>) ?? {};

  const timelineEvents = selectedTrip && events
    ? [
        ...((events.timeline as { label: string; timestamp?: unknown }[]) ?? []),
        ...((events.offers as Record<string, unknown>[]) ?? []).map((o) => ({
          label: `Driver ${String(o.driver_id ?? '').slice(0, 8)} — ${o.status}${o.decline_reason || o.skip_reason ? ` (${o.decline_reason || o.skip_reason})` : ''}`,
          timestamp: o.created_at,
        })),
      ].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    : [];

  return (
    <div>
      <PageHeader title="Live Dispatch Monitor" desc="Every dispatch decision — ride requested → driver skipped → accepted → completed" />
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <KpiCard label="Waiting" value={counts.ride_requests_waiting ?? d.pending_requests as number} tone="amber" />
        <KpiCard label="En Route" value={counts.drivers_en_route ?? 0} tone="blue" />
        <KpiCard label="In Progress" value={counts.trips_in_progress ?? 0} tone="green" />
        <KpiCard label="Avg assign (sec)" value={d.avg_assignment_sec as number} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 font-bold">Pending Queue</h3>
          <DataTable columns={[
            { key: 'id', label: 'Trip', render: (r) => (
              <button type="button" className="text-emerald-400" onClick={() => setSelectedTrip(String(r.id))}>
                {String(r.id).slice(0, 10)}
              </button>
            )},
            { key: 'status', label: 'Status' },
            { key: 'rider_id', label: 'Rider' },
            { key: 'created_at', label: 'Queued' },
          ]} rows={((monitor?.pending_trips as Record<string, unknown>[]) ?? (d.queue as Record<string, unknown>[]) ?? [])} />
        </div>
        <div>
          <h3 className="mb-2 font-bold">
            Dispatch Timeline {selectedTrip ? `— ${selectedTrip.slice(0, 10)}` : '(select a trip)'}
          </h3>
          {selectedTrip ? (
            <Timeline events={timelineEvents} />
          ) : (
            <div className="card text-sm text-slate-400">Click a trip ID to view full dispatch event history.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DriversLivePage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    const load = () => api<{ drivers: Record<string, unknown>[] }>('/admin/drivers/live-status').then((x) => setRows(x.drivers));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div>
      <PageHeader title="Driver Live Status" desc="Real-time driver states & GPS" />
      <DataTable columns={[
        { key: 'name', label: 'Driver' },
        { key: 'live_state', label: 'State' },
        { key: 'is_online', label: 'Online', render: (r) => (r.is_online ? 'Yes' : 'No') },
        { key: 'active_trip_id', label: 'Trip' },
        { key: 'last_location_at', label: 'Last GPS' },
      ]} rows={rows} />
    </div>
  );
}

export function KpiPage() {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api<Record<string, unknown>>('/admin/kpi-scoreboard').then(setD); }, []);
  if (!d) return <div className="card">Loading KPIs…</div>;
  return (
    <div>
      <PageHeader title="Executive KPI Scoreboard" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(d).map(([k, v]) => (
          <KpiCard key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
        ))}
      </div>
    </div>
  );
}

export function FeatureFlagsPage() {
  const [flags, setFlags] = useState<Record<string, string>>({});
  useEffect(() => { api<{ flags: Record<string, string> }>('/admin/feature-flags').then((x) => setFlags(x.flags)); }, []);
  const save = async () => { await api('/admin/feature-flags', { method: 'POST', body: JSON.stringify({ flags }) }); alert('Saved'); };
  return (
    <div>
      <PageHeader title="Feature Flags" desc="Roll out without deploy" actions={<button type="button" className="btn-primary" onClick={save}>Save</button>} />
      <div className="card space-y-3">
        {Object.keys(flags).map((k) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <span className="font-medium capitalize">{k.replace(/_/g, ' ')}</span>
            <select className="input max-w-[200px]" value={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.value })}>
              {['off', 'internal', 'founding', 'beta', 'all'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlaceholderPage({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <PageHeader title={title} desc={desc} />
      <div className="card text-slate-400">Module wired to navigation — connect remaining APIs or use legacy panel sections for advanced workflows.</div>
    </div>
  );
}

export function FinancePage() {
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [withdrawalCounts, setWithdrawalCounts] = useState<Record<string, number>>({});
  const [withdrawals, setWithdrawals] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    Promise.all([
      api<{ payments: Record<string, unknown>[]; approved_count: number; pending_count: number; total_revenue: number }>('/admin/payments'),
      api<{ withdrawals: Record<string, unknown>[]; counts: Record<string, number> }>('/admin/withdrawals'),
    ]).then(([p, w]) => {
      setPayments(p.payments ?? []);
      setStats({ approved: p.approved_count, pending: p.pending_count, revenue: p.total_revenue });
      setWithdrawalCounts(w.counts ?? {});
      setWithdrawals(w.withdrawals ?? []);
    });
  }, []);
  return (
    <div>
      <PageHeader title="Wallet & Finance" desc="Subscriptions, withdrawals, revenue" />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <KpiCard label="Sub Revenue ₦" value={(stats.revenue ?? 0).toLocaleString()} tone="green" />
        <KpiCard label="Approved Payments" value={stats.approved ?? 0} />
        <KpiCard label="Pending Payments" value={stats.pending ?? 0} tone="amber" />
        <KpiCard label="Pending Withdrawals" value={withdrawalCounts.pending ?? 0} tone="amber" />
      </div>
      <h3 className="mb-2 font-bold">Subscription Payments</h3>
      <DataTable columns={[
        { key: 'driver_name', label: 'Driver' },
        { key: 'amount', label: 'Amount ₦' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Date' },
      ]} rows={payments} />
      <h3 className="mb-2 mt-6 font-bold">Recent Withdrawals</h3>
      <DataTable columns={[
        { key: 'user_id', label: 'User' },
        { key: 'amount', label: 'Amount ₦' },
        { key: 'status', label: 'Status' },
      ]} rows={withdrawals.slice(0, 20)} />
    </div>
  );
}

export function SubscriptionsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const q = filter ? `?status=${filter}` : '';
    api<{ subscriptions: Record<string, unknown>[]; counts: Record<string, number> }>(`/admin/subscriptions${q}`).then((x) => {
      setRows(x.subscriptions);
      setCounts(x.counts);
    });
  }, [filter]);
  return (
    <div>
      <PageHeader title="Subscriptions" desc="Active, trial, expired, founding drivers" actions={
        <select className="input max-w-[180px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="expired">Expired</option>
        </select>
      } />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <KpiCard label="Active" value={counts.active ?? 0} tone="green" />
        <KpiCard label="Trial" value={counts.trial ?? 0} tone="amber" />
        <KpiCard label="Expired" value={counts.expired ?? 0} tone="red" />
        <KpiCard label="Founding" value={counts.founding ?? 0} />
      </div>
      <DataTable columns={[
        { key: 'driver_name', label: 'Driver' },
        { key: 'status', label: 'Status' },
        { key: 'plan_type', label: 'Plan' },
        { key: 'amount_paid', label: 'Paid ₦' },
        { key: 'end_date', label: 'Ends' },
      ]} rows={rows} />
    </div>
  );
}

export function SupportPage() {
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    Promise.all([
      api<{ reports: Record<string, unknown>[] }>('/admin/reports/all'),
      api<{ activities: Record<string, unknown>[] }>('/admin/activity-log?limit=30'),
    ]).then(([r, a]) => {
      setReports(r.reports ?? []);
      setActivity(a.activities ?? []);
    });
  }, []);
  return (
    <div>
      <PageHeader title="Support Center" desc="Reports, disputes, activity feed" />
      <h3 className="mb-2 font-bold">Driver Reports</h3>
      <DataTable columns={[
        { key: 'report_id', label: 'ID' },
        { key: 'category', label: 'Category' },
        { key: 'severity', label: 'Severity' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Date' },
      ]} rows={reports} />
      <h3 className="mb-2 mt-6 font-bold">Recent Activity</h3>
      <DataTable columns={[
        { key: 'type', label: 'Type' },
        { key: 'action', label: 'Action' },
        { key: 'user_id', label: 'User' },
        { key: 'timestamp', label: 'Time' },
      ]} rows={activity} />
    </div>
  );
}

export function SafetyPage() {
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    api<{ alerts: Record<string, unknown>[] }>('/admin/sos-alerts').then((x) => setAlerts(x.alerts ?? []));
  }, []);
  return (
    <div>
      <PageHeader title="Safety Center" desc="SOS alerts and emergency requests" />
      <DataTable columns={[
        { key: 'id', label: 'Alert ID' },
        { key: 'trip_id', label: 'Trip' },
        { key: 'user_id', label: 'User' },
        { key: 'status', label: 'Status' },
        { key: 'triggered_at', label: 'Triggered' },
      ]} rows={alerts} empty="No SOS alerts — platform is clear" />
    </div>
  );
}

export function FraudPage() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [blacklist, setBlacklist] = useState<Record<string, unknown>[]>([]);
  const [flags, setFlags] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    Promise.all([
      api<Record<string, unknown>>('/admin/abuse-prevention/stats'),
      api<{ blacklist: Record<string, unknown>[] }>('/admin/abuse-prevention/blacklist'),
      api<{ flags: Record<string, unknown>[] }>('/admin/fraud/flags'),
    ]).then(([s, b, f]) => { setStats(s); setBlacklist(b.blacklist ?? []); setFlags(f.flags ?? []); });
  }, []);
  return (
    <div>
      <PageHeader title="Fraud & Security Center" desc="Auto-detected abuse, duplicate accounts, excessive cancellations" />
      {stats ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          {Object.entries(stats).slice(0, 6).map(([k, v]) => (
            <KpiCard key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
          ))}
        </div>
      ) : null}
      <h3 className="mb-2 font-bold">Suspicious Activity Flags</h3>
      <DataTable columns={[
        { key: 'type', label: 'Type' },
        { key: 'severity', label: 'Severity', render: (r) => <span className={r.severity === 'high' ? 'text-red-400' : 'text-amber-400'}>{String(r.severity)}</span> },
        { key: 'detail', label: 'Detail' },
        { key: 'driver_id', label: 'Driver', render: (r) => r.driver_id ? String(r.driver_id).slice(0, 10) : '—' },
        { key: 'phone', label: 'Phone' },
      ]} rows={flags} empty="No fraud flags detected" />
      <h3 className="mb-2 mt-6 font-bold">Blacklisted Accounts</h3>
      <DataTable columns={[
        { key: 'phone', label: 'Phone' },
        { key: 'reason', label: 'Reason' },
        { key: 'blacklisted_at', label: 'Date' },
        { key: 'status', label: 'Status' },
      ]} rows={blacklist} />
    </div>
  );
}

export function NotificationsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('drivers');
  const [scheduled, setScheduled] = useState<Record<string, unknown>[]>([]);
  const [delivery, setDelivery] = useState<Record<string, unknown> | null>(null);
  const load = () => {
    api<{ scheduled: Record<string, unknown>[] }>('/admin/notifications/scheduled').then((x) => setScheduled(x.scheduled ?? [])).catch(() => {});
    api<Record<string, unknown>>('/admin/notifications/delivery-stats').then(setDelivery).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const send = async () => {
    await api('/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title, body, target: audience }),
    });
    setTitle(''); setBody('');
    load();
    alert('Broadcast queued');
  };
  return (
    <div>
      <PageHeader title="Notification Center" desc="Push broadcasts + delivery tracking (sent, delivered, failed)" />
      {delivery ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-5">
          <KpiCard label="Sent" value={delivery.sent as number} />
          <KpiCard label="Delivered" value={delivery.delivered as number} tone="green" />
          <KpiCard label="Opened" value={delivery.opened as number} />
          <KpiCard label="Clicked" value={delivery.clicked as number} />
          <KpiCard label="Failed" value={delivery.failed as number} tone="red" />
        </div>
      ) : null}
      <div className="card mb-6 space-y-3">
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input min-h-[80px]" placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
        <select className="input max-w-xs" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="all">All users</option>
          <option value="drivers">Drivers</option>
          <option value="riders">Riders</option>
        </select>
        <button type="button" className="btn-primary" onClick={send}>Send push</button>
      </div>
      <DataTable columns={[
        { key: 'title', label: 'Title' },
        { key: 'audience', label: 'Audience' },
        { key: 'scheduled_at', label: 'Scheduled' },
        { key: 'status', label: 'Status' },
      ]} rows={scheduled} />
      {delivery?.recent_failures ? (
        <>
          <h3 className="mb-2 mt-6 font-bold">Recent Failures</h3>
          <DataTable columns={[
            { key: 'title', label: 'Title' },
            { key: 'status', label: 'Status' },
            { key: 'user_id', label: 'User' },
            { key: 'created_at', label: 'Time' },
          ]} rows={(delivery.recent_failures as Record<string, unknown>[]) ?? []} />
        </>
      ) : null}
    </div>
  );
}

export function PromotionsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState('10');
  const load = () => api<{ promos: Record<string, unknown>[] }>('/admin/promos').then((x) => setRows(x.promos ?? []));
  useEffect(() => { load(); }, []);
  const create = async () => {
    const qs = new URLSearchParams({ code, discount_percent: discount, max_uses: '1000' });
    await api(`/admin/promo/create?${qs}`, { method: 'POST' });
    setCode('');
    load();
  };
  return (
    <div>
      <PageHeader title="Promotions" desc="Promo codes and ride discounts" />
      <div className="card mb-6 flex flex-wrap gap-3">
        <input className="input max-w-[160px]" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <input className="input max-w-[120px]" type="number" placeholder="%" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <button type="button" className="btn-primary" onClick={create}>Create promo</button>
      </div>
      <DataTable columns={[
        { key: 'code', label: 'Code' },
        { key: 'discount_percent', label: 'Discount %' },
        { key: 'max_uses', label: 'Max uses' },
        { key: 'active', label: 'Active', render: (r) => (r.active ? 'Yes' : 'No') },
      ]} rows={rows} />
    </div>
  );
}

export function SettingsPage() {
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api<Record<string, unknown>>('/admin/pricing/current').then(setCfg); }, []);
  if (!cfg) return <div className="card">Loading settings…</div>;
  return (
    <div>
      <PageHeader title="Settings" desc="Subscription pricing, trial limits, fare configuration" />
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label="Current Phase" value={String(cfg.current_phase ?? '—')} />
        <KpiCard label="Current Price ₦" value={String(cfg.current_price ?? '—')} tone="green" />
        <KpiCard label="Trial Hours" value={String(cfg.trial_duration_hours ?? '—')} />
        <KpiCard label="Trial Trip Limit" value={String(cfg.trial_trip_limit ?? '—')} />
        <KpiCard label="Launch Driver Limit" value={String(cfg.launch_driver_limit ?? '—')} />
        <KpiCard label="Launch Drivers Count" value={String(cfg.launch_drivers_count ?? 0)} />
      </div>
      <p className="mt-4 text-sm text-slate-400">Use legacy panel or API <code className="text-emerald-400">POST /admin/pricing/set-phase</code> to change phases without deploy.</p>
    </div>
  );
}

export function WorkZonesPage() {
  const [areas, setAreas] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    api<{ areas: Record<string, unknown>[] }>('/work-zone/areas').then((x) => setAreas(x.areas ?? [])).catch(() => setAreas([]));
  }, []);
  return (
    <div>
      <PageHeader title="Work Zone Management" desc="Active zones and driver coverage" />
      <DataTable columns={[
        { key: 'id', label: 'Zone ID' },
        { key: 'name', label: 'Name' },
        { key: 'city', label: 'City' },
        { key: 'active', label: 'Active', render: (r) => (r.active === false ? 'No' : 'Yes') },
      ]} rows={areas} empty="No work zones configured" />
    </div>
  );
}

export function ExportPage() {
  const [busy, setBusy] = useState('');
  const exportData = async (kind: 'drivers' | 'riders' | 'trips') => {
    setBusy(kind);
    try {
      if (kind === 'drivers') {
        const d = await api<{ drivers: Record<string, unknown>[] }>('/admin/drivers?limit=5000');
        downloadCsv('nexryde-drivers.csv', d.drivers ?? []);
      } else if (kind === 'riders') {
        const d = await api<{ riders: Record<string, unknown>[] }>('/admin/riders?limit=5000');
        downloadCsv('nexryde-riders.csv', d.riders ?? []);
      } else {
        const d = await api<{ trips: Record<string, unknown>[] }>('/admin/trips?limit=5000');
        downloadCsv('nexryde-trips.csv', d.trips ?? []);
      }
    } finally {
      setBusy('');
    }
  };
  return (
    <div>
      <PageHeader title="Backup & Data Export" desc="Export platform data to CSV" />
      <div className="grid gap-4 sm:grid-cols-3">
        {(['drivers', 'riders', 'trips'] as const).map((k) => (
          <button key={k} type="button" className="card text-left hover:border-emerald-500/30" onClick={() => exportData(k)} disabled={!!busy}>
            <p className="font-bold capitalize">{k}</p>
            <p className="text-sm text-slate-400">{busy === k ? 'Exporting…' : 'Download CSV'}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DeveloperPage() {
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    Promise.all([
      api<Record<string, unknown>>('/admin/api-usage').catch(() => null),
      api<Record<string, unknown>>('/admin/system-health'),
    ]).then(([u, h]) => { setUsage(u); setHealth(h); });
  }, []);
  return (
    <div>
      <PageHeader title="Developer Tools" desc="API usage, health probes, diagnostics" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 font-bold">API Usage</h3>
          <pre className="max-h-64 overflow-auto text-xs text-slate-300">{JSON.stringify(usage ?? {}, null, 2)}</pre>
        </div>
        <div className="card">
          <h3 className="mb-2 font-bold">System Health</h3>
          <pre className="max-h-64 overflow-auto text-xs text-slate-300">{JSON.stringify(health ?? {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

export function MarketingPage() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api<Record<string, unknown>>('/admin/referral-stats').then(setStats); }, []);
  if (!stats) return <div className="card">Loading…</div>;
  return (
    <div>
      <PageHeader title="Marketing & Referrals" desc="Referral campaign performance" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <KpiCard label="Users with Referral Code" value={stats.users_with_referral_code as number} />
        <KpiCard label="Referred Signups" value={stats.referred_signups as number} tone="green" />
      </div>
      <DataTable columns={[
        { key: '_id', label: 'Reward Type' },
        { key: 'count', label: 'Count' },
        { key: 'total_ngn', label: 'Total ₦' },
      ]} rows={(stats.reward_breakdown as Record<string, unknown>[]) ?? []} empty="No referral rewards yet" />
    </div>
  );
}

export function GeoPage() {
  const [areas, setAreas] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    api<{ areas: Record<string, unknown>[] }>('/work-zone/areas?city=all').then((x) => setAreas(x.areas ?? [])).catch(() => setAreas([]));
  }, []);
  return (
    <div>
      <PageHeader title="Geo Management" desc="Cities, service areas, work zone boundaries" />
      <DataTable columns={[
        { key: 'id', label: 'Area ID' },
        { key: 'name', label: 'Name' },
        { key: 'city', label: 'City' },
        { key: 'demand_label', label: 'Demand' },
        { key: 'trips_per_week', label: 'Trips/wk' },
      ]} rows={areas} />
    </div>
  );
}

export function SurgePage() {
  const [cfg, setCfg] = useState<Record<string, unknown>>({ enabled: false, multiplier: 1, areas: [] });
  useEffect(() => { api<{ config: Record<string, unknown> }>('/admin/surge-config').then((x) => setCfg(x.config)); }, []);
  const save = async () => {
    await api('/admin/surge-config', { method: 'POST', body: JSON.stringify(cfg) });
    alert('Surge config saved');
  };
  return (
    <div>
      <PageHeader title="Surge Pricing" desc="Live demand/supply multipliers" actions={<button type="button" className="btn-primary" onClick={save}>Save</button>} />
      <div className="card space-y-4 max-w-lg">
        <label className="flex items-center gap-3"><input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Enable surge pricing</label>
        <div>
          <label className="text-xs text-slate-400">Multiplier</label>
          <input className="input" type="number" min={1} max={5} step={0.1} value={Number(cfg.multiplier ?? 1)} onChange={(e) => setCfg({ ...cfg, multiplier: Number(e.target.value) })} />
        </div>
      </div>
    </div>
  );
}

export function VehiclesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState('pending');
  const load = () => api<{ registrations: Record<string, unknown>[] }>(`/admin/vehicle-registrations?status=${filter}`).then((x) => setRows(x.registrations ?? []));
  useEffect(() => { load(); }, [filter]);
  const verify = async (id: string, approved: boolean) => {
    await api(`/admin/vehicle-registrations/${id}/verify?approved=${approved}`, { method: 'PUT' });
    load();
  };
  return (
    <div>
      <PageHeader title="Vehicle Management" desc="Approve or suspend vehicle registrations" actions={
        <select className="input max-w-[160px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      } />
      <DataTable columns={[
        { key: 'id', label: 'ID', render: (r) => String(r.id).slice(0, 10) },
        { key: 'driver_id', label: 'Driver' },
        { key: 'plate_number', label: 'Plate' },
        { key: 'vehicle_model', label: 'Model' },
        { key: 'status', label: 'Status' },
        {
          key: 'actions', label: 'Actions', render: (r) => r.status === 'pending' ? (
            <div className="flex gap-2">
              <button type="button" className="text-xs font-bold text-emerald-400" onClick={() => verify(String(r.id), true)}>Approve</button>
              <button type="button" className="text-xs font-bold text-red-400" onClick={() => verify(String(r.id), false)}>Reject</button>
            </div>
          ) : '—',
        },
      ]} rows={rows} />
    </div>
  );
}

export function ContentPage() {
  const [content, setContent] = useState<Record<string, string>>({});
  useEffect(() => { api<{ content: Record<string, string> }>('/admin/content-config').then((x) => setContent(x.content)); }, []);
  const save = async () => {
    await api('/admin/content-config', { method: 'POST', body: JSON.stringify(content) });
    alert('Content saved');
  };
  return (
    <div>
      <PageHeader title="Content CMS" desc="Edit in-app copy without deploy" actions={<button type="button" className="btn-primary" onClick={save}>Save</button>} />
      <div className="card space-y-3 max-w-2xl">
        {['terms_url', 'privacy_url', 'support_url', 'onboarding_headline', 'safety_tips'].map((k) => (
          <div key={k}>
            <label className="mb-1 block text-xs uppercase text-slate-400">{k.replace(/_/g, ' ')}</label>
            {k === 'safety_tips' ? (
              <textarea className="input min-h-[100px]" value={content[k] ?? ''} onChange={(e) => setContent({ ...content, [k]: e.target.value })} />
            ) : (
              <input className="input" value={content[k] ?? ''} onChange={(e) => setContent({ ...content, [k]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReleasesPage() {
  const [cfg, setCfg] = useState<Record<string, unknown>>({});
  useEffect(() => { api<{ config: Record<string, unknown> }>('/admin/release-config').then((x) => setCfg(x.config)); }, []);
  const save = async () => {
    await api('/admin/release-config', { method: 'POST', body: JSON.stringify(cfg) });
    alert('Release config saved');
  };
  return (
    <div>
      <PageHeader title="Release Management" desc="Android/iOS version gates" actions={<button type="button" className="btn-primary" onClick={save}>Save</button>} />
      <div className="card grid gap-3 sm:grid-cols-2 max-w-2xl">
        {['android_version', 'ios_version', 'android_min_version', 'ios_min_version'].map((k) => (
          <div key={k}>
            <label className="mb-1 block text-xs uppercase text-slate-400">{k.replace(/_/g, ' ')}</label>
            <input className="input" value={String(cfg[k] ?? '')} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
          </div>
        ))}
        <label className="flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" checked={!!cfg.force_update} onChange={(e) => setCfg({ ...cfg, force_update: e.target.checked })} />
          Force update required
        </label>
      </div>
    </div>
  );
}

export function SystemAuditPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api<Record<string, unknown>>('/admin/system-audit').then(setData); }, []);
  if (!data) return <div className="card">Loading…</div>;
  return (
    <div>
      <PageHeader title="System Audit" desc="API errors, notification failures, failed requests" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <KpiCard label="Notification Failures (7d)" value={data.notification_failures_7d as number} tone="red" />
        <KpiCard label="Failed Trip Requests (7d)" value={data.failed_trip_requests_7d as number} tone="amber" />
      </div>
      <DataTable columns={[
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Time' },
      ]} rows={(data.recent_notification_errors as Record<string, unknown>[]) ?? []} />
    </div>
  );
}
