import RoleRouteRedirect from '@/src/components/RoleRouteRedirect';

export default function LegacyHomeRedirect() {
  return (
    <RoleRouteRedirect
      riderHref="/(rider-tabs)/rider-home"
      driverHref="/(driver-tabs)/driver-home"
    />
  );
}
