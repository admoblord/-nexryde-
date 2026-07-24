import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, verifyAdminMfa } from '@/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    setInfo('');
    try {
      if (mfaRequired) {
        await verifyAdminMfa(email.trim(), code.trim());
        nav('/');
        return;
      }
      const result = await login(email.trim(), password);
      if (result.mfa_required) {
        setMfaRequired(true);
        setInfo(result.message || 'Enter the verification code sent to your email.');
        return;
      }
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
        {info ? <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{info}</div> : null}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              disabled={mfaRequired}
            />
          </div>
          {!mfaRequired ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Verification code</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Please wait…' : mfaRequired ? 'Verify & sign in' : 'Sign in'}
          </button>
          {mfaRequired ? (
            <button
              type="button"
              className="w-full text-sm text-slate-400 underline"
              onClick={() => {
                setMfaRequired(false);
                setCode('');
                setInfo('');
                setErr('');
              }}
            >
              Back to password
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
