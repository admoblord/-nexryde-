import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

/**
 * Identity is enough to enable authed API hooks — token attaches lazily via authedFetch.
 */
export function useAuthedApiReady() {
  const storeReady = usePersistStoreReady();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const userId = useAppStore((s) => s.user?.id);
  const canCallAuthedApi = storeReady && isAuthenticated && !!userId;

  return {
    storeReady,
    canCallAuthedApi,
    userId,
  };
}
