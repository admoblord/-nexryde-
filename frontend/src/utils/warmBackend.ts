import { BACKEND_URL } from '@/src/services/api';

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
  void fetch(`${BACKEND_URL}/health`, { method: 'GET' }).catch(() => {});
  void fetch(`${BACKEND_URL}/api/health/ready`, { method: 'GET' }).catch(() => {});
}

/** Re-ping Mongo while the login screen is visible (user typing email). */
export function warmBackendWhileWaiting(): void {
  void fetch(`${BACKEND_URL}/api/health/ready`, { method: 'GET' }).catch(() => {});
}
