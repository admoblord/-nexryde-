import { Alert, Linking, Platform } from 'react-native';

import {
  appleMapsNavigationUrls,
  googleMapsNavigationUrls,
  wazeNavigationUrls,
  type MapPlatform,
} from '@/src/utils/navigationAppLinks';

export type NavigationTarget = {
  lat: number;
  lng: number;
  label?: string;
};

/**
 * Open the first candidate URL the device can actually handle.
 *
 * `canOpenURL` needs the scheme listed in `LSApplicationQueriesSchemes` on iOS
 * and in `<queries>` on Android. Android package visibility is not declared for
 * map apps, so there a false negative would send every driver to the browser —
 * we just try to open and let a missing handler throw through to the next
 * candidate instead. Every list ends in an https URL, which always resolves.
 */
async function openFirstAvailableUrl(candidates: string[]): Promise<boolean> {
  for (const url of candidates) {
    try {
      if (Platform.OS === 'ios' && !url.startsWith('http')) {
        const supported = await Linking.canOpenURL(url);
        if (!supported) continue;
      }
      await Linking.openURL(url);
      return true;
    } catch {
      /* try the next candidate */
    }
  }
  return false;
}

const currentMapPlatform = (): MapPlatform =>
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

/** Google Maps turn-by-turn: native app when installed, else Google Maps web. */
export function openGoogleMapsNavigation(lat: number, lng: number): void {
  void openFirstAvailableUrl(googleMapsNavigationUrls(lat, lng, currentMapPlatform()));
}

/** Apple Maps turn-by-turn (iOS only), falling back to Google Maps web. */
export function openAppleMapsNavigation(lat: number, lng: number): void {
  void openFirstAvailableUrl(appleMapsNavigationUrls(lat, lng));
}

export function openWazeNavigation(lat: number, lng: number): void {
  void openFirstAvailableUrl(wazeNavigationUrls(lat, lng));
}

/**
 * Opens turn-by-turn navigation in whichever map app the platform prefers.
 * Prefer an explicit launcher when the driver has picked an app.
 */
export function openGoogleNavigation(
  lat: number | null,
  lng: number | null,
  addressFallback?: string,
): void {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (Platform.OS === 'ios') openAppleMapsNavigation(lat, lng);
    else openGoogleMapsNavigation(lat, lng);
    return;
  }
  if (addressFallback) {
    const encoded = encodeURIComponent(addressFallback);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`);
  }
}

/**
 * Let the driver pick an external map app for turn-by-turn.
 *
 * Used where there is no live trip to guide in-app (trip history, and as the
 * fallback inside the in-app navigation screen). During a trip the driver gets
 * the richer sheet that also offers NEXRYDE's own navigation.
 */
export function promptExternalNavigation(target: NavigationTarget): void {
  const { lat, lng, label } = target;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const options: Parameters<typeof Alert.alert>[2] = [
    { text: 'Google Maps', onPress: () => openGoogleMapsNavigation(lat, lng) },
    ...(Platform.OS === 'ios'
      ? [{ text: 'Apple Maps', onPress: () => openAppleMapsNavigation(lat, lng) }]
      : []),
    { text: 'Waze', onPress: () => openWazeNavigation(lat, lng) },
    { text: 'Cancel', style: 'cancel' as const },
  ];
  Alert.alert('Navigate with', label || 'Choose navigation app', options);
}

/**
 * Resolve the correct navigation target for the current trip phase.
 *
 * accepted  → navigate to pickup
 * arrived   → navigate to pickup (help driver locate rider)
 * ongoing   → navigate to dropoff (destination)
 */
export function resolveTripNavigationTarget(trip: {
  status?: string;
  pickup_location?: { lat?: number; lng?: number; address?: string } | null;
  dropoff_location?: { lat?: number; lng?: number; address?: string } | null;
  pickup_code_verified?: boolean;
  security_code_verified?: boolean;
}): NavigationTarget | null {
  const st   = String(trip.status || '');
  const pick = trip.pickup_location;
  const drop = trip.dropoff_location;

  if ((st === 'accepted' || st === 'arrived') && pick) {
    return { lat: Number(pick.lat), lng: Number(pick.lng), label: pick.address || 'Pickup' };
  }
  if (st === 'ongoing' && drop) {
    return { lat: Number(drop.lat), lng: Number(drop.lng), label: drop.address || 'Destination' };
  }
  return null;
}

/**
 * Navigate to the dropoff/destination regardless of trip status.
 * Use this when a driver wants to plan ahead while still at pickup.
 */
export function openDestinationNavigation(
  dropoff: { lat?: number; lng?: number; address?: string } | null | undefined,
): void {
  if (!dropoff?.lat || !dropoff?.lng) return;
  promptExternalNavigation({
    lat: Number(dropoff.lat),
    lng: Number(dropoff.lng),
    label: dropoff.address || 'Destination',
  });
}
