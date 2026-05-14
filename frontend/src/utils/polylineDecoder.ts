/**
 * Encoded Google polyline → coordinates (same algorithm as Maps overview_polyline).
 * Used for drawing driving routes on react-native-maps after `/api/places/driving-route`.
 */
import { decodePolyline } from '@/src/navigation/navUtils';

export { decodePolyline };

export function decodePolylineToMapCoords(
  encoded: string,
): { latitude: number; longitude: number }[] {
  return decodePolyline(encoded).map((c) => ({ latitude: c.lat, longitude: c.lng }));
}
