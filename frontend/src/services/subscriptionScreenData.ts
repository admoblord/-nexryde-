import { apiFetch } from '@/src/utils/sessionRefresh';

export interface PricingData {
  city_rider: {
    current_price: number;
    current_phase: string;
    launch_slots_remaining: number;
  };
  road_warrior: {
    current_price: number;
    current_phase: string;
    launch_slots_remaining: number;
  };
}

export interface SubscriptionStatus {
  tier: 'city_rider' | 'road_warrior' | 'none';
  status: 'none' | 'trial' | 'active' | 'expired' | 'pending_verification' | 'pending_payment' | 'grace_period';
  monthly_price: number;
  trial_active: boolean;
  trial_trips_completed?: number;
  trial_trips_remaining?: number;
  trial_trips_target?: number;
  trial_progress_pct?: number;
  trial_extended?: boolean;
  trial_extension_count?: number;
  trial_completed?: boolean;
  trial_urgency?: 'normal' | 'warning' | 'critical' | 'expired';
  trial_message?: string;
  trial_day_limit?: number | null;
  trial_days_remaining?: number | null;
  trial_emphasis?: 'trips' | 'days';
  early_subscribe_discount_ngn?: number;
  early_subscribe_first_month_fee_ngn?: number;
  early_subscribe_message?: string;
  days_remaining?: number;
  can_upgrade: boolean;
  upgrade_requirements?: {
    rating_met: boolean;
    trips_met: boolean;
    current_rating: number;
    current_trips: number;
  };
}

export type SubscriptionScreenData = {
  pricing: PricingData;
  subscription: SubscriptionStatus;
};

const DEFAULT_PRICING: PricingData = {
  city_rider: { current_price: 18000, current_phase: 'early', launch_slots_remaining: 450 },
  road_warrior: { current_price: 30000, current_phase: 'early', launch_slots_remaining: 180 },
};

function normalizePricing(raw: Record<string, unknown>): PricingData {
  return {
    city_rider: {
      current_price: Number(raw.city_rider_price ?? raw.monthly_fee ?? raw.current_price ?? 18000),
      current_phase: String(raw.city_rider_phase ?? raw.current_phase ?? 'early'),
      launch_slots_remaining: Number(raw.city_rider_launch_slots_remaining ?? raw.launch_slots_remaining ?? 0),
    },
    road_warrior: {
      current_price: Number(raw.road_warrior_price ?? 30000),
      current_phase: String(raw.road_warrior_phase ?? raw.current_phase ?? 'early'),
      launch_slots_remaining: Number(raw.road_warrior_launch_slots_remaining ?? 0),
    },
  };
}

function normalizeSubscription(raw: Record<string, unknown>, pricing: PricingData): SubscriptionStatus {
  const normalizedStatus = (raw.status as SubscriptionStatus['status']) || 'none';
  const activeOrPending = ['trial', 'active', 'grace_period', 'pending_payment', 'pending_verification'].includes(
    normalizedStatus,
  );
  const tier = activeOrPending ? ((raw.tier as SubscriptionStatus['tier']) || 'city_rider') : 'none';

  return {
    tier,
    status: normalizedStatus,
    monthly_price: Number(raw.amount_expected ?? pricing.city_rider.current_price),
    trial_active: Boolean(raw.trial_active || raw.status === 'trial'),
    trial_trips_completed: Number(raw.trial_trips_completed ?? 0),
    trial_trips_remaining: raw.trial_trips_remaining != null ? Number(raw.trial_trips_remaining) : undefined,
    trial_trips_target: Number(raw.trial_trips_target ?? 15),
    trial_progress_pct: Number(raw.trial_progress_pct ?? 0),
    trial_extended: Boolean(raw.trial_extended ?? false),
    trial_extension_count: Number(raw.trial_extension_count ?? 0),
    trial_completed: Boolean(raw.trial_completed ?? false),
    trial_urgency: (raw.trial_urgency as SubscriptionStatus['trial_urgency']) ?? 'normal',
    trial_message: String(raw.trial_message ?? ''),
    trial_day_limit: raw.trial_day_limit != null ? Number(raw.trial_day_limit) : null,
    trial_days_remaining:
      raw.trial_days_remaining != null
        ? Number(raw.trial_days_remaining)
        : raw.days_remaining != null
          ? Number(raw.days_remaining)
          : undefined,
    trial_emphasis: raw.trial_emphasis === 'days' ? 'days' : 'trips',
    early_subscribe_discount_ngn:
      raw.early_subscribe_discount_ngn != null ? Number(raw.early_subscribe_discount_ngn) : undefined,
    early_subscribe_first_month_fee_ngn:
      raw.early_subscribe_first_month_fee_ngn != null
        ? Number(raw.early_subscribe_first_month_fee_ngn)
        : undefined,
    early_subscribe_message: raw.early_subscribe_message ? String(raw.early_subscribe_message) : undefined,
    days_remaining: raw.days_remaining != null ? Number(raw.days_remaining) : undefined,
    can_upgrade: Boolean(raw.can_upgrade ?? (raw.status === 'active' || raw.status === 'trial')),
    upgrade_requirements: raw.upgrade_requirements as SubscriptionStatus['upgrade_requirements'],
  };
}

export async function fetchSubscriptionScreenData(): Promise<SubscriptionScreenData> {
  const [configRes, statusRes] = await Promise.all([
    apiFetch('/subscriptions/config'),
    apiFetch('/driver/subscription-status'),
  ]);

  let pricing = DEFAULT_PRICING;
  if (configRes.ok) {
    const configJson = (await configRes.json().catch(() => ({}))) as Record<string, unknown>;
    pricing = normalizePricing(configJson);
  }

  let statusJson: Record<string, unknown> = {};
  if (statusRes.ok) {
    statusJson = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
  } else if (statusRes.status >= 500) {
    throw new Error('subscription_failed');
  } else {
    statusJson = { status: 'none' };
  }

  return {
    pricing,
    subscription: normalizeSubscription(statusJson, pricing),
  };
}
