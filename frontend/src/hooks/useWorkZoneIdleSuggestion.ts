/**
 * Suggests Work Zone adjustments after 30 minutes with no eligible offers.
 * Decision always remains with the driver.
 */
import { useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  WORK_ZONE_IDLE_SUGGESTION_MINUTES,
  deactivateWorkZone,
} from '@/src/services/workZoneSession';

type Args = {
  enabled: boolean;
  driverId: string | undefined;
  workZoneActive: boolean;
  workZoneLabel: string;
  hasIncomingOffer: boolean;
  hasActiveTrip: boolean;
};

export function useWorkZoneIdleSuggestion({
  enabled,
  driverId,
  workZoneActive,
  workZoneLabel,
  hasIncomingOffer,
  hasActiveTrip,
}: Args) {
  const router = useRouter();
  const lastOfferAtRef = useRef(Date.now());
  const zoneActivatedAtRef = useRef<number | null>(null);
  const suggestionShownRef = useRef(false);
  const snoozeUntilRef = useRef(0);

  const resetOfferClock = useCallback(() => {
    lastOfferAtRef.current = Date.now();
    suggestionShownRef.current = false;
  }, []);

  useEffect(() => {
    if (workZoneActive && zoneActivatedAtRef.current == null) {
      zoneActivatedAtRef.current = Date.now();
      resetOfferClock();
    }
    if (!workZoneActive) {
      zoneActivatedAtRef.current = null;
      suggestionShownRef.current = false;
      snoozeUntilRef.current = 0;
    }
  }, [workZoneActive, resetOfferClock]);

  useEffect(() => {
    if (hasIncomingOffer) resetOfferClock();
  }, [hasIncomingOffer, resetOfferClock]);

  useEffect(() => {
    if (!enabled || !driverId || !workZoneActive || hasActiveTrip) return;

    const idleMs = WORK_ZONE_IDLE_SUGGESTION_MINUTES * 60 * 1000;
    const tick = () => {
      if (!workZoneActive || hasIncomingOffer || hasActiveTrip) return;
      if (Date.now() < snoozeUntilRef.current) return;
      const idleFor = Date.now() - lastOfferAtRef.current;
      if (idleFor < idleMs || suggestionShownRef.current) return;

      suggestionShownRef.current = true;
      const zoneName = workZoneLabel || 'your zone';
      Alert.alert(
        'Fewer requests in your zone',
        `You're receiving fewer requests in ${zoneName} right now.\n\nWould you like to expand your Work Zone, turn it off temporarily, or keep your current zone?`,
        [
          {
            text: 'Expand zone',
            onPress: () => {
              suggestionShownRef.current = false;
              router.push('/driver/work-zone');
            },
          },
          {
            text: 'Turn off temporarily',
            style: 'destructive',
            onPress: () => {
              void deactivateWorkZone(driverId);
            },
          },
          {
            text: 'Keep current zone',
            style: 'cancel',
            onPress: () => {
              snoozeUntilRef.current = Date.now() + idleMs;
              suggestionShownRef.current = false;
              resetOfferClock();
            },
          },
        ],
        { cancelable: true },
      );
    };

    const id = setInterval(tick, 60_000);
    tick();
    return () => clearInterval(id);
  }, [
    enabled,
    driverId,
    workZoneActive,
    workZoneLabel,
    hasIncomingOffer,
    hasActiveTrip,
    router,
    resetOfferClock,
  ]);
}
