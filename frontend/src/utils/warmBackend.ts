import { BACKEND_URL } from '@/src/services/api';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';

let lastWarmAt = 0;
const WARM_COOLDOWN_MS = 45 * 1000;

/**
 * Fire-and-forget — wakes the API + Mongo pool while user reads/types on welcome/login.
 * `/health` = liveness (no DB). `/api/health/ready` = pings Mongo (what login needs).
 */
export function warmBackendConnection(force = false): void {
  const now = Date.now();
  if (!force && now - lastWarmAt < WARM_COOLDOWN_MS) return;
  lastWarmAt = now;
  // Parallel warm: TLS handshake + DB readiness in one shot for first ride action.
  void Promise.all([
    fetchWithTimeout(`${BACKEND_URL}/health`, { method: 'GET', timeoutMs: 4000 }),
    fetchWithTimeout(`${BACKEND_URL}/api/health/ready`, { method: 'GET', timeoutMs: 7000 }),
  ]).catch(() => {});
}

/** Re-ping Mongo while the login screen is visible (user typing email). */
export function warmBackendWhileWaiting(): void {
  void fetchWithTimeout(`${BACKEND_URL}/api/health/ready`, { method: 'GET', timeoutMs: 8000 }).catch(() => {});
}
