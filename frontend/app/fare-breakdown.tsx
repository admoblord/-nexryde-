import RoleRouteRedirect from '@/src/components/RoleRouteRedirect';

/**
 * Legacy `/fare-breakdown` (was static demo). Real fare detail is on trip receipt / booking flow.
 */
export default function LegacyFareBreakdownRedirect() {
  return (
    <RoleRouteRedirect
      riderHref="/(rider-tabs)/rider-home"
      driverHref="/(driver-tabs)/driver-home"
    />
  );
}
