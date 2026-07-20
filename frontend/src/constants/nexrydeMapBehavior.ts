/**
 * NEXRYDE Advanced Map Behavior — shared tokens for rider & driver maps.
 */
import { HYBRID } from '@/src/constants/nexrydeHybridBrand';

export const MAP = {
  userDot: HYBRID.green,
  driverTaxi: '#FACC15',
  pickupPin: HYBRID.green,
  destinationPin: '#FF4444',
  routeTeal: HYBRID.teal,
  breadcrumb: 'rgba(134,239,172,0.55)',
  breadcrumbWidth: 2,
  routeWidth: 4,
  routeGlowWidth: 14,
  pickupRadiusM: 100,
  minZoom: 10,
  maxZoom: 20,
  update: {
    locationRideSec: 1,
    locationIdleSec: 2,
    etaSec: 5,
    trafficSec: 30,
    markersSec: 3,
    breadcrumbSec: 2,
    heatmapSec: 60,
  },
  /** Cluster driver/request markers when region is wider than this (degrees). */
  clusterLatitudeDelta: 0.08,
} as const;

/**
 * NexRyde Night — single canonical dark map for driver + rider (2026 edition).
 * High-contrast roads for night driving; POI/transit stripped for clean focus.
 * Mutable array so react-native-maps accepts the prop without cast failure.
 */
export const NEXRYDE_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0c1220' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0c1220' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8eaad4' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0e1628' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#111d33' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0b1421' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071524' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2c5282' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243a5c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#4a6a9a', weight: 1.2 }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ec5ef' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#0c1220', weight: 2 }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a4f82' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#6b9ee8', weight: 1.8 }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b8d4f5' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#1f3558' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#5a82b8', weight: 1.4 }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#8eb4dc' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#1a2d48' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#3d5f88', weight: 1 }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#6a90b8' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1a2a42' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e3660' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c0d4ef' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.stroke', stylers: [{ color: '#0c1220' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#6a8db0' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0a1e14', visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#2e6b47', visibility: 'on' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Soft light map — same product language for daytime / light theme. */
export const NEXRYDE_MAP_STYLE_LIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#f1f5f9' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#334155' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f8fafc' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e2e8f0' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfdbfe' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3b82f6' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#eef2ff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcfce7', visibility: 'on' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#0f172a' }] },
];

/** @deprecated Use NEXRYDE_MAP_STYLE — kept for existing imports. */
export const BOOKING_MAP_DARK_STYLE = NEXRYDE_MAP_STYLE;

export function getNexrydeMapStyle(isDark = true) {
  return isDark ? NEXRYDE_MAP_STYLE : NEXRYDE_MAP_STYLE_LIGHT;
}

/** Teal route stroke layers (glow + main). */
export function mapTealRouteLayers(coords: { latitude: number; longitude: number }[]) {
  return {
    glow: {
      coordinates: coords,
      strokeColor: 'rgba(0,217,163,0.12)',
      strokeWidth: MAP.routeGlowWidth,
    },
    mid: {
      coordinates: coords,
      strokeColor: 'rgba(0,217,163,0.45)',
      strokeWidth: 8,
    },
    main: {
      coordinates: coords,
      strokeColor: MAP.routeTeal,
      strokeWidth: MAP.routeWidth,
    },
  };
}
