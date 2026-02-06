/**
 * NEXRYDE "Area Boy" & Community Safety Alert System
 * Nigeria-specific safety feature for dangerous areas, checkpoints, and harassment zones
 */

export interface DangerZone {
  id: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    landmark?: string;
  };
  type: 'area_boys' | 'checkpoint' | 'toll_delay' | 'harassment' | 'robbery' | 'accident_prone' | 'flooding';
  severity: 'low' | 'moderate' | 'high' | 'critical';
  activeTime: {
    start: number; // hour (0-23)
    end: number; // hour (0-23)
    allDay: boolean;
  };
  description: string;
  reports: DangerReport[];
  verifiedReports: number;
  lastReportTime: Date;
  aiConfidence: number; // 0-100
  communityRating: number; // 0-5 stars
  affectedRadius: number; // meters
  safeAlternatives?: string[];
}

export interface DangerReport {
  id: string;
  userId: string;
  userName: string;
  userRole: 'driver' | 'rider';
  timestamp: Date;
  incidentType: DangerZone['type'];
  severity: DangerZone['severity'];
  description: string;
  verified: boolean;
  upvotes: number;
  downvotes: number;
  photos?: string[];
}

export interface SafetyAlert {
  id: string;
  type: 'warning' | 'danger' | 'info' | 'checkpoint';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  zone: DangerZone;
  distance: number; // meters from user
  timeRelevant: boolean; // if active now
  actionRequired: string;
  alternativeRoutes?: SafeRoute[];
}

export interface SafeRoute {
  id: string;
  name: string;
  safetyScore: number; // 0-100 (100 = safest)
  distanceIncrease: number; // extra meters
  timeIncrease: number; // extra seconds
  dangerZonesAvoided: number;
  landmarks: string[];
}

export interface AreaSafetyReport {
  location: {
    latitude: number;
    longitude: number;
    name: string;
  };
  overallSafety: 'very_safe' | 'safe' | 'moderate' | 'unsafe' | 'very_unsafe';
  safetyScore: number; // 0-100
  dangerZones: DangerZone[];
  recentIncidents: number;
  lastIncidentTime?: Date;
  recommendation: string;
  bestTimeToTravel?: string;
}

export class AreaBoySafety {
  // Safety Score Colors
  static readonly SAFETY_COLORS = {
    very_safe: '#00D084',    // Green
    safe: '#00B471',         // Light Green
    moderate: '#FFB800',     // Yellow
    unsafe: '#FF6B00',       // Orange
    very_unsafe: '#FF0000',  // Red
  };

  // Danger Type Icons & Colors
  static readonly DANGER_TYPES = {
    area_boys: { icon: 'warning', color: '#FF0000', label: 'Area Boys' },
    checkpoint: { icon: 'shield-checkmark', color: '#FFB800', label: 'Checkpoint' },
    toll_delay: { icon: 'time', color: '#FF6B00', label: 'Toll Delay' },
    harassment: { icon: 'alert-circle', color: '#FF0000', label: 'Harassment' },
    robbery: { icon: 'skull', color: '#8B0000', label: 'Robbery Risk' },
    accident_prone: { icon: 'car-sport', color: '#FF6B00', label: 'Accident Prone' },
    flooding: { icon: 'water', color: '#0096C7', label: 'Flooding' },
  };

  /**
   * Get danger zones near location
   */
  static async getDangerZones(
    latitude: number,
    longitude: number,
    radius: number = 10000 // 10km default
  ): Promise<DangerZone[]> {
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const response = await fetch(`${BACKEND_URL}/api/safety/danger-zones?lat=${latitude}&lng=${longitude}&radius=${radius}`);
      const data = await response.json();
      
      if (data.success && data.zones?.length > 0) {
        // Map backend format to frontend DangerZone format
        return data.zones.map((z: any) => ({
          id: z.zone_id || z._id,
          location: {
            latitude: z.location?.latitude || 0,
            longitude: z.location?.longitude || 0,
            address: z.location?.address || 'Unknown',
            landmark: z.location?.landmark,
          },
          type: z.type || 'area_boys',
          severity: z.severity || 'moderate',
          activeTime: {
            start: z.active_time?.start || 0,
            end: z.active_time?.end || 23,
            allDay: z.active_time?.all_day || false,
          },
          description: z.description || '',
          reports: [],
          verifiedReports: z.verified_reports || 0,
          lastReportTime: new Date(z.last_report_time || Date.now()),
          aiConfidence: z.ai_confidence || 70,
          communityRating: z.community_rating || 3.0,
          affectedRadius: z.affected_radius || 300,
          safeAlternatives: z.safe_alternatives || [],
        }));
      }
      
      // Fallback to simulated data if backend unavailable
      return this.simulateLagosDangerZones(latitude, longitude);
    } catch (error) {
      console.error('Failed to get danger zones:', error);
      return this.simulateLagosDangerZones(latitude, longitude);
    }
  }

  /**
   * Get safety alerts for driver's current route
   */
  static async getSafetyAlerts(
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number },
    driverId?: string
  ): Promise<SafetyAlert[]> {
    try {
      const dangerZones = await this.getDangerZones(
        currentLocation.latitude,
        currentLocation.longitude,
        15000 // 15km for route planning
      );

      return this.generateAlertsFromZones(dangerZones, currentLocation, destination);
    } catch (error) {
      console.error('Failed to get safety alerts:', error);
      return [];
    }
  }

  /**
   * Get safety report for specific area
   */
  static async getAreaSafetyReport(
    latitude: number,
    longitude: number,
    name: string
  ): Promise<AreaSafetyReport> {
    try {
      const dangerZones = await this.getDangerZones(latitude, longitude, 5000);
      const safetyScore = this.calculateSafetyScore(dangerZones);
      const overallSafety = this.getSafetyLevel(safetyScore);

      const recentIncidents = dangerZones.reduce(
        (sum, zone) => sum + zone.verifiedReports,
        0
      );

      const lastIncident = dangerZones
        .map(z => z.lastReportTime)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        location: { latitude, longitude, name },
        overallSafety,
        safetyScore,
        dangerZones,
        recentIncidents,
        lastIncidentTime: lastIncident,
        recommendation: this.getRecommendation(overallSafety, dangerZones),
        bestTimeToTravel: this.getBestTimeToTravel(dangerZones),
      };
    } catch (error) {
      console.error('Failed to get area safety report:', error);
      throw error;
    }
  }

  /**
   * Report a dangerous area
   */
  static async reportDangerZone(report: Omit<DangerReport, 'id' | 'timestamp'>): Promise<boolean> {
    try {
      // In production, call backend API
      // const response = await fetch('/api/safety/report', {
      //   method: 'POST',
      //   body: JSON.stringify(report),
      // });
      // return response.ok;

      console.log('Danger zone reported:', report);
      return true;
    } catch (error) {
      console.error('Failed to report danger zone:', error);
      return false;
    }
  }

  /**
   * Get safe alternative routes avoiding danger zones
   */
  static async getSafeRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number }
  ): Promise<SafeRoute[]> {
    try {
      const dangerZones = await this.getDangerZones(origin.latitude, origin.longitude, 15000);
      
      // Simulate 3 routes with varying safety scores
      return this.simulateSafeRoutes(origin, destination, dangerZones);
    } catch (error) {
      console.error('Failed to get safe routes:', error);
      return [];
    }
  }

  /**
   * Check if zone is dangerous at current time
   */
  static isZoneDangerousNow(zone: DangerZone): boolean {
    if (zone.activeTime.allDay) return true;

    const currentHour = new Date().getHours();
    const { start, end } = zone.activeTime;

    if (start < end) {
      return currentHour >= start && currentHour < end;
    } else {
      // Crosses midnight
      return currentHour >= start || currentHour < end;
    }
  }

  /**
   * Calculate safety score (0-100)
   */
  static calculateSafetyScore(dangerZones: DangerZone[]): number {
    if (dangerZones.length === 0) return 100;

    const activeDangers = dangerZones.filter(z => this.isZoneDangerousNow(z));
    
    let score = 100;
    
    activeDangers.forEach(zone => {
      let penalty = 0;
      
      // Penalty based on severity
      switch (zone.severity) {
        case 'critical': penalty = 30; break;
        case 'high': penalty = 20; break;
        case 'moderate': penalty = 10; break;
        case 'low': penalty = 5; break;
      }
      
      // Additional penalty for area boys and robbery
      if (zone.type === 'area_boys' || zone.type === 'robbery') {
        penalty *= 1.5;
      }
      
      // Weight by community confidence
      penalty *= (zone.aiConfidence / 100);
      
      score -= penalty;
    });

    return Math.max(0, Math.round(score));
  }

  /**
   * Get safety level from score
   */
  static getSafetyLevel(score: number): AreaSafetyReport['overallSafety'] {
    if (score >= 90) return 'very_safe';
    if (score >= 70) return 'safe';
    if (score >= 50) return 'moderate';
    if (score >= 30) return 'unsafe';
    return 'very_unsafe';
  }

  /**
   * Get safety color
   */
  static getSafetyColor(level: AreaSafetyReport['overallSafety']): string {
    return this.SAFETY_COLORS[level];
  }

  /**
   * Get danger type info
   */
  static getDangerTypeInfo(type: DangerZone['type']) {
    return this.DANGER_TYPES[type];
  }

  /**
   * Format time range
   */
  static formatActiveTime(activeTime: DangerZone['activeTime']): string {
    if (activeTime.allDay) return 'All day';
    
    const formatHour = (hour: number) => {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h = hour % 12 || 12;
      return `${h}${ampm}`;
    };

    return `${formatHour(activeTime.start)} - ${formatHour(activeTime.end)}`;
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private static simulateLagosDangerZones(lat: number, lng: number): DangerZone[] {
    const currentHour = new Date().getHours();
    
    return [
      {
        id: 'dz-1',
        location: {
          latitude: 6.5244,
          longitude: 3.3792,
          address: 'Oshodi Under Bridge',
          landmark: 'Oshodi Bus Stop',
        },
        type: 'area_boys',
        severity: 'critical',
        activeTime: { start: 6, end: 22, allDay: false },
        description: 'Heavy area boy presence, especially at traffic lights. Reports of window smashing and phone snatching.',
        reports: [],
        verifiedReports: 156,
        lastReportTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        aiConfidence: 95,
        communityRating: 4.5,
        affectedRadius: 500,
        safeAlternatives: ['Use Agege Motor Road', 'Pass through Isolo'],
      },
      {
        id: 'dz-2',
        location: {
          latitude: 6.4541,
          longitude: 3.3947,
          address: 'Obalende Junction',
          landmark: 'Obalende Bus Terminal',
        },
        type: 'checkpoint',
        severity: 'moderate',
        activeTime: { start: 0, end: 23, allDay: true },
        description: 'Police checkpoint, usual delay 10-15 minutes. Evening hours worse.',
        reports: [],
        verifiedReports: 87,
        lastReportTime: new Date(Date.now() - 30 * 60 * 1000),
        aiConfidence: 88,
        communityRating: 3.8,
        affectedRadius: 300,
      },
      {
        id: 'dz-3',
        location: {
          latitude: 6.4968,
          longitude: 3.3731,
          address: 'CMS Under Bridge',
          landmark: 'CMS Bus Stop',
        },
        type: 'harassment',
        severity: 'high',
        activeTime: { start: 18, end: 6, allDay: false },
        description: 'Area boys active at night. Harassment of drivers, especially taxis and ride-hailing.',
        reports: [],
        verifiedReports: 92,
        lastReportTime: new Date(Date.now() - 4 * 60 * 60 * 1000),
        aiConfidence: 92,
        communityRating: 4.2,
        affectedRadius: 400,
        safeAlternatives: ['Use Eko Bridge', 'Pass Marina during day'],
      },
      {
        id: 'dz-4',
        location: {
          latitude: 6.4281,
          longitude: 3.4219,
          address: 'Lekki Toll Gate',
          landmark: 'Lekki Toll Plaza',
        },
        type: 'toll_delay',
        severity: 'moderate',
        activeTime: { start: 7, end: 10, allDay: false },
        description: 'Long toll queue during morning rush. 20-30 minutes delay typical.',
        reports: [],
        verifiedReports: 134,
        lastReportTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
        aiConfidence: 90,
        communityRating: 4.0,
        affectedRadius: 1000,
      },
      {
        id: 'dz-5',
        location: {
          latitude: 6.5027,
          longitude: 3.3748,
          address: 'Ojuelegba Junction',
          landmark: 'Ojuelegba Bus Stop',
        },
        type: 'robbery',
        severity: 'critical',
        activeTime: { start: 22, end: 6, allDay: false },
        description: 'High robbery risk at night. Multiple reports of phone and cash theft at traffic lights.',
        reports: [],
        verifiedReports: 78,
        lastReportTime: new Date(Date.now() - 12 * 60 * 60 * 1000),
        aiConfidence: 85,
        communityRating: 4.8,
        affectedRadius: 600,
        safeAlternatives: ['Avoid at night', 'Use Ikorodu Road', 'Take Ojota route'],
      },
    ];
  }

  private static generateAlertsFromZones(
    zones: DangerZone[],
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number }
  ): SafetyAlert[] {
    return zones
      .filter(zone => this.isZoneDangerousNow(zone))
      .map(zone => {
        const distance = this.calculateDistance(currentLocation, zone.location);
        
        let type: SafetyAlert['type'] = 'warning';
        let priority: SafetyAlert['priority'] = 'medium';
        
        if (zone.type === 'area_boys' || zone.type === 'robbery') {
          type = 'danger';
          priority = zone.severity === 'critical' ? 'critical' : 'high';
        } else if (zone.type === 'checkpoint') {
          type = 'checkpoint';
          priority = 'medium';
        }

        return {
          id: `alert-${zone.id}`,
          type,
          priority,
          title: this.getAlertTitle(zone),
          message: zone.description,
          zone,
          distance: Math.round(distance),
          timeRelevant: this.isZoneDangerousNow(zone),
          actionRequired: this.getActionRequired(zone),
        };
      })
      .sort((a, b) => {
        // Sort by priority then distance
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.distance - b.distance;
      });
  }

  private static getAlertTitle(zone: DangerZone): string {
    const typeInfo = this.DANGER_TYPES[zone.type];
    return `${zone.severity.toUpperCase()} - ${typeInfo.label}`;
  }

  private static getActionRequired(zone: DangerZone): string {
    if (zone.type === 'area_boys' || zone.type === 'robbery') {
      return zone.severity === 'critical' 
        ? '🚨 AVOID THIS AREA - Take alternative route'
        : '⚠️ Drive with caution - Lock doors, close windows';
    }
    if (zone.type === 'checkpoint') {
      return '⏰ Expect 10-15 min delay - Have documents ready';
    }
    if (zone.type === 'toll_delay') {
      return '⏰ Long queue expected - Consider alternative';
    }
    return '⚠️ Proceed with caution';
  }

  private static getRecommendation(
    safety: AreaSafetyReport['overallSafety'],
    zones: DangerZone[]
  ): string {
    if (safety === 'very_safe') {
      return '✅ Area is safe for travel. Normal precautions apply.';
    }
    if (safety === 'safe') {
      return '👍 Generally safe area. Stay alert and follow traffic rules.';
    }
    if (safety === 'moderate') {
      const activeZones = zones.filter(z => this.isZoneDangerousNow(z));
      return `⚠️ ${activeZones.length} danger zone(s) reported. Lock doors, avoid stopping.`;
    }
    if (safety === 'unsafe') {
      return '🚨 Multiple danger zones active. Consider alternative route or wait.';
    }
    return '❌ VERY UNSAFE - Do not travel through this area. Find alternative route.';
  }

  private static getBestTimeToTravel(zones: DangerZone[]): string | undefined {
    const nightDangers = zones.filter(
      z => (z.type === 'area_boys' || z.type === 'robbery') && 
           (z.activeTime.start >= 18 || z.activeTime.end <= 6)
    );
    
    if (nightDangers.length > 0) {
      return '☀️ Best to travel during daytime (7 AM - 6 PM)';
    }
    
    const rushHourDangers = zones.filter(
      z => z.type === 'toll_delay' || z.type === 'checkpoint'
    );
    
    if (rushHourDangers.length > 0) {
      return '⏰ Avoid rush hours (7-10 AM, 5-8 PM)';
    }
    
    return undefined;
  }

  private static simulateSafeRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    dangerZones: DangerZone[]
  ): SafeRoute[] {
    return [
      {
        id: 'safe-route-1',
        name: 'Safest Route',
        safetyScore: 95,
        distanceIncrease: 2000, // 2km extra
        timeIncrease: 300, // 5 mins extra
        dangerZonesAvoided: dangerZones.filter(z => z.severity === 'critical').length,
        landmarks: ['Pass through VI', 'Use Lekki-Ikoyi Link'],
      },
      {
        id: 'safe-route-2',
        name: 'Balanced Route',
        safetyScore: 75,
        distanceIncrease: 500,
        timeIncrease: 120,
        dangerZonesAvoided: dangerZones.filter(z => z.severity === 'high' || z.severity === 'critical').length,
        landmarks: ['Through Adeniji Adele', 'Avoid Oshodi'],
      },
      {
        id: 'safe-route-3',
        name: 'Fastest Route',
        safetyScore: 60,
        distanceIncrease: 0,
        timeIncrease: 0,
        dangerZonesAvoided: 0,
        landmarks: ['Direct route', 'Some danger zones'],
      },
    ];
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
 * React Hook for Area Boy Safety
 */
export const useAreaBoySafety = () => {
  const [dangerZones, setDangerZones] = React.useState<DangerZone[]>([]);
  const [safetyAlerts, setSafetyAlerts] = React.useState<SafetyAlert[]>([]);
  const [areaSafety, setAreaSafety] = React.useState<AreaSafetyReport | null>(null);
  const [loading, setLoading] = React.useState(false);

  const fetchDangerZones = async (
    latitude: number,
    longitude: number,
    radius?: number
  ) => {
    setLoading(true);
    try {
      const zones = await AreaBoySafety.getDangerZones(latitude, longitude, radius);
      setDangerZones(zones);
    } catch (error) {
      console.error('Failed to fetch danger zones:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSafetyAlerts = async (
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number },
    driverId?: string
  ) => {
    setLoading(true);
    try {
      const alerts = await AreaBoySafety.getSafetyAlerts(currentLocation, destination, driverId);
      setSafetyAlerts(alerts);
    } catch (error) {
      console.error('Failed to fetch safety alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAreaSafety = async (
    latitude: number,
    longitude: number,
    name: string
  ) => {
    setLoading(true);
    try {
      const report = await AreaBoySafety.getAreaSafetyReport(latitude, longitude, name);
      setAreaSafety(report);
    } catch (error) {
      console.error('Failed to check area safety:', error);
    } finally {
      setLoading(false);
    }
  };

  const reportDanger = async (report: Omit<DangerReport, 'id' | 'timestamp'>) => {
    return await AreaBoySafety.reportDangerZone(report);
  };

  return {
    dangerZones,
    safetyAlerts,
    areaSafety,
    loading,
    fetchDangerZones,
    fetchSafetyAlerts,
    checkAreaSafety,
    reportDanger,
  };
};

// Fix import
import React from 'react';
