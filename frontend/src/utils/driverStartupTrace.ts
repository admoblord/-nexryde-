/**
 * Driver app startup instrumentation — logs tagged phases and flags slow steps (>5s).
 * Used to diagnose white-screen / infinite loading on driver-home.
 */

const APP_START_MS = Date.now();
const stepStarts = new Map<string, number>();

function elapsed(): number {
  return Date.now() - APP_START_MS;
}

export function resetDriverStartupTrace(): void {
  stepStarts.clear();
}

export function startupLog(tag: string, extra?: Record<string, unknown>): void {
  const payload = { t: elapsed(), ...(extra ?? {}) };
  console.log(`[${tag}]`, payload);
  if (payload.t > 5000) {
    console.warn(`[SLOW] ${tag} total_elapsed_ms=${payload.t}`, extra ?? {});
  }
}

export function startupStepStart(key: string): void {
  stepStarts.set(key, Date.now());
}

export function startupStepEnd(tag: string, key: string, extra?: Record<string, unknown>): void {
  const started = stepStarts.get(key);
  const durationMs = started != null ? Date.now() - started : undefined;
  const data: Record<string, unknown> = { ...(extra ?? {}) };
  if (durationMs != null) data.durationMs = durationMs;
  startupLog(tag, data);
  if (durationMs != null && durationMs > 5000) {
    console.warn(`[SLOW] ${tag} duration_ms=${durationMs}`, extra ?? {});
  }
  stepStarts.delete(key);
}

/** Race any promise against a timeout — never block UI indefinitely. */
export async function withStartupTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  startupStepStart(label);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    startupStepEnd(`${label}_END`, label);
    return result;
  } catch (e) {
    startupStepEnd(`${label}_FAILED`, label, {
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
