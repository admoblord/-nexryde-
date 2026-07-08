import { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const tones = {
    default: 'from-slate-500/10 to-slate-600/5 border-white/10',
    green: 'from-emerald-500/15 to-teal-600/5 border-emerald-500/20',
    amber: 'from-amber-500/15 to-orange-600/5 border-amber-500/20',
    red: 'from-red-500/15 to-rose-600/5 border-red-500/20',
    blue: 'from-sky-500/15 to-blue-600/5 border-sky-500/20',
  };
  return (
    <div className={`card bg-gradient-to-br ${tones[tone]} min-h-[110px]`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black text-white">{title}</h1>
        {desc ? <p className="mt-1 text-sm text-slate-400">{desc}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  empty = 'No data',
  onRowClick,
}: {
  columns: { key: string; label: string; render?: (row: Record<string, unknown>) => ReactNode }[];
  rows: Record<string, unknown>[];
  empty?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  if (!rows.length) {
    return <div className="card text-center text-slate-400 py-12">{empty}</div>;
  }
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-3 font-semibold">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-white/5 hover:bg-white/[0.03] ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-3 text-slate-200">
                  {c.render ? c.render(row) : String(row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const ok = status === 'ok';
  const degraded = status === 'degraded' || status === 'unknown';
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${ok ? 'text-emerald-400' : degraded ? 'text-amber-400' : 'text-red-400'}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : degraded ? 'bg-amber-400' : 'bg-red-400'}`} />
      {status}
    </span>
  );
}
