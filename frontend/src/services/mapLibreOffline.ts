/**
 * Optional MapLibre offline pack helpers (Lagos metro default).
 */
import { Platform } from 'react-native';
import { getMapLibreStyleUrl, isMapLibreEnabled } from '@/src/constants/mapEngines';

/** bounds: [west, south, east, north] */
export const LAGOS_OFFLINE_BOUNDS: [number, number, number, number] = [3.1, 6.35, 3.62, 6.72];

export async function ensureLagosOfflinePack(): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === 'web' || !isMapLibreEnabled()) {
    return { ok: false, message: 'MapLibre offline packs require a native build.' };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');
    const mapStyle = getMapLibreStyleUrl();
    const packs = await ml.OfflineManager.getPacks();
    const already = packs.some(
      (p) => (p as { metadata?: { name?: string } }).metadata?.name === 'nexryde-lagos-v1',
    );
    if (already) {
      return { ok: true, message: 'Lagos offline pack already downloaded.' };
    }
    await ml.OfflineManager.createPack(
      {
        mapStyle,
        bounds: LAGOS_OFFLINE_BOUNDS,
        minZoom: 10,
        maxZoom: 15,
        metadata: { name: 'nexryde-lagos-v1' },
      },
      () => undefined,
      () => undefined,
    );
    return { ok: true, message: 'Lagos offline pack download started.' };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Could not create offline pack',
    };
  }
}
