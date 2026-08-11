/**
 * In-memory stale-while-revalidate cache for rider/driver tab screens.
 * Second visit paints instantly; network revalidates in the background.
 */
type Entry<T> = { data: T; at: number };

const store = new Map<string, Entry<unknown>>();

export function tabCacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  return hit.data as T;
}

export function tabCacheSet<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function tabCacheClear(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
