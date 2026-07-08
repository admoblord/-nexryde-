import { BACKEND_URL } from '@/src/services/api';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';

let lastWarmAt = 0;
const WARM_COOLDOWN_MS = 60 * 1000;

/**
 * Fire-and-forget — wakes Cloud Run + Mongo pool while user reads/types on welcome/login.
 * `/health` = liveness (no DB). `/api/health/ready` = pings Mongo (what login needs).
 */
export function warmBackendConnection(force = false): void {
  const now = Date.now();
  if (!force && now - lastWarmAt < WARM_COOLDOWN_MS) return;
  lastWarmAt = now;
  void fetchWithTimeout(`${BACKEND_URL}/health`, { method: 'GET', timeoutMs: 5000 }).catch(() => {});
  void fetchWithTimeout(`${BACKEND_URL}/api/health/ready`, { method: 'GET', timeoutMs: 8000 }).catch(() => {});
}

/** Re-ping Mongo while the login screen is visible (user typing email). */
export function warmBackendWhileWaiting(): void {
  void fetchWithTimeout(`${BACKEND_URL}/api/health/ready`, { method: 'GET', timeoutMs: 8000 }).catch(() => {});
}
