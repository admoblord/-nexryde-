/**
 * FindingDriverScreenV2 — Premium "Finding your driver" experience.
 *
 * Design principles (Uber-level and beyond):
 *  • Full-screen dark Google Map: dark custom style, route polyline, animated
 *    pickup pulse, animated taxi markers, ambient simulated cars when empty.
 *  • Radar overlay: 3 concentric rings pulse-expanding from pickup point (pure
 *    RN Animated — no map API required for this effect).
 *  • Floating top pill: green live dot + NEXRYDE + elapsed timer + driver count.
 *  • Bottom glass sheet:
 *      – Route mini card: pickup ↓ destination addresses.
 *      – Info row: fare chip · distance · ETA.
 *      – Phase-aware header: animated spinner / bouncing checkmark / error icon.
 *      – Animated indeterminate progress bar.
 *      – "Drivers contacted" live counter.
 *      – Safety strip.
 *      – Cancel / Try Again / Go Back button.
 *  • Matched phase: confetti-like bounce + driver name display.
 *  • Error phase: icon + body + retry CTA.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { RiderBookingMapNative } from '@/src/components/map/RiderBookingMapNative';
import { FV2 } from '@/src/components/finding/findingV2Theme';

export type FindingDriverPhase = 'searching' | 'error' | 'matched';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

// ─── status message sequences ────────────────────────────────────────────────
// Rotate through contextual messages to keep the rider informed and confident.
const STATUSES_NORMAL = [
  'Scanning nearby drivers…',
  'Matching your request…',
  'Checking driver availability…',
  'Confirming best route…',
  'Contacting drivers in your area…',
  'Sending out your request…',
] as const;
const STATUSES_SLOW = [
  'Expanding search radius…',
  'Reaching more drivers nearby…',
  'Hold tight, almost there…',
  'Widening coverage area…',
  'Drivers are reviewing your offer…',
  'Looking a bit further out…',
] as const;
const STATUSES_VERY_SLOW = [
  'Searching a wider area for you…',
  'Contacting all available drivers…',
  'Stay put, matching in progress…',
  'Finalising your driver match…',
  'Almost confirmed, please wait…',
  'A driver is reviewing your trip…',
] as const;

function fmtElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

type NearbyDriver = {
  driver_id: string;
  name?: string;
  lat: number;
  lng: number;
  status?: string;
  vehicle?: string;
};

type Props = {
  pickupCoords: { lat: number; lng: number } | null;
  destinationCoords: { lat: number; lng: number } | null;
  routePolyline: { latitude: number; longitude: number }[];
  pickup: string;
  nearbyDrivers?: NearbyDriver[];
  pickupAddress: string;
  destinationAddress: string | null;
  bidNgn: number;
  routeKmLabel: string | null;
  routeMinLabel: string | null;
  phase?: FindingDriverPhase;
  timeElapsedSec?: number;
  errorMessage?: string | null;
  matchedDriverName?: string | null;
  onCancel: () => void;
  onUpdateBid: () => void;
  onTryAgain?: () => void;
};

// ─── Radar ring component ─────────────────────────────────────────────────────
function RadarRing({ delay, size }: { delay: number; size: number }) {
  const scale = useRef(new Animated.Value(0.15)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.55,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 2100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.15, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: FV2.green,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FindingDriverScreenV2({
  pickupCoords,
  destinationCoords,
  routePolyline,
  pickup,
  nearbyDrivers = [],
  pickupAddress,
  destinationAddress,
  bidNgn,
  routeKmLabel,
  routeMinLabel,
  phase = 'searching',
  timeElapsedSec = 0,
  errorMessage,
  matchedDriverName,
  onCancel,
  onUpdateBid,
  onTryAgain,
}: Props) {
  const insets = useSafeAreaInsets();
  const isError = phase === 'error';
  const isMatched = phase === 'matched';
  const isSearching = phase === 'searching';

  // ── sheet slide-in ──────────────────────────────────────────────────────
  const sheetSlide = useRef(new Animated.Value(80)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(sheetSlide, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [sheetSlide, sheetOpacity]);

  // ── spinner ─────────────────────────────────────────────────────────────
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isSearching) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isSearching, spin]);
  const spinInterp = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ── progress bar ─────────────────────────────────────────────────────────
  const bar = useRef(new Animated.Value(0)).current;
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    if (!isSearching) return;
    const loop = Animated.loop(
      Animated.timing(bar, {
        toValue: 1,
        duration: 2000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isSearching, bar]);

  // ── status text rotation ─────────────────────────────────────────────────
  const statusFade = useRef(new Animated.Value(1)).current;
  const [statusIdx, setStatusIdx] = useState(0);
  const STATUSES =
    timeElapsedSec >= 60 ? STATUSES_VERY_SLOW : timeElapsedSec >= 30 ? STATUSES_SLOW : STATUSES_NORMAL;
  useEffect(() => {
    const iv = setInterval(() => {
      Animated.timing(statusFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setStatusIdx((i) => (i + 1) % STATUSES.length);
        Animated.timing(statusFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => clearInterval(iv);
  }, [statusFade, STATUSES.length]);

  // ── matched check bounce ─────────────────────────────────────────────────
  const checkScale = useRef(new Animated.Value(0.3)).current;
  const checkRing = useRef(new Animated.Value(0.3)).current;
  const checkRingOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isMatched) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.timing(checkScale, {
        toValue: 1.25,
        duration: 380,
        easing: Easing.out(Easing.back(3)),
        useNativeDriver: true,
      }),
      Animated.timing(checkScale, {
        toValue: 1,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
    const ringLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(checkRing, { toValue: 1.8, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(checkRingOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(checkRing, { toValue: 0.3, duration: 0, useNativeDriver: true }),
          Animated.timing(checkRingOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    ringLoop.start();
    return () => ringLoop.stop();
  }, [isMatched, checkScale, checkRing, checkRingOpacity]);

  // ── top pill enter ───────────────────────────────────────────────────────
  const pillEnter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pillEnter, {
      toValue: 1,
      duration: 550,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pillEnter]);

  // ── live green dot pulse ─────────────────────────────────────────────────
  const dotScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isSearching) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.5, duration: 700, useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isSearching, dotScale]);

  // ── "drivers contacted" counter — only show real numbers ────────────────
  const driversPinged = useMemo(() => {
    // Only count real online drivers — never fabricate numbers
    return nearbyDrivers.length;
  }, [nearbyDrivers.length]);

  // ── only show real drivers on the map — no fake ambient placeholders ─────
  const safePickup = pickupCoords ?? { lat: 6.5244, lng: 3.3792 };
  const allDrivers = useMemo<NearbyDriver[]>(() => {
    return nearbyDrivers; // real only; empty map is honest when no drivers are nearby
  }, [nearbyDrivers]);

  const driverCount = nearbyDrivers.length;

  // ── sheet height (fixed — inner content animates; map controls stay put) ──
  const SHEET_H = Math.round(SCREEN_H * 0.46);

  const handleCancel = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(isError ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    }
    onCancel();
  }, [isError, onCancel]);

  const phaseTitle = isError
    ? 'No driver available right now'
    : isMatched
      ? matchedDriverName ? `${matchedDriverName} accepted!` : 'Driver confirmed!'
      : timeElapsedSec >= 90
        ? 'Still searching for you'
        : timeElapsedSec >= 60
          ? 'Reaching more drivers'
          : timeElapsedSec >= 30
            ? 'Expanding search area'
            : 'Finding your driver';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Full-screen map ──────────────────────────────────────────────── */}
      <View style={StyleSheet.absoluteFillObject}>
        <RiderBookingMapNative
          pickupCoords={safePickup}
          destinationCoords={destinationCoords}
          routePolyline={routePolyline}
          pickup={pickup}
          destination={destinationAddress ?? ''}
          routeLoading={false}
          pulseDropoffHalo={false}
          searchMode
          matchLocked={isMatched}
          nearbyDrivers={allDrivers}
          controlsBottom={SHEET_H + 20}
          debugOverlay={__DEV__}
        />
      </View>

      {/* ── Radar rings overlay (centred on screen horizontally, sits above map) */}
      {isSearching ? (
        <View
          pointerEvents="none"
          style={[
            styles.radarWrap,
            { top: SCREEN_H - SHEET_H - 90 },
          ]}
        >
          <RadarRing delay={0} size={180} />
          <RadarRing delay={800} size={180} />
          <RadarRing delay={1600} size={180} />
        </View>
      ) : null}

      {/* ── Top scrim ────────────────────────────────────────────────────── */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(3,11,26,0.78)', 'rgba(3,11,26,0.38)', 'transparent']}
        locations={[0, 0.55, 1]}
        style={[styles.topScrim, { height: insets.top + 96 }]}
      />

      {/* ── Top pill ─────────────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.topPill,
          {
            top: insets.top + 14,
            opacity: pillEnter,
            transform: [
              {
                translateY: pillEnter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View
          style={[styles.liveDot, { transform: [{ scale: dotScale }] }]}
        />
        <Text style={styles.topBrand}>NEXRYDE</Text>

        {isSearching && timeElapsedSec >= 4 && (
          <View style={styles.timerBadge}>
            <Text style={styles.timerTxt}>{fmtElapsed(timeElapsedSec)}</Text>
          </View>
        )}

        {driverCount > 0 && isSearching && (
          <View style={styles.driversBadge}>
            <View style={styles.driversGreenDot} />
            <Text style={styles.driversBadgeTxt}>
              {driverCount} nearby
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ── Bottom sheet ─────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: SHEET_H,
            paddingBottom: Math.max(insets.bottom + 4, 20),
            transform: [{ translateY: sheetSlide }],
            opacity: sheetOpacity,
          },
        ]}
      >
        {/* top glow line */}
        <LinearGradient
          pointerEvents="none"
          colors={[FV2.greenGlow, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.sheetGlowLine}
        />
        {/* handle */}
        <View style={styles.handle} />

        {/* ── Scrollable inner content ──────────────────────────────────── */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Route mini card */}
          {(pickupAddress || destinationAddress) && !isError ? (
            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={styles.routeIconCol}>
                  <View style={styles.routeDotGreen} />
                  {destinationAddress ? <View style={styles.routeConnector} /> : null}
                </View>
                <Text style={styles.routeAddrTxt} numberOfLines={1}>
                  {pickupAddress || 'Your location'}
                </Text>
              </View>
              {destinationAddress ? (
                <View style={styles.routeRow}>
                  <View style={styles.routeIconCol}>
                    <View style={styles.routeDotRed} />
                  </View>
                  <Text style={styles.routeAddrTxt} numberOfLines={1}>
                    {destinationAddress}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Phase content */}
          {isError ? (
            <View style={styles.errorInner}>
              <View style={styles.errorIconWrap}>
                <Ionicons name="wifi-outline" size={28} color={FV2.red} />
              </View>
              <Text style={styles.phaseTitleTxt}>No driver available right now</Text>
              <Text style={styles.errorBodyTxt}>
                {errorMessage ?? 'No drivers in your area at the moment. Try again or adjust your fare offer to attract more drivers.'}
              </Text>
              {onTryAgain ? (
                <TouchableOpacity
                  style={styles.tryAgainBtn}
                  onPress={() => {
                    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onTryAgain();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <LinearGradient
                    colors={[FV2.greenBright, FV2.green]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.tryAgainGrad}
                  >
                    <Ionicons name="refresh" size={16} color={FV2.greenInk} />
                    <Text style={styles.tryAgainTxt}>Try Again</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : isMatched ? (
            <View style={styles.matchedInner}>
              <View style={styles.matchedIconWrap}>
                <Animated.View
                  style={[
                    styles.matchedRing,
                    { transform: [{ scale: checkRing }], opacity: checkRingOpacity },
                  ]}
                />
                <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                  <LinearGradient
                    colors={[FV2.greenBright, FV2.green]}
                    style={styles.matchedCheckCircle}
                  >
                    <Ionicons name="checkmark" size={30} color={FV2.greenInk} />
                  </LinearGradient>
                </Animated.View>
              </View>
              <Text style={styles.phaseTitleTxt}>{phaseTitle}</Text>
              <Text style={styles.matchedSubTxt}>Opening live tracking…</Text>
            </View>
          ) : (
            <View style={styles.searchInner}>
              {/* Status row */}
              <View style={styles.statusRow}>
                <View style={styles.spinnerWrap}>
                  <Animated.View style={[styles.spinOuter, { transform: [{ rotate: spinInterp }] }]}>
                    <View style={styles.spinArc} />
                  </Animated.View>
                  <View style={styles.spinInner} />
                </View>
                <View style={styles.statusTextCol}>
                  <Text style={styles.phaseTitleTxt} numberOfLines={1}>{phaseTitle}</Text>
                  <Animated.Text
                    style={[styles.statusSubTxt, { opacity: statusFade }]}
                    numberOfLines={1}
                    accessibilityLiveRegion="polite"
                  >
                    {STATUSES[statusIdx]}
                  </Animated.Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.barTrack} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
                <LinearGradient
                  colors={['transparent', 'rgba(0,208,132,0.08)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
                {barW > 0 ? (
                  <Animated.View
                    style={[
                      styles.barFill,
                      {
                        width: barW * 0.42,
                        transform: [{
                          translateX: bar.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-barW * 0.42, barW],
                          }),
                        }],
                      },
                    ]}
                  />
                ) : null}
              </View>

              {/* Info chips */}
              <View style={styles.infoRow}>
                {bidNgn > 0 ? (
                  <TouchableOpacity
                    style={styles.fareChip}
                    onPress={() => {
                      if (Platform.OS !== 'web') void Haptics.selectionAsync();
                      onUpdateBid();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Fare: ${bidNgn} naira. Tap to update.`}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <Ionicons name="cash-outline" size={13} color={FV2.greenInk} />
                    <Text style={styles.fareChipTxt}>
                      ₦{Math.round(bidNgn).toLocaleString('en-NG')}
                    </Text>
                    <Ionicons name="chevron-up" size={11} color={FV2.greenInk} />
                  </TouchableOpacity>
                ) : null}
                {routeKmLabel ? (
                  <View style={styles.infoChip}>
                    <Ionicons name="navigate-outline" size={12} color={FV2.sub} />
                    <Text style={styles.infoChipTxt}>{routeKmLabel}</Text>
                  </View>
                ) : null}
                {routeMinLabel ? (
                  <View style={styles.infoChip}>
                    <Ionicons name="time-outline" size={12} color={FV2.sub} />
                    <Text style={styles.infoChipTxt}>{routeMinLabel}</Text>
                  </View>
                ) : null}
              </View>

              {/* Drivers nearby — only shown when we have real data */}
              {driversPinged > 0 ? (
                <View style={styles.pinnedRow}>
                  <Ionicons name="radio-outline" size={13} color={FV2.green} />
                  <Text style={styles.pinnedTxt}>
                    {timeElapsedSec >= 60
                      ? <><Text style={styles.pinnedCount}>{driversPinged}</Text> drivers in your area</>
                      : <>Searching <Text style={styles.pinnedCount}>{driversPinged}</Text> nearby drivers</>
                    }
                  </Text>
                </View>
              ) : timeElapsedSec > 5 ? (
                <View style={styles.pinnedRow}>
                  <Ionicons name="search-outline" size={13} color={FV2.sub} />
                  <Text style={styles.pinnedTxt}>Scanning for available drivers…</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Safety strip */}
          {!isError ? (
            <View style={styles.safetyStrip}>
              <View style={styles.safetyDot} />
              <Text style={styles.safetyTxt}>All NexRyde drivers are verified &amp; background-checked</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* ── Cancel / Go Back — always pinned at sheet bottom ─────────── */}
        {!isMatched ? (
          <TouchableOpacity
            style={[styles.cancelBtn, isError && styles.cancelBtnSecondary]}
            onPress={handleCancel}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={isError ? 'Go back to booking' : 'Cancel ride request'}
          >
            <Ionicons
              name={isError ? 'arrow-back-outline' : 'close-circle-outline'}
              size={18}
              color={isError ? FV2.sub : FV2.red}
            />
            <Text style={[styles.cancelTxt, isError && styles.cancelTxtSecondary]}>
              {isError ? 'Go Back' : 'Cancel request'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {!isError && !isMatched ? (
          <Text style={styles.cancelHint}>You can cancel anytime before a driver accepts.</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const SHEET_RADIUS = 30;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030B1A' },

  // ── radar ──────────────────────────────────────────────────────────────────
  radarWrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 180,
    height: 180,
  },

  // ── top ────────────────────────────────────────────────────────────────────
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  topPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(3,11,26,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: FV2.green,
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  topBrand: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.2,
    color: FV2.text,
  },
  timerBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timerTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: FV2.sub,
    fontVariant: ['tabular-nums'],
  },
  driversBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,208,132,0.13)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.3)',
  },
  driversGreenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: FV2.green,
  },
  driversBadgeTxt: { fontSize: 11, fontWeight: '800', color: FV2.green },

  // ── sheet ───────────────────────────────────────────────────────────────────
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(5,12,24,0.97)',
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.7,
    shadowRadius: 30,
    elevation: 28,
    overflow: 'hidden',
  },
  scrollArea: { flex: 1 },
  scrollContent: { gap: 11, paddingBottom: 4 },
  sheetGlowLine: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 2,
    borderRadius: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  // ── route card ──────────────────────────────────────────────────────────────
  routeCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeIconCol: {
    width: 16,
    alignItems: 'center',
    gap: 2,
  },
  routeDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: FV2.green,
    shadowColor: FV2.green,
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 3,
  },
  routeConnector: {
    width: 1.5,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 1,
    marginTop: 2,
  },
  routeDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4466',
    shadowColor: '#FF4466',
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 3,
  },
  routeAddrTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: FV2.text,
    letterSpacing: -0.1,
  },

  // ── searching inner ──────────────────────────────────────────────────────────
  searchInner: { gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  spinnerWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinOuter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: FV2.green,
    borderRightColor: 'rgba(0,208,132,0.4)',
  },
  spinArc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'rgba(0,208,132,0.1)',
  },
  spinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0,208,132,0.35)',
  },
  statusTextCol: { flex: 1 },
  phaseTitleTxt: {
    fontSize: 17,
    fontWeight: '900',
    color: FV2.text,
    letterSpacing: -0.4,
  },
  statusSubTxt: {
    fontSize: 12.5,
    fontWeight: '600',
    color: FV2.sub,
    marginTop: 2,
  },

  // ── progress bar ─────────────────────────────────────────────────────────────
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: FV2.green,
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },

  // ── info row ─────────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  fareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: FV2.green,
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  fareChipTxt: {
    fontSize: 13.5,
    fontWeight: '900',
    color: FV2.greenInk,
    fontVariant: ['tabular-nums'],
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  infoChipTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: FV2.sub,
  },

  // ── drivers contacted ─────────────────────────────────────────────────────────
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pinnedTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: FV2.faint,
  },
  pinnedCount: {
    color: FV2.green,
    fontWeight: '800',
  },

  // ── safety strip ──────────────────────────────────────────────────────────────
  safetyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(0,208,132,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.13)',
  },
  safetyDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: FV2.green,
    shadowColor: FV2.green,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
    flexShrink: 0,
  },
  safetyTxt: { fontSize: 11.5, fontWeight: '700', color: FV2.sub, flex: 1 },

  // ── cancel ────────────────────────────────────────────────────────────────────
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,90,90,0.45)',
    backgroundColor: 'rgba(255,90,90,0.07)',
  },
  cancelBtnSecondary: {
    borderColor: 'rgba(154,175,200,0.25)',
    backgroundColor: 'rgba(154,175,200,0.05)',
  },
  cancelTxt: {
    fontSize: 14.5,
    fontWeight: '900',
    color: FV2.red,
    letterSpacing: 0.1,
  },
  cancelTxtSecondary: { color: FV2.sub },
  cancelHint: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: FV2.faint,
  },

  // ── matched ───────────────────────────────────────────────────────────────────
  matchedInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  matchedIconWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: FV2.green,
  },
  matchedCheckCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 18,
  },
  matchedSubTxt: {
    fontSize: 13.5,
    fontWeight: '600',
    color: FV2.sub,
  },

  // ── error ─────────────────────────────────────────────────────────────────────
  errorInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,90,90,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,90,90,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBodyTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: FV2.sub,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  tryAgainBtn: {
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  tryAgainGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 26,
    paddingVertical: 13,
  },
  tryAgainTxt: { fontSize: 14.5, fontWeight: '900', color: FV2.greenInk },
});
