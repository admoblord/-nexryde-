import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, ZoomIn } from 'lucide-react';
import { api } from '@/api';
import { DataTable, KpiCard } from '@/components/ui';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type DriverProfile = Record<string, unknown>;

import { Timeline } from '@/components/Timeline';

const TABS = [
  'Profile', 'Verification', 'Vehicle', 'Subscription', 'Wallet',
  'Trips', 'Ratings', 'Analytics', 'Work Zone', 'Activity Timeline', 'Admin Notes',
] as const;

type Tab = (typeof TABS)[number];

function fmt(v: unknown) {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function statusBadge(status: string) {
  const s = (status || 'unknown').toLowerCase();
  const cls = s.includes('active') || s.includes('approved') || s.includes('online')
    ? 'badge-ok' : s.includes('suspend') || s.includes('pending') ? 'badge-warn' : s.includes('ban') || s.includes('reject') ? 'badge-err' : 'badge-warn';
  return <span className={cls}>{status}</span>;
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{fmt(value)}</p>
    </div>
  );
}

export function DriverDetailsPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const [tab, setTab] = useState<Tab>('Profile');
  const [data, setData] = useState<DriverProfile | null>(null);
  const [err, setErr] = useState('');
  const [docModal, setDocModal] = useState<{
    type: string;
    label: string;
    url: string;
    mime: string;
    error?: string;
  } | null>(null);

  const revokeDocUrl = (url?: string | null) => {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  };

  const closeDocModal = () => {
    setDocModal((prev) => {
      revokeDocUrl(prev?.url);
      return null;
    });
  };

  const buildDocObjectUrl = (base64: string, contentType?: string | null): { url: string; mime: string } => {
    const mimeRaw = (contentType || 'image/jpeg').split(';')[0].trim().toLowerCase();
    const mime = mimeRaw === 'image/jpg' ? 'image/jpeg' : mimeRaw || 'image/jpeg';
    const cleaned = base64.replace(/\s+/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    // Sniff if declared MIME is wrong/missing — broken data: URLs show only alt text.
    let resolved = mime;
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) resolved = 'image/jpeg';
    else if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) resolved = 'image/png';
    else if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[8] === 0x57) resolved = 'image/webp';
    else if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50) resolved = 'application/pdf';
    const blob = new Blob([bytes], { type: resolved });
    return { url: URL.createObjectURL(blob), mime: resolved };
  };
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealedNin, setRevealedNin] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!driverId) return;
    api<DriverProfile>(`/admin/drivers/${driverId}/operations-profile`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [driverId]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body?: unknown, msg?: string) => {
    if (!driverId) return;
    setBusy(true);
    try {
      const actionPath = path.startsWith('/admin/') ? path : `/admin/drivers/${driverId}${path}`;
      await api(actionPath, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (msg) alert(msg);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const viewDoc = async (docType: string, label: string) => {
    if (!driverId) return;
    try {
      const res = await api<{ data?: string; content_type?: string }>(`/admin/drivers/${driverId}/document/${docType}`);
      if (!res.data) {
        alert('No document image on file. If this is NIN, use Reveal NIN instead.');
        return;
      }
      const { url, mime } = buildDocObjectUrl(res.data, res.content_type);
      setDocModal((prev) => {
        revokeDocUrl(prev?.url);
        return { type: docType, label, url, mime };
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to load document');
    }
  };

  const downloadDoc = async (docType: string, label: string) => {
    if (!driverId) return;
    try {
      const res = await api<{ data?: string; content_type?: string; filename?: string }>(`/admin/drivers/${driverId}/document/${docType}`);
      if (!res.data) {
        alert('No document binary available to download.');
        return;
      }
      const { url, mime } = buildDocObjectUrl(res.data, res.content_type);
      const a = document.createElement('a');
      a.href = url;
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('pdf') ? 'pdf' : 'jpg';
      a.download = res.filename || `${label}.${ext}`;
      a.click();
      setTimeout(() => revokeDocUrl(url), 2_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to download document');
    }
  };

  const reviewDoc = async (docType: string, action: 'approve' | 'reject' | 'request_reupload') => {
    const reason = action === 'approve' ? '' : (prompt('Reason (optional):') || '');
    await act(`/documents/${docType}/review`, { action, reason }, 'Document updated');
  };

  const revealNin = async () => {
    if (!driverId) return;
    const reason = prompt('Reason for revealing full NIN (required for audit):');
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ nin: string }>(`/admin/drivers/${driverId}/reveal-nin`, {
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

  if (err) return <div className="card text-red-400">{err}</div>;
  if (!data) return <div className="card text-slate-400">Loading driver profile…</div>;

  const profile = data.profile as Record<string, unknown>;
  const verification = data.verification as Record<string, unknown>;
  const vehicle = data.vehicle as Record<string, unknown>;
  const subscription = data.subscription as Record<string, unknown>;
  const wallet = data.wallet as Record<string, unknown>;
  const trips = data.trips as Record<string, unknown>;
  const analytics = data.analytics as Record<string, unknown>;
  const live = data.live as Record<string, unknown>;
  const notes = data.notes as Record<string, unknown>;
  const ratings = data.ratings as Record<string, unknown>;
  const workZone = data.work_zone as Record<string, unknown>;
  const activityTimeline = (data.activity_timeline as Record<string, unknown>[]) ?? [];
  const documents = (verification.documents as Record<string, unknown>[]) ?? [];
  const nin = (verification.nin as Record<string, unknown>) ?? {};

  return (
    <div>
      <div className="mb-4">
        <Link to="/drivers" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to drivers
        </Link>
      </div>

      <div className="card mb-6 flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-emerald-500/20 text-2xl font-black text-emerald-400">
          {profile.profile_image ? (
            <img src={String(profile.profile_image)} alt="" className="h-full w-full object-cover" />
          ) : (String(profile.name || 'D')[0])}
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-black text-white">{fmt(profile.name)}</h1>
          <p className="text-sm text-slate-400">{fmt(profile.phone)} · {fmt(profile.id)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {statusBadge(String(profile.account_status))}
            {profile.is_online ? <span className="badge-ok">Online</span> : <span className="badge-warn">Offline</span>}
            {statusBadge(String(profile.verification_status))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-xs" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await api(`/admin/drivers/${driverId}/force-approve`, { method: 'POST' });
              alert('Driver approved');
              load();
            } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
            finally { setBusy(false); }
          }}>Approve</button>
          <button type="button" className="btn-ghost text-xs text-amber-400" disabled={busy} onClick={() => act('/suspend', { days: 7, reason: 'admin_suspend' }, 'Driver suspended')}>Suspend</button>
          <button type="button" className="btn-ghost text-xs text-red-400" disabled={busy} onClick={() => act(`/admin/users/${driverId}/block?block=true`, undefined, 'Driver banned')}>Ban</button>
          <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => {
            const amount = Number(prompt('Credit amount ₦:') || 0);
            if (amount > 0) act('/wallet-adjust', { amount, direction: 'credit', reason: 'admin_credit' });
          }}>Credit Wallet</button>
          <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={async () => {
            const reason = prompt('Reason for free month:') || 'admin_grant';
            setBusy(true);
            try {
              await api('/admin/rewards/grant-free-month', { method: 'POST', body: JSON.stringify({ driver_id: driverId, reason }) });
              alert('Free month granted');
              load();
            } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
            finally { setBusy(false); }
          }}>Grant Free Month</button>
          <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => {
            const title = prompt('Notification title:') || 'NexRyde';
            const body = prompt('Message:') || '';
            if (body) act('/notify', { title, body }, 'Notification sent');
          }}>Notify</button>
          <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => {
            const amount = Number(prompt('Debit amount ₦:') || 0);
            if (amount > 0) act('/wallet-adjust', { amount, direction: 'debit', reason: 'admin_debit' });
          }}>Debit Wallet</button>
          <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => {
            window.open(`/api/admin/drivers/${driverId}/operations-profile`, '_blank');
          }}>Export JSON</button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${tab === t ? 'bg-emerald-500/15 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-white'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Profile' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full Name" value={profile.name} />
          <Field label="Driver ID" value={profile.id} />
          <Field label="Phone" value={profile.phone} />
          <Field label="Email" value={profile.email} />
          <Field label="Gender" value={profile.gender} />
          <Field label="Date of Birth" value={profile.date_of_birth} />
          <Field label="Address" value={profile.address} />
          <Field label="City" value={profile.city} />
          <Field label="Registration Date" value={profile.created_at} />
          <Field label="Account Status" value={profile.account_status} />
          <Field label="Online Status" value={profile.is_online ? 'Online' : 'Offline'} />
          <Field label="Last Active" value={profile.last_active} />
          <Field label="Rating" value={profile.rating} />
          <Field label="NIN (masked)" value={nin.nin_masked || (nin.has_nin ? 'On file' : '—')} />
          <Field label="NIN Verified" value={nin.nin_verified ? 'Yes' : 'No'} />
          <Field label="Current Trip" value={profile.active_trip_id} />
          <Field label="Work Zone" value={((profile.work_zone_area_ids as string[]) ?? []).join(', ') || '—'} />
          <Field label="GPS Lat" value={(profile.current_location as Record<string, unknown>)?.lat ?? (profile.current_location as Record<string, unknown>)?.latitude} />
          <Field label="GPS Lng" value={(profile.current_location as Record<string, unknown>)?.lng ?? (profile.current_location as Record<string, unknown>)?.longitude} />
          <Field label="Battery" value={live.battery_level ?? 'N/A'} />
          <Field label="Network" value={live.network_status} />
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
              <Field label="Capture Mode" value={nin.nin_capture_mode || '—'} />
              <Field label="Verify Method" value={nin.nin_verify_method || '—'} />
              <Field label="Last Checked" value={nin.nin_verify_checked_at || '—'} />
            </div>
            {revealedNin ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Full NIN (audited reveal)</p>
                <p className="mt-1 font-mono text-lg font-bold text-white">{revealedNin}</p>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="License" value={(verification.license as Record<string, unknown>)?.license_masked || ((verification.license as Record<string, unknown>)?.has_license_number ? 'On file' : '—')} />
            <Field label="Face Verification" value={(verification.face_verification as Record<string, unknown>)?.status} />
            <Field label="Review Score" value={verification.review_score} />
            <Field label="Background Check" value={verification.background_check} />
          </div>
          <div>
            <h3 className="mb-3 font-bold">Documents</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {documents.map((d) => (
                <div key={String(d.document_type)} className="card flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-semibold">{fmt(d.label)}</p>
                    <p className="text-xs text-slate-400">
                      {fmt(d.admin_status)} · {d.has_data ? (d.capture_mode === 'number_only' ? 'Number on file' : 'Uploaded') : 'Missing'}
                    </p>
                    {d.document_type === 'nin' && nin.nin_masked ? (
                      <p className="text-xs text-emerald-400">NIN: {String(nin.nin_masked)}</p>
                    ) : null}
                    {d.expiry_date ? <p className="text-xs text-amber-400">Expires: {fmt(d.expiry_date)}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {d.document_type === 'nin' && d.capture_mode === 'number_only' ? (
                      <button type="button" className="btn-ghost text-xs" disabled={!nin.has_nin || busy} onClick={revealNin}>Reveal NIN</button>
                    ) : (
                      <>
                        <button type="button" className="btn-ghost text-xs" disabled={!d.has_data} onClick={() => viewDoc(String(d.document_type), String(d.label))}><Eye className="h-3 w-3" /> View</button>
                        <button type="button" className="btn-ghost text-xs" disabled={!d.has_data} onClick={() => downloadDoc(String(d.document_type), String(d.label))}><Download className="h-3 w-3" /> Download</button>
                      </>
                    )}
                    <button type="button" className="text-xs text-emerald-400" onClick={() => reviewDoc(String(d.document_type), 'approve')}>Approve</button>
                    <button type="button" className="text-xs text-red-400" onClick={() => reviewDoc(String(d.document_type), 'reject')}>Reject</button>
                    <button type="button" className="text-xs text-amber-400" onClick={() => reviewDoc(String(d.document_type), 'request_reupload')}>Re-upload</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 font-bold">Approval History</h3>
            <DataTable columns={[
              { key: 'action', label: 'Action' },
              { key: 'actor_id', label: 'By' },
              { key: 'created_at', label: 'When' },
            ]} rows={(verification.audit_history as Record<string, unknown>[]) ?? []} empty="No audit events" />
          </div>
        </div>
      )}

      {tab === 'Vehicle' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Make" value={vehicle.make} />
            <Field label="Model" value={vehicle.model} />
            <Field label="Year" value={vehicle.year} />
            <Field label="Colour" value={vehicle.color} />
            <Field label="Plate Number" value={vehicle.plate} />
            <Field label="Category" value={vehicle.category} />
            <Field label="Seat Capacity" value={vehicle.seat_capacity} />
            <Field label="Insurance Expiry" value={vehicle.insurance_expiry} />
            <Field label="Roadworthiness Expiry" value={vehicle.roadworthiness_expiry} />
            <Field label="Status" value={vehicle.registration_status} />
          </div>
          <div>
            <h3 className="mb-3 font-bold">Vehicle Photos</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {((vehicle.photos as Record<string, unknown>[]) ?? []).map((p) => (
                <div key={String(p.document_type)} className="card">
                  <p className="font-medium">{fmt(p.label)}</p>
                  <button type="button" className="btn-ghost mt-2 text-xs" disabled={!p.has_data} onClick={() => viewDoc(String(p.document_type), String(p.label))}>
                    <ZoomIn className="h-3 w-3" /> View photo
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'Subscription' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Current Plan" value={fmt((subscription.current as Record<string, unknown>)?.plan || (subscription.current as Record<string, unknown>)?.status)} />
            <KpiCard label="Trial Active" value={subscription.trial_active ? 'Yes' : 'No'} tone={subscription.trial_active ? 'amber' : 'default'} />
            <KpiCard label="Trial Trips Left" value={subscription.trial_trips_remaining as number} />
            <KpiCard label="Founding Driver" value={subscription.founding_driver ? 'Yes' : 'No'} tone="green" />
          </div>
          <Field label="Subscription Expiry" value={subscription.expiry} />
          <div>
            <h3 className="mb-2 font-bold">Work Zone Access</h3>
            <p className="text-sm text-slate-300">
              {(subscription.work_zone as Record<string, unknown>)?.active ? 'Active' : 'Inactive'} —{' '}
              {((subscription.work_zone as Record<string, unknown>)?.area_ids as string[] ?? []).join(', ') || 'No zones'}
            </p>
          </div>
          <DataTable columns={[
            { key: 'status', label: 'Status' },
            { key: 'plan', label: 'Plan' },
            { key: 'amount_paid', label: 'Paid ₦' },
            { key: 'start_date', label: 'Start' },
            { key: 'end_date', label: 'End' },
          ]} rows={(subscription.history as Record<string, unknown>[]) ?? []} empty="No subscription history" />
        </div>
      )}

      {tab === 'Wallet' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Balance ₦" value={Number(wallet.balance_ngn ?? 0).toLocaleString()} tone="green" />
            <KpiCard label="Pending Withdrawal ₦" value={Number(wallet.pending_withdrawal_ngn ?? 0).toLocaleString()} tone="amber" />
            <KpiCard label="Transactions" value={(wallet.transactions as unknown[])?.length ?? 0} />
          </div>
          <DataTable columns={[
            { key: 'type', label: 'Type' },
            { key: 'amount', label: 'Amount ₦' },
            { key: 'source', label: 'Source' },
            { key: 'status', label: 'Status' },
            { key: 'created_at', label: 'Date' },
          ]} rows={(wallet.transactions as Record<string, unknown>[]) ?? []} />
        </div>
      )}

      {tab === 'Trips' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <KpiCard label="Completed" value={trips.completed as number} tone="green" />
            <KpiCard label="Cancelled" value={trips.cancelled as number} tone="red" />
            <KpiCard label="Acceptance Rate" value={`${trips.acceptance_rate_pct}%`} />
            <KpiCard label="Cancellation Rate" value={`${trips.cancellation_rate_pct}%`} />
          </div>
          <DataTable columns={[
            { key: 'id', label: 'Trip', render: (r) => String(r.id).slice(0, 10) },
            { key: 'status', label: 'Status' },
            { key: 'fare', label: 'Fare ₦' },
            { key: 'created_at', label: 'Date' },
          ]} rows={(trips.recent as Record<string, unknown>[]) ?? []} />
        </div>
      )}

      {tab === 'Analytics' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Weekly Earnings ₦" value={Number(analytics.weekly_earnings_ngn ?? 0).toLocaleString()} tone="green" />
            <KpiCard label="Monthly Earnings ₦" value={Number(analytics.monthly_earnings_ngn ?? 0).toLocaleString()} tone="green" />
            <KpiCard label="Monthly Trips" value={analytics.monthly_trips as number} />
          </div>
          <div className="card h-64">
            <h3 className="mb-2 font-bold">Daily Earnings (7d)</h3>
            <ResponsiveContainer width="100%" height="90%">
              <AreaChart data={(analytics.daily_earnings as { _id: string; earnings: number }[]) ?? []}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="_id" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="earnings" stroke="#00d084" fill="#00d08433" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'Ratings' && (
        <div className="space-y-4">
          <KpiCard label="Average Rating" value={fmt(ratings.average)} tone="green" />
          <DataTable columns={[
            { key: 'driver_rating', label: 'Rating' },
            { key: 'rider_id', label: 'Rider' },
            { key: 'created_at', label: 'Trip Date' },
          ]} rows={(ratings.recent as Record<string, unknown>[]) ?? []} empty="No ratings yet" />
        </div>
      )}

      {tab === 'Work Zone' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Work Zone Active" value={workZone.active} />
          <Field label="Expires" value={workZone.expires_at} />
          <Field label="Zones" value={((workZone.area_ids as string[]) ?? []).join(', ') || '—'} />
          <Field label="Label" value={workZone.label} />
        </div>
      )}

      {tab === 'Activity Timeline' && (
        <Timeline events={activityTimeline as { label: string; timestamp?: unknown; actor?: string }[]} />
      )}

      {tab === 'Admin Notes' && (
        <div className="space-y-6">
          <div className="card space-y-3">
            <h3 className="font-bold">Add Internal Note</h3>
            <textarea className="input min-h-[100px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Warning, suspension context, ops notes…" />
            <button type="button" className="btn-primary" disabled={!note.trim() || busy} onClick={() => act('/notes', { note }, 'Note saved').then(() => setNote(''))}>Save note</button>
          </div>
          <DataTable columns={[
            { key: 'note', label: 'Note' },
            { key: 'created_by', label: 'Admin' },
            { key: 'created_at', label: 'Date' },
          ]} rows={(notes.admin_notes as Record<string, unknown>[]) ?? []} empty="No admin notes" />
          <h3 className="font-bold">Violations & Suspensions</h3>
          <DataTable columns={[
            { key: 'type', label: 'Type' },
            { key: 'reason', label: 'Reason' },
            { key: 'created_at', label: 'Date' },
          ]} rows={(notes.violations as Record<string, unknown>[]) ?? []} />
          <h3 className="font-bold">Support / Reports</h3>
          <DataTable columns={[
            { key: 'category', label: 'Category' },
            { key: 'status', label: 'Status' },
            { key: 'created_at', label: 'Date' },
          ]} rows={(notes.support_reports as Record<string, unknown>[]) ?? []} />
        </div>
      )}

      {docModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={closeDocModal}>
          <div className="card max-h-[90vh] max-w-4xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-bold">{docModal.label}</h3>
              <div className="flex gap-2">
                <a className="btn-ghost text-xs" href={docModal.url} download={`${docModal.label}.bin`}>
                  Download
                </a>
                <button type="button" className="btn-ghost text-xs" onClick={closeDocModal}>Close</button>
              </div>
            </div>
            {docModal.error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-sm text-red-300">
                {docModal.error}
              </p>
            ) : docModal.mime === 'application/pdf' ? (
              <iframe title={docModal.label} src={docModal.url} className="h-[70vh] w-full rounded-xl bg-white" />
            ) : (
              <img
                src={docModal.url}
                alt=""
                className="max-h-[70vh] w-full bg-black object-contain"
                onError={() => {
                  setDocModal((prev) =>
                    prev
                      ? {
                          ...prev,
                          error:
                            'Could not render this document in the browser. Use Download, or ask the driver to re-upload a JPG/PNG photo.',
                        }
                      : prev,
                  );
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
