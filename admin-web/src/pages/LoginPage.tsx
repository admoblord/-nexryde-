import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await login(email.trim(), password);
      nav('/');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-nx-bg p-4">
      <div className="w-full max-w-md card">
        <div className="mb-8 text-center">
          <h1 className="bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-3xl font-black text-transparent">NEXRYDE</h1>
          <p className="mt-2 text-sm text-slate-400">Operations Center — secure admin login</p>
        </div>
        {err ? <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div> : null}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
