import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  StatusBar,
  Alert,
} from 'react-native';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useSegments } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { BACKEND_URL } from '@/src/services/api';
import { logLegalGateCheck, syncUserLegalStatus } from '@/src/services/legalStatusSync';
import { replaceLegalTermsIfNeeded } from '@/src/utils/navigationRouteGuard';
import { normalizeTripStatus, resolveRiderScreenStatus } from '@/src/utils/tripStatus';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import { FeatureHubDrawer } from '@/src/components/FeatureHubDrawer';
import { RiderSavedSlotPremiumIcon } from '@/src/components/RiderSavedSlotPremiumIcon';
import { useThemeColors } from '@/src/constants/theme';
import { BRAND, SURFACE, HOME_PALETTE } from '@/src/constants/designSystem';
import { RIDER_HOME_DEST_BAR_BORDER } from '@/src/constants/riderRideChrome';
import notificationService from '@/src/services/notifications';
import {
  loadRiderSavedPlaces,
  RIDER_SAVED_SLOT_META,
  RIDER_SAVED_SLOTS_ORDER,
  type RiderSavedPlace,
} from '@/src/services/riderSavedPlaces';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { RiderFavoritesHomeStrip } from '@/src/components/rider/RiderFavoritesHomeStrip';
import { RiderActiveTripHomePanel } from '@/src/components/rider/RiderActiveTripHomePanel';
import { RiderHomeMapStrip } from '@/src/components/map/RiderHomeMapStrip';
import { TripMapErrorBoundary } from '@/src/components/TripMapErrorBoundary';
import { pullAndApplyActiveTrip } from '@/src/services/activeTripSync';
import { useRiderHasActiveTrip, useRiderActiveTripPhase } from '@/src/hooks/useRiderHasActiveTrip';
import { riderTripStatusHeadline } from '@/src/constants/riderActiveTripDisplay';
import type { RiderTripDisplayOpts } from '@/src/utils/tripPaymentMethod';

export default function ModernRiderHome() {
  const router = useRouter();
  const segments = useSegments();
  // Tear down native MapView when this tab is blurred (single-map OOM policy).
  const isFocused = useIsFocused();
  const { canCallAuthedApi } = useAuthedApiReady();
  const { userId: riderId } = useAuthedUserId();
  // Scoped selectors — avoid re-rendering Home on unrelated store changes.
  const user = useAppStore((s) => s.user);
  const currentTrip = useAppStore((s) => s.currentTrip);
  const setCurrentTrip = useAppStore((s) => s.setCurrentTrip);
  const firstName =
    (user?.name && String(user.name).trim().split(/\s+/)[0]) || 'there';
  // Start visible — a 600ms fade made Home chips/bars feel lagged after login.
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [featureHubOpen, setFeatureHubOpen] = useState(false);
  const { t } = useLanguage();
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();
  const [savedPlaces, setSavedPlaces] = useState<RiderSavedPlace[]>([]);
  const hasActiveTrip = useRiderHasActiveTrip();
  const activeTripPhase = useRiderActiveTripPhase();
  const activeTripFade = useRef(new Animated.Value(hasActiveTrip ? 1 : 0)).current;
  const { colors, isDark } = useThemeColors();
  const homeTheme = useMemo(
    () => ({
      screen: colors.background,
      activeScreen: isDark ? '#071525' : colors.surface,
      card: isDark ? SURFACE.cardDark : colors.card,
      cardSoft: isDark ? SURFACE.glassSoft : colors.surfaceAlt,
      border: isDark ? SURFACE.hairline : colors.border,
      text: colors.text,
      sub: colors.textMuted,
      iconButton: isDark ? SURFACE.glassSoft : colors.surface,
      whereBar: isDark ? SURFACE.glassSoft : colors.card,
    }),
    [colors, isDark],
  );

  useEffect(() => {
    Animated.timing(activeTripFade, {
      toValue: hasActiveTrip ? 1 : 0,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [hasActiveTrip, activeTripFade]);

  useEffect(() => {
    // Request push notification permission so riders get driver alerts
    void notificationService.initialize().catch(() => {});
  }, []);

  useEffect(() => {
    const enforceRiderVerification = async () => {
      if (!canCallAuthedApi || !riderId || user?.role !== 'rider') return;
      // Paint Home first; run legal + verification in parallel (was sequential ~1.5s).
      const { authedFetch } = await import('@/src/utils/sessionRefresh');
      const [legalSynced, verifyRes] = await Promise.all([
        syncUserLegalStatus(riderId),
        authedFetch(`${BACKEND_URL}/api/users/${riderId}/rider-verification-status`, {
          method: 'GET',
          preserveSessionOn401: true,
          timeoutMs: 8_000,
        }).catch(() => null),
      ]);
      const effectiveUser = useAppStore.getState().user ?? user;
      if (logLegalGateCheck(effectiveUser, 'rider-home') || (legalSynced && logLegalGateCheck({ ...effectiveUser, ...legalSynced }, 'rider-home'))) {
        replaceLegalTermsIfNeeded(router, 'rider', segments);
        return;
      }
      try {
        const res = verifyRes;
        if (!res) return;
        // Auth / identity errors → re-login only when we had a token (avoid pre-hydration 401).
        if (res.status === 401 || res.status === 403) {
          router.replace('/(auth)/login');
          return;
        }
        if (res.status === 404) {
          router.replace('/(auth)/rider-verification');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data?.completed === false) {
            router.replace('/(auth)/rider-verification');
          }
        }
        // else: network error / 5xx — stay on home, don't kick user out
      } catch {
        // Network error — don't redirect, let the user stay on home
      }
    };
    void enforceRiderVerification();
  }, [canCallAuthedApi, router, riderId, segments, user?.role, user?.terms_accepted, user?.terms_version, user?.privacy_accepted, user?.privacy_version]);

  // Prefetch saved places on mount so chips aren't empty on first focus.
  useEffect(() => {
    if (!riderId || !canCallAuthedApi) return;
    void loadRiderSavedPlaces(riderId).then((places) => setSavedPlaces(places)).catch(() => {});
  }, [riderId, canCallAuthedApi]);

  const lastHomeFocusSyncRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!riderId || !canCallAuthedApi) {
        setSavedPlaces([]);
        return;
      }
      // Tab-switch back to Home shouldn't repeat this network + storage work
      // every time — throttle so rapid tab hopping stays snappy.
      const now = Date.now();
      if (now - lastHomeFocusSyncRef.current < 15000) return;
      lastHomeFocusSyncRef.current = now;
      void loadRiderSavedPlaces(riderId).then(setSavedPlaces).catch(() => setSavedPlaces([]));
      void pullAndApplyActiveTrip(riderId);
    }, [riderId, canCallAuthedApi]),
  );

  const openBookToSaved = useCallback(
    (place: RiderSavedPlace) => {
      if (hasActiveTrip) {
        Alert.alert(
          'Ride in progress',
          'Finish or cancel your current trip before booking another ride.',
        );
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/rider/book',
        params: {
          dropoff: place.address,
          dropoffLat: String(place.lat),
          dropoffLng: String(place.lng),
        },
      } as any);
    },
    [router, hasActiveTrip],
  );

  const openBook = useCallback(() => {
    if (hasActiveTrip) {
      Alert.alert(
        'Ride in progress',
        'Finish or cancel your current trip before booking another ride.',
      );
      return;
    }
    router.push('/rider/book' as any);
  }, [router, hasActiveTrip]);

  const normalizedCurrentTripStatus = normalizeTripStatus(currentTrip?.status, (currentTrip as any)?.payment_status);

  const riderTripWsEnabled = Boolean(
    riderId &&
      canCallAuthedApi &&
      currentTrip?.id &&
      ['pending', 'pending_driver_offers', 'accepted', 'arrived', 'ongoing', 'pending_payment'].includes(
        normalizedCurrentTripStatus
      )
  );

  const handleRiderHomeTripWs = useCallback(
    (msg: RiderTripWsMessage) => {
      const t = (msg.trip || {}) as Record<string, any>;
      const norm = resolveRiderScreenStatus(msg.status, t.payment_status, t.payment_method);
      const prev = useAppStore.getState().currentTrip;
      if (!prev || String(prev.id) !== String(msg.trip_id)) return;
      setCurrentTrip({
        ...prev,
        ...t,
        status: norm as typeof prev.status,
        driver_id: (t.driver_id as string) || prev.driver_id,
        fare: t.fare != null ? Number(t.fare) : prev.fare,
        ride_version: typeof msg.ride_version === 'number' ? msg.ride_version : (t.ride_version as number | undefined),
        state_sequence: typeof msg.state_sequence === 'number' ? msg.state_sequence : (t.state_sequence as number | undefined),
        state_updated_at: (msg.state_updated_at as string | undefined) || (t.state_updated_at as string | undefined),
      });
    },
    [setCurrentTrip]
  );

  useRiderTripRealtime({
    riderId,
    enabled: riderTripWsEnabled,
    watchTripId: currentTrip?.id ?? null,
    onTripUpdate: handleRiderHomeTripWs,
  });

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: hasActiveTrip ? homeTheme.activeScreen : homeTheme.screen },
      ]}
      edges={['top']}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={homeTheme.screen} />
      
      {/* HEADER */}
      <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[styles.greeting, { color: homeTheme.text }]}>
              {t.common.hello}, {firstName}!
            </Text>
            {hasActiveTrip && activeTripPhase ? (
              <View style={styles.liveHeaderBadge}>
                <View style={styles.liveHeaderDot} />
                <Text style={styles.liveHeaderTxt}>LIVE</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.subtitle, { color: homeTheme.sub }]}>
            {hasActiveTrip && activeTripPhase && currentTrip
              ? riderTripStatusHeadline(activeTripPhase, {
                  paymentMethod: currentTrip.payment_method,
                  paymentStatus: currentTrip.payment_status,
                  tripStatus: currentTrip.status,
                } satisfies RiderTripDisplayOpts)
              : 'Live map · book in seconds'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => setFeatureHubOpen(true)}
            style={[styles.headerIconBtn, { backgroundColor: homeTheme.iconButton, borderColor: homeTheme.border }]}
            accessibilityLabel="Open feature hub"
            accessibilityRole="button"
          >
            <Ionicons name="menu" size={24} color={homeTheme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/(rider-tabs)/rider-profile' as any)} accessibilityLabel="Open profile" accessibilityRole="button">
            <LinearGradient
              colors={[BRAND.primary, BRAND.primaryDark]}
              style={styles.profileGradient}
            >
              <Ionicons name="person" size={24} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {!hasActiveTrip ? (
        <>
          <TouchableOpacity
            style={[
              styles.whereToBar,
              {
                marginHorizontal: flow.padH,
                backgroundColor: homeTheme.whereBar,
                borderColor: isDark ? RIDER_HOME_DEST_BAR_BORDER : colors.borderStrong,
              },
            ]}
            onPress={openBook}
            activeOpacity={0.86}
            accessibilityLabel="Book a ride — Where to?"
            accessibilityRole="button"
          >
            <View style={styles.whereToBarDot} />
            <Text style={[styles.whereToBarText, { color: homeTheme.sub }]}>Where to?</Text>
            <View style={styles.whereToGoPill}>
              <Text style={styles.whereToGoPillTxt}>Go</Text>
            </View>
          </TouchableOpacity>
          <View style={{ marginHorizontal: flow.padH }}>
            <TripMapErrorBoundary>
              {isFocused ? (
                <RiderHomeMapStrip isDark={isDark} height={260} onPress={openBook} />
              ) : (
                <View style={{ height: 260, borderRadius: 16, backgroundColor: isDark ? '#0B1220' : '#E2E8F0' }} />
              )}
            </TripMapErrorBoundary>
          </View>
        </>
      ) : null}

      <ScrollView
        style={[styles.content, { paddingHorizontal: flow.padH }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabPad, gap: Math.round(flow.sectionGap * 0.35) }}
      >
        {hasActiveTrip ? (
          <Animated.View style={{ marginTop: 4, opacity: activeTripFade, transform: [{ translateY: activeTripFade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
            <RiderActiveTripHomePanel />
          </Animated.View>
        ) : (
        <>
        {/* SAVED PLACES — one-tap destination (pickup = current location on book screen) */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitleInline, { color: homeTheme.text }]}>Saved places</Text>
            <TouchableOpacity
              onPress={() => router.push('/rider/saved-places' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.seeAll}>
                {savedPlaces.length > 0 ? 'Edit' : 'Set up'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.savedPlacesRow}
          >
            {RIDER_SAVED_SLOTS_ORDER.map((slot) => {
              const meta = RIDER_SAVED_SLOT_META[slot];
              const place = savedPlaces.find((p) => p.slot === slot);
              return (
                <TouchableOpacity
                  key={slot}
                  style={[
                    styles.savedPlaceChip,
                    { backgroundColor: homeTheme.card, borderColor: homeTheme.border },
                    !place && [styles.savedPlaceChipEmpty, { backgroundColor: homeTheme.cardSoft, borderColor: isDark ? SURFACE.glassBorder : colors.borderStrong }],
                  ]}
                  onPress={() => {
                    if (place) openBookToSaved(place);
                    else {
                      void Haptics.selectionAsync();
                      router.push('/rider/saved-places' as any);
                    }
                  }}
                  activeOpacity={0.88}
                  accessibilityLabel={place ? `Book to ${meta.label}` : `Set ${meta.label}`}
                  accessibilityRole="button"
                >
                  <RiderSavedSlotPremiumIcon slot={slot} filled={!!place} style={styles.savedPlaceIconWrap} />
                  <Text style={[styles.savedPlaceLabel, { color: homeTheme.text }, !place && { color: homeTheme.sub }]} numberOfLines={1}>
                    {meta.label}
                  </Text>
                  {place ? (
                    <Text style={[styles.savedPlaceAddr, { color: homeTheme.sub }]} numberOfLines={2}>
                      {place.address}
                    </Text>
                  ) : (
                    <Text style={styles.savedPlaceTap}>Add place</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* FAVOURITE DRIVERS — one-tap rebook trusted drivers */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <RiderFavoritesHomeStrip />
        </Animated.View>
        </>
        )}
      </ScrollView>

      <FeatureHubDrawer visible={featureHubOpen} onClose={() => setFeatureHubOpen(false)} role="rider" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bgDeep,
  },
  containerActiveTrip: {
    backgroundColor: '#071525',
  },
  liveHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: BRAND.primaryMuted,
    borderWidth: 1,
    borderColor: SURFACE.glassBorder,
  },
  liveHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.primary,
  },
  liveHeaderTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: BRAND.primary,
    letterSpacing: 0.8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '900',
    color: BRAND.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.textSecondary,
    letterSpacing: 0.1,
    lineHeight: 21,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: SURFACE.glassSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
  },
  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  profileGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  whereToBar: {
    marginTop: 4,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE.glassSoft,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: RIDER_HOME_DEST_BAR_BORDER,
  },
  whereToBarDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BRAND.primary,
    marginRight: 14,
  },
  whereToBarText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.textSecondary,
    letterSpacing: 0.2,
  },
  whereToGoPill: {
    backgroundColor: BRAND.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  whereToGoPillTxt: {
    color: BRAND.bgDeep,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  heroSection: {
    marginTop: 8,
  },
  heroSectionBleed: {},
  heroCard: {
    minHeight: 196,
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  heroGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
    paddingVertical: 24,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
  },
  heroSmallCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroSmallInner: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  heroSmallTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    marginTop: 12,
    marginBottom: 3,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroSmallSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.3,
  },
  section: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: BRAND.textPrimary,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  sectionTitleInline: {
    fontSize: 22,
    fontWeight: '900',
    color: BRAND.textPrimary,
    marginBottom: 0,
    letterSpacing: 0.5,
  },
  seeAll: {
    fontSize: 15,
    color: BRAND.primary,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  savedPlacesRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 8,
    paddingBottom: 4,
  },
  savedPlaceChip: {
    width: 152,
    backgroundColor: SURFACE.cardDark,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
  },
  savedPlaceChipEmpty: {
    borderStyle: 'dashed',
    borderColor: SURFACE.glassBorder,
    backgroundColor: SURFACE.glassSoft,
  },
  savedPlaceIconWrap: {
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  savedPlaceLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -0.2,
  },
  savedPlaceLabelMuted: {
    color: BRAND.textSecondary,
  },
  savedPlaceAddr: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.textMuted,
    marginTop: 6,
    lineHeight: 14,
  },
  savedPlaceTap: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.primary,
    marginTop: 8,
  },
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickCard: {
    alignItems: 'center',
  },
  quickIcon: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  driverOfMonthCard: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SURFACE.hairline,
  },
  driverOfMonthHero: {
    padding: 20,
  },
  driverOfMonthBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  driverOfMonthBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  driverOfMonthTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 6,
  },
  driverOfMonthSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  driverOfMonthStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  driverOfMonthStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 12,
  },
  driverOfMonthStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
  },
  driverOfMonthStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  driverOfMonthBody: {
    padding: 18,
  },
  driverOfMonthReward: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.textPrimary,
    lineHeight: 20,
  },
  driverOfMonthHook: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
  driverOfMonthCandidateList: {
    marginTop: 16,
    gap: 12,
  },
  driverOfMonthCandidate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: SURFACE.glassSoft,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
  },
  driverOfMonthCandidateMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverOfMonthCandidateRank: {
    width: 34,
    height: 34,
    borderRadius: 17,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: BRAND.primaryMuted,
    color: BRAND.primary,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    paddingTop: 8,
  },
  driverOfMonthCandidateName: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  driverOfMonthCandidateInfo: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  driverOfMonthVoteBtn: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  driverOfMonthVoteBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  tripsCard: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginBottom: 8,
  },
  emptyButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  moreList: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SURFACE.hairline,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE.hairline,
  },
  moreIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  moreLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.textPrimary,
  },
  // ALL FEATURES GRID
  allFeaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  featureCard: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  featureIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  featureLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
});

export { ErrorBoundary } from '@/src/components/rider/RiderScreenErrorBoundary';
