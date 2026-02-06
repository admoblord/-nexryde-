/**
 * NEXRYDE Predictive Maintenance AI
 * "Fix it before it breaks!" 🔧
 */

export interface VehicleHealth {
  overall: number; // 0-100
  engine: number;
  brakes: number;
  tires: number;
  battery: number;
  transmission: number;
  suspension: number;
}

export interface MaintenanceAlert {
  id: string;
  component: string;
  severity: 'info' | 'warning' | 'urgent' | 'critical';
  message: string;
  daysUntilIssue: number;
  estimatedCost: number;
  recommendation: string;
  canDriveNow: boolean;
}

export class PredictiveMaintenanceAI {
  static analyzeVehicle(mileage: number, lastServiceDate: number, tripCount: number): { health: VehicleHealth; alerts: MaintenanceAlert[] } {
    const daysSinceService = Math.floor((Date.now() - lastServiceDate) / (24 * 60 * 60 * 1000));
    const alerts: MaintenanceAlert[] = [];
    
    // Engine analysis
    if (mileage > 100000 || daysSinceService > 180) {
      alerts.push({
        id: '1',
        component: 'Engine Oil',
        severity: mileage > 120000 ? 'urgent' : 'warning',
        message: 'Engine oil change needed',
        daysUntilIssue: 7,
        estimatedCost: 8000,
        recommendation: 'Schedule oil change within 7 days',
        canDriveNow: true,
      });
    }
    
    // Brake analysis
    if (tripCount > 500) {
      alerts.push({
        id: '2',
        component: 'Brake Pads',
        severity: 'warning',
        message: 'Brake pads wearing thin',
        daysUntilIssue: 14,
        estimatedCost: 25000,
        recommendation: 'Check brake pads soon',
        canDriveNow: true,
      });
    }
    
    // Tire analysis
    if (mileage % 40000 < 1000) {
      alerts.push({
        id: '3',
        component: 'Tires',
        severity: 'info',
        message: 'Tire rotation recommended',
        daysUntilIssue: 30,
        estimatedCost: 5000,
        recommendation: 'Rotate tires for even wear',
        canDriveNow: true,
      });
    }
    
    const health: VehicleHealth = {
      overall: 85 - (alerts.length * 10),
      engine: 90 - (daysSinceService / 10),
      brakes: 88 - (tripCount / 100),
      tires: 85,
      battery: 80,
      transmission: 90,
      suspension: 85,
    };
    
    return { health, alerts };
  }
}

/** Fetch AI driver awareness insights from backend (Emergent LLM → GPT-4o) */
export async function fetchAIDriverAwareness(): Promise<any> {
  try {
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const res = await fetch(`${BACKEND_URL}/api/driver/awareness`);
    return await res.json();
  } catch { return null; }
}
