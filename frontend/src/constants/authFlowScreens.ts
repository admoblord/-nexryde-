/** Auth onboarding screens where signed-in users must stay (no authed redirect). */
export const AUTH_FLOW_SCREENS = new Set([
  'rider-terms',
  'driver-terms',
  'rider-nin',
  'rider-verification',
  'driver-profile',
  'driver-documents',
  'driver-verification-status',
]);

export function isAuthFlowScreen(segment: string | undefined): boolean {
  return !!segment && AUTH_FLOW_SCREENS.has(segment);
}
