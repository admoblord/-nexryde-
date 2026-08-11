/**
 * Structured Sentry breadcrumbs and custom event tracking for NEXRYDE.
 *
 * Provides strongly-typed helpers so key user journeys appear in Sentry's
 * breadcrumb trail and Insights dashboards without scattering Sentry.* calls
 * throughout feature code.
 *
 * Sentry is initialized in src/utils/sentry.ts (called from app/_layout.tsx).
 * When no DSN is configured the SDK is left uninitialized and every call below
 * is a safe no-op, so these helpers degrade gracefully on dev/local builds.
 */
import * as Sentry from '@sentry/react-native';
import { isSentryEnabled, setSentryUser, clearSentryUser } from '@/src/utils/sentry';

type SentryCapture = {
  addBreadcrumb: (b: unknown) => void;
  captureMessage: (msg: string, opts?: unknown) => void;
  captureException: (err: unknown, opts?: unknown) => void;
};

function getSentry(): SentryCapture | null {
  if (!isSentryEnabled()) return null;
  return Sentry as unknown as SentryCapture;
}

// ─── User identity ────────────────────────────────────────────────────────────

export function sentryIdentify(userId: string, role: 'rider' | 'driver' | 'admin') {
  setSentryUser(userId, role);
}

export function sentryLogout() {
  clearSentryUser();
}

// ─── Ride flow breadcrumbs ────────────────────────────────────────────────────

export function breadcrumbRideRequested(tripId: string, city: string, fare: number) {
  getSentry()?.addBreadcrumb({
    category: 'ride',
    message: 'Ride requested',
    data: { tripId, city, fare },
    level: 'info',
  });
}

export function breadcrumbDriverAssigned(tripId: string, driverId: string, etaMin: number) {
  getSentry()?.addBreadcrumb({
    category: 'ride',
    message: 'Driver assigned',
    data: { tripId, driverId, etaMin },
    level: 'info',
  });
}

export function breadcrumbTripStarted(tripId: string) {
  getSentry()?.addBreadcrumb({
    category: 'ride',
    message: 'Trip started',
    data: { tripId },
    level: 'info',
  });
}

export function breadcrumbTripCompleted(tripId: string, fare: number, paymentMethod: string) {
  getSentry()?.addBreadcrumb({
    category: 'ride',
    message: 'Trip completed',
    data: { tripId, fare, paymentMethod },
    level: 'info',
  });
}

export function breadcrumbTripCancelled(tripId: string, reason: string, byWhom: 'rider' | 'driver' | 'system') {
  getSentry()?.addBreadcrumb({
    category: 'ride',
    message: 'Trip cancelled',
    data: { tripId, reason, byWhom },
    level: 'warning',
  });
}

// ─── Navigation breadcrumbs ───────────────────────────────────────────────────

export function breadcrumbScreenView(screenName: string) {
  getSentry()?.addBreadcrumb({
    category: 'navigation',
    message: `Viewed ${screenName}`,
    level: 'info',
  });
}

// ─── Network breadcrumbs ──────────────────────────────────────────────────────

export function breadcrumbWsConnected(role: string) {
  getSentry()?.addBreadcrumb({
    category: 'realtime',
    message: 'WebSocket connected',
    data: { role },
    level: 'info',
  });
}

export function breadcrumbWsReconnecting(attempt: number) {
  getSentry()?.addBreadcrumb({
    category: 'realtime',
    message: `WebSocket reconnecting (attempt ${attempt})`,
    level: 'warning',
  });
}

export function breadcrumbWsError(error: string) {
  getSentry()?.addBreadcrumb({
    category: 'realtime',
    message: 'WebSocket error',
    data: { error },
    level: 'error',
  });
}

// ─── Error capture helpers ────────────────────────────────────────────────────

export function sentryError(error: unknown, context?: Record<string, unknown>) {
  getSentry()?.captureException(error, context ? ({ extra: context } as never) : undefined);
}

export function sentryWarn(message: string, data?: Record<string, unknown>) {
  getSentry()?.captureMessage(message, {
    level: 'warning',
    extra: data,
  } as never);
}
