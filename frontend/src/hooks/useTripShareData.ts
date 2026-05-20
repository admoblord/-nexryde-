import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchTripShareData,
  generateTripShareLink,
  type TripShareData,
} from '@/src/services/api';
import { buildLocalShareSnapshot } from '@/src/utils/tripShareSnapshot';
import type { Trip } from '@/src/store/appStore';

const POLL_MS = 5000;

export function useTripShareData(
  tripId: string | null | undefined,
  currentTrip: Trip | null | undefined,
  driverInfo?: Record<string, unknown> | null,
) {
  const [shareData, setShareData] = useState<TripShareData | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const shareLinkRef = useRef('');
  const hasLoadedRef = useRef(false);

  const applyLocalFallback = useCallback(() => {
    const local = buildLocalShareSnapshot(currentTrip, driverInfo);
    if (!local) return;
    setShareData((prev) => ({
      ...(prev ?? ({} as TripShareData)),
      ...local,
      driver: {
        ...(prev?.driver ?? {}),
        ...(local.driver ?? {}),
        image_url:
          local.driver?.face_image ||
          local.driver?.profile_image ||
          prev?.driver?.image_url ||
          null,
      },
      vehicle: { ...(prev?.vehicle ?? {}), ...(local.vehicle ?? {}) },
      eta_seconds: prev?.eta_seconds ?? local.eta_seconds,
      distance_km: prev?.distance_km ?? local.distance_km,
      share_link: prev?.share_link || shareLinkRef.current || '',
      last_updated: prev?.last_updated || new Date().toISOString(),
    } as TripShareData));
  }, [currentTrip, driverInfo]);

  const load = useCallback(
    async (silent = false) => {
      if (!tripId) {
        setLoading(false);
        return;
      }
      if (!silent) setRefreshing(true);
      try {
        const res = await fetchTripShareData(tripId);
        const data = res.data;
        if (data?.share_link) {
          shareLinkRef.current = data.share_link;
          setShareLink(data.share_link);
        }
        setShareData((prev) => {
          if (!prev) return data;
          return {
            ...prev,
            ...data,
            driver: {
              ...prev.driver,
              ...data?.driver,
              face_image: data?.driver?.face_image || prev.driver?.face_image,
              profile_image: data?.driver?.profile_image || prev.driver?.profile_image,
              image_url: data?.driver?.image_url || prev.driver?.image_url,
            },
          } as TripShareData;
        });
        hasLoadedRef.current = true;
        setLastRefresh(new Date());
        setError(null);
      } catch (e) {
        if (!shareLinkRef.current) {
          try {
            const gen = await generateTripShareLink(tripId);
            if (gen.data?.share_link) {
              shareLinkRef.current = gen.data.share_link;
              setShareLink(gen.data.share_link);
            }
          } catch {
            /* keep prior link */
          }
        }
        applyLocalFallback();
        if (!hasLoadedRef.current) {
          setError(e instanceof Error ? e.message : 'Could not refresh trip data');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tripId, applyLocalFallback],
  );

  useEffect(() => {
    shareLinkRef.current = shareLink;
  }, [shareLink]);

  useEffect(() => {
    hasLoadedRef.current = false;
    setError(null);
    setLoading(Boolean(tripId));
  }, [tripId]);

  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      applyLocalFallback();
      return;
    }
    applyLocalFallback();
    void load(false);
    const iv = setInterval(() => void load(true), POLL_MS);
    return () => clearInterval(iv);
  }, [tripId, load, applyLocalFallback]);

  return {
    shareData,
    shareLink,
    loading,
    refreshing,
    error,
    lastRefresh,
    reload: () => load(true),
  };
}
