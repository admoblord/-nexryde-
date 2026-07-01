import type { MapStyleElement } from 'react-native-maps';

/** NEXRYDE Perfect Tracking Map — design tokens (spec). */
export const PERFECT_TRACKING = {
  green: '#00D084',
  yellow: '#FFD700',
  red: '#FF4444',
  teal: '#00D9A3',
  blue: '#0066FF',
  orange: '#FF8C00',
  bg: '#0F1419',
  card: '#1A1F2E',
  border: '#2D3748',
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  headerH: 70,
  fabSize: 48,
  mapFlex: 85,
  panelFlex: 15,
} as const;

export const PERFECT_TRACKING_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0e1a2d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0e1a2d' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  // local roads — clearly visible
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#37577f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b0d5ce' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#080e1a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0e1a2d' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#7aa8cc' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e3048' }] },
];
