/**
 * Map GPS / address text → backend `city` slug for `/fare/estimate` and trip request.
 * Must stay aligned with `backend/fare_config.normalize_fare_city_key` slugs.
 * Lagos is explicit only when coords or text indicate Lagos — unknown Nigeria → `default` (nationwide FCT card).
 */

export type FareCityCentroid = { slug: string; lat: number; lng: number };

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

/** Approximate state seats / major hubs for nearest-slug inference (km cap in picker). */
export const NIGERIA_FARE_CITY_CENTROIDS: readonly FareCityCentroid[] = [
  { slug: 'lagos', lat: 6.5244, lng: 3.3792 },
  { slug: 'abuja', lat: 9.0765, lng: 7.3986 },
  { slug: 'abia', lat: 5.5333, lng: 7.4833 },
  { slug: 'adamawa', lat: 9.2035, lng: 12.4833 },
  { slug: 'akwa_ibom', lat: 5.052, lng: 7.9335 },
  { slug: 'anambra', lat: 6.2104, lng: 7.0741 },
  { slug: 'bauchi', lat: 10.3158, lng: 9.8442 },
  { slug: 'bayelsa', lat: 4.9267, lng: 6.2676 },
  { slug: 'benue', lat: 7.7411, lng: 8.5191 },
  { slug: 'borno', lat: 11.8333, lng: 13.15 },
  { slug: 'cross_river', lat: 4.9517, lng: 8.3222 },
  { slug: 'delta', lat: 6.1982, lng: 6.7378 },
  { slug: 'ebonyi', lat: 6.3249, lng: 8.1137 },
  { slug: 'edo', lat: 6.3176, lng: 5.6145 },
  { slug: 'ekiti', lat: 7.6233, lng: 5.221 },
  { slug: 'enugu', lat: 6.4478, lng: 7.5139 },
  { slug: 'gombe', lat: 10.2833, lng: 11.1667 },
  { slug: 'imo', lat: 5.4836, lng: 7.0333 },
  { slug: 'jigawa', lat: 11.7964, lng: 9.3386 },
  { slug: 'kaduna', lat: 10.5105, lng: 7.4165 },
  { slug: 'kano', lat: 12.0022, lng: 8.592 },
  { slug: 'katsina', lat: 12.9908, lng: 7.6018 },
  { slug: 'kebbi', lat: 12.45, lng: 4.1975 },
  { slug: 'kogi', lat: 7.8023, lng: 6.739 },
  { slug: 'kwara', lat: 8.4969, lng: 4.5426 },
  { slug: 'nasarawa', lat: 8.4939, lng: 8.5153 },
  { slug: 'niger', lat: 9.6152, lng: 6.5478 },
  { slug: 'ogun', lat: 7.1475, lng: 3.3619 },
  { slug: 'ondo', lat: 7.2571, lng: 5.2058 },
  { slug: 'osun', lat: 7.7714, lng: 4.5561 },
  { slug: 'oyo', lat: 7.3775, lng: 3.947 },
  { slug: 'plateau', lat: 9.8965, lng: 8.8581 },
  { slug: 'rivers', lat: 4.8156, lng: 7.0498 },
  { slug: 'sokoto', lat: 13.0059, lng: 5.2476 },
  { slug: 'taraba', lat: 8.8937, lng: 11.366 },
  { slug: 'yobe', lat: 11.7489, lng: 11.9664 },
  { slug: 'zamfara', lat: 12.1704, lng: 6.6611 },
] as const;

export function pickFareCitySlugFromCoords(lat: number, lng: number, maxKm = 140): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: { slug: string; d: number } | null = null;
  for (const { slug, lat: clat, lng: clng } of NIGERIA_FARE_CITY_CENTROIDS) {
    const d = haversineKm(lat, lng, clat, clng);
    if (!best || d < best.d) best = { slug, d };
  }
  if (best && best.d <= maxKm) return best.slug;
  return null;
}

/** Multi-word and metro aliases first (substring order). */
const ADDRESS_FARE_SLUG_RULES: ReadonlyArray<readonly [string, string]> = [
  ['fct', 'abuja'],
  ['abuja', 'abuja'],
  ['port harcourt', 'rivers'],
  ['port-harcourt', 'rivers'],
  ['portharcourt', 'rivers'],
  ['benin city', 'edo'],
  ['benin-city', 'edo'],
  ['cross river', 'cross_river'],
  ['cross-river', 'cross_river'],
  ['akwa ibom', 'akwa_ibom'],
  ['akwa-ibom', 'akwa_ibom'],
  ['niger state', 'niger'],
  ['asaba', 'delta'],
  ['warri', 'delta'],
  ['owerri', 'imo'],
  ['uyo', 'akwa_ibom'],
  ['calabar', 'cross_river'],
  ['ibadan', 'oyo'],
  ['abeokuta', 'ogun'],
  ['ilorin', 'kwara'],
  ['minna', 'niger'],
  ['lafia', 'nasarawa'],
  ['makurdi', 'benue'],
  ['maiduguri', 'borno'],
  ['yenagoa', 'bayelsa'],
  ['dutse', 'jigawa'],
  ['birnin kebbi', 'kebbi'],
  ['lokoja', 'kogi'],
  ['damaturu', 'yobe'],
  ['jalingo', 'taraba'],
  ['gusau', 'zamfara'],
  ['lekki', 'lagos'],
  ['ikeja', 'lagos'],
  ['ajah', 'lagos'],
  ['surulere', 'lagos'],
  ['yaba', 'lagos'],
  ['vi,', 'lagos'],
  ['victoria island', 'lagos'],
  ['ikorodu', 'lagos'],
  ['badagry', 'lagos'],
  ['epe', 'lagos'],
  ['festac', 'lagos'],
  ['magodo', 'lagos'],
  ['gbagada', 'lagos'],
  ['maryland', 'lagos'],
  ['oshodi', 'lagos'],
  ['lagos', 'lagos'],
];

const SLUGS_FOR_WORD_BOUNDARY: readonly string[] = [
  'abia',
  'adamawa',
  'anambra',
  'bauchi',
  'bayelsa',
  'benue',
  'borno',
  'delta',
  'ebonyi',
  'edo',
  'ekiti',
  'enugu',
  'gombe',
  'imo',
  'jigawa',
  'kaduna',
  'kano',
  'katsina',
  'kebbi',
  'kogi',
  'kwara',
  'nasarawa',
  'ogun',
  'ondo',
  'osun',
  'oyo',
  'plateau',
  'rivers',
  'sokoto',
  'taraba',
  'yobe',
  'zamfara',
];

export function inferFareCitySlugFromAddress(pickup: string, destination: string): string | null {
  const c = `${pickup || ''} ${destination || ''}`.toLowerCase();
  for (const [needle, slug] of ADDRESS_FARE_SLUG_RULES) {
    if (c.includes(needle)) return slug;
  }
  if (/\bjos\b/i.test(c)) return 'plateau';
  for (const slug of SLUGS_FOR_WORD_BOUNDARY) {
    const pat = slug.replace(/_/g, '[_\\s]');
    const re = new RegExp(`\\b${pat}\\b`, 'i');
    if (re.test(c)) return slug;
  }
  return null;
}
