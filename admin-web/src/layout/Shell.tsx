import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Moon, Sun, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NAV } from '@/nav';
import { clearToken, getToken } from '@/api';
import { GlobalSearch } from '@/components/GlobalSearch';

export function Shell() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const nav = useNavigate();

  const toggleTheme = () => {
    setDark((d) => !d);
    document.documentElement.classList.toggle('dark');
  };

  const logout = async () => {
    try {
      const token = getToken();
      await fetch('/api/admin/logout', {
        method: 'POST',
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
    } catch { /* */ }
    clearToken();
    nav('/login');
  };

  let lastSection = '';
  return (
    <div className="flex min-h-screen bg-nx-bg">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-white/10 bg-nx-surface transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div>
            <div className="bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-xl font-black text-transparent">NEXRYDE</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Operations Center</div>
          </div>
          <button type="button" className="lg:hidden" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <nav className="h-[calc(100vh-4rem)] overflow-y-auto p-3">
          {NAV.map((item) => {
            const section = item.section ?? '';
            const showHeader = section !== lastSection;
            if (showHeader) lastSection = section;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showHeader ? <p className="mb-1 mt-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">{section}</p> : null}
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `mb-0.5 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:ml-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/10 bg-nx-bg/90 px-4 backdrop-blur lg:px-8">
          <button type="button" className="lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <GlobalSearch />
          <div className="hidden text-sm text-slate-400 sm:block">NEXRYDE Ops · Production</div>
          <button type="button" className="btn-ghost" onClick={toggleTheme} aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" className="btn-ghost text-red-400" onClick={logout}><LogOut className="h-4 w-4" /> Logout</button>
        </header>
        <main className="flex-1 p-4 lg:p-8"><Outlet /></main>
      </div>
      {open ? <button type="button" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu" /> : null}
    </div>
  );
}
