import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

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
  const hasHydrated = usePersistStoreReady();
  const user = useAppStore((state) => state.user);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user?.id || !isAuthenticated) {
      router.replace(fallbackHref as any);
      return;
    }
    if (user.role === 'driver') {
      router.replace(driverHref as any);
    } else {
      router.replace(riderHref as any);
    }
  }, [hasHydrated, user?.id, user?.role, isAuthenticated, driverHref, riderHref, fallbackHref, router]);

  if (!hasHydrated) return null;
  return null;
}
