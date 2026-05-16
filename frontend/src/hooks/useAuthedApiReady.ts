import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

/**
 * Persist hydration + JWT for authenticated driver onboarding API calls.
 */
export function useAuthedApiReady() {
  const storeReady = usePersistStoreReady();
  const token = useAppStore((s) => s.token);
  const canCallAuthedApi = storeReady && !!token;

  return { storeReady, token, canCallAuthedApi };
}
