import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/api';
import { DataTable, KpiCard } from '@/components/ui';
import { Timeline } from '@/components/Timeline';

export function TripDetailsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!tripId) return;
    api<Record<string, unknown>>(`/admin/trips/${tripId}/operations-detail`).then(setData).catch(() => setData(null));
  }, [tripId]);

  if (!data) return <div className="card text-slate-400">Loading trip details…</div>;

  const trip = data.trip as Record<string, unknown>;
  const fare = data.fare_breakdown as Record<string, unknown>;
  const rider = data.rider as Record<string, unknown>;
  const driver = data.driver as Record<string, unknown>;

  return (
    <div>
      <Link to="/trips" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to trips
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-black">Trip {String(trip.id).slice(0, 12)}</h1>
        <p className="text-sm text-slate-400">Status: {String(trip.status)}</p>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <KpiCard label="Fare ₦" value={Number(fare.fare ?? 0).toLocaleString()} tone="green" />
        <KpiCard label="Distance km" value={fare.distance_km as number} />
        <KpiCard label="Duration min" value={fare.duration_min as number} />
        <KpiCard label="Payment" value={String(fare.payment_method ?? '—')} />
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-bold">Pickup</h3>
          <p className="text-sm text-slate-300">{String((trip.pickup_location as Record<string, unknown> | undefined)?.address ?? JSON.stringify(trip.pickup_location ?? {}))}</p>
        </div>
        <div className="card">
          <h3 className="mb-3 font-bold">Destination</h3>
          <p className="text-sm text-slate-300">{String((trip.dropoff_location as Record<string, unknown> | undefined)?.address ?? JSON.stringify(trip.dropoff_location ?? {}))}</p>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 font-bold">Rider</h3>
          {rider ? <Link to={`/riders/${rider.id}`} className="text-emerald-400">{String(rider.name)} · {String(rider.phone)}</Link> : '—'}
        </div>
        <div className="card">
          <h3 className="mb-2 font-bold">Driver</h3>
          {driver ? <Link to={`/drivers/${driver.id}`} className="text-emerald-400">{String(driver.name)} · {String(driver.phone)}</Link> : 'Unassigned'}
        </div>
      </div>
      <h3 className="mb-3 font-bold">Dispatch & Trip Timeline</h3>
      <Timeline events={(data.timeline as { label: string; timestamp?: unknown }[]) ?? []} />
      <h3 className="mb-3 mt-6 font-bold">GPS History ({((data.gps_history as unknown[]) ?? []).length} points)</h3>
      <DataTable columns={[
        { key: 'speed', label: 'Speed' }, { key: 'lat', label: 'Lat' }, { key: 'lng', label: 'Lng' }, { key: 'timestamp', label: 'Time' },
      ]} rows={(data.gps_history as Record<string, unknown>[]) ?? []} empty="No GPS pings stored" />
      <h3 className="mb-3 mt-6 font-bold">Transactions</h3>
      <DataTable columns={[
        { key: 'type', label: 'Type' }, { key: 'amount', label: '₦' }, { key: 'status', label: 'Status' },
      ]} rows={(data.transactions as Record<string, unknown>[]) ?? []} />
    </div>
  );
}
