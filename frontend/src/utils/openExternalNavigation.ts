import { Alert, Linking, Platform } from 'react-native';

export type NavigationTarget = {
  lat: number;
  lng: number;
  label?: string;
};

/**
 * Opens turn-by-turn navigation to the given coordinates.
 *
 * iOS:     Apple Maps directions (turn-by-turn), falls back to Google Maps web
 * Android: Google Maps turn-by-turn via intent URL
 * Web:     Google Maps web directions
 */
export function openGoogleNavigation(
  lat: number | null,
  lng: number | null,
  addressFallback?: string,
): void {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    // iOS: Apple Maps daddr= opens turn-by-turn; fallback to Google if not available
    const iosAppleMaps = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    const googleMapsWeb = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    const androidGoogleNav = `google.navigation:q=${lat},${lng}&mode=d`;

    const url = Platform.select({
      ios:     iosAppleMaps,
      android: androidGoogleNav,
    }) ?? googleMapsWeb;

    void Linking.openURL(url).catch(() => {
      // iOS fallback: try Google Maps app, then web
      if (Platform.OS === 'ios') {
        const googleMapsIos = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
        void Linking.canOpenURL(googleMapsIos).then((ok) => {
          void Linking.openURL(ok ? googleMapsIos : googleMapsWeb);
        });
      } else {
        void Linking.openURL(googleMapsWeb);
      }
    });
    return;
  }
  if (addressFallback) {
    const encoded = encodeURIComponent(addressFallback);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`);
  }
}

export function openWazeNavigation(lat: number, lng: number): void {
  const native = `waze://?ll=${lat},${lng}&navigate=yes`;
  const web    = `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
  void Linking.canOpenURL(native)
    .then((ok) => Linking.openURL(ok ? native : web))
    .catch(() => Linking.openURL(web));
}

/** Let driver pick Google Maps / Apple Maps or Waze for turn-by-turn. */
export function promptExternalNavigation(target: NavigationTarget): void {
  const { lat, lng, label } = target;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const options: Parameters<typeof Alert.alert>[2] = [
    { text: Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps', onPress: () => openGoogleNavigation(lat, lng, label) },
    { text: 'Waze',   onPress: () => openWazeNavigation(lat, lng) },
    { text: 'Cancel', style: 'cancel' },
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
