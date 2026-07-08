import { useEffect, useState } from 'react';
import { api } from '@/api';
import { KpiCard, PageHeader } from '@/components/ui';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const EMPTY_OPS = {
  drivers: { online: 0, offline: 0, total: 0, pending_verification: 0 },
  riders: { total: 0 },
  trips: { active_now: 0, today_total: 0, today_completed: 0, today_cancelled: 0, today_revenue_ngn: 0 },
  ops: {} as Record<string, number>,
};

export function DashboardPage() {
  const [data, setData] = useState(EMPTY_OPS);
  const [analytics, setAnalytics] = useState<{ trips_per_day: { date: string; total: number; completed: number }[] }>({ trips_per_day: [] });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      api<typeof EMPTY_OPS>('/admin/ops-center'),
      api<{ trips_per_day: { date: string; total: number; completed: number }[] }>('/admin/analytics?period=7d'),
    ]).then(([opsRes, anRes]) => {
      const errors: string[] = [];
      if (opsRes.status === 'fulfilled') {
        setData({
          ...EMPTY_OPS,
          ...opsRes.value,
          drivers: { ...EMPTY_OPS.drivers, ...(opsRes.value.drivers ?? {}) },
          riders: { ...EMPTY_OPS.riders, ...(opsRes.value.riders ?? {}) },
          trips: { ...EMPTY_OPS.trips, ...(opsRes.value.trips ?? {}) },
          ops: opsRes.value.ops ?? {},
        });
      } else {
        errors.push(opsRes.reason instanceof Error ? opsRes.reason.message : 'Ops center unavailable');
      }
      if (anRes.status === 'fulfilled') {
        setAnalytics(anRes.value);
      } else {
        errors.push(anRes.reason instanceof Error ? anRes.reason.message : 'Analytics unavailable');
      }
      setErr(errors.join(' · '));
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const o = data.ops ?? {};
  return (
    <div>
      <PageHeader title="Dashboard" desc="Live platform KPIs — refreshes every 30s" />
      {err ? <div className="card mb-4 text-amber-400 text-sm">{err}</div> : null}
      {loading && !data.ops ? <div className="card mb-4 text-slate-400">Loading dashboard…</div> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Online Drivers" value={data.drivers.online} tone="green" />
        <KpiCard label="Offline Drivers" value={data.drivers.offline} />
        <KpiCard label="Active Riders" value={data.riders.total} tone="blue" />
        <KpiCard label="Active Trips" value={data.trips.active_now} tone="amber" />
        <KpiCard label="Trips Today" value={data.trips.today_total} />
        <KpiCard label="Completed Today" value={data.trips.today_completed} tone="green" />
        <KpiCard label="Cancelled Today" value={data.trips.today_cancelled} tone="red" />
        <KpiCard label="Revenue Today ₦" value={Number(data.trips.today_revenue_ngn ?? 0).toLocaleString()} tone="green" />
        <KpiCard label="Monthly Trips" value={o.monthly_trips ?? 0} />
        <KpiCard label="Monthly Sub Revenue ₦" value={Number(o.monthly_subscription_revenue_ngn ?? 0).toLocaleString()} />
        <KpiCard label="Pending Withdrawals" value={o.pending_withdrawals ?? 0} tone="amber" />
        <KpiCard label="Support Tickets" value={o.support_tickets ?? 0} />
        <KpiCard label="SOS Alerts" value={o.sos_alerts ?? 0} tone="red" />
        <KpiCard label="Driver Approvals" value={o.driver_approval_requests ?? 0} tone="amber" />
        <KpiCard label="Avg Rider Wait (min)" value={o.avg_rider_wait_min ?? 0} />
        <KpiCard label="Avg Accept (sec)" value={o.avg_driver_acceptance_sec ?? 0} />
        <KpiCard label="Today's Sub Revenue ₦" value={Number(o.todays_subscription_revenue_ngn ?? 0).toLocaleString()} />
        <KpiCard label="Failed Dispatches" value={o.failed_dispatches_today ?? 0} tone="red" />
        <KpiCard label="Drivers En Route" value={o.drivers_en_route ?? 0} tone="blue" />
        <KpiCard label="Trips In Progress" value={o.trips_in_progress ?? 0} tone="amber" />
        <KpiCard label="Pending Ride Requests" value={o.pending_ride_requests ?? 0} tone="amber" />
      </div>
      <div className="mt-6 card">
        <h2 className="mb-4 text-lg font-bold">Trips per day (7d)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.trips_per_day ?? []}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d084" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#00d084" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0b1e35', border: '1px solid #ffffff20' }} />
              <Area type="monotone" dataKey="total" stroke="#00d084" fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
