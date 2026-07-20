import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { RiderActiveTripHomeCard } from '@/src/components/rider/RiderActiveTripHomeCard';
import { RiderActiveTripMapPeek } from '@/src/components/map/RiderActiveTripMapPeek';
import { useRiderActiveTripPhase } from '@/src/hooks/useRiderHasActiveTrip';
import { useThemeColors } from '@/src/constants/theme';
import {
  riderCancelFeePreviewNgn,
  riderTripCanCancel,
  riderTripHasDriver,
} from '@/src/constants/riderActiveTripDisplay';
import { openShareTrip } from '@/src/utils/openShareTrip';
import CancellationReasonModal from '@/src/components/shared/CancellationReasonModal';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import { clearTripDriverCache } from '@/src/utils/tripDriverCache';

type QuickAction = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  bg: string;
  onPress: () => void;
};

export function RiderActiveTripHomePanel() {
  const router = useRouter();
  const phase = useRiderActiveTripPhase();
  const currentTrip = useAppStore((s) => s.currentTrip);
  const setCurrentTrip = useAppStore((s) => s.setCurrentTrip);
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelInFlightRef = useRef(false);
  const toast = useErrorToast();
  const { isDark } = useThemeColors();

  const openTracking = useCallback(() => {
    if (!currentTrip?.id) return;
    void Haptics.selectionAsync();
    router.push({ pathname: '/rider/tracking', params: { tripId: currentTrip.id } } as any);
  }, [currentTrip?.id, router]);

  const confirmCancel = useCallback(
    async (reason?: string) => {
      if (!currentTrip?.id || !userId || !canCallAuthedApi) return;
      if (cancelInFlightRef.current) return;
      cancelInFlightRef.current = true;
      setCancelError(null);
      setCancelling(true);
      try {
        const payload: Record<string, string> = { cancelled_by: userId };
        const trimmed = String(reason || '').trim();
        if (trimmed) {
          payload.reason = trimmed;
          payload.cancellation_reason = trimmed;
        }
        const res = await fetch(`${BACKEND_URL}/api/trips/${currentTrip.id}/cancel`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        let data: { detail?: string } = {};
        try {
          data = await res.json();
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          setCancelError(String(data?.detail || 'Unable to cancel this request. Tap Cancel Ride to retry.'));
          return;
        }
        clearTripDriverCache();
        setCurrentTrip(null);
        setCancelOpen(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.show('Trip cancelled successfully.', 'success');
      } catch {
        setCancelError('Could not cancel this request. Check your connection and retry.');
      } finally {
        cancelInFlightRef.current = false;
        setCancelling(false);
      }
    },
    [currentTrip?.id, userId, canCallAuthedApi, setCurrentTrip, toast],
  );

  const handleCancel = useCallback(() => {
    if (!currentTrip?.id || !userId || !canCallAuthedApi) return;
    setCancelError(null);
    setCancelOpen(true);
  }, [currentTrip?.id, userId, canCallAuthedApi]);

  if (!currentTrip?.id || !phase) return null;

  const canCancel = riderTripCanCancel(phase);
  const hasDriver = riderTripHasDriver(phase) && Boolean(currentTrip.driver_id);

  const quickActions: QuickAction[] = [
    {
      id: 'map',
      label: 'Live map',
      icon: 'map',
      tint: '#057A48',
      bg: '#ECFDF5',
      onPress: openTracking,
    },
    {
      id: 'safety',
      label: 'Safety',
      icon: 'shield-checkmark',
      tint: '#D97706',
      bg: '#FFFBEB',
      onPress: () => router.push('/(rider-tabs)/rider-safety' as any),
    },
    {
      id: 'share',
      label: 'Share trip',
      icon: 'share-social',
      tint: '#2563EB',
      bg: '#EFF6FF',
      onPress: () => openShareTrip(router, currentTrip?.id),
    },
    {
      id: 'help',
      label: 'Get help',
      icon: 'headset',
      tint: '#7C3AED',
      bg: '#F5F3FF',
      onPress: () => router.push('/support' as any),
    },
  ];

  if (hasDriver) {
    quickActions.splice(1, 0, {
      id: 'chat',
      label: 'Message',
      icon: 'chatbubble',
      tint: '#0F172A',
      bg: '#F1F5F9',
      onPress: () =>
        router.push({ pathname: '/chat', params: { tripId: currentTrip.id } } as any),
    });
  }

  return (
    <View style={styles.wrap}>
      <RiderActiveTripHomeCard />
      <RiderActiveTripMapPeek trip={currentTrip} isDark={isDark} onPress={openTracking} />

      <Text style={styles.sectionLabel}>Quick actions</Text>
      <View style={styles.actionGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={[styles.actionTile, { backgroundColor: action.bg }]}
            onPress={() => {
              void Haptics.selectionAsync();
              action.onPress();
            }}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FFF' }]}>
              <Ionicons name={action.icon} size={20} color={action.tint} />
            </View>
            <Text style={styles.actionLbl} numberOfLines={1}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {canCancel ? (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleCancel}
          disabled={cancelling}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Cancel ride request"
        >
          {cancelling ? (
            <ActivityIndicator color="#EF4444" size="small" />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={styles.cancelTxt}>
                {phase === 'accepted' ? 'Cancel ride' : 'Cancel request'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={16} color="#64748B" />
        <Text style={styles.noticeTxt}>
          New bookings are paused until this trip finishes. You can still use Safety, Wallet, and
          other tabs.
        </Text>
      </View>

      <CancellationReasonModal
        visible={cancelOpen}
        role="rider"
        cancelling={cancelling}
        errorMessage={cancelError}
        feePreviewNote={
          (() => {
            const fee = riderCancelFeePreviewNgn(
              phase,
              (currentTrip as { cancellation_fee?: number } | null)?.cancellation_fee,
            );
            if (fee == null) return null;
            if (fee <= 0) return 'No cancellation fee while searching for a driver.';
            return `A cancellation fee of about ₦${fee.toLocaleString()} may apply.`;
          })()
        }
        onKeepTrip={() => {
          if (!cancelling) {
            setCancelError(null);
            setCancelOpen(false);
          }
        }}
        onConfirm={(reason) => void confirmCancel(reason)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionTile: {
    width: '47%',
    flexGrow: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLbl: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  noticeTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 17,
  },
});
