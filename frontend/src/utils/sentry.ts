/**
 * Central Sentry wiring for the NEXRYDE app (single binary, rider + driver roles).
 *
 * - initSentry() is called once at the very top of app/_layout.tsx (module load),
 *   before the root component mounts, so native + JS crashes are captured early.
 * - The DSN is read from the public env (EXPO_PUBLIC_SENTRY_DSN) or expo extra
 *   (sentryDsn, injected via app.config.js). When no DSN is present, Sentry is
 *   left UNINITIALIZED and every helper is a safe no-op — so dev/local builds
 *   never ship events and CI doesn't need a DSN.
 * - sentryTestCrash() is the deliberate, user-fireable trigger to PROVE an event
 *   reaches the dashboard (wired to a long-press on the version line in both the
 *   rider and driver profile screens).
 */
import Constants from 'expo-constants';
import { ErrorUtils } from 'react-native';
import * as Sentry from '@sentry/react-native';
import CrashReporter from '@/src/services/crashReporting';

let _initialized = false;

function resolveDsn(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const fromExtra = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn;
  return (fromEnv || fromExtra || '').trim();
}

export function isSentryEnabled(): boolean {
  return _initialized;
}

/**
 * Initialize Sentry once. Safe to call on every cold start; no-ops if already
 * initialized or if no DSN is configured.
 */
export function initSentry(): void {
  if (_initialized) return;
  const dsn = resolveDsn();
  if (!dsn) {
    // No DSN wired yet → leave Sentry off rather than initializing a dead client.
    return;
  }
  try {
    Sentry.init({
      dsn,
      // App version/build so dashboard events map to a specific APK.
      release: Constants.expoConfig?.version ?? undefined,
      // Capture a modest perf sample; crashes are always sent.
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      enableAutoSessionTracking: true,
      environment: __DEV__ ? 'development' : 'production',
    });
    _initialized = true;
  } catch {
    _initialized = false;
  }
}

/**
 * Wrap the root component so Sentry's error boundary + navigation
 * instrumentation are active. No-op passthrough if Sentry isn't installed.
 */
export const wrapWithSentry = Sentry.wrap;

/**
 * Capture uncaught JS exceptions (outside React error boundaries).
 * Call once after initSentry() in app/_layout.tsx.
 */
export function installGlobalErrorHandler(): void {
  const defaultHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const err = error instanceof Error ? error : new Error(String(error));
    CrashReporter.captureException(err, { fatal: String(Boolean(isFatal)) });
    if (_initialized) {
      try {
        Sentry.captureException(err, { tags: { isFatal: String(Boolean(isFatal)) } } as never);
      } catch {
        /* noop */
      }
    }
    defaultHandler?.(error, isFatal);
  });
}

// ─── Identity ──────────────────────────────────────────────────────────────

export function setSentryUser(userId: string, role: 'rider' | 'driver' | 'admin'): void {
  if (!_initialized) return;
  try {
    Sentry.setUser({ id: userId });
    Sentry.setTag('role', role);
  } catch { /* noop */ }
}

export function clearSentryUser(): void {
  if (!_initialized) return;
  try { Sentry.setUser(null); } catch { /* noop */ }
}

// ─── Deliberate test crash (PROOF an event lands) ────────────────────────────

/**
 * Fire a deliberate error to Sentry so you can confirm an event reaches the
 * dashboard from a real device. Returns a short status string for UI feedback.
 *
 * - If Sentry is not initialized (no DSN), returns a clear "not wired" message
 *   instead of pretending to send — so "configured" can't masquerade as "working".
 */
export function sentryTestCrash(role: 'rider' | 'driver'): { sent: boolean; message: string } {
  if (!_initialized) {
    return {
      sent: false,
      message: 'Sentry is NOT wired (no DSN in this build). Add EXPO_PUBLIC_SENTRY_DSN and rebuild.',
    };
  }
  try {
    Sentry.captureException(
      new Error(`NEXRYDE deliberate test-crash from ${role} app — if you see this in Sentry, frontend reporting works.`),
      { tags: { role, test_crash: 'true' } } as never,
    );
    // Flush so the event is sent before the app is potentially backgrounded.
    void Sentry.flush();
    return { sent: true, message: 'Test event sent to Sentry. Check the dashboard.' };
  } catch (err) {
    return { sent: false, message: `Failed to send test event: ${String(err)}` };
  }
}
