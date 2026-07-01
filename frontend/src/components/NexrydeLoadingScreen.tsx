import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NexrydeLogo } from '@/src/components/brand/NexrydeLogo';
import {
  NEX_LOADING,
  NEX_LOADING_STEPS,
  type NexLoadingStepId,
} from '@/src/constants/nexrydeLoadingBrand';

const { width: SCREEN_W } = Dimensions.get('window');

function NexrydeLogoMark({ pulse }: { pulse: Animated.Value }) {
  return (
    <View style={styles.logoOuter}>
      <Animated.View
        style={[
          styles.logoGlow,
          {
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.18],
                }),
              },
            ],
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 0.55],
            }),
          },
        ]}
      />
      <NexrydeLogo size={88} />
    </View>
  );
}

function LoadingDots() {
  const d1 = useRef(new Animated.Value(0.35)).current;
  const d2 = useRef(new Animated.Value(0.35)).current;
  const d3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const wave = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.35, duration: 380, useNativeDriver: true }),
        ]),
      );
    const a = wave(d1, 0);
    const b = wave(d2, 140);
    const c = wave(d3, 280);
    a.start();
    b.start();
    c.start();
    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
  }, [d1, d2, d3]);

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, { opacity: d1 }]} />
      <Animated.View style={[styles.dot, { opacity: d2 }]} />
      <Animated.View style={[styles.dot, { opacity: d3 }]} />
    </View>
  );
}

function StepRow({
  index,
  label,
  icon,
  done,
  active,
}: {
  index: number;
  label: string;
  icon: (typeof NEX_LOADING_STEPS)[0]['icon'];
  done: boolean;
  active: boolean;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepLeft}>
        <Ionicons
          name={done ? 'checkmark-circle' : icon}
          size={20}
          color={done ? NEX_LOADING.green : active ? NEX_LOADING.green : NEX_LOADING.darkGray}
        />
        <Text
          style={[
            styles.stepLabel,
            (done || active) && styles.stepLabelActive,
          ]}
        >
          {label}
        </Text>
      </View>
      {done ? (
        <View style={styles.stepDoneBadge}>
          <Ionicons name="checkmark" size={14} color={NEX_LOADING.bg} />
        </View>
      ) : active ? (
        <LoadingDots />
      ) : (
        <View style={styles.stepPendingBadge}>
          <Text style={styles.stepPendingNum}>{index + 1}</Text>
        </View>
      )}
    </View>
  );
}

export type NexrydeLoadingScreenProps = {
  progress: number;
  completedSteps: NexLoadingStepId[];
  currentStep: NexLoadingStepId | null;
};

export function NexrydeLoadingScreen({
  progress,
  completedSteps,
  currentStep,
}: NexrydeLoadingScreenProps) {
  const glowPulse = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const screenFade = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(16)).current;

  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [glowPulse]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: pct / 100,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pct, progressAnim]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(screenFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(contentY, { toValue: 0, friction: 9, tension: 70, useNativeDriver: true }),
    ]).start();
  }, [screenFade, contentY]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[NEX_LOADING.bg, '#141c28', NEX_LOADING.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <Animated.View
        style={[
          styles.orbGreen,
          {
            opacity: glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] }),
            transform: [
              {
                scale: glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orbBlue,
          {
            opacity: glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.2] }),
          },
        ]}
      />

      <Animated.View
        style={[
          styles.content,
          { opacity: screenFade, transform: [{ translateY: contentY }] },
        ]}
      >
        <NexrydeLogoMark pulse={glowPulse} />
        <Text style={styles.title}>NEXRYDE</Text>
        <Text style={styles.motto}>RIDE SMART. RIDE SAFE.</Text>

        <View style={styles.card}>
          {NEX_LOADING_STEPS.map((step, index) => (
            <StepRow
              key={step.id}
              index={index}
              label={step.label}
              icon={step.icon}
              done={completedSteps.includes(step.id)}
              active={currentStep === step.id}
            />
          ))}
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFillWrap,
                {
                  transform: [
                    { scaleX: progressAnim },
                    { translateX: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-((SCREEN_W - 72) / 2), 0],
                    }) },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={[NEX_LOADING.green, NEX_LOADING.green]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.progressFill}
              >
                {pct >= 12 ? (
                  <Text style={styles.progressPctInBar}>{pct}%</Text>
                ) : null}
              </LinearGradient>
            </Animated.View>
          </View>
          <View style={styles.progressFooter}>
            <View style={styles.loadingLabelRow}>
              <Text style={styles.loadingLabel}>LOADING</Text>
              <LoadingDots />
            </View>
            <Text style={styles.progressPctRight}>{pct}%</Text>
          </View>
        </View>

        <Text style={styles.footer}>Great experiences take a moment</Text>
      </Animated.View>
    </View>
  );
}

const LOGO = 88;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NEX_LOADING.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGreen: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: NEX_LOADING.green,
    top: '18%',
    left: -80,
  },
  orbBlue: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: NEX_LOADING.blue,
    bottom: '22%',
    right: -60,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 0,
  },
  logoOuter: {
    width: LOGO + 24,
    height: LOGO + 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoGlow: {
    position: 'absolute',
    width: LOGO + 20,
    height: LOGO + 20,
    borderRadius: 20,
    backgroundColor: NEX_LOADING.green,
  },
  logoBox: {
    width: LOGO,
    height: LOGO,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${NEX_LOADING.green}44`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGradBg: {
    ...StyleSheet.absoluteFillObject,
  },
  logoLetter: {
    fontSize: 52,
    fontWeight: '900',
    fontStyle: 'italic',
    color: NEX_LOADING.white,
    letterSpacing: -2,
    marginTop: -4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: NEX_LOADING.white,
    letterSpacing: 3,
    marginBottom: 8,
  },
  motto: {
    fontSize: 11,
    fontWeight: '700',
    color: NEX_LOADING.textGray,
    letterSpacing: 3.5,
    marginBottom: 28,
  },
  card: {
    width: '100%',
    backgroundColor: NEX_LOADING.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${NEX_LOADING.green}33`,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 16,
    marginBottom: 22,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: NEX_LOADING.darkGray,
  },
  stepLabelActive: {
    color: NEX_LOADING.white,
    fontWeight: '700',
  },
  stepDoneBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: NEX_LOADING.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPendingBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: NEX_LOADING.bg,
    borderWidth: 1,
    borderColor: NEX_LOADING.borderGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPendingNum: {
    fontSize: 12,
    fontWeight: '800',
    color: NEX_LOADING.darkGray,
  },
  progressWrap: {
    width: '100%',
    marginBottom: 20,
  },
  progressTrack: {
    height: 22,
    borderRadius: 11,
    backgroundColor: NEX_LOADING.track,
    borderWidth: 1,
    borderColor: NEX_LOADING.borderGray,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  progressFillWrap: {
    height: '100%',
    width: SCREEN_W - 72,
  },
  progressFill: {
    flex: 1,
    borderRadius: 11,
    justifyContent: 'center',
    paddingLeft: 10,
    minWidth: 8,
  },
  progressPctInBar: {
    fontSize: 10,
    fontWeight: '900',
    color: NEX_LOADING.bg,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 2,
  },
  loadingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: NEX_LOADING.textGray,
    letterSpacing: 2,
  },
  progressPctRight: {
    fontSize: 11,
    fontWeight: '800',
    color: NEX_LOADING.green,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NEX_LOADING.green,
  },
  footer: {
    fontSize: 12,
    fontWeight: '500',
    color: NEX_LOADING.darkGray,
    textAlign: 'center',
    marginTop: 4,
  },
});
