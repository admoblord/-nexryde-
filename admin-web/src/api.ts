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
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  const data = await api<{ token: string; role?: string }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  if (data.role) setRole(data.role);
  return data;
}
