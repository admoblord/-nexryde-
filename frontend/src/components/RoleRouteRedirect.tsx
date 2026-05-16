import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

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
  const storeReady = usePersistStoreReady();
  const user = useAppStore((state) => state.user);
  const token = useAppStore((state) => state.token);

  useEffect(() => {
    if (!storeReady) return;
    if (!user?.id || !token) {
      router.replace(fallbackHref as any);
      return;
    }
    if (user.role === 'driver') {
      router.replace(driverHref as any);
    } else {
      router.replace(riderHref as any);
    }
  }, [storeReady, user?.id, user?.role, token, driverHref, riderHref, fallbackHref, router]);

  return <AuthLoadingGate />;
}
