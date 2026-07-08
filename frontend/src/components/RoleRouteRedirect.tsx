import React, { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { routeMatchesSegments, safeReplace } from '@/src/utils/navigationSafe';

type RoleRouteRedirectProps = {
  riderHref: string;
  driverHref: string;
  fallbackHref?: string;
};

export default function RoleRouteRedirect({
  riderHref,
  driverHref,
  fallbackHref = '/(auth)/login',
}: RoleRouteRedirectProps) {
  const router = useRouter();
  const segments = useSegments();
  const hasHydrated = usePersistStoreReady();
  const user = useAppStore((state) => state.user);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user?.id || !isAuthenticated) {
      if (!routeMatchesSegments(segments, fallbackHref)) {
        safeReplace(router, fallbackHref);
      }
      return;
    }
    const target = user.role === 'driver' ? driverHref : riderHref;
    if (!routeMatchesSegments(segments, target)) {
      safeReplace(router, target);
    }
  }, [hasHydrated, user?.id, user?.role, isAuthenticated, driverHref, riderHref, fallbackHref, router, segments]);

  if (!hasHydrated) return null;
  return null;
}
