import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

/**
 * Waits for persisted store rehydration, then requires identity.
 * Token is loaded lazily by authedFetch — never gates render.
 */
export function useRequireUserOrLogin(): boolean {
  const router = useRouter();
  const hasHydrated = usePersistStoreReady();
  const userId = useAppStore((s) => s.user?.id);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!userId || !isAuthenticated) router.replace('/(auth)/login');
  }, [hasHydrated, userId, isAuthenticated, router]);

  return hasHydrated && !!userId && isAuthenticated;
}
