import RoleRouteRedirect from '@/src/components/RoleRouteRedirect';

/**
 * Legacy `/ride-history` — route to the correct tab trips list (hydration + role aware).
 */
export default function LegacyRideHistoryRedirect() {
  return (
    <RoleRouteRedirect
      riderHref="/(rider-tabs)/rider-trips"
      driverHref="/(driver-tabs)/driver-trips"
    />
  );
}
