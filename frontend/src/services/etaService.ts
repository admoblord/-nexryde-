/**
 * Live ETA estimates for rider tracking (Haversine + speed + traffic window).
 * Server `compute_live_tracking` remains authoritative when fresh; this fills gaps between pings.
 */

export type LatLng = { lat: number; lng: number };

export type EtaEstimate = {
  etaMinutes: number;
  etaSeconds: number;
  distanceKm: number;
  speedKmh: number;
  trafficFactor: number;
};

export class ETAService {
  static getTrafficMultiplier(hour: number = new Date().getHours()): number {
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) return 1.35;
    if (hour >= 12 && hour <= 13) return 1.15;
    return 1.0;
  }

  static calculateDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371;
    const dLat = ETAService.toRad(point2.lat - point1.lat);
    const dLng = ETAService.toRad(point2.lng - point1.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(ETAService.toRad(point1.lat)) *
        Math.cos(ETAService.toRad(point2.lat)) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static calculateETA(
    driverLocation: LatLng,
    destination: LatLng,
    driverSpeedKmh = 40,
    trafficMultiplier?: number,
  ): EtaEstimate {
    const distance = ETAService.calculateDistance(driverLocation, destination);
    const speed = Math.min(90, Math.max(8, Number(driverSpeedKmh) || 40));
    const traffic = trafficMultiplier ?? ETAService.getTrafficMultiplier();
    const baseMinutes = (distance / speed) * 60;
    const etaMinutes = Math.max(1, Math.ceil(baseMinutes * traffic));
    const etaSeconds = etaMinutes * 60;
    return {
      etaMinutes,
      etaSeconds,
      distanceKm: Math.round(distance * 10) / 10,
      speedKmh: speed,
      trafficFactor: traffic,
    };
  }

  static trackingStatusFromEta(
    etaSeconds: number,
    distanceKm: number,
    tripStatus: string,
  ): 'en_route' | 'arriving' | 'arrived' {
    if (tripStatus === 'arrived' || distanceKm <= 0.05) return 'arrived';
    if (etaSeconds < 60) return 'arriving';
    return 'en_route';
  }

  private static toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
