/**
 * Last-known vehicle fare matrix so booking paints prices instantly
 * while the live estimate revalidates.
 */
import { tabCacheGet, tabCacheSet } from '@/src/services/tabDataCache';

export type FareMatrixCache = {
  matrix: Record<string, number>;
  original: Record<string, number>;
};

function round4(n: number): string {
  return n.toFixed(4);
}

export function fareMatrixCacheKey(
  pLat: number,
  pLng: number,
  dLat: number,
  dLng: number,
  city: string,
): string {
  return `fare-matrix:${round4(pLat)}:${round4(pLng)}:${round4(dLat)}:${round4(dLng)}:${city || 'default'}`;
}

export function getCachedFareMatrix(key: string): FareMatrixCache | null {
  const hit = tabCacheGet<FareMatrixCache>(key);
  if (!hit || !hit.matrix || typeof hit.matrix !== 'object') return null;
  return {
    matrix: hit.matrix,
    original: hit.original && typeof hit.original === 'object' ? hit.original : {},
  };
}

export function setCachedFareMatrix(key: string, data: FareMatrixCache): void {
  tabCacheSet(key, data);
}
