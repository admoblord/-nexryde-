/**
 * TurnCard.tsx
 * Turn-by-turn navigation overlay card.
 *
 * Shows:
 *  - Large animated turn arrow (rotation based on maneuver type)
 *  - Distance to next turn (color-coded: green / amber / red)
 *  - Full instruction text
 *  - Next step preview
 *  - Step progress dots
 *  - Mute / unmute speaker button
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NavStep } from './navUtils';
import {
  fmtDistanceDisplay,
  maneuverToRotation,
  maneuverToColor,
} from './navUtils';

interface TurnCardProps {
  loading: boolean;
  currentStep: NavStep | null;
  nextStep: NavStep | null;
  distToStep: number | null;
  /** Total metres for the current segment (for progress bar) */
  totalRouteM?: number;
  /** Metres remaining on the whole segment */
  remainingRouteM?: number | null;
  stepIndex: number;
  totalSteps: number;
  /** Driver's current speed in km/h (from GPS or haversine delta) */
  speedKmh?: number | null;
  muted: boolean;
  onToggleMute: () => void;
  /** Whether nav is active at all */
  active: boolean;
  /** Pass 'arrived' to show the pickup code waiting card */
  tripStatus?: string;
}

// ── Arrived-at-pickup card (unique to NEXRYDE — shown instead of nav when status=arrived) ──
function ArrivedCard() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loopRef.current = loop;
    loop.start();
    return () => { loopRef.current?.stop(); loopRef.current = null; };
  }, []);

  return (
    <Animated.View style={[arrivedStyles.wrap, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['rgba(8,12,24,0.97)', 'rgba(12,20,40,0.94)']}
        style={arrivedStyles.card}
      >
        <View style={arrivedStyles.row}>
          {/* Pulsing green dot */}
          <Animated.View style={[arrivedStyles.pulseRing, { transform: [{ scale: pulseAnim }] }]}>
            <View style={arrivedStyles.pulseDot} />
          </Animated.View>

          <View style={arrivedStyles.textBlock}>
            <Text style={arrivedStyles.title}>You have arrived</Text>
            <Text style={arrivedStyles.subtitle}>Ask the rider for their 4-digit pickup code</Text>
          </View>
        </View>

        {/* Code entry hint */}
        <View style={arrivedStyles.codeHintRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={arrivedStyles.codeBox}>
              <Text style={arrivedStyles.codeBoxText}>—</Text>
            </View>
          ))}
        </View>
        <Text style={arrivedStyles.codeHint}>Enter the code from your trip screen to start</Text>
      </LinearGradient>
    </Animated.View>
  );
}

const arrivedStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 30,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pulseRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.4)',
  },
  pulseDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22c55e',
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#22c55e',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    lineHeight: 16,
  },
  codeHintRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  codeBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxText: {
    fontSize: 16,
    color: '#334155',
    fontWeight: '700',
  },
  codeHint: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '500',
  },
});

function ArrowIcon({ maneuver, color, size = 38 }: { maneuver: string; color: string; size?: number }) {
  const rotation = maneuverToRotation(maneuver);
  const isRoundabout = maneuver.includes('roundabout');
  const isUTurn = maneuver.includes('u-turn');

  const iconName: any = isRoundabout
    ? 'refresh'
    : isUTurn
    ? 'return-up-back'
    : 'arrow-up';

  return (
    <View style={{
      width: size + 16,
      height: size + 16,
      borderRadius: (size + 16) / 2,
      backgroundColor: `${color}20`,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: `${color}60`,
    }}>
      <Ionicons
        name={iconName}
        size={size}
        color={color}
        style={{ transform: [{ rotate: `${rotation}deg` }] }}
      />
    </View>
  );
}

function DistanceBadge({ metres }: { metres: number }) {
  const color = metres > 400 ? '#22c55e' : metres > 150 ? '#f59e0b' : '#f87171';
  const anim = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (metres < 150) {
      loopRef.current?.stop();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loopRef.current = loop;
      loop.start();
    } else {
      loopRef.current?.stop();
      loopRef.current = null;
      anim.setValue(1);
    }
    return () => {
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [metres < 150]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.Text style={[styles.distance, { color, transform: [{ scale: anim }] }]}>
      {fmtDistanceDisplay(metres)}
    </Animated.Text>
  );
}

export function TurnCard({
  loading,
  currentStep,
  nextStep,
  distToStep,
  totalRouteM,
  remainingRouteM,
  stepIndex,
  totalSteps,
  speedKmh,
  muted,
  onToggleMute,
  active,
  tripStatus,
}: TurnCardProps) {
  if (!active || Platform.OS === 'web') return null;

  // Arrived at pickup — show the unique "waiting for code" card
  if (tripStatus === 'arrived') return <ArrivedCard />;

  if (loading) {
    return (
      <View style={styles.wrap}>
        <LinearGradient colors={['rgba(10,15,30,0.95)', 'rgba(15,23,42,0.92)']} style={styles.card}>
          <ActivityIndicator size="small" color="#38bdf8" />
          <Text style={styles.loadingText}>Calculating route…</Text>
        </LinearGradient>
      </View>
    );
  }

  if (!currentStep) return null;

  const accentColor = maneuverToColor(currentStep.maneuver);

  // Route progress: 0–1
  const progress =
    totalRouteM && totalRouteM > 0 && remainingRouteM != null
      ? Math.max(0, Math.min(1, 1 - remainingRouteM / totalRouteM))
      : null;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['rgba(8,12,24,0.97)', 'rgba(12,20,40,0.94)']}
        style={[styles.card, { borderColor: `${accentColor}35` }]}
      >
        {/* ── Main instruction row ── */}
        <View style={styles.mainRow}>
          {/* Turn arrow */}
          <ArrowIcon maneuver={currentStep.maneuver} color={accentColor} size={36} />

          {/* Instruction + distance */}
          <View style={styles.instructionBlock}>
            {distToStep != null && <DistanceBadge metres={distToStep} />}
            <Text style={styles.instruction} numberOfLines={2}>
              {currentStep.instruction}
            </Text>
          </View>

          {/* Mute button */}
          <TouchableOpacity
            style={[styles.muteBtn, muted && styles.muteBtnOff]}
            onPress={onToggleMute}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={muted ? 'volume-mute' : 'volume-high'}
              size={16}
              color={muted ? '#475569' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {/* ── Divider ── */}
        {nextStep && <View style={[styles.divider, { backgroundColor: `${accentColor}25` }]} />}

        {/* ── Next step preview ── */}
        {nextStep && (
          <View style={styles.nextRow}>
            <Ionicons name="arrow-forward" size={12} color="#64748b" />
            <Text style={styles.nextLabel}>Then</Text>
            <Ionicons
              name="arrow-up"
              size={13}
              color="#475569"
              style={{ transform: [{ rotate: `${maneuverToRotation(nextStep.maneuver)}deg` }] }}
            />
            <Text style={styles.nextInstruction} numberOfLines={1}>
              {nextStep.instruction}
            </Text>
            <Text style={styles.nextDist}>
              {fmtDistanceDisplay(nextStep.distanceM)}
            </Text>
          </View>
        )}

        {/* ── Route progress bar + speed ── */}
        <View style={styles.footerRow}>
          {/* Continuous progress bar */}
          {progress != null && (
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.round(progress * 100)}%`, backgroundColor: accentColor },
                ]}
              />
            </View>
          )}

          {/* Speed chip */}
          {speedKmh != null && speedKmh > 1 && (
            <View style={[styles.speedChip, { borderColor: `${accentColor}40` }]}>
              <Text style={[styles.speedNum, { color: accentColor }]}>
                {Math.round(speedKmh)}
              </Text>
              <Text style={styles.speedUnit}>km/h</Text>
            </View>
          )}
        </View>

        {/* ── Step progress dots (compact) ── */}
        {totalSteps > 1 && progress == null && (
          <View style={styles.progressRow}>
            {Array.from({ length: Math.min(totalSteps, 12) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i === stepIndex
                    ? [styles.progressDotActive, { backgroundColor: accentColor }]
                    : i < stepIndex
                    ? styles.progressDotDone
                    : styles.progressDotAhead,
                ]}
              />
            ))}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 30,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  instructionBlock: {
    flex: 1,
    gap: 3,
  },
  distance: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  instruction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e2e8f0',
    lineHeight: 18,
  },
  muteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  muteBtnOff: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  divider: {
    height: 1,
    marginVertical: 8,
    borderRadius: 1,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  nextLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nextInstruction: {
    flex: 1,
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  nextDist: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    marginTop: 4,
  },
  progressDot: {
    height: 3,
    width: 14,
    borderRadius: 2,
  },
  progressDotActive: {
    width: 22,
  },
  progressDotDone: {
    backgroundColor: '#334155',
  },
  progressDotAhead: {
    backgroundColor: '#1e293b',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginLeft: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
  },
  progressBarTrack: {
    flex: 1,
    height: 3,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 3,
    borderRadius: 2,
  },
  speedChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  speedNum: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  speedUnit: {
    fontSize: 9,
    color: '#475569',
    fontWeight: '700',
  },
});
