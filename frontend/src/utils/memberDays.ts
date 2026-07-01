/**
 * Days since account registration (inclusive: joined today = 1 day).
 */
export function calculateMemberDays(createdAt?: string | null): number {
  if (!createdAt) return 0;
  const registration = new Date(createdAt);
  if (Number.isNaN(registration.getTime())) return 0;
  const diffMs = Date.now() - registration.getTime();
  if (diffMs < 0) return 0;
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
