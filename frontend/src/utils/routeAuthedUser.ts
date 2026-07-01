import type { Router } from 'expo-router';
import { BACKEND_URL } from '@/src/services/api';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import { STARTUP_REQUEST_TIMEOUT_MS } from '@/src/constants/startupPolicy';
import { startupLog } from '@/src/utils/driverStartupTrace';
import { writeDriverBootCache } from '@/src/services/driverBootCache';
import {
  isDriverOnboardingCached,
  isRiderVerificationCached,
  routeToHomeInstant,
  syncAuthStatusInBackground,
} from '@/src/utils/sessionRouting';
import {
  driverDocumentsRouteParams,
  driverProfileRouteParams,
  driverTermsRouteParams,
  type DriverOnboardingUser,
} from '@/src/utils/driverOnboardingNav';

export type AuthedUserForRouting = DriverOnboardingUser & {
  role?: 'rider' | 'driver' | 'admin';
};

/**
 * RENDER FIRST: navigate to home immediately for returning sessions.
 * Onboarding status check runs only for first-time users without local cache.
 */
export async function routeAuthedUser(
  router: Pick<Router, 'replace'>,
  loggedUser: AuthedUserForRouting,
  resolvedToken: string | null,
): Promise<void> {
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (resolvedToken) authHeaders.Authorization = `Bearer ${resolvedToken}`;

  if (loggedUser?.role === 'admin') {
    router.replace('/admin/dashboard' as any);
    return;
  }

  if (loggedUser?.role === 'driver') {
    if (await isDriverOnboardingCached(loggedUser.id)) {
      routeToHomeInstant(router, 'driver');
      syncAuthStatusInBackground(loggedUser, resolvedToken);
      return;
    }

    // First login / unknown onboarding — still route home first, validate in background on dashboard
    routeToHomeInstant(router, 'driver');
    syncAuthStatusInBackground(loggedUser, resolvedToken);

    void (async () => {
      try {
        startupLog('PROFILE_FETCH_START', { source: 'routeAuthedUser_background' });
        const st = await fetchWithTimeout(
          `${BACKEND_URL}/api/drivers/${loggedUser.id}/onboarding-status`,
          { headers: authHeaders, timeoutMs: STARTUP_REQUEST_TIMEOUT_MS },
        );
        startupLog('PROFILE_FETCH_END', { source: 'routeAuthedUser_background', status: st.status });
        const status = await st.json();

        if (!st.ok || !status?.completed) {
          if (status?.step === 'terms') {
            router.replace({
              pathname: '/(auth)/driver-terms',
              params: driverTermsRouteParams(loggedUser),
            } as any);
            return;
          }
          if (status?.step === 'documents') {
            router.replace({
              pathname: '/(auth)/driver-documents',
              params: driverDocumentsRouteParams(loggedUser),
            } as any);
            return;
          }
          if (status?.step === 'documents_rejected') {
            router.replace({
              pathname: '/(auth)/driver-verification-status',
              params: driverDocumentsRouteParams(loggedUser),
            } as any);
            return;
          }
          if (status?.step === 'profile') {
            router.replace({
              pathname: '/(auth)/driver-profile',
              params: driverProfileRouteParams(loggedUser),
            } as any);
            return;
          }
          return;
        }

        const locked = status.can_go_online === false;
        void writeDriverBootCache({
          driverId: loggedUser.id,
          verificationStatus:
            status.verification_status || (locked ? 'pending_review' : 'approved'),
          subscriptionStatus: locked ? 'locked_until_approval' : 'none',
          trialTripsCompleted: 0,
          trialTripsTarget: 20,
          trialExtended: false,
          onboardingCompleted: true,
        });
        void import('@/src/utils/sessionRouting').then(({ markDriverOnboardingCached }) =>
          markDriverOnboardingCached(loggedUser.id),
        );
      } catch {
        /* dashboard already visible — non-fatal */
      }
    })();
    return;
  }

  if (await isRiderVerificationCached(loggedUser.id)) {
    routeToHomeInstant(router, 'rider');
    syncAuthStatusInBackground(loggedUser, resolvedToken);
    return;
  }

  routeToHomeInstant(router, 'rider');
  syncAuthStatusInBackground(loggedUser, resolvedToken);
}
