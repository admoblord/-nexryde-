import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { routeAuthedUser } from '@/src/utils/routeAuthedUser';

/**
 * Auth screens: after persist hydration, send signed-in users to home.
 * Gates on identity only — never waits for JWT.
 */
export function useRedirectIfAuthed(): boolean {
  const router = useRouter();
  const storeReady = usePersistStoreReady();
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (!storeReady || !user?.id || !isAuthenticated) return;
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    void routeAuthedUser(router, user, null).finally(() => {
      redirectingRef.current = false;
    });
  }, [storeReady, user?.id, user?.role, isAuthenticated, router]);

  if (!storeReady) return false;
  if (user?.id && isAuthenticated) return false;
  return true;
}
