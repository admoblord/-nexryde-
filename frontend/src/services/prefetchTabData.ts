/**
 * After auth resolves, warm TanStack Query caches for every tab so second
 * visits (and first taps) paint from memory.
 */
import { queryClient } from '@/src/providers/QueryProvider';
import { qk } from '@/src/services/queryKeys';
import { BACKEND_URL } from '@/src/services/api';
import { getUserTrips, getWalletMe, getUser, getUserTrustSummary } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import { loadRiderSavedPlaces } from '@/src/services/riderSavedPlaces';
import { fetchFeatureAnnouncements } from '@/src/services/featureAnnouncements';
import { tabCacheSet } from '@/src/services/tabDataCache';
import { applyRiderProfileToStore } from '@/src/utils/hydrateRiderProfile';

export async function prefetchRiderTabs(userId: string): Promise<void> {
  if (!userId) return;
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: qk.riderTrips(userId),
      queryFn: async () => {
        const res = await getUserTrips(userId, 'rider');
        const trips = Array.isArray(res.data) ? res.data : [];
        tabCacheSet(`rider-trips:${userId}`, trips);
        return trips;
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.riderSavedPlaces(userId),
      queryFn: async () => {
        const places = await loadRiderSavedPlaces(userId);
        tabCacheSet(`rider-saved:${userId}`, places);
        return places;
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.riderProfile(userId),
      queryFn: async () => {
        const res = await getUser(userId);
        if (res.data && typeof res.data === 'object') {
          void applyRiderProfileToStore(res.data as Record<string, unknown>);
        }
        return res.data;
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.riderTrust(userId),
      queryFn: async () => {
        const res = await getUserTrustSummary(userId);
        return res.data;
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.riderWallet(userId),
      queryFn: async () => {
        const w = await getWalletMe(15);
        const next = {
          balance: Number(w.data?.balance ?? 0),
          txs: Array.isArray(w.data?.transactions) ? w.data.transactions : [],
        };
        tabCacheSet(`rider-wallet:${userId}`, next);
        return next;
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.riderNotifs(userId),
      queryFn: async () => {
        const [rows, res] = await Promise.all([
          fetchFeatureAnnouncements('rider'),
          authedFetch(`${BACKEND_URL}/api/users/${userId}/notifications?limit=40`, {
            timeoutMs: 10_000,
            preserveSessionOn401: true,
          }),
        ]);
        let backendNotifs: unknown[] = [];
        let unreadBackend = 0;
        if (res.ok) {
          const data = await res.json();
          backendNotifs = Array.isArray(data.notifications) ? data.notifications : [];
          unreadBackend = Number(data.unread_count || 0);
        }
        const next = { rows, backendNotifs, unreadBackend };
        tabCacheSet(`tab-notifs:rider:${userId}`, next);
        return next;
      },
    }),
  ]);
}

export async function prefetchDriverTabs(userId: string): Promise<void> {
  if (!userId) return;
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: qk.driverTrips(userId),
      queryFn: async () => {
        const res = await getUserTrips(userId, 'driver');
        return Array.isArray(res.data) ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.driverSubscription(userId),
      queryFn: async () => {
        const res = await authedFetch(`${BACKEND_URL}/api/subscriptions/${userId}`, {
          timeoutMs: 10_000,
          preserveSessionOn401: true,
        });
        if (!res.ok) return null;
        return res.json();
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.driverWorkZone(userId),
      queryFn: async () => {
        const res = await authedFetch(`${BACKEND_URL}/api/drivers/${userId}/work-zone`, {
          timeoutMs: 10_000,
          preserveSessionOn401: true,
        });
        if (!res.ok) return null;
        return res.json();
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.driverProfile(userId),
      queryFn: async () => {
        const res = await authedFetch(`${BACKEND_URL}/api/drivers/${userId}/profile`, {
          timeoutMs: 10_000,
          preserveSessionOn401: true,
        });
        if (!res.ok) return null;
        return res.json();
      },
    }),
    queryClient.prefetchQuery({
      queryKey: qk.driverNotifs(userId),
      queryFn: async () => {
        const [rows, res] = await Promise.all([
          fetchFeatureAnnouncements('driver'),
          authedFetch(`${BACKEND_URL}/api/users/${userId}/notifications?limit=40`, {
            timeoutMs: 10_000,
            preserveSessionOn401: true,
          }),
        ]);
        let backendNotifs: unknown[] = [];
        let unreadBackend = 0;
        if (res.ok) {
          const data = await res.json();
          backendNotifs = Array.isArray(data.notifications) ? data.notifications : [];
          unreadBackend = Number(data.unread_count || 0);
        }
        const next = { rows, backendNotifs, unreadBackend };
        tabCacheSet(`tab-notifs:driver:${userId}`, next);
        return next;
      },
    }),
  ]);
}

export function prefetchTabsForRole(role: string | undefined, userId: string | undefined): void {
  if (!userId || !role) return;
  if (role === 'rider') void prefetchRiderTabs(userId);
  else if (role === 'driver') void prefetchDriverTabs(userId);
}
