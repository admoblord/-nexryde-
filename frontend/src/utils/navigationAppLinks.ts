/**
 * Deep links for every navigation app a driver can pick.
 *
 * Deliberately dependency-free so the exact URLs handed to Google Maps, Apple
 * Maps and Waze can be asserted directly by scripts/verify_driver_navigation_choice.mjs.
 * Each list is ordered best-first and ends in an https URL that always resolves,
 * so a driver without the app installed still gets directions in the browser.
 */

export type NavigationAppId = 'in_app' | 'google_maps' | 'apple_maps' | 'waze';

export type MapPlatform = 'ios' | 'android' | 'web';

export const NAVIGATION_APP_IDS: readonly NavigationAppId[] = [
  'in_app',
  'google_maps',
  'apple_maps',
  'waze',
];

export function isNavigationAppId(raw: unknown): raw is NavigationAppId {
  return typeof raw === 'string' && (NAVIGATION_APP_IDS as readonly string[]).includes(raw);
}

/** Apple Maps only exists on iOS; every other app is offered everywhere. */
export function navigationAppIdsForPlatform(platform: MapPlatform): NavigationAppId[] {
  return NAVIGATION_APP_IDS.filter((id) => id !== 'apple_maps' || platform === 'ios');
}

export function googleMapsWebUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function googleMapsNavigationUrls(
  lat: number,
  lng: number,
  platform: MapPlatform,
): string[] {
  if (platform === 'ios') {
    return [`comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`, googleMapsWebUrl(lat, lng)];
  }
  if (platform === 'android') {
    return [`google.navigation:q=${lat},${lng}&mode=d`, googleMapsWebUrl(lat, lng)];
  }
  return [googleMapsWebUrl(lat, lng)];
}

export function appleMapsNavigationUrls(lat: number, lng: number): string[] {
  return [`http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`, googleMapsWebUrl(lat, lng)];
}

export function wazeNavigationUrls(lat: number, lng: number): string[] {
  return [
    `waze://?ll=${lat},${lng}&navigate=yes`,
    `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`,
  ];
}

/** Put the driver's last pick first so repeat trips stay a single tap. */
export function orderByLastUsed<T extends { id: NavigationAppId }>(
  items: T[],
  lastUsed: NavigationAppId | null,
): T[] {
  if (!lastUsed) return items;
  const index = items.findIndex((item) => item.id === lastUsed);
  if (index <= 0) return items;
  return [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}
