/**
 * NEXRYDE AI Driving Coach
 * "Learn to drive better, earn more!" 🎓
 */

export type CoachingTip = 'speed' | 'braking' | 'acceleration' | 'fuel' | 'route' | 'timing' | 'customer';

export interface CoachingFeedback {
  type: CoachingTip;
  title: string;
  message: string;
  icon: string;
  impact: 'positive' | 'negative' | 'neutral';
  score: number; // 0-100
  improvement?: string;
}

export interface DrivingReport {
  overallScore: number; // 0-100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  feedbacks: CoachingFeedback[];
  strengths: string[];
  improvements: string[];
  projectedEarningsIncrease: number; // percentage
}

export class DrivingCoachAI {
  static analyzeDrivingSession(
    avgSpeed: number,
    suddenBrakes: number,
    smoothAccels: number,
    routeEfficiency: number,
    customerRating: number,
    tripDuration: number
  ): DrivingReport {
    const feedbacks: CoachingFeedback[] = [];
    let totalScore = 0;
    
    // Speed analysis
    const speedScore = avgSpeed >= 40 && avgSpeed <= 60 ? 90 : 70;
    feedbacks.push({
      type: 'speed',
      title: 'Speed Control',
      message: avgSpeed > 60 ? 'Slow down slightly for safety' : 'Good speed control!',
      icon: '🚗',
      impact: avgSpeed > 60 ? 'negative' : 'positive',
      score: speedScore,
      improvement: avgSpeed > 60 ? 'Maintain 50-60 km/h for optimal safety' : undefined,
    });
    totalScore += speedScore;
    
    // Braking analysis
    const brakingScore = suddenBrakes < 3 ? 95 : 65;
    feedbacks.push({
      type: 'braking',
      title: 'Smooth Braking',
      message: suddenBrakes < 3 ? 'Excellent smooth braking!' : 'Too many sudden brakes',
      icon: '🛑',
      impact: suddenBrakes < 3 ? 'positive' : 'negative',
      score: brakingScore,
      improvement: suddenBrakes >= 3 ? 'Anticipate stops, brake gradually' : undefined,
    });
    totalScore += brakingScore;
    
    // Customer service
    const customerScore = customerRating >= 4.5 ? 95 : 75;
    feedbacks.push({
      type: 'customer',
      title: 'Customer Service',
      message: customerRating >= 4.5 ? 'Riders love you!' : 'Good service, can improve',
      icon: '⭐',
      impact: customerRating >= 4.5 ? 'positive' : 'neutral',
      score: customerScore,
      improvement: customerRating < 4.5 ? 'Greet warmly, ask about temperature' : undefined,
    });
    totalScore += customerScore;
    
    const overallScore = Math.round(totalScore / feedbacks.length);
    const grade = overallScore >= 95 ? 'A+' : overallScore >= 85 ? 'A' : overallScore >= 75 ? 'B' : overallScore >= 65 ? 'C' : overallScore >= 50 ? 'D' : 'F';
    
    return {
      overallScore,
      grade,
      feedbacks,
      strengths: feedbacks.filter(f => f.impact === 'positive').map(f => f.title),
      improvements: feedbacks.filter(f => f.improvement).map(f => f.improvement!),
      projectedEarningsIncrease: (100 - overallScore) * 0.5, // 0.5% per point improvement
    };
  }
}
