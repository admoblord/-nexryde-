/**
 * Where the API lives, in one place.
 *
 * The app used to carry the Cloud Run URL in six files (app.json, app.config.js,
 * eas.json, api.ts, a terms screen and — worst — the security allowlist, which
 * silently refused every host that was not Cloud Run). Now `app.config.js` reads
 * `backend.config.json` at build time and injects the result into
 * `expoConfig.extra`, and every consumer reads it from here.
 *
 * Order of precedence:
 *   1. EXPO_PUBLIC_BACKEND_URL       — set at build time / per EAS profile
 *   2. expoConfig.extra.BACKEND_URL  — injected by app.config.js
 */
import Constants from 'expo-constants';

type BackendExtra = {
  BACKEND_URL?: string;
  extraApiHosts?: string[];
};

function extra(): BackendExtra {
  return (Constants.expoConfig?.extra || {}) as BackendExtra;
}

function normalizeOrigin(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Tolerate a bare host, and drop a trailing /api or slash so callers can
  // append their own paths without doubling up.
  const withScheme = raw.includes('://') ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '').replace(/\/api$/, '');
}

export function resolveBackendOrigin(): string {
  const fromEnv = normalizeOrigin(process.env.EXPO_PUBLIC_BACKEND_URL);
  if (fromEnv) return fromEnv;
  return normalizeOrigin(extra().BACKEND_URL);
}

/** Kept for callers that want the build-time value without the env override. */
export const DEFAULT_BACKEND_ORIGIN = normalizeOrigin(extra().BACKEND_URL);

/**
 * Hostnames the app is allowed to call.
 *
 * Derived from whatever origin is configured, so a host move needs no code
 * change, while still refusing redirection to an unrelated host. Extra hosts (a
 * CDN, a websocket edge) go in `backend.config.json` "extraApiHosts" or
 * EXPO_PUBLIC_EXTRA_API_HOSTS.
 */
export function allowedApiHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (value: unknown) => {
    const origin = normalizeOrigin(value);
    if (!origin) return;
    try {
      hosts.add(new URL(origin).hostname.toLowerCase());
    } catch {
      /* ignore anything unparseable */
    }
  };

  add(resolveBackendOrigin());
  add(extra().BACKEND_URL);
  for (const host of extra().extraApiHosts || []) add(host);
  for (const host of String(process.env.EXPO_PUBLIC_EXTRA_API_HOSTS || '').split(',')) {
    add(host);
  }
  return hosts;
}
