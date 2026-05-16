import { useEffect, useState } from 'react';
import { useAppStore } from '@/src/store/appStore';

/**
 * Resolves when zustand persist has finished loading from AsyncStorage.
 * Use in splash/bootstrap before applying SecureStore-driven auth so a late
 * rehydrate merge cannot overwrite a freshly restored session.
 */
export async function awaitPersistHydration(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return;
  const persistApi = useAppStore.persist as typeof useAppStore.persist & {
    rehydrate?: () => Promise<void> | void;
  };
  if (typeof persistApi.rehydrate === 'function') {
    await persistApi.rehydrate();
    return;
  }
  await new Promise<void>((resolve) => {
    const unsub = useAppStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

/** `true` once zustand persist has finished rehydrating from AsyncStorage. */
export function usePersistStoreReady(): boolean {
  const [ready, setReady] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    return useAppStore.persist.onFinishHydration(() => setReady(true));
  }, []);

  return ready;
}
