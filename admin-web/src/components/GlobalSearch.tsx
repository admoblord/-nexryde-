import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '@/api';

type Result = { type: string; id: string; label: string; sub?: string; path: string };

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api<{ results: Result[] }>(`/admin/search?q=${encodeURIComponent(q.trim())}`)
        .then((d) => setResults(d.results ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (r: Result) => {
    setOpen(false);
    setQ('');
    nav(r.path);
  };

  return (
    <div ref={ref} className="relative hidden flex-1 max-w-md md:block">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="input py-2 pl-9 text-sm"
          placeholder="Search driver, rider, trip, phone, plate…"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        />
      </div>
      {open && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-nx-surface shadow-xl">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left hover:bg-white/5"
              onClick={() => pick(r)}
            >
              <div>
                <p className="text-sm font-medium text-white">{r.label}</p>
                <p className="text-xs text-slate-400">{r.type} · {r.sub || r.id}</p>
              </div>
              <span className="badge-warn text-[10px] uppercase">{r.type}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
