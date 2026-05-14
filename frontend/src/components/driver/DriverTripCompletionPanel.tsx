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

const NEON = '#39FF14';
const winH = Dimensions.get('window').height;
const SHEET_HEIGHT = Math.max(440, Math.round(winH * 0.58));

export type TripCompletionPayload = {
  tripId: string;
  tripDisplayId?: string;
  riderName: string;
  riderPhoto: string | null;
  fare: number;
  paymentMethod: string;
  paymentPending: boolean;
  alreadyRated: boolean;
  mysteryBonusNgn?: number | null;
  riderRatingAvg?: number | null;
  riderTripCount?: number | null;
  baseFareNgn?: number | null;
  distanceFareNgn?: number | null;
  timeFareNgn?: number | null;
};

type Props = {
  payload: TripCompletionPayload;
  onDismiss: () => void;
  onSubmitRating: (stars: number, comment: string) => Promise<void>;
  /** Trip list / receipt path — secondary CTA in mock. */
  onViewDetails?: () => void;
};

function formatFare(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `₦${Math.round(n).toLocaleString()}`;
}

function earningsBreakdownLine(p: TripCompletionPayload): string | null {
  const b = p.baseFareNgn;
  const d = p.distanceFareNgn;
  const t = p.timeFareNgn;
  if (b == null || d == null || t == null) return null;
  if (![b, d, t].every((x) => Number.isFinite(x) && x >= 0)) return null;
  const sum = Math.round(b + d + t);
  if (sum <= 0) return null;
  return `Base Fare ₦${Math.round(b).toLocaleString()} + Distance ₦${Math.round(d).toLocaleString()} + Time ₦${Math.round(t).toLocaleString()} = ₦${sum.toLocaleString()}`;
}

export default function DriverTripCompletionPanel({
  payload,
  onDismiss,
  onSubmitRating,
  onViewDetails,
}: Props) {
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState('');
  const [thanks, setThanks] = useState(payload.alreadyRated);
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(48)).current;

  const riderFirst = useMemo(() => {
    const t = payload.riderName.trim() || 'Your rider';
    return t.split(/\s+/)[0] || t;
  }, [payload.riderName]);

  const breakdown = useMemo(() => earningsBreakdownLine(payload), [payload]);
  const showRating = !payload.alreadyRated && !thanks;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, friction: 9, tension: 62, useNativeDriver: true }),
    ]).start();
  }, [fade, sheetY]);

  const handleAcceptNextRide = async () => {
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

  const topPillTop = insets.top + 52;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdropWrap, { opacity: fade }]} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(2,6,23,0.05)', 'rgba(2,6,23,0.28)', 'rgba(2,6,23,0.88)']}
          locations={[0, 0.38, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {thanks || payload.alreadyRated ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        ) : null}
      </Animated.View>

      {/* Map-area success pill (mock) */}
      <Animated.View style={[styles.topPillWrap, { top: topPillTop, opacity: fade }]} pointerEvents="none">
        <LinearGradient
          colors={['#22E5A0', '#16A34A', '#0D9F6E']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.topPillGrad}
        >
          <View style={styles.topPillIconCircle}>
            <Ionicons name="checkmark" size={18} color="#022C22" />
          </View>
          <Text style={styles.topPillTxt}>TRIP COMPLETED</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT,
            paddingBottom: Math.max(insets.bottom, 16),
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        {Platform.OS === 'ios' || Platform.OS === 'android' ? (
          <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(11,14,17,0.96)' }]} />
        )}
        <LinearGradient
          colors={['rgba(57,255,20,0.07)', 'rgba(2,6,23,0.94)', '#0B0E11']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.handleRail}>
          <LinearGradient
            colors={['rgba(57,255,20,0.55)', 'rgba(0,123,255,0.35)', 'rgba(57,255,20,0.5)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.handle}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.confettiRow}>
            <Ionicons name="sparkles" size={16} color="#A78BFA" style={styles.confettiLeft} />
            <Ionicons name="gift" size={15} color="#F472B6" style={styles.confettiRight} />
          </View>

          <View style={styles.sheetHeadline}>
            <LinearGradient colors={['#34F5B8', '#0D9F6E']} style={styles.sheetHeadIcon}>
              <Ionicons name="checkmark" size={22} color="#022C22" />
            </LinearGradient>
            <Text style={styles.sheetHeadTitle}>Great job! Trip completed</Text>
          </View>

          <View style={styles.riderCard}>
            {payload.riderPhoto ? (
              <Image source={{ uri: payload.riderPhoto }} style={styles.riderAvatar} />
            ) : (
              <View style={styles.riderAvatarPh}>
                <Text style={styles.riderAvatarTxt}>
                  {(payload.riderName.trim().charAt(0) || 'R').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.riderMetaCol}>
              <Text style={styles.riderNameFull} numberOfLines={1}>
                {payload.riderName.trim() || riderFirst}
              </Text>
              <View style={styles.riderStatsRow}>
                {typeof payload.riderRatingAvg === 'number' && payload.riderRatingAvg > 0 ? (
                  <>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={styles.riderStatTxt}>{payload.riderRatingAvg.toFixed(1)}</Text>
                  </>
                ) : null}
                {typeof payload.riderTripCount === 'number' && payload.riderTripCount > 0 ? (
                  <>
                    {typeof payload.riderRatingAvg === 'number' && payload.riderRatingAvg > 0 ? (
                      <Text style={styles.riderStatSep}>|</Text>
                    ) : null}
                    <Text style={styles.riderStatTxt}>
                      {payload.riderTripCount.toLocaleString()} trips
                    </Text>
                  </>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.earningsHero}>
            <LinearGradient
              colors={['rgba(57,255,20,0.35)', 'rgba(13,159,110,0.55)', 'rgba(6,78,59,0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.12)', 'transparent', 'rgba(255,255,255,0.04)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <Text style={styles.totalEarnLbl}>TOTAL EARNINGS</Text>
            <Text style={styles.totalEarnVal}>{formatFare(payload.fare)}</Text>
            {breakdown ? (
              <Text style={styles.totalEarnBreak} numberOfLines={3}>
                {breakdown}
              </Text>
            ) : (
              <Text style={styles.totalEarnBreakMuted}>Full fare breakdown appears when the trip includes meter line items.</Text>
            )}
            {payload.paymentPending ? (
              <View style={styles.pendingInline}>
                <Ionicons name="time-outline" size={14} color="#FDE68A" />
                <Text style={styles.pendingInlineTxt}>Payment pending rider confirmation</Text>
              </View>
            ) : null}
            {payload.mysteryBonusNgn != null && Number(payload.mysteryBonusNgn) > 0 ? (
              <View style={styles.bonusInline}>
                <Ionicons name="sparkles" size={14} color="#E9D5FF" />
                <Text style={styles.bonusInlineTxt}>
                  +₦{Math.round(Number(payload.mysteryBonusNgn)).toLocaleString()} mystery bonus
                </Text>
              </View>
            ) : null}
          </View>

          {showRating ? (
            <View style={styles.rateBlock}>
              <Text style={styles.rateAsk}>How was {riderFirst}?</Text>
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
                        size={40}
                        color={filled ? '#FBBF24' : '#475569'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.tapStarHint}>Tap a star to rate</Text>
              <View style={styles.commentRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color="#64748B" style={styles.commentIcon} />
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a comment (optional)"
                  placeholderTextColor="#64748B"
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  maxLength={280}
                />
              </View>
            </View>
          ) : (
            <View style={styles.postRateNote}>
              <Ionicons name="checkmark-circle" size={20} color={NEON} />
              <Text style={styles.postRateNoteTxt}>
                {payload.alreadyRated
                  ? 'Rating already on file for this trip.'
                  : 'Thanks — your private feedback was saved.'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.ctaPrimaryOuter, busy && styles.ctaDisabled]}
            onPress={() => void handleAcceptNextRide()}
            disabled={busy}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Accept next ride"
          >
            <LinearGradient
              colors={['#5DFFC7', '#34F5B8', '#0D9F6E']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.ctaPrimaryGrad}
            >
              {busy ? (
                <ActivityIndicator color="#022C22" />
              ) : (
                <>
                  <View style={styles.ctaCircleIcon}>
                    <Ionicons name="arrow-forward" size={18} color="#022C22" />
                  </View>
                  <Text style={styles.ctaPrimaryTxt}>ACCEPT NEXT RIDE</Text>
                  <Ionicons name="chevron-forward" size={22} color="rgba(2,44,34,0.45)" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctaSecondaryOuter}
            onPress={handleViewDetails}
            disabled={busy}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="View trip details"
          >
            <LinearGradient
              colors={['#2563EB', '#1D4ED8', '#172554']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.ctaSecondaryGrad}
            >
              <View style={styles.ctaCircleIconBlue}>
                <Ionicons name="list" size={18} color="#F8FAFC" />
              </View>
              <Text style={styles.ctaSecondaryTxt}>VIEW DETAILS</Text>
              <Ionicons name="chevron-forward" size={22} color="rgba(248,250,252,0.45)" />
            </LinearGradient>
          </TouchableOpacity>

          {payload.tripDisplayId ? (
            <Text style={styles.footerTripId} numberOfLines={1}>
              {payload.tripDisplayId}
            </Text>
          ) : null}
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
  backdropWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
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
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 16,
    elevation: 14,
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
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 1.2,
  },
  sheet: {
    zIndex: 2,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 36,
  },
  handleRail: { alignItems: 'center', paddingTop: 6, paddingBottom: 8 },
  handle: { width: 48, height: 4, borderRadius: 100 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12, flexGrow: 1 },
  confettiRow: {
    height: 18,
    marginBottom: 4,
    position: 'relative',
  },
  confettiLeft: { position: 'absolute', left: 4, top: 0, opacity: 0.85 },
  confettiRight: { position: 'absolute', right: 8, top: 2, opacity: 0.85 },
  sheetHeadline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sheetHeadIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sheetHeadTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
  },
  riderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(57,255,20,0.4)',
  },
  riderAvatarPh: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(30,41,59,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  riderAvatarTxt: { fontSize: 20, fontWeight: '900', color: '#94A3B8' },
  riderMetaCol: { flex: 1, minWidth: 0 },
  riderNameFull: { fontSize: 18, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.3 },
  riderStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  riderStatTxt: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  riderStatSep: { fontSize: 13, fontWeight: '700', color: '#475569', marginHorizontal: 2 },
  earningsHero: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(57,255,20,0.55)',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  totalEarnLbl: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(248,250,252,0.88)',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  totalEarnVal: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.2,
    marginBottom: 8,
  },
  totalEarnBreak: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(248,250,252,0.92)',
    lineHeight: 18,
  },
  totalEarnBreakMuted: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.75)',
    lineHeight: 17,
  },
  pendingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(251,191,36,0.35)',
  },
  pendingInlineTxt: { flex: 1, fontSize: 11, fontWeight: '700', color: '#FDE68A' },
  bonusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  bonusInlineTxt: { fontSize: 12, fontWeight: '700', color: '#E9D5FF' },
  rateBlock: { marginBottom: 16 },
  rateAsk: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F1F5F9',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  tapStarHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.75)',
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 10,
    gap: 8,
  },
  commentIcon: { marginTop: 4 },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    textAlignVertical: 'top',
    paddingTop: 4,
  },
  postRateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.55)',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.2)',
  },
  postRateNoteTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: '#CBD5E1', lineHeight: 18 },
  ctaPrimaryOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  ctaDisabled: { opacity: 0.65 },
  ctaPrimaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  ctaCircleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(2,44,34,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(2,44,34,0.25)',
  },
  ctaPrimaryTxt: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.9,
  },
  ctaSecondaryOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
  },
  ctaSecondaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  ctaCircleIconBlue: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  ctaSecondaryTxt: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.85,
  },
  footerTripId: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginTop: 4,
  },
});
