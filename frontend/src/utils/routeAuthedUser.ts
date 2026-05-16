import type { Router } from 'expo-router';
import { BACKEND_URL } from '@/src/services/api';
import {
  driverDocumentsRouteParams,
  driverProfileRouteParams,
  driverTermsRouteParams,
  type DriverOnboardingUser,
} from '@/src/utils/driverOnboardingNav';

export type AuthedUserForRouting = DriverOnboardingUser & {
  role?: 'rider' | 'driver';
};

/**
 * After login / cold start / opening auth while signed in — route to the correct
 * home or onboarding step (mirrors splash + login post-verify behavior).
 */
export async function routeAuthedUser(
  router: Pick<Router, 'replace'>,
  loggedUser: AuthedUserForRouting,
  resolvedToken: string | null,
): Promise<void> {
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (resolvedToken) authHeaders.Authorization = `Bearer ${resolvedToken}`;

  if (loggedUser?.role === 'driver') {
    try {
      const st = await fetch(`${BACKEND_URL}/api/drivers/${loggedUser.id}/onboarding-status`, {
        headers: authHeaders,
      });
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
        if (status?.step === 'documents_rejected' || status?.step === 'documents_review') {
          if (status?.step === 'documents_rejected') {
            router.replace({
              pathname: '/(auth)/driver-verification-status',
              params: driverDocumentsRouteParams(loggedUser),
            } as any);
          } else {
            router.replace('/(driver-tabs)/driver-home' as any);
          }
          return;
        }
        if (status?.step === 'profile') {
          router.replace({
            pathname: '/(auth)/driver-profile',
            params: driverProfileRouteParams(loggedUser),
          } as any);
          return;
        }
      }
      router.replace('/(driver-tabs)/driver-home' as any);
      return;
    } catch {
      router.replace('/(driver-tabs)/driver-home' as any);
      return;
    }
  }

  try {
    const st = await fetch(`${BACKEND_URL}/api/users/${loggedUser.id}/rider-verification-status`, {
      headers: authHeaders,
    });
    const riderStatus = await st.json();
    if (st.ok && riderStatus?.completed) {
      router.replace('/(rider-tabs)/rider-home' as any);
    } else {
      router.replace('/(auth)/rider-verification' as any);
    }
  } catch {
    router.replace('/(auth)/rider-verification' as any);
  }
}
