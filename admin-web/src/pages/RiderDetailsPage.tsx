import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/api';
import { DataTable, KpiCard } from '@/components/ui';
import { Timeline } from '@/components/Timeline';

const TABS = ['Profile', 'Verification', 'Trips', 'Payments', 'Favourites', 'Complaints', 'Ratings', 'Timeline', 'Notes'] as const;
type Tab = (typeof TABS)[number];

function fmt(v: unknown) {
  if (v == null || v === '') return '—';
  return String(v);
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{fmt(value)}</p>
    </div>
  );
}

export function RiderDetailsPage() {
  const { riderId } = useParams<{ riderId: string }>();
  const [tab, setTab] = useState<Tab>('Profile');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealedNin, setRevealedNin] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!riderId) return;
    setLoading(true);
    setErr('');
    api<Record<string, unknown>>(`/admin/riders/${riderId}/operations-profile`)
      .then((d) => { setData(d as Record<string, unknown>); setLoading(false); })
      .catch((e) => { setData(null); setErr(e instanceof Error ? e.message : 'Failed to load rider'); setLoading(false); });
  }, [riderId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="card text-slate-400">Loading rider profile…</div>;
  if (err || !data) return <div className="card text-red-400">{err || 'Rider not found'}</div>;

  const profile = data.profile as Record<string, unknown>;
  const verification = data.verification as Record<string, unknown>;
  const nin = (verification?.nin as Record<string, unknown>) ?? profile;
  const trips = data.trips as Record<string, unknown>;

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      load();
    } finally { setBusy(false); }
  };

  const revealNin = async () => {
    if (!riderId) return;
    const reason = prompt('Reason for revealing full NIN (min 8 chars, audited):');
    if (!reason || reason.trim().length < 8) {
      alert('A reason of at least 8 characters is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ nin: string }>(`/admin/riders/${riderId}/reveal-nin`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setRevealedNin(res.nin);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not reveal NIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/riders" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to riders
      </Link>
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">{fmt(profile.name)}</h1>
          <p className="text-sm text-slate-400">{fmt(profile.phone)} · {fmt(profile.id)}</p>
          {nin.nin_masked ? <p className="mt-1 text-xs font-mono text-emerald-400">NIN {String(nin.nin_masked)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs text-amber-400" disabled={busy} onClick={() => act(`/admin/users/${riderId}/block?block=true`)}>Suspend</button>
          <button type="button" className="btn-ghost text-xs text-red-400" disabled={busy} onClick={() => act(`/admin/users/${riderId}/block?block=true`)}>Ban</button>
          {nin.has_nin ? (
            <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={revealNin}>Reveal NIN</button>
          ) : null}
        </div>
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`shrink-0 rounded-t-xl px-4 py-2.5 text-sm font-semibold ${tab === t ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Profile' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={profile.name} />
          <Field label="Phone" value={profile.phone} />
          <Field label="Email" value={profile.email} />
          <Field label="Status" value={profile.account_status} />
          <Field label="NIN (masked)" value={nin.nin_masked || (nin.has_nin ? 'On file' : '—')} />
          <Field label="NIN Verified" value={nin.nin_verified ? 'Yes' : 'No'} />
          <Field label="Total Trips" value={profile.total_trips} />
          <Field label="Total Spend ₦" value={profile.total_spend_ngn} />
          <Field label="Joined" value={profile.created_at} />
        </div>
      )}
      {tab === 'Verification' && (
        <div className="space-y-6">
          <div className="card border-emerald-500/20 bg-emerald-500/5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-emerald-400">National ID (NIN)</h3>
              {nin.has_nin ? (
                <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={revealNin}>
                  Reveal full NIN
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="NIN Status" value={nin.has_nin ? 'On file' : 'Missing'} />
              <Field label="NIN (masked)" value={nin.nin_masked || '—'} />
              <Field label="NIN Verified" value={nin.nin_verified ? 'Yes' : 'No'} />
              <Field label="Registry Verified" value={nin.nin_registry_verified ? 'Yes' : 'No'} />
              <Field label="Verify Method" value={nin.nin_verify_method || '—'} />
              <Field label="Last Checked" value={nin.nin_verify_checked_at || '—'} />
              <Field label="Face Verified" value={verification.face_verified ? 'Yes' : 'No'} />
              <Field label="Face Liveness Score" value={verification.face_liveness_score ?? '—'} />
            </div>
            {revealedNin ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Full NIN (audited reveal)</p>
                <p className="mt-1 font-mono text-lg font-bold text-white">{revealedNin}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {tab === 'Trips' && (
        <DataTable columns={[
          { key: 'id', label: 'Trip', render: (r) => String(r.id).slice(0, 10) },
          { key: 'status', label: 'Status' }, { key: 'fare', label: 'Fare ₦' }, { key: 'created_at', label: 'Date' },
        ]} rows={(trips.recent as Record<string, unknown>[]) ?? []} />
      )}
      {tab === 'Payments' && (
        <DataTable columns={[
          { key: 'source', label: 'Source' }, { key: 'amount', label: '₦' }, { key: 'created_at', label: 'Date' },
        ]} rows={(data.payments as Record<string, unknown>[]) ?? []} />
      )}
      {tab === 'Favourites' && (
        <div className="card text-sm text-slate-300">
          {((data.favourite_drivers as unknown[]) ?? []).length
            ? JSON.stringify(data.favourite_drivers)
            : 'No favourite drivers saved'}
        </div>
      )}
      {tab === 'Complaints' && (
        <DataTable columns={[
          { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }, { key: 'created_at', label: 'Date' },
        ]} rows={(data.complaints as Record<string, unknown>[]) ?? []} />
      )}
      {tab === 'Ratings' && <Field label="Average rating given" value={(data.ratings as Record<string, unknown>)?.average_given} />}
      {tab === 'Timeline' && <Timeline events={(data.timeline as { label: string; timestamp?: unknown }[]) ?? []} />}
      {tab === 'Notes' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note…" />
            <button type="button" className="btn-primary" disabled={!note.trim() || busy} onClick={async () => {
              await act(`/admin/riders/${riderId}/notes`, { note });
              setNote('');
            }}>Save</button>
          </div>
          <DataTable columns={[
            { key: 'note', label: 'Note' }, { key: 'created_by', label: 'Admin' }, { key: 'created_at', label: 'Date' },
          ]} rows={((data.notes as Record<string, unknown>)?.admin_notes as Record<string, unknown>[]) ?? []} />
        </div>
      )}
    </div>
  );
}
