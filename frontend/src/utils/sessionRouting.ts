/**
 * Bank-style session resume: valid login → home immediately.
 * Verification/onboarding API checks run in background only (no blocking redirect).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Router } from 'expo-router';
import { BACKEND_URL } from '@/src/services/api';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import {
  driverDocumentsRouteParams,
  driverProfileRouteParams,
  type DriverOnboardingUser,
} from '@/src/utils/driverOnboardingNav';
import { legalTermsRouteForRole } from '@/src/constants/legal';
import { replaceLegalTermsIfNeeded } from '@/src/utils/navigationRouteGuard';
import { logLegalGateCheck, syncUserLegalStatus } from '@/src/services/legalStatusSync';
import { writeDriverVerificationFact } from '@/src/services/driverVerificationFact';

/**
 * Verification learned during routing is persisted IMMEDIATELY (Uber model).
 * Seeds the in-memory fact synchronously, so when driver-home mounts moments
 * later its first frame paints Verified/GO from local state — no second
 * onboarding-status round-trip, no "Checking your account…".
 */
function persistDriverVerificationFromRouting(driverId: string, status: unknown): void {
  const vs = typeof status === 'string' ? status.trim() : '';
  if (!driverId || !vs) return;
  void writeDriverVerificationFact(driverId, vs);
}

const ONBOARDING_SEEN_KEY = 'onboarding_complete';
const riderVerifiedKey = (userId: string) => `@nexryde_rider_verified_${userId}`;
const driverOnboardedKey = (userId: string) => `@nexryde_driver_onboarded_${userId}`;

/** Resolve user for legal gate — prefer server-synced store user. */
async function resolveUserForLegalGate(
  loggedUser: AuthedUserForRouting,
): Promise<AuthedUserForRouting> {
  if (!loggedUser?.id) return loggedUser;
  const synced = await syncUserLegalStatus(loggedUser.id);
  if (synced) {
    return { ...loggedUser, ...synced } as AuthedUserForRouting;
  }
  return loggedUser;
}

function needsLegalRedirect(user: AuthedUserForRouting, source: string): boolean {
  return logLegalGateCheck(user, source);
}

export type AuthedUserForRouting = DriverOnboardingUser & {
  role?: 'rider' | 'driver' | 'admin';
  is_verified?: boolean;
  terms_accepted?: boolean;
  terms_version?: string | null;
  privacy_accepted?: boolean;
  privacy_version?: string | null;
};

export function homeRouteForRole(role?: string): '/(rider-tabs)/rider-home' | '/(driver-tabs)/driver-home' {
  return role === 'driver' ? '/(driver-tabs)/driver-home' : '/(rider-tabs)/rider-home';
}

export async function markAppOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
  } catch {
    /* non-fatal */
  }
}

export async function isRiderVerificationCached(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(riderVerifiedKey(userId))) === 'true';
  } catch {
    return false;
  }
}

export async function markRiderVerificationCached(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(riderVerifiedKey(userId), 'true');
  } catch {
    /* non-fatal */
  }
}

export async function isDriverOnboardingCached(driverId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(driverOnboardedKey(driverId))) === 'true';
  } catch {
    return false;
  }
}

export async function markDriverOnboardingCached(driverId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(driverOnboardedKey(driverId), 'true');
  } catch {
    /* non-fatal */
  }
}

export async function clearDriverOnboardingCached(driverId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(driverOnboardedKey(driverId));
  } catch {
    /* non-fatal */
  }
}

export async function clearSessionRoutingCache(userId?: string | null): Promise<void> {
  try {
    if (userId) {
      await AsyncStorage.multiRemove([riderVerifiedKey(userId), driverOnboardedKey(userId)]);
    }
  } catch {
    /* non-fatal */
  }
}

/** Immediate navigation to the correct tab home (no network). */
export function routeToHomeInstant(
  router: Pick<Router, 'replace'>,
  role?: string,
): void {
  // Fire-and-forget the storage write — never block navigation on it
  void markAppOnboardingSeen();
  router.replace(homeRouteForRole(role) as any);
}

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * Refresh verification flags from API without changing the current screen.
 * Used after cold start / resume so a slow network never sends users to onboarding.
 */
export function syncAuthStatusInBackground(
  loggedUser: AuthedUserForRouting,
  token: string | null,
): void {
  const id = loggedUser?.id;
  if (!id || !token) return;

  void (async () => {
    const headers = authHeaders(token);
    if (loggedUser.role === 'rider') {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/users/${id}/rider-verification-status`,
          { headers, timeoutMs: 5000 },
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.completed) await markRiderVerificationCached(id);
        }
      } catch {
        /* stay on home */
      }
      return;
    }

    if (loggedUser.role === 'driver') {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/drivers/${id}/onboarding-status`,
          { headers, timeoutMs: 5000 },
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.completed) {
            await markDriverOnboardingCached(id);
          } else {
            // Poisoned cache from older clients sent unfinished drivers to Home.
            await clearDriverOnboardingCached(id);
          }
          persistDriverVerificationFromRouting(id, data?.verification_status);
        }
      } catch {
        /* stay on home */
      }
    }
  })();
}

/**
 * First sign-in only: route to onboarding steps when cache says user never finished.
 * Returning users with a saved session always go home instantly.
 */
export async function routeAuthedUserFirstLogin(
  router: Pick<Router, 'replace'>,
  loggedUser: AuthedUserForRouting,
  resolvedToken: string | null,
): Promise<void> {
  await markAppOnboardingSeen();
  const id = loggedUser.id;
  const headers = authHeaders(resolvedToken);
  const legalUser = await resolveUserForLegalGate(loggedUser);

  if (loggedUser.role === 'driver') {
    if (needsLegalRedirect(legalUser, 'routeAuthedUserFirstLogin:driver')) {
      replaceLegalTermsIfNeeded(router, 'driver');
      return;
    }
    try {
      const st = await fetchWithTimeout(
        `${BACKEND_URL}/api/drivers/${id}/onboarding-status`,
        { headers, timeoutMs: 10000 },
      );
      const status = await st.json();
      // Login already carries the verification answer — persist it NOW so the
      // dashboard's first frame is Verified/GO, never "Checking your account…".
      if (st.ok) persistDriverVerificationFromRouting(id, status?.verification_status);
      if (st.ok && status?.completed) {
        await markDriverOnboardingCached(id);
        router.replace(homeRouteForRole('driver') as any);
        return;
      }
      if (!st.ok || !status?.completed) {
        if (status?.step === 'terms') {
          replaceLegalTermsIfNeeded(router, 'driver');
          return;
        }
        if (status?.step === 'documents') {
          await clearDriverOnboardingCached(id);
          router.replace({
            pathname: '/(auth)/driver-documents',
            params: driverDocumentsRouteParams(loggedUser),
          } as any);
          return;
        }
        if (status?.step === 'documents_rejected' || status?.step === 'documents_review') {
          if (status?.step === 'documents_rejected') {
            await clearDriverOnboardingCached(id);
            router.replace({
              pathname: '/(auth)/driver-verification-status',
              params: driverDocumentsRouteParams(loggedUser),
            } as any);
          } else {
            // Docs submitted — limited Home until approval (option 1).
            await markDriverOnboardingCached(id);
            router.replace(homeRouteForRole('driver') as any);
          }
          return;
        }
        if (status?.step === 'profile') {
          await clearDriverOnboardingCached(id);
          router.replace({
            pathname: '/(auth)/driver-profile',
            params: driverProfileRouteParams(loggedUser),
          } as any);
          return;
        }
        // Unknown incomplete step — never dump unfinished drivers on Home.
        await clearDriverOnboardingCached(id);
        router.replace({
          pathname: '/(auth)/driver-documents',
          params: driverDocumentsRouteParams(loggedUser),
        } as any);
        return;
      }
      router.replace(homeRouteForRole('driver') as any);
    } catch {
      // Network blip on first login: prefer documents over a fake Home.
      router.replace({
        pathname: '/(auth)/driver-documents',
        params: driverDocumentsRouteParams(loggedUser),
      } as any);
    }
    return;
  }

  try {
    if (needsLegalRedirect(legalUser, 'routeAuthedUserFirstLogin:rider')) {
      replaceLegalTermsIfNeeded(router, loggedUser.role);
      return;
    }
    const st = await fetchWithTimeout(
      `${BACKEND_URL}/api/users/${id}/rider-verification-status`,
      { headers, timeoutMs: 10000 },
    );
    const riderStatus = await st.json();
    if (st.ok && riderStatus?.completed) {
      await markRiderVerificationCached(id);
      router.replace(homeRouteForRole('rider') as any);
    } else {
      router.replace('/(auth)/rider-verification' as any);
    }
  } catch {
    router.replace('/(auth)/rider-verification' as any);
  }
}

/**
 * After login / cold start: returning session → home immediately;
 * only runs blocking status routing when there is no local "finished" cache.
 */
export async function routeAuthedUser(
  router: Pick<Router, 'replace'>,
  loggedUser: AuthedUserForRouting,
  resolvedToken: string | null,
  options?: { forceStatusCheck?: boolean },
): Promise<void> {
  const id = loggedUser?.id;
  if (!id) {
    router.replace('/(auth)/login' as any);
    return;
  }

  const role = loggedUser.role;
  const forceCheck = options?.forceStatusCheck === true;
  const legalUser = await resolveUserForLegalGate(loggedUser);

  if (!forceCheck) {
    if (role === 'rider') {
      // IMPORTANT: do NOT use `is_verified` here. The backend sets is_verified=true
      // at registration (phone/email verified), not when 3-step rider onboarding is
      // done. Using it sends brand-new riders straight to home, skipping NIN/address/
      // face liveness. Only trust explicit completion signals.
      const cached =
        (await isRiderVerificationCached(id)) ||
        (loggedUser as { rider_verification_completed?: boolean }).rider_verification_completed === true ||
        (loggedUser as { onboarding_complete?: boolean }).onboarding_complete === true;
      if (cached) {
        if (needsLegalRedirect(legalUser, 'routeAuthedUser:rider-cached')) {
          replaceLegalTermsIfNeeded(router, role);
          return;
        }
        routeToHomeInstant(router, role);
        syncAuthStatusInBackground(loggedUser, resolvedToken);
        return;
      }
    } else if (role === 'driver') {
      if (needsLegalRedirect(legalUser, 'routeAuthedUser:driver')) {
        replaceLegalTermsIfNeeded(router, 'driver');
        return;
      }
      // Never trust onboarded cache alone — unfinished drivers must hit status routing.
      // Instant Home only when local verification fact is approved (Uber-grade gate).
      if (await isDriverOnboardingCached(id)) {
        try {
          const { readDriverVerificationFact } = await import(
            '@/src/services/driverVerificationFact'
          );
          const fact = await readDriverVerificationFact(id);
          if (fact?.verificationStatus === 'approved') {
            routeToHomeInstant(router, role);
            syncAuthStatusInBackground(loggedUser, resolvedToken);
            return;
          }
        } catch {
          /* fall through to status check */
        }
        await clearDriverOnboardingCached(id);
      }
    }
  }

  await routeAuthedUserFirstLogin(router, loggedUser, resolvedToken);
}
