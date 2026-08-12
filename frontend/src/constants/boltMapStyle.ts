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

/** Nexryde route green — from MAP_VEHICLE tokens (contrast vs navy car). */
export const BOLT_ROUTE_GREEN = MAP_VEHICLE.routeGreen;
export const BOLT_ROUTE_CASING = MAP_VEHICLE.outline;
export const BOLT_ROUTE_WIDTH = 9;
export const BOLT_ROUTE_CASING_WIDTH = 11;

/** Mutable array for react-native-maps customMapStyle. */
export const BOLT_RIDER_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F3F5F2' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A939E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F3F5F2' }, { weight: 2 }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7A8490' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#F3F5F2' }],
  },

  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#EEF3E8' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#DCEBD4' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F5F5F5' }] },

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
    stylers: [{ color: '#D4E8C8', visibility: 'on' }],
  },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D5D9DE', weight: 0.6 }],
  },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9AA3AD' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D0D5DB', weight: 0.7 }],
  },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#C8CED6', weight: 1.1 }],
  },
  { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road.local',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#DCE0E5', weight: 0.5 }],
  },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },

  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D6E4F0' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9BB4C8' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#D6E4F0' }] },
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
