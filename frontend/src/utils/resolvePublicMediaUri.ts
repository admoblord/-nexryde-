import { BACKEND_URL } from '@/src/services/api';

/** Turns relative API paths (`/media/...`) into absolute URLs for `<Image source={{ uri }} />`. */
export function resolvePublicMediaUri(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('data:')) return t;
  if (/^https?:\/\//i.test(t)) return t;
  const base = BACKEND_URL.replace(/\/+$/, '');
  if (t.startsWith('//')) return `https:${t}`;
  if (t.startsWith('/')) return `${base}${t}`;
  return `${base}/${t}`;
}
