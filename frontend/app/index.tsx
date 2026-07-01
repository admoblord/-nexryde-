import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Platform,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getUserSession, isUserLoggedIn } from '@/utils/authStorage';
import { setTokens, warmTokenCache } from '@/src/lib/tokenStore';
import { useAppStore } from '@/src/store/appStore';
import { loadDriverState } from '@/src/services/driverStateService';
import { awaitPersistHydration } from '@/src/hooks/usePersistStoreReady';
import { routeAuthedUser } from '@/src/utils/routeAuthedUser';
import { warmBackendConnection } from '@/src/utils/warmBackend';
import { startupLog } from '@/src/utils/driverStartupTrace';
import { timedStartupRequestOrNull } from '@/src/utils/startupRequestLog';
import { STARTUP_REQUEST_TIMEOUT_MS, STARTUP_GLOBAL_WATCHDOG_MS } from '@/src/constants/startupPolicy';

const { width, height } = Dimensions.get('window');

const C = {
  bg: '#0D1420',
  bgMid: '#19253F',
  green: '#00D084',
  greenLight: '#4ADE80',
  greenNeon: '#00D084',
  blue: '#0066FF',
  blueDark: '#1A4FCC',
  white: '#FFFFFF',
  muted: '#A8B8D0',
  dim: '#4B5A72',
};

const DRIVER_CAMERA_RESUME_KEY = '@driver_documents_camera_resume';

export default function SplashScreen() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(false); // show CTA splash after no session
  const [checking, setChecking] = useState(Platform.OS !== 'web');

  const setUser = useAppStore((s) => s.setUser);
  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);

  // Wake Cloud Run while splash/CTA is visible — before user reaches login.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    warmBackendConnection(true);
  }, []);

  // ── Fast-resume: skip animations entirely for returning logged-in users ────
  const [skipAnimation, setSkipAnimation] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    isUserLoggedIn().then((loggedIn) => {
      if (loggedIn) setSkipAnimation(true);
    }).catch(() => {});
  }, []);

  // ── Animation refs ────────────────────────────────────────────────
  const screenFade = useRef(new Animated.Value(0)).current;         // whole screen
  const leftBarY = useRef(new Animated.Value(-120)).current;        // left logo bar slides down
  const rightBarY = useRef(new Animated.Value(120)).current;        // right logo bar slides up
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(20)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(40)).current;

  // Returning users skip entry animation — snap opacities to visible (avoid opacity-0 flash).
  useEffect(() => {
    if (!skipAnimation) return;
    screenFade.setValue(1);
    logoOpacity.setValue(1);
    logoScale.setValue(1);
    textFade.setValue(1);
    textY.setValue(0);
    taglineFade.setValue(1);
    leftBarY.setValue(0);
    rightBarY.setValue(0);
  }, [skipAnimation, screenFade, logoOpacity, logoScale, textFade, textY, taglineFade, leftBarY, rightBarY]);

  // ── Helper ─────────────────────────────────────────────────────────
  const isDriverCameraResumeActive = async (userData: any) => {
    if (userData?.role !== 'driver') return false;
    try {
      const raw = await AsyncStorage.getItem(DRIVER_CAMERA_RESUME_KEY);
      if (!raw) return false;
      const resume = JSON.parse(raw) as { driverId?: string; expiresAt?: number };
      if (!resume?.expiresAt || resume.expiresAt < Date.now()) {
        await AsyncStorage.removeItem(DRIVER_CAMERA_RESUME_KEY);
        return false;
      }
      return !resume.driverId || String(resume.driverId) === String(userData.id);
    } catch { return false; }
  };

  // ── Entry animation (new users only — returning users skip straight to their screen) ──
  useEffect(() => {
    if (Platform.OS === 'web' || skipAnimation) return;

    // Sequence: screen fades in → logo bars slide in → logo scales → text → tagline → dots
    Animated.sequence([
      // Screen fade-in
      Animated.timing(screenFade, { toValue: 1, duration: 300, useNativeDriver: true }),

      // Logo bars animate simultaneously
      Animated.parallel([
        Animated.spring(leftBarY, { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
        Animated.spring(rightBarY, { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      ]),

      // Brand name fades in
      Animated.parallel([
        Animated.timing(textFade, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(textY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ]),

      // Tagline fades in
      Animated.timing(taglineFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Glow pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowScale, { toValue: 1.25, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowScale, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Dots loading animation — sequential wave
    const dotLoop = () => {
      const wave = (anim: Animated.Value, delay: number) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        ]);
      Animated.loop(
        Animated.parallel([
          wave(dot1, 0),
          wave(dot2, 200),
          wave(dot3, 400),
        ])
      ).start();
    };
    const dotTimer = setTimeout(dotLoop, 800);
    return () => clearTimeout(dotTimer);
  }, []);

  // ── Session check ──────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') { setChecking(false); return; }

    const safetyTimeout = setTimeout(() => {
      startupLog('STARTUP_TIMEOUT', { screen: 'splash', afterMs: STARTUP_GLOBAL_WATCHDOG_MS });
      setChecking(false);
    }, STARTUP_GLOBAL_WATCHDOG_MS);
    checkSession();
    return () => clearTimeout(safetyTimeout);
  }, []);

  const checkSession = async () => {
    startupLog('APP_START', { screen: 'splash' });
    try {
      try {
        await awaitPersistHydration();
        const isLoggedIn = await timedStartupRequestOrNull(
          'splash_is_logged_in',
          () => isUserLoggedIn(),
          STARTUP_REQUEST_TIMEOUT_MS,
        );
        if (isLoggedIn) {
          const userData = await timedStartupRequestOrNull(
            'splash_get_user_session',
            () => getUserSession(),
            STARTUP_REQUEST_TIMEOUT_MS,
          );
          if (!userData) { setChecking(false); return; }

          const { isBiometricEnabled, authenticateWithBiometrics, isBiometricSupported } =
            await import('@/utils/authStorage');
          const [bioEnabled, bioSupported, cameraResume] = await Promise.all([
            isBiometricEnabled(),
            isBiometricSupported(),
            isDriverCameraResumeActive(userData),
          ]);

          if (bioEnabled && bioSupported && !cameraResume) {
            const auth = await authenticateWithBiometrics();
            if (!auth.success) { setChecking(false); return; }
          }

          setUser(userData);
          setIsAuthenticated(true);
          void setTokens(userData.token || '', userData.refresh_token);
          void warmTokenCache();

          const authedUser = {
            id: userData.id,
            phone: userData.phone,
            name: userData.name,
            email: userData.email,
            role: userData.role as 'rider' | 'driver',
          };

          if (userData.role === 'driver') {
            const driverState = await loadDriverState(userData.id).catch(() => null);
            if (driverState?.activeTripId) {
              router.replace('/(driver-tabs)/driver-home' as any);
              setChecking(false);
              return;
            }
          }

          void routeAuthedUser(router, authedUser, userData.token || null);
          setChecking(false);
          return;
        }
      } catch { /* storage unavailable */ }

      const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
      if (!onboardingDone) { router.replace('/onboarding'); return; }
      setChecking(false);
    } catch { setChecking(false); }
  };

  // ── CTA splash entry (no session) ─────────────────────────────────
  useEffect(() => {
    if (!checking) {
      setShowSplash(true);
      Animated.parallel([
        Animated.timing(ctaFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(ctaY, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]).start();
    }
  }, [checking]);

  // ── Branded loading state (used for BOTH checking AND splash) ──────
  return (
    <Animated.View style={[styles.root, { opacity: screenFade }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={[C.bg, C.bgMid, C.bg]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Ambient glow orbs */}
      <Animated.View style={[styles.glowOrb, styles.glowOrbGreen, { transform: [{ scale: glowScale }] }]} />
      <Animated.View style={[styles.glowOrb, styles.glowOrbBlue, { transform: [{ scale: glowScale }] }]} />
      <View style={styles.glowOrbCenter} />

      {/* ── LOGO SECTION ───────────────────────────────────────────── */}
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        {/* Left bar — slides down from top */}
        <Animated.View style={[styles.logoBarLeft, { transform: [{ translateY: leftBarY }] }]}>
          <LinearGradient
            colors={[C.greenNeon, C.green]}
            style={styles.logoBarGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </Animated.View>

        {/* Right bar — slides up from bottom */}
        <Animated.View style={[styles.logoBarRight, { transform: [{ translateY: rightBarY }] }]}>
          <LinearGradient
            colors={[C.blue, C.blueDark]}
            style={styles.logoBarGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </Animated.View>

        {/* Road dashes */}
        <View style={styles.road}>
          <View style={styles.roadDash} />
          <View style={styles.roadDash} />
          <View style={styles.roadDash} />
        </View>

        {/* Logo glow */}
        <Animated.View style={[styles.logoGlow, { transform: [{ scale: glowScale }] }]} />
      </Animated.View>

      {/* ── BRAND NAME ─────────────────────────────────────────────── */}
      <Animated.View style={[styles.brandWrap, { opacity: textFade, transform: [{ translateY: textY }] }]}>
        <Text style={styles.brandNex}>NEX</Text>
        <Text style={styles.brandRyde}>RYDE</Text>
      </Animated.View>

      {/* ── TAGLINE ────────────────────────────────────────────────── */}
      <Animated.View style={[styles.taglineBadge, { opacity: taglineFade }]}>
        <View style={[styles.taglineDot, { backgroundColor: C.green }]} />
        <Text style={styles.taglineText}>RIDE SMART · RIDE SAFE</Text>
        <View style={[styles.taglineDot, { backgroundColor: C.blue }]} />
      </Animated.View>

      {/* ── LOADING DOTS (while checking) or CTA (no session) — fixed slot avoids layout jump ── */}
      <View style={styles.bottomActionSlot}>
      {checking ? (
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { opacity: dot1 }]} />
          <Animated.View style={[styles.dot, { opacity: dot2 }]} />
          <Animated.View style={[styles.dot, { opacity: dot3 }]} />
        </View>
      ) : showSplash ? (
        <Animated.View style={[styles.ctaWrap, { opacity: ctaFade, transform: [{ translateY: ctaY }] }]}>
          {/* Feature pills */}
          <View style={styles.featurePills}>
            <View style={styles.featurePill}>
              <Ionicons name="shield-checkmark" size={14} color={C.green} />
              <Text style={styles.featurePillText}>Verified Drivers</Text>
            </View>
            <View style={styles.featurePill}>
              <Ionicons name="cash" size={14} color={C.blue} />
              <Text style={styles.featurePillText}>Fair Pricing</Text>
            </View>
            <View style={styles.featurePill}>
              <Ionicons name="flash" size={14} color="#F59E0B" />
              <Text style={styles.featurePillText}>Fast Pickup</Text>
            </View>
          </View>

          {/* Primary CTA */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={async () => {
              const done = await AsyncStorage.getItem('onboarding_complete');
              router.push(done ? '/(auth)/login' : '/onboarding');
            }}
            accessibilityLabel="Get started"
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[C.greenLight, C.green, C.blue]}
              style={styles.ctaBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaBtnText}>Get Started</Text>
              <View style={styles.ctaArrow}>
                <Ionicons name="arrow-forward" size={20} color={C.bg} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Sign in link */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            style={styles.signinLink}
            activeOpacity={0.7}
          >
            <Text style={styles.signinText}>Already have an account? </Text>
            <Text style={[styles.signinText, { color: C.green, fontWeight: '800' }]}>Sign in</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      </View>

      {/* Bottom tag */}
      <View style={styles.bottomTag}>
        <Text style={styles.bottomTagText}>NIGERIA'S PREMIUM RIDE EXPERIENCE</Text>
      </View>
    </Animated.View>
  );
}

const LOGO_W = 110;
const LOGO_H = 110;
const BAR_W = 40;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Glows ─────────────────────────────────────────────────────────
  glowOrb: {
    position: 'absolute',
    borderRadius: 9999,
  },
  glowOrbGreen: {
    width: 260,
    height: 260,
    top: height * 0.08,
    left: -60,
    backgroundColor: C.green,
    opacity: 0.09,
  },
  glowOrbBlue: {
    width: 220,
    height: 220,
    bottom: height * 0.15,
    right: -40,
    backgroundColor: C.blue,
    opacity: 0.09,
  },
  glowOrbCenter: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: height * 0.3,
    left: width / 2 - 150,
    backgroundColor: '#6366F1',
    opacity: 0.04,
  },

  // ── Logo ──────────────────────────────────────────────────────────
  logoWrap: {
    width: LOGO_W,
    height: LOGO_H,
    position: 'relative',
    marginBottom: 28,
    overflow: 'hidden',
  },
  logoBarLeft: {
    position: 'absolute',
    left: 8,
    top: 0,
    width: BAR_W,
    height: LOGO_H,
    overflow: 'hidden',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    transform: [{ skewX: '-8deg' }],
  },
  logoBarRight: {
    position: 'absolute',
    right: 8,
    top: 0,
    width: BAR_W,
    height: LOGO_H,
    overflow: 'hidden',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    transform: [{ skewX: '8deg' }],
  },
  logoBarGrad: {
    flex: 1,
  },
  road: {
    position: 'absolute',
    left: '50%',
    marginLeft: -3,
    top: 14,
    bottom: 14,
    width: 6,
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 2,
  },
  roadDash: {
    width: 6,
    height: 14,
    backgroundColor: C.white,
    borderRadius: 3,
    opacity: 0.9,
  },
  logoGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 30,
    backgroundColor: C.green,
    opacity: 0.12,
  },

  // ── Brand name ────────────────────────────────────────────────────
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandNex: {
    fontSize: 52,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 4,
  },
  brandRyde: {
    fontSize: 52,
    fontWeight: '900',
    color: C.green,
    letterSpacing: 4,
  },

  // ── Tagline ───────────────────────────────────────────────────────
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    marginBottom: 56,
  },
  taglineDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  taglineText: {
    color: C.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
  },

  // ── Loading dots ──────────────────────────────────────────────────
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  bottomActionSlot: {
    minHeight: 220,
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
  },

  // ── CTA section ───────────────────────────────────────────────────
  ctaWrap: {
    width: '100%',
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  featurePills: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 4,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  featurePillText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '700',
  },
  ctaBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 32,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 14,
  },
  ctaBtnText: {
    color: C.bg,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginRight: 16,
  },
  ctaArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(2,6,23,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signinLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  signinText: {
    color: C.muted,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Bottom tag ────────────────────────────────────────────────────
  bottomTag: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomTagText: {
    color: C.dim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
