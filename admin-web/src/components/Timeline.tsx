export function Timeline({ events }: { events: { type?: string; label: string; timestamp?: unknown; actor?: string }[] }) {
  if (!events.length) {
    return <div className="card text-sm text-slate-400">No activity recorded yet.</div>;
  }
  return (
    <div className="card space-y-0 p-0">
      {events.map((ev, i) => (
        <div key={i} className="flex gap-4 border-b border-white/5 px-5 py-4 last:border-0">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">{ev.label}</p>
            <p className="text-xs text-slate-400">
              {ev.timestamp ? String(ev.timestamp) : '—'}
              {ev.actor ? ` · ${ev.actor}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
