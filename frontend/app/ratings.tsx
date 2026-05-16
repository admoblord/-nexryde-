import RoleRouteRedirect from '@/src/components/RoleRouteRedirect';

/**
 * Legacy `/ratings` (was mock data). Per-trip ratings live under Trips / receipts.
 */
export default function LegacyRatingsRedirect() {
  return (
    <RoleRouteRedirect
      riderHref="/(rider-tabs)/rider-trips"
      driverHref="/(driver-tabs)/driver-trips"
    />
  );
}
