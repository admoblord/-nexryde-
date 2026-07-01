import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

type AppRole = 'rider' | 'driver';

const OTHER_ROLE_HOME: Record<AppRole, string> = {
  rider: '/(driver-tabs)/driver-home',
  driver: '/(rider-tabs)/rider-home',
};

/**
 * Gate on persisted identity ONLY — never on JWT.
 * Token is loaded lazily by apiFetch/authedFetch on first authenticated request.
 */
export function useRequireRole(expected: AppRole): boolean {
  const router = useRouter();
  const hasHydrated = usePersistStoreReady();
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = user?.role;

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated || !user?.id) {
      router.replace('/(auth)/login');
      return;
    }
    if (role !== expected) {
      router.replace(OTHER_ROLE_HOME[expected] as any);
    }
  }, [hasHydrated, isAuthenticated, user?.id, role, expected, router]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !user?.id) return;
    if (expected !== 'driver' || role !== 'driver') return;
    void import('@/src/utils/sessionRouting').then(({ markDriverOnboardingCached }) =>
      markDriverOnboardingCached(user.id),
    );
  }, [hasHydrated, isAuthenticated, user?.id, role, expected]);

  const allowed = hasHydrated && isAuthenticated && !!user?.id && role === expected;
  if (allowed) {
    console.log('[GATE_ALLOW]', { role: expected, hydrated: true });
  }

  return allowed;
}
