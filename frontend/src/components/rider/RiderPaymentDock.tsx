/**
 * Map-first pending_payment dock — pay CTA + safety checklist (blur shell).
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  RIDER_FINDING_HANDLE_GRADIENT,
  RIDER_FINDING_SHEET_BORDER,
  RIDER_MAP_PRIMARY_CTA_GRADIENT,
} from '@/src/constants/riderRideChrome';
import { DOCK_BLUR_INTENSITY, DOCK_TOP_RADIUS } from '@/src/components/driver/driverDockTheme';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export type SafetyChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  onPress?: () => void;
};

export type RiderPaymentDockProps = {
  fareDisplay: string | null;
  financialPaymentPending: boolean;
  paymentStatus?: string;
  checklist: SafetyChecklistItem[];
  loading?: boolean;
  onPay: () => void;
  onOpenReceipt: () => void;
  onClose: () => void;
  onOpenTripDetails?: () => void;
  bottomInset: number;
};

export function RiderPaymentDock({
  fareDisplay,
  financialPaymentPending,
  paymentStatus,
  checklist,
  loading,
  onPay,
  onOpenReceipt,
  onClose,
  onOpenTripDetails,
  bottomInset,
}: RiderPaymentDockProps) {
  const pendingItems = checklist.filter((c) => !c.completed);

  return (
    <View style={[styles.root, { paddingBottom: Math.max(bottomInset, 10) }]} pointerEvents="box-none">
      <View style={styles.shell}>
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient
          colors={['rgba(60,255,179,0.07)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.sheen}
          pointerEvents="none"
        />
        <View style={styles.handleWrap} pointerEvents="none">
          <LinearGradient
            colors={[...RIDER_FINDING_HANDLE_GRADIENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.handle}
          />
        </View>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={COLORS.accentGreen} style={{ marginVertical: 16 }} />
          ) : (
            <>
              <View style={styles.brandRow}>
                <Ionicons name="checkmark-done-circle" size={22} color="#34F5B8" />
                <Text style={styles.heroTitle}>Trip complete</Text>
              </View>
              <Text style={styles.heroSub}>
                {financialPaymentPending
                  ? 'Settle your fare and finish the quick safety steps below.'
                  : 'Confirm the safety prompts below to close your trip.'}
              </Text>

              <View style={styles.fareCard}>
                <Text style={styles.fareLabel}>Total fare</Text>
                <Text style={styles.fareValue}>{fareDisplay ?? '—'}</Text>
                {paymentStatus ? (
                  <Text style={styles.fareMeta}>Payment · {paymentStatus}</Text>
                ) : null}
              </View>

              {checklist.length > 0 ? (
                <View style={styles.checklist}>
                  <Text style={styles.checklistTitle}>Before you go</Text>
                  {checklist.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.checkRow, item.completed && styles.checkRowDone]}
                      onPress={item.onPress}
                      disabled={!item.onPress || item.completed}
                      activeOpacity={item.onPress ? 0.88 : 1}
                    >
                      <Ionicons
                        name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={item.completed ? '#34F5B8' : '#64748B'}
                      />
                      <Text style={[styles.checkLabel, item.completed && styles.checkLabelDone]}>
                        {item.label}
                      </Text>
                      {!item.completed && item.onPress ? (
                        <Ionicons name="chevron-forward" size={18} color="#64748B" />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                  {pendingItems.length > 0 ? (
                    <Text style={styles.checkHint}>
                      {pendingItems.length} step{pendingItems.length === 1 ? '' : 's'} remaining
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {financialPaymentPending ? (
                <TouchableOpacity style={styles.payShell} onPress={onPay} activeOpacity={0.9}>
                  <LinearGradient
                    colors={[...RIDER_MAP_PRIMARY_CTA_GRADIENT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.payBtn}
                  >
                    <Ionicons name="wallet" size={20} color="#022C22" />
                    <Text style={styles.payTxt}>Pay & view receipt</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.receiptBtn} onPress={onOpenReceipt} activeOpacity={0.88}>
                  <Ionicons name="receipt-outline" size={18} color="#E2E8F0" />
                  <Text style={styles.receiptTxt}>Open trip receipt</Text>
                </TouchableOpacity>
              )}

              {onOpenTripDetails ? (
                <TouchableOpacity style={styles.detailsBtn} onPress={onOpenTripDetails} activeOpacity={0.88}>
                  <Ionicons name="reader-outline" size={18} color="#94A3B8" />
                  <Text style={styles.detailsTxt}>Trip details & safety tools</Text>
                  <Ionicons name="chevron-up" size={18} color="#64748B" />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.88}>
                <Text style={styles.closeTxt}>Close tracking</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    paddingHorizontal: SPACING.md,
  },
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: RIDER_FINDING_SHEET_BORDER,
    backgroundColor: 'rgba(8,11,22,0.55)',
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 90 },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 48, height: 5, borderRadius: 3 },
  body: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: '#4ADE80' },
  heroSub: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#94A3B8', lineHeight: 20, marginTop: -4 },
  fareCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fareValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F8FAFC',
    marginTop: 4,
  },
  fareMeta: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#94A3B8', marginTop: 4 },
  checklist: {
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  checklistTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  checkRowDone: { opacity: 0.75 },
  checkLabel: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#E2E8F0' },
  checkLabelDone: { color: '#94A3B8' },
  checkHint: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#64748B', marginTop: 4 },
  payShell: { borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  payTxt: { fontSize: FONT_SIZE.md, fontWeight: '900', color: '#022C22' },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  receiptTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: '#E2E8F0' },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  detailsTxt: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#94A3B8' },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
});
