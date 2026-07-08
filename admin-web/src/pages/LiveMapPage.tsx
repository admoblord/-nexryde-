import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api';
import { PageHeader } from '@/components/ui';

type Loc = { lat?: number; lng?: number; latitude?: number; longitude?: number };
type Driver = { user_id?: string; name?: string; is_online?: boolean; live_state?: string; current_location?: Loc };
type Trip = { id?: string; status?: string; pickup_location?: Loc; dropoff_location?: Loc; driver_id?: string; rider_id?: string };

const BOUNDS = { n: 6.75, s: 6.35, w: 3.15, e: 3.65 };

function readLoc(loc?: Loc): { lat: number; lng: number } | null {
  if (!loc) return null;
  const lat = loc.lat ?? loc.latitude;
  const lng = loc.lng ?? loc.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

function toXY(lat: number, lng: number, w: number, h: number) {
  const x = ((lng - BOUNDS.w) / (BOUNDS.e - BOUNDS.w)) * w;
  const y = ((BOUNDS.n - lat) / (BOUNDS.n - BOUNDS.s)) * h;
  return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
}

export function LiveMapPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      api<{ drivers: Driver[]; trips: Trip[] }>('/admin/live-map-data').then((d) => {
        setDrivers(d.drivers ?? []);
        setTrips(d.trips ?? []);
      }).catch(() => {});
    };
    load();
    const timer = setInterval(load, 12000);
    return () => clearInterval(timer);
  }, []);

  const online = drivers.filter((d) => d.is_online);
  const markers = useMemo(() => {
    const items: { id: string; label: string; kind: 'driver' | 'trip' | 'dest'; lat: number; lng: number; meta: string; link?: string }[] = [];
    for (const d of online) {
      const loc = readLoc(d.current_location);
      if (!loc) continue;
      items.push({
        id: `d-${d.user_id}`,
        label: d.name || 'Driver',
        kind: 'driver',
        lat: loc.lat,
        lng: loc.lng,
        meta: d.is_online ? 'online' : 'offline',
        link: d.user_id ? `/drivers/${d.user_id}` : undefined,
      });
    }
    for (const t of trips) {
      const pickup = readLoc(t.pickup_location);
      const dest = readLoc(t.dropoff_location);
      if (pickup) {
        items.push({
          id: `t-${t.id}`,
          label: `Trip ${String(t.id).slice(0, 8)}`,
          kind: 'trip',
          lat: pickup.lat,
          lng: pickup.lng,
          meta: `${t.status ?? 'active'} · pickup`,
          link: t.id ? `/trips/${t.id}` : undefined,
        });
      }
      if (dest) {
        items.push({
          id: `td-${t.id}`,
          label: `Dest ${String(t.id).slice(0, 8)}`,
          kind: 'dest',
          lat: dest.lat,
          lng: dest.lng,
          meta: 'destination',
          link: t.id ? `/trips/${t.id}` : undefined,
        });
      }
    }
    return items;
  }, [online, trips]);

  const detail = markers.find((m) => m.id === selected);

  return (
    <div>
      <PageHeader
        title="Live Operations Map"
        desc="Online drivers, active trips, pickup points — Lagos metro view"
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="card py-3"><p className="text-xs text-slate-400">Online drivers</p><p className="text-2xl font-black text-emerald-400">{online.length}</p></div>
        <div className="card py-3"><p className="text-xs text-slate-400">Active trips</p><p className="text-2xl font-black text-sky-400">{trips.length}</p></div>
        <div className="card py-3"><p className="text-xs text-slate-400">Map markers</p><p className="text-2xl font-black">{markers.length}</p></div>
        <div className="card py-3"><p className="text-xs text-slate-400">Refresh</p><p className="text-sm text-slate-300">Every 12s</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card relative h-[min(70vh,640px)] overflow-hidden p-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-40"
            style={{ backgroundImage: 'url(https://tile.openstreetmap.org/10/511/511.png)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-nx-bg/20 to-nx-bg/60" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="none">
            {markers.map((m) => {
              const { x, y } = toXY(m.lat, m.lng, 1000, 600);
              const color = m.kind === 'driver' ? '#00d084' : m.kind === 'dest' ? '#f59e0b' : '#0ea5e9';
              return (
                <g key={m.id} onClick={() => setSelected(m.id)} style={{ cursor: 'pointer' }}>
                  <circle cx={x} cy={y} r={selected === m.id ? 14 : 9} fill={color} fillOpacity={0.35} />
                  <circle cx={x} cy={y} r={selected === m.id ? 6 : 4} fill={color} />
                </g>
              );
            })}
          </svg>
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-2 text-xs text-slate-300">
            <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Driver</span>
            <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Pickup</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Destination</span>
          </div>
        </div>
        <div className="card max-h-[min(70vh,640px)] overflow-y-auto">
          <h3 className="mb-3 font-bold">Entities</h3>
          {markers.length === 0 ? (
            <p className="text-sm text-slate-400">No live GPS data yet. Drivers appear when online with location updates.</p>
          ) : (
            <ul className="space-y-2">
              {markers.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${selected === m.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 hover:bg-white/5'}`}
                  >
                    <div className="font-semibold">{m.label}</div>
                    <div className="text-xs text-slate-400">{m.kind} · {m.meta}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {detail ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
              <p className="font-bold">{detail.label}</p>
              <p className="text-slate-400">Type: {detail.kind}</p>
              <p className="text-slate-400">Status: {detail.meta}</p>
              <p className="text-slate-400">Lat: {detail.lat.toFixed(5)}</p>
              <p className="text-slate-400">Lng: {detail.lng.toFixed(5)}</p>
              {detail.link ? <Link to={detail.link} className="mt-2 inline-block text-sm text-emerald-400">Open profile →</Link> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
