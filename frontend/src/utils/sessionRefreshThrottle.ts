/**
 * Coalesce duplicate in-flight requests (same millisecond bursts).
 * Optional minInterval only for background resume — never block user navigation.
 */
export function createRefreshThrottle(
  minIntervalMs: number,
  opts?: { inFlightOnly?: boolean },
) {
  const inFlightOnly = opts?.inFlightOnly ?? false;
  let lastAt = 0;
  let inFlight: Promise<unknown> | null = null;

  return {
    shouldRun(force = false): boolean {
      if (force) return true;
      if (inFlightOnly) return !inFlight;
      return Date.now() - lastAt >= minIntervalMs;
    },
    markRan() {
      lastAt = Date.now();
    },
    async run<T>(fn: () => Promise<T>, force = false): Promise<T | undefined> {
      if (inFlight) return inFlight as Promise<T | undefined>;
      if (!force && !inFlightOnly && Date.now() - lastAt < minIntervalMs) {
        return undefined;
      }
      const job = fn().finally(() => {
        lastAt = Date.now();
        inFlight = null;
      });
      inFlight = job;
      return job;
    },
  };
}

/** Dedupe only — always allow a new pull after the previous finishes. */
export const activeTripPullThrottle = createRefreshThrottle(0, { inFlightOnly: true });

/** Background resume bursts (AppState), not user taps. */
export const driverSessionRefreshThrottle = createRefreshThrottle(4000);

export const driverOnboardingRefreshThrottle = createRefreshThrottle(6 * 60 * 60 * 1000);

/** Rider tracking AppState only — screen focus always fetches fresh. */
export const riderTripStatusThrottle = createRefreshThrottle(0, { inFlightOnly: true });
