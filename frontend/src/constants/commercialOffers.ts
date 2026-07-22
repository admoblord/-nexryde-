/**
 * Commercial / legal copy numbers — must match backend enforcement.
 *
 * Sources of truth:
 * - Trial + monthly fee: `backend/driver_trial_policy.py` `_BUILTIN_DEFAULTS`
 * - Tier launch prices: `backend/routers/payments.py` CITY_RIDER_PRICES / ROAD_WARRIOR_PRICES
 * - Promo credits + referral: `backend/routers/incentives.py`
 * - First-ride fare %: `backend/server.py` PROMO_CONFIG + trips fare path
 * - Support contact: Support screen / privacy policy
 */

export const SUPPORT_EMAIL = 'admin@admoblordgroup.com';
export const SUPPORT_PHONE_DISPLAY = '+234 808 929 7811';
export const SUPPORT_PHONE_E164 = '+2348089297811';

/** Standard monthly subscription (after launch / early-subscribe window). */
export const MONTHLY_FEE_NGN = 18_000;
/** First-month fee when driver subscribes during free trial. */
export const EARLY_SUBSCRIBE_FEE_NGN = 15_000;
export const EARLY_SUBSCRIBE_DISCOUNT_NGN = 3_000;

/** Free trial for newly verified drivers (whichever comes first). */
export const TRIAL_TRIPS_TARGET = 15;
export const TRIAL_DAY_LIMIT = 14;

/** City Rider launch pricing (first N drivers). */
export const CITY_RIDER_LAUNCH_FEE_NGN = 15_000;
export const CITY_RIDER_LAUNCH_SLOTS = 500;
export const CITY_RIDER_STANDARD_FEE_NGN = MONTHLY_FEE_NGN;

/** Road Warrior (intercity) — launch / early phase. */
export const ROAD_WARRIOR_LAUNCH_FEE_NGN = 30_000;
export const ROAD_WARRIOR_STANDARD_FEE_NGN = 40_000;
export const ROAD_WARRIOR_LAUNCH_SLOTS = 200;

/** Fare discount on first completed paid trip (percentage points). */
export const FIRST_RIDE_DISCOUNT_PCT = 20;

/** Promo credit granted after first completed trip (incentives.py). */
export const FIRST_RIDE_REWARD_NGN = 500;
export const REFERRAL_REWARD_INVITER_NGN = 500;
export const REFERRAL_REWARD_INVITEE_NGN = 500;
export const PROMO_CREDIT_MAX_PER_RIDE_NGN = 500;
export const PROMO_CREDIT_MAX_FARE_COVERAGE_PCT = 40;

export function formatNgn(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

export const DRIVER_TRIAL_COPY =
  `${TRIAL_TRIPS_TARGET} completed trips or ${TRIAL_DAY_LIMIT} days from first go-online (whichever comes first)`;

export const DRIVER_SUBSCRIPTION_BULLETS = [
  `Launch pricing: ${formatNgn(CITY_RIDER_LAUNCH_FEE_NGN)}/month (first ${CITY_RIDER_LAUNCH_SLOTS} City Rider drivers)`,
  `Standard pricing: ${formatNgn(MONTHLY_FEE_NGN)}/month (after launch)`,
  `Free trial for newly verified drivers: ${DRIVER_TRIAL_COPY}`,
  `Subscribe during trial and save ${formatNgn(EARLY_SUBSCRIBE_DISCOUNT_NGN)} on your first month (${formatNgn(EARLY_SUBSCRIBE_FEE_NGN)})`,
  'Zero commission on rides — keep 100% of your earnings',
  'Subscription must be active to accept ride requests',
  'Payment proof must be submitted for verification',
] as const;
