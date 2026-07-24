import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  RiderPaymentDock,
  type SafetyChecklistItem,
} from '@/src/components/rider/RiderPaymentDock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatPaymentMetaDisplay,
  paymentChecklistPayLabel,
  isCashPaymentMethod,
} from '@/src/utils/tripPaymentMethod';
import { confirmTripPayment } from '@/src/services/api';
import { apiErrorMessage } from '@/src/utils/apiErrorMessage';

type Props = {
  tripId: string;
  loading: boolean;
  fareDisplay: string | null;
  financialPaymentPending: boolean;
  paymentMethod: string;
  paymentStatus: string;
  onClose: () => void;
};

export function TrackingPaymentView({
  tripId,
  loading,
  fareDisplay,
  financialPaymentPending,
  paymentMethod,
  paymentStatus,
  onClose,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = React.useState(false);
  const goToReceipt = React.useCallback(() => {
    router.replace({ pathname: '/rider/trip-receipt', params: { tripId } } as any);
  }, [router, tripId]);

  // Cash is settled when the driver ends the trip — the rider is NEVER asked to
  // confirm cash. If a cash trip ever reaches this view, bounce straight to the
  // non-blocking receipt instead of showing a confirm-cash gate.
  React.useEffect(() => {
    if (isCashPaymentMethod(paymentMethod)) {
      goToReceipt();
    }
  }, [paymentMethod, goToReceipt]);

  // Cash/transfer: DRIVER confirms receipt on their completion panel.
  // Rider never calls confirm-payment for cash. Wallet/transfer (rider) settle here.
  const handlePay = React.useCallback(async () => {
    if (submitting) return;
    if (!financialPaymentPending || isCashPaymentMethod(paymentMethod)) {
      goToReceipt();
      return;
    }
    setSubmitting(true);
    try {
      await confirmTripPayment(tripId);
      goToReceipt();
    } catch (err) {
      Alert.alert(
        'Payment not completed',
        apiErrorMessage(err, 'Could not complete your payment. Check your wallet balance and try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [submitting, financialPaymentPending, paymentMethod, tripId, goToReceipt]);

  const checklist: SafetyChecklistItem[] = [
    {
      id: 'pay',
      label: paymentChecklistPayLabel(paymentMethod),
      completed: !financialPaymentPending,
    },
    {
      id: 'meta',
      label: formatPaymentMetaDisplay(paymentMethod, paymentStatus).line,
      completed: true,
    },
  ];

  return (
    <View style={styles.root}>
      <RiderPaymentDock
        loading={loading || submitting}
        fareDisplay={fareDisplay}
        financialPaymentPending={financialPaymentPending}
        paymentMethod={paymentMethod}
        paymentStatus={paymentStatus}
        checklist={checklist}
        onPay={handlePay}
        onOpenReceipt={goToReceipt}
        onClose={onClose}
        onOpenTripDetails={goToReceipt}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0F1A' },
});
