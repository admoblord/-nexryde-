import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * Stale-while-revalidate: cached value renders instantly; fetch runs in background.
 * `fetcher` should use apiFetch (10s timeout + token handling).
 */
export function useResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: UseResourceOptions = { cache: true },
) {
  const { cache = true, enabled = true } = opts;
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: enabled, error: null });
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (!mounted.current) return;
      setState({ data, loading: false, error: null });
      if (cache) AsyncStorage.setItem(`res:${key}`, JSON.stringify(data)).catch(() => {});
    } catch (e) {
      if (!mounted.current) return;
      setState((s) => ({ data: s.data, loading: false, error: e instanceof Error ? e : new Error(String(e)) }));
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

    if (cache) {
      AsyncStorage.getItem(`res:${key}`)
        .then((raw) => {
          if (raw && mounted.current) {
            try {
              setState((s) => ({ ...s, data: JSON.parse(raw) as T }));
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
