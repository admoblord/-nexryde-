/**
 * Rider receipt fare lines: reconcile base / surge / discounts to the stored total when possible.
 */
export type TripReceiptFareInput = {
  fare?: unknown;
  base_fare?: unknown;
  distance_fee?: unknown;
  time_fee?: unknown;
  traffic_fee?: unknown;
  quoted_subtotal?: unknown;
  surge_multiplier?: unknown;
  first_ride_discount_ngn?: unknown;
  favorite_driver_discount_ngn?: unknown;
};

export type TripReceiptFareSummary = {
  baseBlock: number;
  surgeMultiplier: number;
  surgeAmount: number;
  discountAmount: number;
  total: number;
  showSurge: boolean;
  showDiscount: boolean;
};

export function summarizeTripReceiptFare(t: TripReceiptFareInput): TripReceiptFareSummary {
  const total = Math.round(Number(t.fare ?? 0));
  const parts =
    Number(t.base_fare ?? 0) +
    Number(t.distance_fee ?? 0) +
    Number(t.time_fee ?? 0) +
    Number(t.traffic_fee ?? 0);
  const quoted = Number(t.quoted_subtotal);
  const mult = Number(t.surge_multiplier ?? 1);
  const surgeMultiplier = Number.isFinite(mult) && mult > 0 ? mult : 1;
  const firstDisc = Math.round(Number(t.first_ride_discount_ngn ?? 0));
  const favDisc = Math.round(Number(t.favorite_driver_discount_ngn ?? 0));
  const discountAmount = Math.max(0, firstDisc + favDisc);
  const showDiscount = discountAmount > 0;

  const rawBase = Number.isFinite(quoted) && quoted > 0 ? Math.round(quoted) : Math.round(parts);
  // When the meter breakdown is missing/zero, anchor the base block to the stored
  // total (+ any discount) so the summary never shows ₦0 against a real fare.
  const baseBlock = rawBase > 0 ? rawBase : Math.max(0, total + discountAmount);

  let surgeAmount = 0;
  if (surgeMultiplier > 1.02) {
    surgeAmount = Math.max(0, Math.round(baseBlock * (surgeMultiplier - 1)));
  }
  let after = baseBlock + surgeAmount - discountAmount;
  if (Math.abs(after - total) > 2 && total >= 0) {
    surgeAmount = Math.max(0, total + discountAmount - baseBlock);
    after = baseBlock + surgeAmount - discountAmount;
  }
  const showSurge = surgeAmount > 0 && surgeMultiplier > 1.02;

  return {
    baseBlock,
    surgeMultiplier,
    surgeAmount,
    discountAmount,
    total,
    showSurge,
    showDiscount,
  };
}
