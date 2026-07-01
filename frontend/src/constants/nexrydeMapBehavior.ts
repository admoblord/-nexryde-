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
 * NexRyde dark map — "Midnight Commander" variant.
 * Background #0e1a2d (deep navy) · Roads #304a7d (clear blue) · Labels #8ec3b9.
 * Road/bg delta is ~45 lightness units → clearly visible on all phone screens.
 * NOT readonly so react-native-maps accepts the prop without silent cast failure.
 */
export const BOOKING_MAP_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0e1a2d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0e1a2d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  // local roads — clearly brighter blue
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#0e1a2d' }] },
  // arterial — slightly lighter
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#37577f' }] },
  // highway — most prominent
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b0d5ce' }] },
  { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#023747' }] },
  // water
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#080e1a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
  // landscape
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0e1a2d' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0d1e30' }] },
  // parks slightly green-tinted
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#0a1e2a' }] },
  // hide POI clutter, keep parks subtle
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'simplified' }] },
  // transit hidden
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  // admin borders faint
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e3048' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#7aa8cc' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#2a4060' }] },
];

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
