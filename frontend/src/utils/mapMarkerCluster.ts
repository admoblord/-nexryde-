import { MAP } from '@/src/constants/nexrydeMapBehavior';

export type MapClusterItem<T> =
  | { kind: 'point'; item: T; index: number }
  | { kind: 'cluster'; lat: number; lng: number; count: number; indices: number[] };

export function shouldClusterMarkers(latitudeDelta: number): boolean {
  return Number.isFinite(latitudeDelta) && latitudeDelta >= MAP.clusterLatitudeDelta;
}

/** Grid cluster for map markers when zoomed out. */
export function clusterMapMarkers<T extends { lat: number; lng: number }>(
  items: T[],
  latitudeDelta: number,
): MapClusterItem<T>[] {
  if (!items.length) return [];
  if (!shouldClusterMarkers(latitudeDelta) || items.length < 2) {
    return items.map((item, index) => ({ kind: 'point' as const, item, index }));
  }

  const cellDeg = Math.max(0.012, latitudeDelta / 6);
  const grid = new Map<string, number[]>();

  items.forEach((item, index) => {
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${Math.floor(lat / cellDeg)},${Math.floor(lng / cellDeg)}`;
    const bucket = grid.get(key) ?? [];
    bucket.push(index);
    grid.set(key, bucket);
  });

  const out: MapClusterItem<T>[] = [];
  for (const indices of grid.values()) {
    if (indices.length === 1) {
      const index = indices[0]!;
      out.push({ kind: 'point', item: items[index]!, index });
      continue;
    }
    let sumLat = 0;
    let sumLng = 0;
    for (const i of indices) {
      sumLat += Number(items[i]!.lat);
      sumLng += Number(items[i]!.lng);
    }
    out.push({
      kind: 'cluster',
      lat: sumLat / indices.length,
      lng: sumLng / indices.length,
      count: indices.length,
      indices,
    });
  }
  return out;
}
