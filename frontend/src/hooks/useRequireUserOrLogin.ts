import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

/**
 * Waits for persisted store rehydration, then requires `user.id`.
 * If missing after hydration, replaces with login.
 * @returns `true` when safe to render authenticated UI.
 */
export function useRequireUserOrLogin(): boolean {
  const router = useRouter();
  const storeReady = usePersistStoreReady();
  const userId = useAppStore((s) => s.user?.id);
  const token = useAppStore((s) => s.token);

  useEffect(() => {
    if (!storeReady) return;
    if (!userId || !token) router.replace('/(auth)/login');
  }, [storeReady, userId, token, router]);

  return storeReady && !!userId && !!token;
}
