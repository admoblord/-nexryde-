import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { DOCK_BLUR_INTENSITY } from '@/src/components/driver/driverDockTheme';
import { isWalletPaymentMethod } from '@/src/utils/tripPaymentMethod';

const NEON = '#22C55E';
const winH = Dimensions.get('window').height;
const SHEET_HEIGHT = Math.max(520, Math.round(winH * 0.88));

export type TripCompletionPayload = {
  tripId: string;
  tripDisplayId?: string;
  riderName: string;
  riderPhoto: string | null;
  fare: number;
  paymentMethod?: string;
  paymentPending?: boolean;
  alreadyRated: boolean;
  mysteryBonusNgn?: number | null;
  riderRatingAvg?: number | null;
  riderTripCount?: number | null;
  baseFareNgn?: number | null;
  distanceFareNgn?: number | null;
  timeFareNgn?: number | null;
  distanceKm?: number | null;
  durationMins?: number | null;
  dropoffLabel?: string | null;
};

type Props = {
  payload: TripCompletionPayload;
  onDismiss: () => void;
  onSubmitRating: (stars: number, comment: string) => Promise<void>;
  onViewDetails?: () => void;
  /** Cash collected — confirm payment with backend. */
  onConfirmCash?: () => Promise<void>;
};

function formatFare(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `₦${Math.round(n).toLocaleString()}`;
}

function CompletionBrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandLeft}>
        <LinearGradient colors={['#22C55E', '#16A34A']} style={styles.brandLogo}>
          <Text style={styles.brandLogoTxt}>NX</Text>
        </LinearGradient>
        <View style={styles.brandWord}>
          <Text style={styles.brandNex}>NEX</Text>
          <Text style={styles.brandR}>R</Text>
          <Text style={styles.brandYde}>YDE</Text>
        </View>
      </View>
      <View style={styles.driverPill}>
        <Ionicons name="car-sport" size={13} color={NEON} />
        <Text style={styles.driverPillTxt}>Driver</Text>
      </View>
    </View>
  );
}

function EarningsBreakdownGrid({ payload }: { payload: TripCompletionPayload }) {
  const bonus = payload.mysteryBonusNgn != null && Number(payload.mysteryBonusNgn) > 0;
  const cols = [
    {
      key: 'base',
      label: 'Base fare',
      value: payload.baseFareNgn,
      sub: null as string | null,
    },
    {
      key: 'dist',
      label: 'Distance',
      value: payload.distanceFareNgn,
      sub: payload.distanceKm != null ? `${payload.distanceKm} km` : null,
    },
    {
      key: 'time',
      label: 'Time',
      value: payload.timeFareNgn,
      sub: payload.durationMins != null ? `${payload.durationMins} min` : null,
    },
    ...(bonus
      ? [
          {
            key: 'bonus',
            label: 'Bonus',
            value: Number(payload.mysteryBonusNgn),
            sub: null as string | null,
            highlight: true,
          },
        ]
      : []),
  ];
  const hasAny = cols.some((c) => c.value != null && Number(c.value) >= 0);

  if (!hasAny) {
    return (
      <Text style={styles.earnBreakMuted}>
        Fare breakdown appears when meter line items are on the trip record.
      </Text>
    );
  }

  return (
    <View style={styles.earnGrid}>
      {cols.map((col, i) => (
        <View
          key={col.key}
          style={[
            styles.earnCol,
            i > 0 && styles.earnColBorder,
            'highlight' in col && col.highlight && styles.earnColBonus,
          ]}
        >
          <Text style={[styles.earnColLbl, 'highlight' in col && col.highlight && styles.earnColLblBonus]}>
            {'highlight' in col && col.highlight ? 'Bonus' : col.label}
          </Text>
          <Text style={[styles.earnColVal, 'highlight' in col && col.highlight && styles.earnColValBonus]}>
            {col.value != null && Number.isFinite(Number(col.value))
              ? formatFare(Number(col.value))
              : '—'}
          </Text>
          {col.sub ? <Text style={styles.earnColSub}>{col.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export default function DriverTripCompletionPanel({
  payload,
  onDismiss,
  onSubmitRating,
  onViewDetails,
  onConfirmCash,
}: Props) {
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState('');
  const [thanks, setThanks] = useState(payload.alreadyRated);
  const [busy, setBusy] = useState(false);
  const [cashBusy, setCashBusy] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(56)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  const riderFirst = useMemo(() => {
    const t = payload.riderName.trim() || 'Your rider';
    return t.split(/\s+/)[0] || t;
  }, [payload.riderName]);

  const tripSummaryLine = useMemo(() => {
    const parts: string[] = [];
    if (payload.distanceKm != null) parts.push(`${payload.distanceKm} km`);
    if (payload.durationMins != null) parts.push(`${payload.durationMins} min`);
    return parts.length ? parts.join(' · ') : null;
  }, [payload.distanceKm, payload.durationMins]);

  const showRating = !payload.alreadyRated && !thanks;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, friction: 9, tension: 58, useNativeDriver: true }),
    ]).start();
    Animated.spring(checkScale, {
      toValue: 1,
      friction: 6,
      tension: 48,
      delay: 120,
      useNativeDriver: true,
    }).start();
  }, [fade, sheetY, checkScale]);

  const handleConfirmContinue = async () => {
    if (busy) return;
    if (showRating && stars > 0) {
      setBusy(true);
      try {
        await onSubmitRating(stars, comment.trim());
        setThanks(true);
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not submit rating', 'Check your connection and try again.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDismiss();
  };

  const handleViewDetails = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    if (onViewDetails) onViewDetails();
    else onDismiss();
  };

  const topPillTop = insets.top + 48;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdropWrap, { opacity: fade }]} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(2,6,23,0.08)', 'rgba(2,6,23,0.45)', 'rgba(2,6,23,0.92)']}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {thanks || payload.alreadyRated ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        ) : null}
      </Animated.View>

      <Animated.View style={[styles.topPillWrap, { top: topPillTop, opacity: fade }]} pointerEvents="none">
        <LinearGradient
          colors={['#34F5B8', '#22C55E', '#16A34A']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.topPillGrad}
        >
          <View style={styles.topPillIconCircle}>
            <Ionicons name="checkmark" size={18} color="#022C22" />
          </View>
          <Text style={styles.topPillTxt}>Done</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT,
            paddingBottom: Math.max(insets.bottom, 20),
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        {Platform.OS === 'ios' || Platform.OS === 'android' ? (
          <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(8,11,22,0.97)' }]} />
        )}
        <LinearGradient
          colors={['rgba(34,197,94,0.06)', 'rgba(8,11,22,0.98)', '#0A0F1A']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.45 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.handleRail}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <CompletionBrandHeader />

          <LinearGradient
            colors={['#34F5B8', '#22C55E', '#15803D']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.successBanner}
          >
            <View style={styles.successBannerIcon}>
              <Ionicons name="checkmark" size={22} color="#022C22" />
            </View>
            <Text style={styles.successBannerTxt}>Trip completed</Text>
          </LinearGradient>

          <View style={styles.tripSummaryCard}>
            <View style={styles.tripSummaryLeft}>
              <View style={styles.tripSummaryIconWrap}>
                <Ionicons name="navigate" size={18} color={NEON} />
              </View>
              <View style={styles.tripSummaryTextCol}>
                {tripSummaryLine ? (
                  <Text style={styles.tripSummaryMeta}>{tripSummaryLine.toUpperCase()}</Text>
                ) : null}
                <Text style={styles.tripSummaryTitle} numberOfLines={2}>
                  {payload.dropoffLabel || 'Drop-off completed'}
                </Text>
              </View>
            </View>
            <View style={styles.miniMapDecor} pointerEvents="none">
              <View style={styles.miniMapRoute} />
              <Ionicons name="location" size={22} color={NEON} style={styles.miniMapPin} />
            </View>
          </View>

          <View style={styles.celebrationCard}>
            <Animated.View
              style={[
                styles.celebrationGlow,
                { transform: [{ scale: checkScale }] },
              ]}
            >
              <LinearGradient colors={['#4ADE80', '#22C55E', '#16A34A']} style={styles.celebrationCheck}>
                <Ionicons name="checkmark" size={40} color="#022C22" />
              </LinearGradient>
            </Animated.View>
            <Text style={styles.celebrationGreat}>Great job!</Text>
            <Text style={styles.celebrationDone}>Trip completed</Text>
            <View style={styles.celebrationRiderRow}>
              {payload.riderPhoto ? (
                <Image source={{ uri: payload.riderPhoto }} style={styles.celebrationAvatar} />
              ) : (
                <View style={styles.celebrationAvatarPh}>
                  <Text style={styles.celebrationAvatarTxt}>
                    {(payload.riderName.trim().charAt(0) || 'R').toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.celebrationRiderName} numberOfLines={1}>
                {payload.riderName.trim() || riderFirst}
              </Text>
            </View>
          </View>

          <View style={styles.earningsCard}>
            <View style={styles.earningsTopRow}>
              <Text style={styles.earningsLbl}>Total earnings</Text>
              <View style={styles.earningsWalletIcon}>
                <Ionicons name="wallet" size={20} color={NEON} />
              </View>
            </View>
            <Text style={styles.earningsAmount}>{formatFare(payload.fare)}</Text>
            <View style={styles.earningsDivider} />
            <EarningsBreakdownGrid payload={payload} />
            {/* Payment method / pending payment notice */}
            {payload.paymentMethod ? (
              <View style={[
                styles.paymentMethodRow,
                payload.paymentPending && styles.paymentMethodPending,
              ]}>
                <Ionicons
                  name={
                    isWalletPaymentMethod(payload.paymentMethod)
                      ? 'wallet-outline'
                      : payload.paymentMethod === 'transfer' || payload.paymentMethod === 'bank_transfer'
                        ? 'swap-horizontal-outline'
                        : 'cash-outline'
                  }
                  size={16}
                  color={payload.paymentPending ? '#F59E0B' : NEON}
                />
                <Text style={[styles.paymentMethodTxt, payload.paymentPending && styles.paymentMethodPendingTxt]}>
                  {payload.paymentPending
                    ? isWalletPaymentMethod(payload.paymentMethod)
                      ? 'Wallet payment pending — rider settles in app'
                      : payload.paymentMethod === 'transfer' || payload.paymentMethod === 'bank_transfer'
                        ? `Transfer pending — ₦${Math.round(payload.fare).toLocaleString()} to your bank account`
                        : `Cash pending — collect ₦${Math.round(payload.fare).toLocaleString()} from rider`
                    : `Payment via ${
                        isWalletPaymentMethod(payload.paymentMethod)
                          ? 'wallet'
                          : payload.paymentMethod === 'transfer' || payload.paymentMethod === 'bank_transfer'
                            ? 'transfer'
                            : 'cash'
                      } — complete`}
                </Text>
              </View>
            ) : null}
            {/* Wallet settlement is rider-triggered (backend rejects driver confirm);
                cash/transfer are confirmed by the driver who received the money. */}
            {payload.paymentPending && onConfirmCash && !isWalletPaymentMethod(payload.paymentMethod) ? (
              <TouchableOpacity
                style={[styles.cashConfirmBtn, cashBusy && { opacity: 0.65 }]}
                disabled={cashBusy}
                onPress={() => {
                  void (async () => {
                    setCashBusy(true);
                    try {
                      await onConfirmCash();
                      if (Platform.OS !== 'web') {
                        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }
                    } catch {
                      /* parent toasts */
                    } finally {
                      setCashBusy(false);
                    }
                  })();
                }}
                accessibilityRole="button"
                accessibilityLabel="Confirm payment received"
              >
                {cashBusy ? (
                  <ActivityIndicator color="#022C22" />
                ) : (
                  <>
                    <Ionicons name="cash" size={18} color="#022C22" />
                    <Text style={styles.cashConfirmTxt}>
                      {payload.paymentMethod === 'transfer' || payload.paymentMethod === 'bank_transfer'
                        ? 'Transfer received'
                        : 'Cash collected'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          {showRating ? (
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackTitle}>How was {riderFirst}?</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = n <= (hoveredStar || stars);
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => {
                        setStars(n);
                        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      onPressIn={() => setHoveredStar(n)}
                      onPressOut={() => setHoveredStar(0)}
                      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                    >
                      <Ionicons
                        name={filled ? 'star' : 'star-outline'}
                        size={36}
                        color={filled ? '#FBBF24' : '#475569'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.tapStarHint}>Tap a star to rate</Text>
              <View style={styles.commentBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add an optional comment..."
                  placeholderTextColor="#64748B"
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  maxLength={120}
                />
              </View>
              <Text style={styles.charCount}>{comment.length}/120</Text>
            </View>
          ) : (
            <View style={styles.postRateNote}>
              <Ionicons name="checkmark-circle" size={20} color={NEON} />
              <Text style={styles.postRateNoteTxt}>
                {payload.alreadyRated
                  ? 'Rating already on file for this trip.'
                  : 'Thanks — your feedback was saved.'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.ctaPrimary, busy && styles.ctaDisabled]}
            onPress={() => void handleConfirmContinue()}
            disabled={busy}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Confirm and continue"
          >
            <LinearGradient
              colors={['#4ADE80', '#22C55E', '#16A34A']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.ctaPrimaryGrad}
            >
              {busy ? (
                <ActivityIndicator color="#022C22" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#022C22" />
                  <Text style={styles.ctaPrimaryTxt}>Confirm & Continue</Text>
                  <Ionicons name="chevron-forward" size={20} color="rgba(2,44,34,0.5)" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctaSecondary}
            onPress={handleViewDetails}
            disabled={busy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="View trip details"
          >
            <Ionicons name="document-text-outline" size={20} color="#94A3B8" />
            <Text style={styles.ctaSecondaryTxt}>View trip details</Text>
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          </TouchableOpacity>

          <View style={styles.footer}>
            <Ionicons name="heart" size={14} color={NEON} style={{ marginBottom: 6 }} />
            <Text style={styles.footerThanks}>Thanks for the ride!</Text>
            <Text style={styles.footerBrand}>NEXRYDE</Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: 'flex-end',
  },
  backdropWrap: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  topPillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 41,
  },
  topPillGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 12,
  },
  topPillIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPillTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  sheet: {
    zIndex: 2,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 32,
  },
  handleRail: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(148,163,184,0.45)',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8 },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingTop: 4,
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogoTxt: { fontSize: 12, fontWeight: '900', color: '#F8FAFC' },
  brandWord: { flexDirection: 'row' },
  brandNex: { fontSize: 17, fontWeight: '900', color: '#F8FAFC' },
  brandR: { fontSize: 17, fontWeight: '900', color: NEON },
  brandYde: { fontSize: 17, fontWeight: '900', color: '#F8FAFC' },
  driverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.45)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  driverPillTxt: { fontSize: 11, fontWeight: '800', color: NEON, letterSpacing: 0.6 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  successBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBannerTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.1,
  },
  tripSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  tripSummaryLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  tripSummaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripSummaryTextCol: { flex: 1, minWidth: 0 },
  tripSummaryMeta: {
    fontSize: 10,
    fontWeight: '800',
    color: NEON,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  tripSummaryTitle: { fontSize: 15, fontWeight: '800', color: '#F8FAFC', lineHeight: 20 },
  miniMapDecor: {
    width: 72,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(2,6,23,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.6)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 6,
  },
  miniMapRoute: {
    position: 'absolute',
    left: 8,
    top: 28,
    right: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: NEON,
    opacity: 0.85,
    transform: [{ rotate: '-12deg' }],
  },
  miniMapPin: { zIndex: 2 },
  celebrationCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.45)',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  celebrationGlow: {
    marginBottom: 12,
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 14,
  },
  celebrationCheck: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  celebrationGreat: { fontSize: 22, fontWeight: '900', color: NEON, marginBottom: 4, letterSpacing: -0.3 },
  celebrationDone: { fontSize: 18, fontWeight: '900', color: '#F8FAFC', marginBottom: 14 },
  celebrationRiderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  celebrationAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.4)',
  },
  celebrationAvatarPh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(30,41,59,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  celebrationAvatarTxt: { fontSize: 16, fontWeight: '900', color: '#94A3B8' },
  celebrationRiderName: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', maxWidth: 200 },
  earningsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(15,23,42,0.7)',
    padding: 18,
    marginBottom: 14,
  },
  earningsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  earningsLbl: {
    fontSize: 12,
    fontWeight: '700',
    color: NEON,
    letterSpacing: 0.15,
  },
  earningsWalletIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  earningsAmount: {
    fontSize: 48,
    fontWeight: '900',
    color: NEON,
    letterSpacing: -1.5,
    marginBottom: 14,
  },
  earningsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148,163,184,0.35)',
    marginBottom: 14,
  },
  paymentMethodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  paymentMethodPending: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.35)',
  },
  paymentMethodTxt: { fontSize: 12, fontWeight: '700', color: NEON, flex: 1 },
  paymentMethodPendingTxt: { color: '#FBBF24' },
  cashConfirmBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FBBF24',
  },
  cashConfirmTxt: { color: '#022C22', fontWeight: '900', fontSize: 14 },
  earnGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  earnCol: { flex: 1, minWidth: 72, paddingHorizontal: 4, paddingVertical: 4 },
  earnColBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(148,163,184,0.3)' },
  earnColBonus: {},
  earnColLbl: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 4 },
  earnColLblBonus: { color: NEON },
  earnColVal: { fontSize: 13, fontWeight: '800', color: '#F8FAFC' },
  earnColValBonus: { color: NEON },
  earnColSub: { fontSize: 10, fontWeight: '600', color: '#64748B', marginTop: 2 },
  earnBreakMuted: { fontSize: 12, fontWeight: '600', color: '#64748B', lineHeight: 17 },
  feedbackCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
    backgroundColor: 'rgba(15,23,42,0.55)',
    padding: 18,
    marginBottom: 14,
  },
  feedbackTitle: { fontSize: 17, fontWeight: '900', color: '#F8FAFC', marginBottom: 12 },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  tapStarHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
  },
  commentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.65)',
    backgroundColor: 'rgba(2,6,23,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  commentInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 88,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    textAlignVertical: 'top',
    paddingTop: 2,
  },
  charCount: { fontSize: 11, fontWeight: '600', color: '#64748B', textAlign: 'right', marginTop: 6 },
  postRateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.55)',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  postRateNoteTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: '#CBD5E1', lineHeight: 18 },
  ctaPrimary: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  ctaDisabled: { opacity: 0.65 },
  ctaPrimaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 20,
    minHeight: 62,
  },
  ctaPrimaryTxt: { fontSize: 18, fontWeight: '900', color: '#022C22', letterSpacing: -0.2 },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(15,23,42,0.4)',
    marginBottom: 16,
  },
  ctaSecondaryTxt: { fontSize: 15, fontWeight: '800', color: '#94A3B8' },
  footer: { alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  footerThanks: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginBottom: 4 },
  footerBrand: { fontSize: 14, fontWeight: '900', color: '#E2E8F0', letterSpacing: 1 },
});
