import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  StatusBar,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SupportedLanguage, SUPPORTED_LANGUAGES } from '@/src/i18n/translations';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders, getDriverOfMonth, voteDriverOfMonth } from '@/src/services/api';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import { FeatureHubDrawer } from '@/src/components/FeatureHubDrawer';
import { RiderSavedSlotPremiumIcon } from '@/src/components/RiderSavedSlotPremiumIcon';
import { COLORS } from '@/src/constants/theme';
import { BRAND, HOME_PALETTE } from '@/src/constants/designSystem';
import {
  RIDER_HOME_DEST_BAR_BORDER,
  RIDER_HOME_RESUME_ACCENT,
  RIDER_HOME_WALLET_BORDER,
  RIDER_PRIMARY_CTA_GRADIENT,
} from '@/src/constants/riderRideChrome';
import notificationService from '@/src/services/notifications';
import {
  loadRiderSavedPlaces,
  RIDER_SAVED_SLOT_META,
  RIDER_SAVED_SLOTS_ORDER,
  type RiderSavedPlace,
} from '@/src/services/riderSavedPlaces';
import { useFlowLayout } from '@/src/constants/flowLayout';

const ICON_EMERGENCY = '#EF4444';
const ICON_SUPPORT = '#F97316';
const FEAT_LIVE = '#2563EB';
const FEAT_SAFETY = '#F59E0B';

export default function ModernRiderHome() {
  const router = useRouter();
  const { user, token, currentTrip, setCurrentTrip } = useAppStore();
  const firstName =
    (user?.name && String(user.name).trim().split(/\s+/)[0]) || 'there';
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [featureHubOpen, setFeatureHubOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const [driverOfMonth, setDriverOfMonth] = useState<any>(null);
  const [votingDriverId, setVotingDriverId] = useState<string | null>(null);
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [recentTripsLoading, setRecentTripsLoading] = useState(false);
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();
  const gridColW = useMemo(
    () => Math.max(68, Math.floor((flow.width - flow.padH * 2 - 24) / 4)),
    [flow.padH, flow.width],
  );
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [completedTripCount, setCompletedTripCount] = useState<number>(-1);
  const [savedPlaces, setSavedPlaces] = useState<RiderSavedPlace[]>([]);

  const QUICK_FEATURES = [
    {
      id: 'emergency',
      label: t.home.emergency,
      icon: 'warning' as const,
      route: '/(rider-tabs)/rider-safety',
      bg: ICON_EMERGENCY,
    },
    {
      id: 'police',
      label: 'Police & help',
      icon: 'shield' as const,
      route: '/support',
      bg: ICON_SUPPORT,
    },
    {
      id: 'wallet',
      label: 'My Wallet',
      icon: 'wallet' as const,
      route: '/(rider-tabs)/rider-wallet',
      bg: '#7C3AED',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings' as const,
      route: '/settings',
      bg: '#475569',
    },
  ];

  /** Secondary shortcuts — share-trip lives under Quick “Witness”; wallet in hub. */
  const ALL_FEATURES = [
    { id: 'saved-places', label: 'Saved places', icon: 'bookmark' as const, route: '/rider/saved-places', bg: '#0D9488' },
    { id: 'tracking', label: t.home.liveTrack, icon: 'navigate' as const, route: '/rider/tracking', bg: FEAT_LIVE },
    { id: 'safety-center', label: 'Safety Center', icon: 'shield-checkmark' as const, route: '/(rider-tabs)/rider-safety', bg: FEAT_SAFETY },
    { id: 'stories', label: 'Stories', icon: 'book' as const, route: '/stories', bg: HOME_PALETTE.heroPurple },
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
    // Request push notification permission so riders get driver alerts
    void notificationService.initialize().catch(() => {});
  }, []);

  useEffect(() => {
    const enforceRiderVerification = async () => {
      if (!user?.id || user?.role !== 'rider') return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/${user.id}/rider-verification-status`, {
          headers: getAuthHeaders(),
        });
        // Only redirect on explicit 4xx — never on network failures or 5xx
        if (res.status === 401 || res.status === 403) {
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
    enforceRiderVerification();
  }, [router, user?.id, user?.role]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        setSavedPlaces([]);
        return;
      }
      void loadRiderSavedPlaces(user.id).then(setSavedPlaces).catch(() => setSavedPlaces([]));
    }, [user?.id]),
  );

  const openBookToSaved = useCallback(
    (place: RiderSavedPlace) => {
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
    [router],
  );

  useEffect(() => {
    if (!user?.id) return;
    const loadRecentTrips = async () => {
      setRecentTripsLoading(true);
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/trips/rider/${user.id}?limit=3&status=completed`,
          { headers: getAuthHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setRecentTrips(Array.isArray(data?.trips) ? data.trips : []);
        }
      } catch {
        // silent — empty state shown
      } finally {
        setRecentTripsLoading(false);
      }
    };
    loadRecentTrips();
  }, [user?.id]);

  useEffect(() => {
    const loadDriverOfMonth = async () => {
      try {
        const res = await getDriverOfMonth();
        setDriverOfMonth(res.data || null);
      } catch {
        /* optional widget */
      }
    };
    loadDriverOfMonth();
  }, []);

  // Wallet balance + completed trip count for first-ride nudge
  useEffect(() => {
    if (!user?.id) return;
    const loadWalletAndStats = async () => {
      try {
        const headers = getAuthHeaders();
          const [walletRes, tripsRes] = await Promise.allSettled([
          fetch(`${BACKEND_URL}/api/wallet/${user.id}`, { headers }),
          fetch(`${BACKEND_URL}/api/trips/rider/${user.id}?limit=1&status=completed`, { headers }),
        ]);
        if (walletRes.status === 'fulfilled' && walletRes.value.ok) {
          const data = await walletRes.value.json();
          setWalletBalance(Number(data?.balance ?? data?.wallet_balance ?? 0));
        } else {
          // Show strip with ₦0 on failure so the tap-to-open-wallet CTA is always visible
          setWalletBalance(0);
        }
        if (tripsRes.status === 'fulfilled' && tripsRes.value.ok) {
          const data = await tripsRes.value.json();
          const count = Number(data?.total_count ?? data?.count ?? (Array.isArray(data?.trips) ? data.trips.length : -1));
          setCompletedTripCount(count);
        }
      } catch { /* non-critical */ }
    };
    void loadWalletAndStats();
  }, [user?.id]);

  const normalizedCurrentTripStatus = normalizeTripStatus(currentTrip?.status, (currentTrip as any)?.payment_status);
  const showResumeChip = Boolean(currentTrip?.id && isActiveTripStatus(normalizedCurrentTripStatus));

  const riderTripWsEnabled = Boolean(
    user?.id &&
      token &&
      currentTrip?.id &&
      ['pending', 'pending_driver_offers', 'accepted', 'arrived', 'ongoing', 'pending_payment'].includes(
        normalizedCurrentTripStatus
      )
  );

  const handleRiderHomeTripWs = useCallback(
    (msg: RiderTripWsMessage) => {
      const t = (msg.trip || {}) as Record<string, any>;
      const norm = normalizeTripStatus(msg.status, t.payment_status);
      const prev = useAppStore.getState().currentTrip;
      if (!prev || String(prev.id) !== String(msg.trip_id)) return;
      setCurrentTrip({
        ...prev,
        status: norm as typeof prev.status,
        driver_id: (t.driver_id as string) || prev.driver_id,
        fare: t.fare != null ? Number(t.fare) : prev.fare,
      });
    },
    [setCurrentTrip]
  );

  useRiderTripRealtime({
    riderId: user?.id,
    token,
    enabled: riderTripWsEnabled,
    watchTripId: currentTrip?.id ?? null,
    onTripUpdate: handleRiderHomeTripWs,
  });
  const resumeStatusLabel =
    normalizedCurrentTripStatus === 'pending' || normalizedCurrentTripStatus === 'pending_driver_offers'
      ? 'Finding drivers'
      : normalizedCurrentTripStatus === 'accepted'
        ? 'Driver on the way'
        : normalizedCurrentTripStatus === 'arrived'
          ? 'Driver arrived'
          : normalizedCurrentTripStatus === 'ongoing'
            ? 'Trip in progress'
            : normalizedCurrentTripStatus === 'pending_payment'
              ? 'Payment pending'
              : 'Active trip';

  const handleVoteDriverOfMonth = useCallback(
    async (driverId: string) => {
      if (!user?.id) {
        router.push('/(auth)/login' as any);
        return;
      }
      try {
        setVotingDriverId(driverId);
        const res = await voteDriverOfMonth(user.id, driverId);
        setDriverOfMonth(res.data || null);
      } catch (error: any) {
        Alert.alert('Vote unavailable', error?.response?.data?.detail || 'You may have already voted this month.');
      } finally {
        setVotingDriverId(null);
      }
    },
    [router, user?.id]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.gray50} />
      
      {/* HEADER */}
      <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.greeting}>
            {t.common.hello}, {firstName}!
          </Text>
          <Text style={styles.subtitle}>Where would you like to go?</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => setFeatureHubOpen(true)}
            style={styles.headerIconBtn}
            accessibilityLabel="Open feature hub"
            accessibilityRole="button"
          >
            <Ionicons name="menu" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowLangPicker(true)}
            style={styles.headerIconBtnSm}
            accessibilityLabel="Change language"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 18 }}>{SUPPORTED_LANGUAGES.find(l => l.code === language)?.flag || '🌐'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/(rider-tabs)/rider-profile' as any)} accessibilityLabel="Open profile" accessibilityRole="button">
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
              style={styles.profileGradient}
            >
              <Ionicons name="person" size={24} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {showResumeChip ? (
        <TouchableOpacity
          style={[styles.resumeTripChip, { marginHorizontal: flow.padH }]}
          onPress={() => router.push({ pathname: '/rider/tracking', params: { tripId: currentTrip?.id } } as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="navigate-circle" size={16} color="#065F46" />
          <Text style={styles.resumeTripChipText}>
            Resume Trip #{String(currentTrip?.id || '').slice(-6).toUpperCase()} - {resumeStatusLabel}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#065F46" />
        </TouchableOpacity>
      ) : null}

      {/* ── Uber-style "Where to?" destination bar ── */}
      <TouchableOpacity
        style={[styles.whereToBar, { marginHorizontal: flow.padH }]}
        onPress={() => router.push('/rider/book' as any)}
        activeOpacity={0.86}
        accessibilityLabel="Book a ride — Where to?"
        accessibilityRole="button"
      >
        <View style={styles.whereToBarDot} />
        <Text style={styles.whereToBarText}>Where to?</Text>
        <LinearGradient
          colors={[...RIDER_PRIMARY_CTA_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.whereToBarCta}
        >
          <Text style={styles.whereToBarCtaText}>Book</Text>
          <Ionicons name="arrow-forward" size={13} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Language Picker Modal */}
      <Modal visible={showLangPicker} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', paddingTop: 100 }} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={{ marginHorizontal: flow.padH, backgroundColor: '#FFF', borderRadius: 16, padding: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', paddingHorizontal: 12, paddingVertical: 8 }}>SELECT LANGUAGE</Text>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => { setLanguage(lang.code as SupportedLanguage); setShowLangPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: language === lang.code ? '#ECFDF5' : 'transparent', gap: 12 }}
              >
                <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{lang.nativeName}</Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{lang.name}</Text>
                </View>
                {language === lang.code && <Ionicons name="checkmark-circle" size={22} color={COLORS.accentGreen} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Wallet balance strip ─────────────────────────────────── */}
      {walletBalance !== null && (
        <TouchableOpacity
          style={[styles.walletStrip, { marginHorizontal: flow.padH }]}
          onPress={() => router.push('/(rider-tabs)/rider-wallet' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.walletStripLeft}>
            <Ionicons name="wallet-outline" size={16} color={COLORS.accentGreen} />
            <Text style={styles.walletStripLabel}>Wallet</Text>
          </View>
          <Text style={styles.walletStripBalance}>₦{walletBalance.toLocaleString()}</Text>
          <Ionicons name="chevron-forward" size={15} color={COLORS.gray400} />
        </TouchableOpacity>
      )}

      {/* ── First-ride discount nudge (only before first completed trip) ── */}
      {completedTripCount === 0 && (
        <TouchableOpacity
          style={[styles.firstRideBanner, { marginHorizontal: flow.padH }]}
          onPress={() => router.push('/rider/book' as any)}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#16A34A', '#15803D']}
            style={styles.firstRideBannerGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={styles.firstRideBannerIcon}>
              <Ionicons name="gift" size={22} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.firstRideBannerTitle}>🎉 20% off your first ride!</Text>
              <Text style={styles.firstRideBannerSub}>
                Your first-ride discount is ready — book now to use it.
              </Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={26} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      <ScrollView
        style={[styles.content, { paddingHorizontal: flow.padH }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabPad, gap: Math.round(flow.sectionGap * 0.35) }}
      >
        {/* PRIORITY ACTIONS — full-bleed green hero, then two equal cards */}
        <Animated.View
          style={[
            styles.heroSection,
            styles.heroSectionBleed,
            { marginHorizontal: -flow.padH, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.heroCard}
            onPress={() => router.push('/rider/book' as any)}
            activeOpacity={0.9}
            accessibilityLabel="Book a ride"
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
              style={styles.heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.heroContent}>
                <View style={styles.heroIcon}>
                  <Ionicons name="car-sport" size={36} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>{t.home.bookRide}</Text>
                  <Text style={styles.heroSubtitle}>{t.home.whereTo}</Text>
                </View>
              </View>
              <Ionicons name="arrow-forward-circle" size={44} color="rgba(255,255,255,0.95)" />
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.heroRow}>
            <TouchableOpacity
              style={[styles.heroSmallCard, { backgroundColor: HOME_PALETTE.heroPurple }]}
              onPress={() => router.push('/(rider-tabs)/rider-trips' as any)}
              activeOpacity={0.9}
              accessibilityLabel={t.home.myTrips}
              accessibilityRole="button"
            >
              <View style={styles.heroSmallInner}>
                <Ionicons name="time" size={30} color="#FFF" />
                <Text style={styles.heroSmallTitle}>{t.home.myTrips}</Text>
                <Text style={styles.heroSmallSubtitle}>History &amp; receipts</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.heroSmallCard, { backgroundColor: HOME_PALETTE.heroOrange }]}
              onPress={() => setFeatureHubOpen(true)}
              activeOpacity={0.9}
              accessibilityLabel={t.home.allFeatures}
              accessibilityRole="button"
            >
              <View style={styles.heroSmallInner}>
                <Ionicons name="grid" size={30} color="#FFF" />
                <Text style={styles.heroSmallTitle}>{t.home.allFeatures}</Text>
                <Text style={styles.heroSmallSubtitle}>Wallet, schedule & more</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* SAVED PLACES — one-tap destination (pickup = current location on book screen) */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleInline}>Saved places</Text>
            <TouchableOpacity
              onPress={() => router.push('/rider/saved-places' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.seeAll}>
                {savedPlaces.length > 0 ? 'Edit' : 'Set up'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.savedPlacesHint}>
            Book to Home, Work, or a saved spot — pickup defaults to where you are now.
          </Text>
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
                  style={[styles.savedPlaceChip, !place && styles.savedPlaceChipEmpty]}
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
                  <Text style={[styles.savedPlaceLabel, !place && styles.savedPlaceLabelMuted]} numberOfLines={1}>
                    {meta.label}
                  </Text>
                  {place ? (
                    <Text style={styles.savedPlaceAddr} numberOfLines={2}>
                      {place.address}
                    </Text>
                  ) : (
                    <Text style={styles.savedPlaceTap}>Tap to add</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* QUICK ACCESS - ICON ROW */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>{t.home.quickAccess}</Text>
          <View style={styles.quickGrid}>
            {QUICK_FEATURES.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={[styles.quickCard, { width: gridColW }]}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.85}
                accessibilityLabel={feature.label}
                accessibilityRole="button"
              >
                <View style={[styles.quickIcon, { backgroundColor: feature.bg }]}>
                  <Ionicons name={feature.icon as any} size={26} color="#FFF" />
                </View>
                <Text style={styles.quickLabel} numberOfLines={2}>
                  {feature.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {driverOfMonth?.featured_driver ? (
          <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleInline}>Driver of the Month</Text>
              <Text style={styles.seeAll}>{driverOfMonth.month_key}</Text>
            </View>
            <View style={styles.driverOfMonthCard}>
              <LinearGradient colors={['#111827', '#1F2937']} style={styles.driverOfMonthHero}>
                <View style={styles.driverOfMonthBadge}>
                  <Ionicons name="trophy" size={16} color="#92400E" />
                  <Text style={styles.driverOfMonthBadgeText}>Featured winner</Text>
                </View>
                <Text style={styles.driverOfMonthTitle}>{driverOfMonth.featured_driver.name}</Text>
                <Text style={styles.driverOfMonthSubtitle}>{driverOfMonth.subtitle}</Text>
                <View style={styles.driverOfMonthStats}>
                  <View style={styles.driverOfMonthStat}>
                    <Text style={styles.driverOfMonthStatValue}>{driverOfMonth.featured_driver.votes}</Text>
                    <Text style={styles.driverOfMonthStatLabel}>Votes</Text>
                  </View>
                  <View style={styles.driverOfMonthStat}>
                    <Text style={styles.driverOfMonthStatValue}>
                      {Number(driverOfMonth?.featured_driver?.rating ?? 0).toFixed(1)}
                    </Text>
                    <Text style={styles.driverOfMonthStatLabel}>Rating</Text>
                  </View>
                  <View style={styles.driverOfMonthStat}>
                    <Text style={styles.driverOfMonthStatValue}>{driverOfMonth.featured_driver.trip_count}</Text>
                    <Text style={styles.driverOfMonthStatLabel}>Trips</Text>
                  </View>
                </View>
              </LinearGradient>

              <View style={styles.driverOfMonthBody}>
                <Text style={styles.driverOfMonthReward}>
                  Winner gets ₦{Number(driverOfMonth.cash_bonus || 0).toLocaleString()} cash bonus and a trophy delivered home.
                </Text>
                <Text style={styles.driverOfMonthHook}>{driverOfMonth.social_hook}</Text>
                <View style={styles.driverOfMonthCandidateList}>
                  {driverOfMonth.candidates?.slice(0, 3).map((candidate: any, index: number) => (
                    <View key={candidate.driver_id} style={styles.driverOfMonthCandidate}>
                      <View style={styles.driverOfMonthCandidateMeta}>
                        <Text style={styles.driverOfMonthCandidateRank}>#{index + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.driverOfMonthCandidateName}>{candidate.name}</Text>
                          <Text style={styles.driverOfMonthCandidateInfo}>
                            {candidate.votes} votes . {Number(candidate?.rating ?? 0).toFixed(1)} stars
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.driverOfMonthVoteBtn}
                        disabled={votingDriverId === candidate.driver_id}
                        onPress={() => handleVoteDriverOfMonth(candidate.driver_id)}
                      >
                        <Text style={styles.driverOfMonthVoteBtnText}>
                          {votingDriverId === candidate.driver_id ? 'Voting...' : 'Vote'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* RECENT TRIPS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleInline}>{t.home.recentTrips}</Text>
            <TouchableOpacity onPress={() => router.push('/(rider-tabs)/rider-trips' as any)}>
              <Text style={styles.seeAll}>{t.common.viewAll}</Text>
            </TouchableOpacity>
          </View>

          {recentTripsLoading ? (
            <View style={[styles.tripsCard, { alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator size="small" color={COLORS.accentGreen} />
            </View>
          ) : recentTrips.length > 0 ? (
            <View style={styles.tripsCard}>
              {recentTrips.map((trip: any) => {
                const pickup = typeof trip.pickup_location === 'string'
                  ? trip.pickup_location : trip.pickup_location?.address || 'Pickup';
                const dropoff = typeof trip.dropoff_location === 'string'
                  ? trip.dropoff_location : trip.dropoff_location?.address || 'Destination';
                const fare = Number(trip.fare ?? 0);
                const dt = trip.completed_at ? new Date(trip.completed_at) : null;
                const dateStr = dt && !isNaN(dt.getTime())
                  ? dt.toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : '';
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={() => router.push({ pathname: '/rider/trip-receipt', params: { tripId: trip.id } } as any)}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="car-sport" size={18} color="#16a34a" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }} numberOfLines={1}>{pickup} → {dropoff}</Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{dateStr}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#16a34a' }}>₦{fare.toLocaleString()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.tripsCard}>
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: COLORS.accentGreen }]}>
                  <Ionicons name="car-sport" size={40} color="#FFF" />
                </View>
                <Text style={styles.emptyTitle}>No trips yet</Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/rider/book' as any)}
                  accessibilityLabel="Book now"
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                    style={styles.emptyButtonGradient}
                  >
                    <Text style={styles.emptyButtonText}>Book Now</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>

        {/* ALL FEATURES GRID - COMPLETE ACCESS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>{t.home.allFeatures}</Text>
          <View style={styles.allFeaturesGrid}>
            {ALL_FEATURES.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={[styles.featureCard, { width: gridColW }]}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.85}
                accessibilityLabel={feature.label}
                accessibilityRole="button"
              >
                <View style={[styles.featureIcon, { backgroundColor: feature.bg }]}>
                  <Ionicons name={feature.icon as any} size={24} color="#FFF" />
                </View>
                <Text style={styles.featureLabel} numberOfLines={2}>{feature.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <FeatureHubDrawer visible={featureHubOpen} onClose={() => setFeatureHubOpen(false)} role="rider" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    letterSpacing: 0.2,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  headerIconBtnSm: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  resumeTripChip: {
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderLeftWidth: 4,
    borderLeftColor: RIDER_HOME_RESUME_ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: BRAND.primaryNeon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  resumeTripChipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    textTransform: 'capitalize',
  },
  whereToBar: {
    marginTop: 4,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: RIDER_HOME_DEST_BAR_BORDER,
    shadowColor: BRAND.primaryNeon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 4,
  },
  whereToBarDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
    marginRight: 14,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  whereToBarText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.2,
  },
  whereToBarCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(2,44,34,0.12)',
  },
  whereToBarCtaText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.5,
  },
  walletStrip: {
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: RIDER_HOME_WALLET_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
  },
  walletStripLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  walletStripLabel: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  walletStripBalance: { fontSize: 17, fontWeight: '900', color: '#0F172A', letterSpacing: 0.2 },
  firstRideBanner: {
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  firstRideBannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  firstRideBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  firstRideBannerTitle: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  firstRideBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
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
    color: COLORS.lightTextPrimary,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  sectionTitleInline: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 0,
    letterSpacing: 0.5,
  },
  seeAll: {
    fontSize: 15,
    color: COLORS.accentGreen,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  savedPlacesHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
    marginTop: -8,
    paddingHorizontal: 2,
  },
  savedPlacesRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 8,
    paddingBottom: 4,
  },
  savedPlaceChip: {
    width: 152,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  savedPlaceChipEmpty: {
    borderStyle: 'dashed',
    borderColor: 'rgba(100,116,139,0.42)',
    backgroundColor: '#FAFBFD',
  },
  savedPlaceIconWrap: {
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  savedPlaceLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    letterSpacing: -0.2,
  },
  savedPlaceLabelMuted: {
    color: '#64748B',
  },
  savedPlaceAddr: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 6,
    lineHeight: 14,
  },
  savedPlaceTap: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accentGreen,
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
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  driverOfMonthCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
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
    color: COLORS.lightTextPrimary,
    lineHeight: 20,
  },
  driverOfMonthHook: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
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
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
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
    backgroundColor: COLORS.accentGreenSoft,
    color: COLORS.accentGreenDark,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    paddingTop: 8,
  },
  driverOfMonthCandidateName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  driverOfMonthCandidateInfo: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginTop: 2,
  },
  driverOfMonthVoteBtn: {
    backgroundColor: COLORS.accentGreen,
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
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 32,
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
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
    color: COLORS.lightTextPrimary,
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
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  moreIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  moreLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
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
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
});
