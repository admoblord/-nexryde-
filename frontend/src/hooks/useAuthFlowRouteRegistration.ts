import { useEffect } from 'react';
import { setActiveAuthFlowSegment } from '@/src/utils/navigationRouteGuard';

/** Register the current auth-flow screen so session routing never replaces the same route. */
export function useAuthFlowRouteRegistration(segment: string): void {
  useEffect(() => {
    setActiveAuthFlowSegment(segment);
    return () => setActiveAuthFlowSegment(null);
  }, [segment]);
}
