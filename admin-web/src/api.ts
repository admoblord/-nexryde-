const TOKEN_KEY = 'nexryde_admin_token';
const ROLE_KEY = 'nexryde_admin_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRole(): string {
  return localStorage.getItem(ROLE_KEY) || 'super_admin';
}

export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}

export function setRole(role: string) {
  localStorage.setItem(ROLE_KEY, role);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: unknown }).detail;
    let message = res.statusText;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
        .join('; ');
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

type LoginResponse = {
  token?: string;
  role?: string;
  mfa_required?: boolean;
  message?: string;
  email?: string;
  success?: boolean;
};

async function postPublicAdmin<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: unknown }).detail;
    throw new Error(typeof detail === 'string' ? detail : res.statusText || 'Request failed');
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await postPublicAdmin<LoginResponse>('/admin/login', { email, password });
  if (data.mfa_required) {
    return data;
  }
  if (!data.token) {
    throw new Error('Login failed');
  }
  setToken(data.token);
  if (data.role) setRole(data.role);
  return data;
}

export async function verifyAdminMfa(email: string, code: string): Promise<LoginResponse> {
  const data = await postPublicAdmin<LoginResponse>('/admin/login/verify-2fa', { email, code });
  if (!data.token) {
    throw new Error('Verification failed');
  }
  setToken(data.token);
  if (data.role) setRole(data.role);
  return data;
}
