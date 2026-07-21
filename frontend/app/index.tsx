import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { OnboardingPhotoHero } from '@/src/components/onboarding/OnboardingPhotoHero';

const C = {
  bg: '#0D1420',
  green: '#22E180',
  greenLight: '#6DFFC3',
  blue: '#0066FF',
  blueDark: '#1A4FCC',
  white: '#FFFFFF',
  muted: '#A8B8D0',
};

const DRIVER_CAMERA_RESUME_KEY = '@driver_documents_camera_resume';

export default function SplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showSplash, setShowSplash] = useState(false);
  const [checking, setChecking] = useState(Platform.OS !== 'web');

  const setUser = useAppStore((s) => s.setUser);
  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    warmBackendConnection(true);
  }, []);

  const [skipAnimation, setSkipAnimation] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    isUserLoggedIn()
      .then((loggedIn) => {
        if (loggedIn) setSkipAnimation(true);
      })
      .catch(() => {});
  }, []);

  const screenFade = useRef(new Animated.Value(0)).current;
  const leftBarY = useRef(new Animated.Value(-80)).current;
  const rightBarY = useRef(new Animated.Value(80)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(18)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(28)).current;

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
  }, [
    skipAnimation,
    screenFade,
    logoOpacity,
    logoScale,
    textFade,
    textY,
    taglineFade,
    leftBarY,
    rightBarY,
  ]);

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
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web' || skipAnimation) return;

    Animated.sequence([
      Animated.timing(screenFade, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(leftBarY, { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
        Animated.spring(rightBarY, { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textFade, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(textY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ]),
      Animated.timing(taglineFade, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();

    const wave = (anim: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 320, useNativeDriver: true }),
      ]);
    const dotTimer = setTimeout(() => {
      Animated.loop(
        Animated.parallel([wave(dot1, 0), wave(dot2, 180), wave(dot3, 360)]),
      ).start();
    }, 600);
    return () => clearTimeout(dotTimer);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setChecking(false);
      return;
    }

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
          if (!userData) {
            setChecking(false);
            return;
          }

          const { isBiometricEnabled, authenticateWithBiometrics, isBiometricSupported } =
            await import('@/utils/authStorage');
          const [bioEnabled, bioSupported, cameraResume] = await Promise.all([
            isBiometricEnabled(),
            isBiometricSupported(),
            isDriverCameraResumeActive(userData),
          ]);

          if (bioEnabled && bioSupported && !cameraResume) {
            const auth = await authenticateWithBiometrics();
            if (!auth.success) {
              setChecking(false);
              return;
            }
          }

          setUser(userData);
          setIsAuthenticated(true);
          void setTokens(userData.token || '', userData.refresh_token);
          void warmTokenCache();

          if (userData.role === 'driver') {
            const driverState = await loadDriverState(userData.id).catch(() => null);
            if (driverState?.activeTripId) {
              router.replace('/(driver-tabs)/driver-home' as any);
              setChecking(false);
              return;
            }
          }

          void routeAuthedUser(router, userData, userData.token || null);
          setChecking(false);
          return;
        }
      } catch {
        /* storage unavailable */
      }

      const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
      if (!onboardingDone) {
        router.replace('/onboarding');
        return;
      }
      setChecking(false);
    } catch {
      setChecking(false);
    }
  };

  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (checking || isAuthenticated) return;
    setShowSplash(true);
    Animated.parallel([
      Animated.timing(ctaFade, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.spring(ctaY, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [checking, isAuthenticated, ctaFade, ctaY]);

  return (
    <Animated.View style={[styles.root, { opacity: screenFade }]}>
      <OnboardingPhotoHero
        source={require('../assets/images/onboarding/splash-hero.png')}
        animate={!skipAnimation}
      />

      <View style={[styles.bottomStack, { paddingBottom: Math.max(insets.bottom, 28) }]}>
        <Animated.View
          style={[
            styles.brandBlock,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <View style={styles.logoWrap}>
            <Animated.View style={[styles.logoBarLeft, { transform: [{ translateY: leftBarY }] }]}>
              <LinearGradient
                colors={[C.greenLight, C.green]}
                style={styles.logoBarGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
            </Animated.View>
            <Animated.View style={[styles.logoBarRight, { transform: [{ translateY: rightBarY }] }]}>
              <LinearGradient
                colors={[C.blue, C.blueDark]}
                style={styles.logoBarGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
            </Animated.View>
            <View style={styles.road}>
              <View style={styles.roadDash} />
              <View style={styles.roadDash} />
              <View style={styles.roadDash} />
            </View>
          </View>

          <Animated.View style={[styles.brandRow, { opacity: textFade, transform: [{ translateY: textY }] }]}>
            <Text style={styles.brandNex}>NEX</Text>
            <Text style={styles.brandRyde}>RYDE</Text>
          </Animated.View>

          <Animated.Text style={[styles.heroLine, { opacity: taglineFade }]}>
            Ride anywhere in Nigeria — whenever you're ready.
          </Animated.Text>
        </Animated.View>

        {checking ? (
          <View style={styles.dotsRow}>
            <Animated.View style={[styles.dot, { opacity: dot1 }]} />
            <Animated.View style={[styles.dot, { opacity: dot2 }]} />
            <Animated.View style={[styles.dot, { opacity: dot3 }]} />
          </View>
        ) : showSplash ? (
          <Animated.View style={[styles.ctaWrap, { opacity: ctaFade, transform: [{ translateY: ctaY }] }]}>
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
                <Text style={styles.ctaBtnText}>Get started</Text>
                <View style={styles.ctaArrow}>
                  <Ionicons name="arrow-forward" size={20} color={C.bg} />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/login')}
              style={styles.signinLink}
              activeOpacity={0.7}
            >
              <Text style={styles.signinText}>Already have an account? </Text>
              <Text style={[styles.signinText, { color: C.greenLight, fontWeight: '800' }]}>Sign in</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const LOGO_W = 56;
const LOGO_H = 56;
const BAR_W = 22;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  bottomStack: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    zIndex: 2,
  },
  brandBlock: {
    marginBottom: 28,
  },
  logoWrap: {
    width: LOGO_W,
    height: LOGO_H,
    position: 'relative',
    marginBottom: 18,
    overflow: 'hidden',
    borderRadius: 14,
  },
  logoBarLeft: {
    position: 'absolute',
    left: 4,
    top: 0,
    width: BAR_W,
    height: LOGO_H,
    overflow: 'hidden',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  logoBarRight: {
    position: 'absolute',
    right: 4,
    top: 0,
    width: BAR_W,
    height: LOGO_H,
    overflow: 'hidden',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  logoBarGrad: {
    flex: 1,
  },
  road: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: 10,
    bottom: 10,
    width: 4,
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 2,
  },
  roadDash: {
    width: 4,
    height: 8,
    backgroundColor: C.white,
    borderRadius: 2,
    opacity: 0.95,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  brandNex: {
    fontSize: 42,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 2,
  },
  brandRyde: {
    fontSize: 42,
    fontWeight: '900',
    color: C.green,
    letterSpacing: 2,
  },
  heroLine: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 23,
    maxWidth: 300,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
  },
  ctaWrap: {
    width: '100%',
    gap: 14,
    marginBottom: 4,
  },
  ctaBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 18,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
  },
  ctaBtnText: {
    color: C.bg,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginRight: 14,
  },
  ctaArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(2,6,23,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signinLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  signinText: {
    color: C.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
