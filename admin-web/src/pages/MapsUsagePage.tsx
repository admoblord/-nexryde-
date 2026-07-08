import { useEffect, useState } from 'react';
import { api } from '@/api';
import { KpiCard, PageHeader } from '@/components/ui';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function MapsUsagePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    api<Record<string, unknown>>(`/admin/maps-usage?days=${days}`).then(setData).catch(() => setData(null));
  }, [days]);

  if (!data) return <div className="card text-slate-400">Loading Google Maps usage…</div>;

  const apis = (data.apis as Record<string, number>) ?? {};
  const budgetAlert = Boolean(data.budget_alert);

  return (
    <div>
      <PageHeader
        title="Google Maps API Usage"
        desc="Directions, Routes, Places, Geocoding — cost tracking & budget alerts"
        actions={
          <select className="input max-w-[140px]" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        }
      />
      {budgetAlert ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Usage exceeds 80% of monthly budget — review cache hit rate and route optimization.
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total API Calls" value={Number(data.total_calls ?? 0).toLocaleString()} />
        <KpiCard label="Real Google Calls" value={Number(data.real_google_calls ?? 0).toLocaleString()} tone="amber" />
        <KpiCard label="Cache Hit Rate" value={`${data.cache_hit_rate_pct ?? 0}%`} tone="green" />
        <KpiCard label="Est. Daily Cost ₦" value={Number(data.estimated_daily_cost_ngn ?? 0).toLocaleString()} />
        <KpiCard label="Est. Monthly Cost ₦" value={Number(data.estimated_monthly_cost_ngn ?? 0).toLocaleString()} tone="amber" />
        <KpiCard label="Budget ₦" value={Number(data.budget_ngn ?? 0).toLocaleString()} />
        <KpiCard label="Remaining Budget ₦" value={Number(data.remaining_budget_ngn ?? 0).toLocaleString()} tone="green" />
        <KpiCard label="Cached Hits" value={Number(data.cached_hits ?? 0).toLocaleString()} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Directions API" value={apis.directions ?? 0} />
        <KpiCard label="Routes API" value={apis.routes ?? 0} />
        <KpiCard label="Places API" value={apis.places ?? 0} />
        <KpiCard label="Geocoding API" value={apis.geocoding ?? 0} />
        <KpiCard label="Distance Matrix" value={apis.distance_matrix ?? 0} />
      </div>
      <div className="mt-6 card">
        <h2 className="mb-4 text-lg font-bold">Daily breakdown</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={(data.daily_breakdown as Record<string, unknown>[]) ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#0b1e35', border: '1px solid #ffffff20' }} />
              <Area type="monotone" dataKey="real_calls" stroke="#00d084" fill="#00d08433" name="Real calls" />
              <Area type="monotone" dataKey="cached_hits" stroke="#0ea5e9" fill="#0ea5e933" name="Cache hits" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
