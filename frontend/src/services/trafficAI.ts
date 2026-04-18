/**
 * NEXRYDE AI Traffic Intelligence System
 * Real-time traffic updates, predictions, and route optimization
 */
import React from 'react';
import { BACKEND_URL } from '@/src/services/api';

export interface TrafficHotspot {
  id: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  severity: 'low' | 'moderate' | 'high' | 'severe';
  type: 'accident' | 'roadwork' | 'congestion' | 'event' | 'weather';
  delayMinutes: number;
  affectedRadius: number; // in meters
  startTime: Date;
  estimatedClearTime?: Date;
  description: string;
  verifiedReports: number;
  aiConfidence: number; // 0-100
}

export interface TrafficRoute {
  id: string;
  polyline: string;
  distance: number; // in meters
  durationWithoutTraffic: number; // in seconds
  durationWithTraffic: number; // in seconds
  trafficDelay: number; // in seconds
  trafficLevel: 'light' | 'moderate' | 'heavy' | 'severe';
  hotspots: TrafficHotspot[];
  toll: boolean;
  tollCost?: number;
  fuelConsumption: number; // liters
  aiScore: number; // 0-100 (best route)
  timeSavedVsAlternative?: number; // seconds
  /** ETA in whole minutes when the optimizer sets it (rider tracking). */
  estimatedTimeMinutes?: number;
}

export interface TrafficPrediction {
  location: {
    latitude: number;
    longitude: number;
    name: string;
  };
  currentLevel: 'light' | 'moderate' | 'heavy' | 'severe';
  predictedLevel: 'light' | 'moderate' | 'heavy' | 'severe';
  predictionTime: Date;
  confidence: number; // 0-100
  factors: string[]; // ['rush hour', 'school zone', 'market day']
}

export interface TrafficAlert {
  id: string;
  type: 'avoid' | 'warning' | 'info' | 'update';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  location: string;
  distance: number; // meters from user
  timestamp: Date;
  actionRequired?: string;
  alternativeRoute?: TrafficRoute;
}

export class TrafficAI {
  // Traffic Severity Colors
  static readonly TRAFFIC_COLORS = {
    light: '#00D084',      // Green - Free flowing
    moderate: '#FFB800',   // Yellow - Moderate
    heavy: '#FF6B00',      // Orange - Heavy
    severe: '#FF0000',     // Red - Severe
  };

  // Traffic Severity Thresholds (delay in minutes)
  static readonly SEVERITY_THRESHOLDS = {
    light: 0,
    moderate: 5,
    heavy: 15,
    severe: 30,
  };

  /**
   * Get real-time traffic status for a location
   */
  static async getTrafficStatus(
    latitude: number,
    longitude: number,
    radius: number = 5000 // 5km default
  ): Promise<TrafficHotspot[]> {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/ai/traffic/predict?origin_lat=${latitude}&origin_lng=${longitude}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      const hotspots = data?.hotspots || data?.traffic_hotspots || [];
      if (!Array.isArray(hotspots)) return [];
      return hotspots.map((h: any, idx: number) => ({
        id: h.id || h.zone_id || `hotspot-${idx}`,
        location: {
          latitude: h.location?.latitude ?? latitude,
          longitude: h.location?.longitude ?? longitude,
          address: h.location?.address || h.address || 'Unknown',
        },
        severity: h.severity || 'moderate',
        type: h.type || 'congestion',
        delayMinutes: Number(h.delay_minutes || h.delayMinutes || 0),
        affectedRadius: Number(h.affected_radius || radius),
        startTime: new Date(h.start_time || Date.now()),
        estimatedClearTime: h.estimated_clear_time ? new Date(h.estimated_clear_time) : undefined,
        description: h.description || '',
        verifiedReports: Number(h.verified_reports || 0),
        aiConfidence: Number(h.ai_confidence || 0),
      }));
    } catch (error) {
      console.error('Failed to get traffic status:', error);
      return [];
    }
  }

  /** Coerce API / partial objects into a safe TrafficRoute (avoids render crashes). */
  static normalizeTrafficRoute(raw: unknown): TrafficRoute | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const levels = ['light', 'moderate', 'heavy', 'severe'] as const;
    const levelRaw = String(r.trafficLevel ?? r.traffic_level ?? 'light').toLowerCase();
    const trafficLevel = (levels as readonly string[]).includes(levelRaw)
      ? (levelRaw as (typeof levels)[number])
      : 'light';
    const trafficDelay = Number(r.trafficDelay ?? r.traffic_delay ?? 0);
    const aiScore = Number(r.aiScore ?? r.ai_score ?? 70);
    const distance = Number(r.distance ?? 0);
    const durationWithoutTraffic = Number(r.durationWithoutTraffic ?? r.duration_without_traffic ?? 0);
    const durationWithTraffic = Number(r.durationWithTraffic ?? r.duration_with_traffic ?? 0);
    const hotspots = Array.isArray(r.hotspots) ? (r.hotspots as TrafficHotspot[]) : [];
    return {
      id: String(r.id || 'route'),
      polyline: String(r.polyline || ''),
      distance: Number.isFinite(distance) ? Math.max(0, distance) : 0,
      durationWithoutTraffic: Number.isFinite(durationWithoutTraffic) ? Math.max(0, durationWithoutTraffic) : 0,
      durationWithTraffic: Number.isFinite(durationWithTraffic) ? Math.max(0, durationWithTraffic) : 0,
      trafficDelay: Number.isFinite(trafficDelay) ? Math.max(0, trafficDelay) : 0,
      trafficLevel,
      hotspots,
      toll: Boolean(r.toll),
      tollCost:
        r.tollCost != null && Number.isFinite(Number(r.tollCost)) ? Number(r.tollCost) : undefined,
      fuelConsumption: Number.isFinite(Number(r.fuelConsumption ?? r.fuel_consumption))
        ? Number(r.fuelConsumption ?? r.fuel_consumption)
        : 0,
      aiScore: Number.isFinite(aiScore) ? Math.min(100, Math.max(0, Math.round(aiScore))) : 70,
      timeSavedVsAlternative:
        r.timeSavedVsAlternative != null && Number.isFinite(Number(r.timeSavedVsAlternative))
          ? Number(r.timeSavedVsAlternative)
          : undefined,
    };
  }

  /**
   * Get AI-optimized routes with traffic analysis
   */
  static async getOptimizedRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    preferences?: {
      avoidTolls?: boolean;
      avoidHighways?: boolean;
      prioritizeFuel?: boolean;
      prioritizeTime?: boolean;
    }
  ): Promise<TrafficRoute[]> {
    const ola = Number(origin.latitude);
    const olo = Number(origin.longitude);
    const dla = Number(destination.latitude);
    const dlo = Number(destination.longitude);
    if (![ola, olo, dla, dlo].every(Number.isFinite)) {
      return [];
    }
    const originN = { latitude: ola, longitude: olo };
    const destinationN = { latitude: dla, longitude: dlo };
    try {
      const response = await fetch(`${BACKEND_URL}/api/traffic/optimize-routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: originN, destination: destinationN, preferences }),
      });
      if (!response.ok) {
        return await this.buildFallbackOptimizedRoutes(originN, destinationN, preferences);
      }
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data?.routes) && data.routes.length > 0) {
        const cleaned = (data.routes as unknown[])
          .map((row) => this.normalizeTrafficRoute(row))
          .filter((x): x is TrafficRoute => x != null);
        if (cleaned.length) return cleaned;
      }
      return await this.buildFallbackOptimizedRoutes(originN, destinationN, preferences);
    } catch (error) {
      console.error('Failed to get optimized routes:', error);
      return await this.buildFallbackOptimizedRoutes(originN, destinationN, preferences);
    }
  }

  /**
   * Get traffic predictions for the next hour
   */
  static async getTrafficPredictions(
    locations: Array<{ latitude: number; longitude: number; name: string }>
  ): Promise<TrafficPrediction[]> {
    try {
      const predictions = await Promise.all(
        locations.map(async (location) => {
          const hotspots = await this.getTrafficStatus(location.latitude, location.longitude, 4000);
          const maxDelay = hotspots.reduce((m, h) => Math.max(m, h.delayMinutes), 0);
          const currentLevel = this.getTrafficLevel(maxDelay) as 'light' | 'moderate' | 'heavy' | 'severe';
          return {
            location,
            currentLevel,
            predictedLevel: currentLevel,
            predictionTime: new Date(Date.now() + 30 * 60 * 1000),
            confidence: hotspots.length ? 70 : 0,
            factors: hotspots.length ? ['live traffic feed'] : [],
          };
        })
      );
      return predictions;
    } catch (error) {
      console.error('Failed to get traffic predictions:', error);
      return [];
    }
  }

  /**
   * Get real-time traffic alerts for driver
   */
  static async getTrafficAlerts(
    driverId: string,
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number }
  ): Promise<TrafficAlert[]> {
    try {
      const hotspots = await this.getTrafficStatus(
        currentLocation.latitude,
        currentLocation.longitude,
        10000 // 10km radius
      );

      return this.generateAlertsFromHotspots(hotspots, currentLocation, destination);
    } catch (error) {
      console.error('Failed to get traffic alerts:', error);
      return [];
    }
  }

  /**
   * Calculate time saved by using AI route vs standard route
   */
  static calculateTimeSaved(aiRoute: TrafficRoute, standardDuration: number): number {
    const std = Number(standardDuration);
    const dwt = Number(aiRoute?.durationWithTraffic);
    if (!Number.isFinite(std) || !Number.isFinite(dwt)) return 0;
    return Math.max(0, std - dwt);
  }

  /**
   * Get traffic level from delay minutes
   */
  static getTrafficLevel(delayMinutes: number): 'light' | 'moderate' | 'heavy' | 'severe' {
    const m = Number(delayMinutes);
    if (!Number.isFinite(m) || m < 0) return 'light';
    if (m < 5) return 'light';
    if (m < 15) return 'moderate';
    if (m < 30) return 'heavy';
    return 'severe';
  }

  /**
   * Format delay time for display
   */
  static formatDelay(delaySeconds: number): string {
    const sec = Number(delaySeconds);
    if (!Number.isFinite(sec)) return 'No delay';
    const minutes = Math.round(sec / 60);
    if (minutes < 1) return 'No delay';
    if (minutes === 1) return '1 min delay';
    if (minutes < 60) return `${minutes} mins delay`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m delay`;
  }

  /**
   * Get traffic color for visualization
   */
  static getTrafficColor(level: 'light' | 'moderate' | 'heavy' | 'severe'): string {
    return this.TRAFFIC_COLORS[level];
  }

  private static async buildFallbackOptimizedRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    preferences?: {
      avoidTolls?: boolean;
      avoidHighways?: boolean;
      prioritizeFuel?: boolean;
      prioritizeTime?: boolean;
    }
  ): Promise<TrafficRoute[]> {
    if (
      ![origin.latitude, origin.longitude, destination.latitude, destination.longitude].every((n) =>
        Number.isFinite(Number(n))
      )
    ) {
      return [];
    }
    const midpoint = {
      latitude: (origin.latitude + destination.latitude) / 2,
      longitude: (origin.longitude + destination.longitude) / 2,
    };
    const hotspots = await this.getTrafficStatus(midpoint.latitude, midpoint.longitude, 8000);
    const distanceMeters = this.calculateDistance(origin, destination);
    const baseDurationSeconds = Math.max(300, Math.round((distanceMeters / 1000 / 28) * 3600));
    const totalDelaySeconds = hotspots.reduce(
      (sum, hotspot) => sum + Math.max(0, hotspot.delayMinutes) * 60,
      0
    );
    const trafficLevel = this.getTrafficLevel(totalDelaySeconds / 60);

    const fastestRoute: TrafficRoute = {
      id: 'fallback-fastest',
      polyline: '',
      distance: distanceMeters,
      durationWithoutTraffic: baseDurationSeconds,
      durationWithTraffic: baseDurationSeconds + totalDelaySeconds,
      trafficDelay: totalDelaySeconds,
      trafficLevel,
      hotspots,
      toll: !preferences?.avoidTolls,
      tollCost: preferences?.avoidTolls ? 0 : 500,
      fuelConsumption: Number(((distanceMeters / 1000) * 0.09).toFixed(2)),
      aiScore: Math.max(55, 100 - Math.round(totalDelaySeconds / 60)),
      timeSavedVsAlternative: Math.max(0, Math.round(totalDelaySeconds * 0.35)),
    };

    const alternativeDelaySeconds = totalDelaySeconds + (preferences?.prioritizeTime ? 0 : 8 * 60);
    const alternativeRoute: TrafficRoute = {
      id: 'fallback-alternative',
      polyline: '',
      distance: Math.round(distanceMeters * 1.08),
      durationWithoutTraffic: Math.round(baseDurationSeconds * 1.08),
      durationWithTraffic: Math.round(baseDurationSeconds * 1.08) + alternativeDelaySeconds,
      trafficDelay: alternativeDelaySeconds,
      trafficLevel: this.getTrafficLevel(alternativeDelaySeconds / 60),
      hotspots,
      toll: false,
      tollCost: 0,
      fuelConsumption: Number((((distanceMeters * 1.08) / 1000) * 0.085).toFixed(2)),
      aiScore: Math.max(40, fastestRoute.aiScore - 12),
      timeSavedVsAlternative: 0,
    };

    return [fastestRoute, alternativeRoute];
  }

  private static generateAlertsFromHotspots(
    hotspots: TrafficHotspot[],
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number }
  ): TrafficAlert[] {
    return hotspots.map((hotspot) => {
      const distance = this.calculateDistance(currentLocation, hotspot.location);
      
      let type: TrafficAlert['type'] = 'warning';
      let priority: TrafficAlert['priority'] = 'medium';
      
      if (hotspot.severity === 'severe') {
        type = 'avoid';
        priority = 'critical';
      } else if (hotspot.severity === 'high') {
        type = 'warning';
        priority = 'high';
      }

      return {
        id: `alert-${hotspot.id}`,
        type,
        priority,
        title: this.getAlertTitle(hotspot),
        message: hotspot.description,
        location: hotspot.location.address,
        distance: Math.round(distance),
        timestamp: new Date(),
        actionRequired: hotspot.severity === 'severe' ? 'Consider alternative route' : undefined,
      };
    });
  }

  private static getAlertTitle(hotspot: TrafficHotspot): string {
    const severityText = hotspot.severity.toUpperCase();
    const typeText = hotspot.type.charAt(0).toUpperCase() + hotspot.type.slice(1);
    return `${severityText} - ${typeText} Ahead`;
  }

  private static calculateDistance(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number {
    const la1 = Number(point1.latitude);
    const lo1 = Number(point1.longitude);
    const la2 = Number(point2.latitude);
    const lo2 = Number(point2.longitude);
    if (![la1, lo1, la2, lo2].every(Number.isFinite)) return 0;
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(la2 - la1);
    const dLon = this.toRad(lo2 - lo1);
    const lat1 = this.toRad(la1);
    const lat2 = this.toRad(la2);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

/**
 * React Hook for Traffic Intelligence
 */
export const useTrafficAI = () => {
  const [hotspots, setHotspots] = React.useState<TrafficHotspot[]>([]);
  const [routes, setRoutes] = React.useState<TrafficRoute[]>([]);
  const [alerts, setAlerts] = React.useState<TrafficAlert[]>([]);
  const [loading, setLoading] = React.useState(false);

  const fetchTrafficStatus = async (
    latitude: number,
    longitude: number,
    radius?: number
  ) => {
    setLoading(true);
    try {
      const data = await TrafficAI.getTrafficStatus(latitude, longitude, radius);
      setHotspots(data);
    } catch (error) {
      console.error('Failed to fetch traffic status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptimizedRoutes = async (
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    preferences?: any
  ) => {
    setLoading(true);
    try {
      const data = await TrafficAI.getOptimizedRoutes(origin, destination, preferences);
      setRoutes(data);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrafficAlerts = async (
    driverId: string,
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number }
  ) => {
    setLoading(true);
    try {
      const data = await TrafficAI.getTrafficAlerts(driverId, currentLocation, destination);
      setAlerts(data);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    hotspots,
    routes,
    alerts,
    loading,
    fetchTrafficStatus,
    fetchOptimizedRoutes,
    fetchTrafficAlerts,
  };
};
