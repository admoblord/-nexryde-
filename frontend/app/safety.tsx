import RoleRouteRedirect from '@/src/components/RoleRouteRedirect';

export default function SafetyRedirect() {
  return (
    <RoleRouteRedirect
      riderHref="/(rider-tabs)/rider-safety"
      driverHref="/driver/safety-alerts"
    />
  );
}
