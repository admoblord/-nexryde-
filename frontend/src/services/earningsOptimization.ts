/**
 * NEXRYDE Earnings Optimization AI
 * "Maximize your money!" 📈💰
 */

export interface EarningsInsight {
  type: 'hotspot' | 'timing' | 'route' | 'strategy';
  title: string;
  message: string;
  potentialIncrease: number; // percentage
  recommendation: string;
  location?: { latitude: number; longitude: number; name: string };
  timeSlot?: string;
}

export interface EarningsOptimization {
  currentRate: number; // per hour
  optimizedRate: number; // potential
  improvement: number; // percentage
  insights: EarningsInsight[];
  bestHotspots: Array<{ name: string; avgEarnings: number; distance: number }>;
  bestTimes: Array<{ time: string; avgEarnings: number; demand: string }>;
}

export class EarningsOptimizationAI {
  static analyzeEarnings(
    currentLocation: { latitude: number; longitude: number },
    currentHour: number,
    weeklyEarnings: number,
    totalTrips: number
  ): EarningsOptimization {
    const insights: EarningsInsight[] = [];
    const currentRate = weeklyEarnings / 40; // Assume 40 hours/week
    
    // Hotspot analysis
    if (currentLocation.latitude < 6.5) {
      insights.push({
        type: 'hotspot',
        title: '🗺️ Better Hotspot Nearby',
        message: 'VI area has 40% higher demand right now',
        potentialIncrease: 40,
        recommendation: 'Drive to Victoria Island - high demand area',
        location: { latitude: 6.4281, longitude: 3.4219, name: 'Victoria Island' },
      });
    }
    
    // Timing analysis
    if (currentHour < 7 || currentHour > 9) {
      insights.push({
        type: 'timing',
        title: '⏰ Peak Hours Coming',
        message: 'Morning rush (6-9 AM) earns 50% more',
        potentialIncrease: 50,
        recommendation: 'Start driving before 6 AM tomorrow',
        timeSlot: '06:00 - 09:00',
      });
    }
    
    // Strategy analysis
    if (totalTrips < 10) {
      insights.push({
        type: 'strategy',
        title: '💡 Accept More Short Rides',
        message: 'Short rides = more trips = more earnings',
        potentialIncrease: 25,
        recommendation: 'Enable Smart Mode for rides < 5km',
      });
    }
    
    const optimizedRate = currentRate * 1.35; // 35% improvement potential
    
    return {
      currentRate,
      optimizedRate,
      improvement: 35,
      insights,
      bestHotspots: [
        { name: 'Victoria Island', avgEarnings: 3500, distance: 5.2 },
        { name: 'Lekki Phase 1', avgEarnings: 3200, distance: 8.1 },
        { name: 'Ikeja GRA', avgEarnings: 2900, distance: 3.5 },
      ],
      bestTimes: [
        { time: '06:00 - 09:00', avgEarnings: 4200, demand: 'Very High' },
        { time: '17:00 - 20:00', avgEarnings: 3800, demand: 'High' },
        { time: '12:00 - 14:00', avgEarnings: 2500, demand: 'Medium' },
      ],
    };
  }
}

/**
 * Fetch AI-powered earnings prediction from backend (uses Emergent LLM Key → GPT-4o)
 */
export async function fetchAIEarningsPrediction(driverId: string): Promise<{
  predicted_daily: number; predicted_weekly: number; recommendations: string[]; powered_by: string;
} | null> {
  try {
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const response = await fetch(`${BACKEND_URL}/api/ai/earnings-predictor/${driverId}`);
    const data = await response.json();
    return data.success ? {
      predicted_daily: data.predicted_daily || 0,
      predicted_weekly: data.predicted_weekly || 0,
      recommendations: data.recommendations || [],
      powered_by: data.powered_by || 'gpt-4o',
    } : null;
  } catch (error) {
    console.error('AI earnings fetch failed:', error);
    return null;
  }
}
