import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tabCacheGet, tabCacheSet } from '@/src/services/tabDataCache';

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

type UseResourceOptions = {
  cache?: boolean;
  /** When false, skips fetch (still reads cache if enabled). */
  enabled?: boolean;
};

/**
 * Stale-while-revalidate: memory → AsyncStorage → network.
 * Second visit paints instantly from memory; never blanks the UI while revalidating.
 */
export function useResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: UseResourceOptions = { cache: true },
) {
  const { cache = true, enabled = true } = opts;
  const memHit = cache ? tabCacheGet<T>(key) : null;
  const [state, setState] = useState<ResourceState<T>>({
    data: memHit,
    // Only show loading skeleton when we have nothing to paint.
    loading: enabled && !memHit,
    error: null,
  });
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({
      ...s,
      // Keep existing data visible — only spin when empty.
      loading: s.data == null,
      error: null,
    }));
    const LOAD_TIMEOUT_MS = 12000;
    try {
      const data = await Promise.race([
        fetcherRef.current(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('resource_timeout')), LOAD_TIMEOUT_MS),
        ),
      ]);
      if (!mounted.current) return;
      setState({ data, loading: false, error: null });
      if (cache) {
        tabCacheSet(key, data);
        AsyncStorage.setItem(`res:${key}`, JSON.stringify(data)).catch(() => {});
      }
    } catch (e) {
      if (!mounted.current) return;
      setState((s) => ({
        data: s.data,
        loading: false,
        error: e instanceof Error ? e : new Error(String(e)),
      }));
    }
  }, [cache, enabled, key]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return () => {
        mounted.current = false;
      };
    }

    const warm = cache ? tabCacheGet<T>(key) : null;
    if (warm) {
      setState((s) => ({ ...s, data: warm, loading: false }));
    } else if (cache) {
      AsyncStorage.getItem(`res:${key}`)
        .then((raw) => {
          if (raw && mounted.current) {
            try {
              const parsed = JSON.parse(raw) as T;
              tabCacheSet(key, parsed);
              setState((s) => ({ ...s, data: parsed, loading: false }));
            } catch {
              /* ignore corrupt cache */
            }
          }
        })
        .catch(() => {});
    }

    void load();
    return () => {
      mounted.current = false;
    };
  }, [cache, enabled, key, load]);

  return { ...state, retry: load };
}
