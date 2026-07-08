/**
 * Single entry point for post-login / post-register routing.
 * Implementation lives in sessionRouting (legal gates + onboarding).
 */
export type { AuthedUserForRouting } from '@/src/utils/sessionRouting';
export { routeAuthedUser } from '@/src/utils/sessionRouting';
