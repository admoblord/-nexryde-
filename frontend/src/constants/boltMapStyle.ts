/**
 * Bolt-style desaturated rider map — pale landscape, white roads, muted labels.
 * Prefer Google Cloud Map IDs (googleMapId); JSON is the legacy fallback.
 *
 * Keep in sync with mapStyles/boltRiderLight.json (Cloud Console reference).
 */
import { Platform } from 'react-native';
import type { MapStyleElement } from 'react-native-maps';
import { getGoogleMapIdForPlatform } from '@/src/constants/mapEngines';
import { MAP_VEHICLE } from '@/src/constants/designSystem';

/**
 * Route line: brand lime core over a navy casing.
 *
 * The casing used to be white, which vanished against the white roads it was
 * drawn on. Navy is the other half of the logo pairing and gives the route a
 * hard edge on every surface — white road, pale land, or park green.
 */
export const BOLT_ROUTE_GREEN = MAP_VEHICLE.routeGreen;
export const BOLT_ROUTE_CASING = MAP_VEHICLE.routeCasing;
export const BOLT_ROUTE_WIDTH = 8;
export const BOLT_ROUTE_CASING_WIDTH = 13;

/**
 * Mutable array for react-native-maps customMapStyle.
 *
 * Palette is NEXRYDE's: land carries a faint lime cast, water a faint navy-blue
 * one, and labels are navy-grey rather than neutral slate. Roads stay pure white
 * with a three-step hairline hierarchy (highway darkest, local lightest) so the
 * lime route and the navy-glassed car are the only saturated things on screen.
 */
export const BOLT_RIDER_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F4F6F1' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7C8494' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 2.5 }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5A6272' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#FFFFFF' }, { weight: 3 }],
  },

  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#F0F3EA' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#E7F0DC' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F6F7F4' }] },

  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#E2EFD2', visibility: 'on' }],
  },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E1E5EA', weight: 0.5 }],
  },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98A0AC' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D9DEE4', weight: 0.6 }],
  },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#C6CDD6', weight: 0.9 }],
  },
  { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  // Route shields (E1, A1…) are the last bit of visual noise competing with the
  // route line. Names stay, the badges go.
  { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#BCC4CF', weight: 1 }],
  },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road.local',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E8EBEF', weight: 0.4 }],
  },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },

  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DBE5F1' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8B9CB4' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#DBE5F1' }] },
];

/**
 * Cloud Map ID when configured; empty string → use JSON customMapStyle.
 * Create styles in Google Cloud Console (Light base) and attach Android/iOS Map IDs.
 */
export function getBoltRiderGoogleMapId(): string {
  return getGoogleMapIdForPlatform(Platform.OS);
}

/** When a cloud Map ID is present, skip JSON styling (cloud wins). */
export function getBoltRiderCustomMapStyle(): MapStyleElement[] | undefined {
  return getBoltRiderGoogleMapId() ? undefined : BOLT_RIDER_MAP_STYLE;
}

/** White casing + dark green route (Bolt readability over pale roads). */
export function mapBoltRouteLayers(coords: { latitude: number; longitude: number }[]) {
  return {
    casing: {
      coordinates: coords,
      strokeColor: BOLT_ROUTE_CASING,
      strokeWidth: BOLT_ROUTE_CASING_WIDTH,
    },
    main: {
      coordinates: coords,
      strokeColor: BOLT_ROUTE_GREEN,
      strokeWidth: BOLT_ROUTE_WIDTH,
    },
  };
}
