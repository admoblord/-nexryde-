/** Backend stores average of driver ratings of this rider (`users.rating` for rider role). */
export type RiderBadgeId = 'first_ride' | 'rides_100' | 'five_star_rider';

export interface RiderAchievementBadgeMeta {
  id: RiderBadgeId;
  /** expo Ionicons glyph name */
  icon: 'flag' | 'trophy' | 'star';
  title: string;
  description: string;
  accent: string;
}

export const RIDER_BADGE_META: RiderAchievementBadgeMeta[] = [
  {
    id: 'first_ride',
    icon: 'flag',
    title: 'First Ride',
    description: 'You completed your first NEXRYDE trip.',
    accent: '#22C55E',
  },
  {
    id: 'rides_100',
    icon: 'trophy',
    title: '100 Rides',
    description: '100 completed trips as a rider.',
    accent: '#F59E0B',
  },
  {
    id: 'five_star_rider',
    icon: 'star',
    title: '5★ Rider',
    description: 'Average rider rating holds at five stars.',
    accent: '#E879F9',
  },
];

const MIN_DRIVER_RATINGS_FOR_FIVE_STAR_BADGE = 5;

/** `Math.round`-style to one decimal matching profile display “5.0”. */
export function qualifiesFiveStarBadge(rating: number, riderReputationTripCount?: number): boolean {
  const count = riderReputationTripCount ?? 0;
  if (count < MIN_DRIVER_RATINGS_FOR_FIVE_STAR_BADGE) return false;
  return Math.round(Number(rating || 0) * 10) / 10 >= 5.0;
}

export function computeEarnedRiderBadgeIds(stats: {
  totalTrips: number;
  rating: number;
  riderReputationTripCount?: number;
}): Set<RiderBadgeId> {
  const earned = new Set<RiderBadgeId>();
  if (stats.totalTrips >= 1) earned.add('first_ride');
  if (stats.totalTrips >= 100) earned.add('rides_100');
  if (qualifiesFiveStarBadge(stats.rating, stats.riderReputationTripCount)) earned.add('five_star_rider');
  return earned;
}

export type RiderBadgeGoal = {
  badgeId: RiderBadgeId;
  title: string;
  accent: string;
  /** 0–1 progress toward unlocking this badge */
  progress: number;
  detail: string;
};

/** Next badge the rider is working toward; null when all three are earned. */
export function getNextRiderBadgeGoal(stats: {
  totalTrips: number;
  rating: number;
  riderReputationTripCount?: number;
}): RiderBadgeGoal | null {
  const earned = computeEarnedRiderBadgeIds(stats);
  const meta = (id: RiderBadgeId) => RIDER_BADGE_META.find((b) => b.id === id)!;

  if (!earned.has('first_ride')) {
    const m = meta('first_ride');
    return {
      badgeId: m.id,
      title: m.title,
      accent: m.accent,
      progress: Math.min(1, Math.max(0, stats.totalTrips)),
      detail: 'Book and complete your first trip',
    };
  }

  if (!earned.has('rides_100')) {
    const m = meta('rides_100');
    const remaining = Math.max(0, 100 - stats.totalTrips);
    return {
      badgeId: m.id,
      title: m.title,
      accent: m.accent,
      progress: Math.min(1, stats.totalTrips / 100),
      detail: remaining === 0 ? 'Almost there' : `${remaining} trip${remaining === 1 ? '' : 's'} to go`,
    };
  }

  if (!earned.has('five_star_rider')) {
    const m = meta('five_star_rider');
    const count = stats.riderReputationTripCount ?? 0;
    const need = Math.max(0, MIN_DRIVER_RATINGS_FOR_FIVE_STAR_BADGE - count);
    const ratingOk = Math.round(Number(stats.rating || 0) * 10) / 10 >= 5.0;
    return {
      badgeId: m.id,
      title: m.title,
      accent: m.accent,
      progress: Math.min(1, count / MIN_DRIVER_RATINGS_FOR_FIVE_STAR_BADGE),
      detail:
        need > 0
          ? `${need} more driver rating${need === 1 ? '' : 's'}`
          : ratingOk
            ? 'Keep your 5.0★ average'
            : 'Hold a 5.0★ average after 5 ratings',
    };
  }

  return null;
}

/** Full WhatsApp body: achievement line + referral CTA (invite URL appended by caller). */
export function buildAchievementWhatsAppMessage(
  badgeId: RiderBadgeId,
  opts: {
    displayName: string;
    tripCount: number;
    inviteUrl: string;
  },
): string {
  const url = (opts.inviteUrl || '').trim();
  const inviteLine = url
    ? `Join with my invite link — we both earn ₦500 after your first ride:\n${url}`
    : 'Download NEXRYDE for rides in Nigeria — smart matching & fair fares.';

  switch (badgeId) {
    case 'first_ride': {
      const first = (opts.displayName || '').trim().split(/\s+/)[0] || 'I';
      return `${first} just completed their first NEXRYDE ride! 🚗\n\n${inviteLine}`;
    }
    case 'rides_100':
      return `I just completed 100 rides on NEXRYDE! 🎉\n\n${inviteLine}`;
    case 'five_star_rider':
      return `I'm a 5★ rider on NEXRYDE! ⭐\n\n${inviteLine}`;
    default:
      return `I'm riding with NEXRYDE! 🚗\n\n${inviteLine}`;
  }
}

