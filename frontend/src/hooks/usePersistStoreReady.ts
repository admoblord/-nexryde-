import { useEffect, useState } from 'react';
import { useAppStore } from '@/src/store/appStore';
import { STARTUP_REQUEST_TIMEOUT_MS } from '@/src/constants/startupPolicy';
import { timedStartupRequestOrNull } from '@/src/utils/startupRequestLog';

/**
 * Resolves when zustand persist has finished loading from AsyncStorage.
 * Hard 5s cap — never block startup indefinitely on AsyncStorage.
 */
export async function awaitPersistHydration(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return;

  await timedStartupRequestOrNull(
    'persist_hydration',
    async () => {
      const persistApi = useAppStore.persist as typeof useAppStore.persist & {
        rehydrate?: () => Promise<void> | void;
      };
      if (typeof persistApi.rehydrate === 'function') {
        await persistApi.rehydrate();
        return true;
      }
      await new Promise<void>((resolve) => {
        const unsub = useAppStore.persist.onFinishHydration(() => {
          unsub();
          resolve();
        });
      });
      return true;
    },
    STARTUP_REQUEST_TIMEOUT_MS,
  );
}

/** `true` once zustand persist has finished rehydrating (or 5s grace elapsed). */
export function usePersistStoreReady(): boolean {
  const [ready, setReady] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }

    const unsub = useAppStore.persist.onFinishHydration(() => setReady(true));
    const watchdog = setTimeout(() => {
      console.warn('[STARTUP_REQ_FAIL] persist_hydration_watchdog — proceeding without persist');
      setReady(true);
    }, STARTUP_REQUEST_TIMEOUT_MS);

    return () => {
      unsub();
      clearTimeout(watchdog);
    };
  }, []);

  return ready;
}
