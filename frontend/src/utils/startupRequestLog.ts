/**
 * Startup request instrumentation — START_TIME, END_TIME, DURATION for every boot API.
 */
import { STARTUP_REQUEST_TIMEOUT_MS } from '@/src/constants/startupPolicy';

export type StartupRequestMeta = {
  label: string;
  phase?: string;
  ok?: boolean;
  status?: number;
  error?: string;
};

export async function timedStartupRequest<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number = STARTUP_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const start = Date.now();
  console.log(`[STARTUP_REQ_START] ${label}`, { startTime: start });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}_timeout_${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    const end = Date.now();
    const durationMs = end - start;
    console.log(`[STARTUP_REQ_END] ${label}`, { startTime: start, endTime: end, durationMs, ok: true });
    if (durationMs > 5000) {
      console.warn(`[STARTUP_REQ_SLOW] ${label} duration_ms=${durationMs}`);
    }
    return result;
  } catch (e) {
    const end = Date.now();
    const durationMs = end - start;
    const error = e instanceof Error ? e.message : String(e);
    console.warn(`[STARTUP_REQ_FAIL] ${label}`, {
      startTime: start,
      endTime: end,
      durationMs,
      ok: false,
      error,
    });
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Like timedStartupRequest but returns null on failure — startup continues. */
export async function timedStartupRequestOrNull<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number = STARTUP_REQUEST_TIMEOUT_MS,
): Promise<T | null> {
  try {
    return await timedStartupRequest(label, fn, timeoutMs);
  } catch {
    return null;
  }
}
