/**
 * TurnCard.tsx
 * Bolt-style (but better) turn-by-turn navigation overlay card.
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
  stepIndex: number;
  totalSteps: number;
  muted: boolean;
  onToggleMute: () => void;
  /** Whether nav is active at all */
  active: boolean;
}

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

  useEffect(() => {
    if (metres < 150) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      anim.stopAnimation();
      anim.setValue(1);
    }
  }, [metres < 150]);

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
  stepIndex,
  totalSteps,
  muted,
  onToggleMute,
  active,
}: TurnCardProps) {
  if (!active || Platform.OS === 'web') return null;

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

        {/* ── Step progress dots ── */}
        {totalSteps > 1 && (
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
});
