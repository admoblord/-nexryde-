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
    try {
      const response = await fetch(`${BACKEND_URL}/api/traffic/optimize-routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, preferences }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.routes) ? data.routes : [];
    } catch (error) {
      console.error('Failed to get optimized routes:', error);
      return [];
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
    return Math.max(0, standardDuration - aiRoute.durationWithTraffic);
  }

  /**
   * Get traffic level from delay minutes
   */
  static getTrafficLevel(delayMinutes: number): 'light' | 'moderate' | 'heavy' | 'severe' {
    if (delayMinutes < 5) return 'light';
    if (delayMinutes < 15) return 'moderate';
    if (delayMinutes < 30) return 'heavy';
    return 'severe';
  }

  /**
   * Format delay time for display
   */
  static formatDelay(delaySeconds: number): string {
    const minutes = Math.round(delaySeconds / 60);
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
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(point2.latitude - point1.latitude);
    const dLon = this.toRad(point2.longitude - point1.longitude);
    const lat1 = this.toRad(point1.latitude);
    const lat2 = this.toRad(point2.latitude);

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
