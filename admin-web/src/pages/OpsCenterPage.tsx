import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api';
import { DataTable, KpiCard, PageHeader, StatusDot } from '@/components/ui';
import { Timeline } from '@/components/Timeline';

type OpsPayload = Record<string, unknown>;
type DispatchPayload = {
  counts?: Record<string, number>;
  pending_trips?: Record<string, unknown>[];
  recent_offers?: Record<string, unknown>[];
};

export function OpsCenterPage() {
  const [data, setData] = useState<OpsPayload | null>(null);
  const [dispatch, setDispatch] = useState<DispatchPayload | null>(null);

  useEffect(() => {
    const load = () => {
      Promise.all([
        api<OpsPayload>('/admin/ops-center'),
        api<DispatchPayload>('/admin/dispatch/monitor'),
      ]).then(([ops, mon]) => { setData(ops); setDispatch(mon); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div className="card">Loading operations center…</div>;

  const drivers = data.drivers as Record<string, number>;
  const trips = data.trips as Record<string, number>;
  const ops = data.ops as Record<string, number>;
  const counts = dispatch?.counts ?? {};
  const services = (data.services as { name: string; status: string }[]) ?? [];
  const alerts = (data.alerts_red as { name: string; status: string }[]) ?? [];

  const offerTimeline = (dispatch?.recent_offers ?? []).slice(0, 15).map((o) => ({
    label: `Offer → driver ${String(o.driver_id ?? '').slice(0, 8)} · ${o.status ?? 'sent'}${o.decline_reason || o.skip_reason ? ` (${o.decline_reason || o.skip_reason})` : ''}`,
    timestamp: o.created_at,
  }));

  return (
    <div>
      <PageHeader title="Live Operations Center" desc="Company control room — auto-refreshes every 12s" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Online Drivers" value={drivers.online} tone="green" />
        <KpiCard label="Offline Drivers" value={drivers.offline} />
        <KpiCard label="Waiting Requests" value={counts.ride_requests_waiting ?? ops.pending_ride_requests} tone="amber" />
        <KpiCard label="Broadcast Queue" value={counts.broadcast_queue ?? 0} tone="amber" />
        <KpiCard label="Drivers En Route" value={counts.drivers_en_route ?? ops.drivers_en_route} tone="blue" />
        <KpiCard label="Trips In Progress" value={counts.trips_in_progress ?? ops.trips_in_progress} tone="blue" />
        <KpiCard label="Completed Today" value={counts.completed_today ?? trips.today_completed} tone="green" />
        <KpiCard label="Cancelled Today" value={counts.cancelled_today ?? trips.today_cancelled} tone="red" />
        <KpiCard label="Revenue Today ₦" value={Number(trips.today_revenue_ngn ?? 0).toLocaleString()} tone="green" />
        <KpiCard label="Sub Revenue Today ₦" value={Number(ops.todays_subscription_revenue_ngn ?? 0).toLocaleString()} />
        <KpiCard label="Pending Approvals" value={ops.driver_approval_requests} tone="amber" />
        <KpiCard label="SOS Alerts" value={ops.sos_alerts} tone="red" />
        <KpiCard label="Support Tickets" value={ops.support_tickets} tone="amber" />
        <KpiCard label="Failed Dispatches" value={ops.failed_dispatches_today} tone="red" />
        <KpiCard label="Avg Assignment (sec)" value={ops.avg_driver_acceptance_sec} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-bold">Ride Request Queue</h2>
          <DataTable
            columns={[
              { key: 'id', label: 'Trip', render: (r) => <Link to={`/trips/${r.id}`} className="text-emerald-400">{String(r.id).slice(0, 10)}</Link> },
              { key: 'status', label: 'Status' },
              { key: 'rider_id', label: 'Rider', render: (r) => String(r.rider_id ?? '').slice(0, 8) },
              { key: 'created_at', label: 'Queued' },
            ]}
            rows={dispatch?.pending_trips ?? []}
            empty="No pending ride requests"
          />
        </div>
        <div>
          <h2 className="mb-3 font-bold">Recent Dispatch Activity</h2>
          <Timeline events={offerTimeline} />
        </div>
      </div>

      <div className="mt-6 card">
        <h2 className="mb-4 text-lg font-bold">System Health</h2>
        {alerts.length > 0 ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {alerts.length} service(s) need attention
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <div key={s.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-sm font-medium">{s.name}</span>
              <StatusDot status={s.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
