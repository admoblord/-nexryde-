/**
 * Offline / boot-shell ride offer — same Uber card as on-map DriverMapOfferDock.
 * Online dashboard uses DriverMapOfferDock directly on the live map.
 */
import React from 'react';
import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DriverMapOfferDock from '@/src/components/driver/DriverMapOfferDock';
import { DRIVER_OFFER_COUNTDOWN_SECONDS } from '@/src/constants/driverOffer';

export type FairTier = 'good' | 'fair' | 'low';

/** Kept for any legacy imports / tests. */
export function computeFairTier(
  baseFare: number,
  riderOffer: number,
  minPrice?: number | null,
): FairTier {
  if (baseFare <= 0) return 'fair';
  if (minPrice != null && minPrice > 0 && riderOffer < minPrice - 0.5) return 'low';
  const r = riderOffer / baseFare;
  if (r >= 0.97) return 'good';
  if (r >= 0.88) return 'fair';
  return 'low';
}

type TripOffer = Record<string, any>;

type Props = {
  visible: boolean;
  trip: TripOffer | null;
  countdownSeconds: number;
  countdownTotal?: number;
  fareInput: string;
  onFareInputChange: (v: string) => void;
  accepting: boolean;
  onAcceptRiderPrice: () => void;
  onSendCounterPrice: () => void;
  onIgnore: () => void;
  /** @deprecated Use onAcceptRiderPrice */
  onAccept?: () => void;
  driverLat?: number | null;
  driverLng?: number | null;
};

export default function DriverRideRequestModal({
  visible,
  trip,
  countdownSeconds,
  countdownTotal = DRIVER_OFFER_COUNTDOWN_SECONDS,
  fareInput,
  onFareInputChange,
  accepting,
  onAcceptRiderPrice,
  onSendCounterPrice,
  onIgnore,
  onAccept,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!visible || !trip) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onIgnore}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onIgnore} accessibilityLabel="Dismiss offer" />
        <View style={[styles.dockWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <DriverMapOfferDock
            trip={trip}
            countdownSeconds={countdownSeconds}
            countdownTotal={countdownTotal}
            fareInput={fareInput}
            onFareInputChange={onFareInputChange}
            accepting={accepting}
            onAcceptRiderPrice={onAccept || onAcceptRiderPrice}
            onAcceptCounterPrice={onSendCounterPrice}
            onDecline={onIgnore}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2, 6, 23, 0.62)' },
  dockWrap: { width: '100%' },
});
