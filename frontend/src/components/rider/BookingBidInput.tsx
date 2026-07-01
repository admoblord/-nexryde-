/**
 * Bid control — slider on server min/max band with suggested marker (single modern pattern).
 */
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Animated } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { bidAdjustStep } from '@/src/utils/bookingPriceBreakdown';

const C = {
  lime: '#B8F11B',
  white: '#FFFFFF',
  muted: '#94A3B8',
  dim: '#64748B',
  green: '#00D46A',
  border: 'rgba(148,163,184,0.22)',
  track: 'rgba(148,163,184,0.35)',
};

type Props = {
  value: number;
  onChange: (amount: number) => void;
  smartMin: number | null;
  smartMax: number | null;
  suggested?: number | null;
};

function sliderStepForRange(min: number, max: number): number {
  const span = max - min;
  if (span <= 3000) return 100;
  if (span <= 15000) return 500;
  if (span <= 80000) return 1000;
  return 5000;
}

export function BookingBidInput({ value, onChange, smartMin, smartMax, suggested }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;
  const prevValue = useRef(value);
  const lastHapticBid = useRef(0);

  const floor = Math.max(100, smartMin ?? 100);
  const cap = useMemo(() => {
    if (smartMax != null && smartMax > floor) return smartMax;
    const anchor = suggested ?? value ?? floor;
    return Math.max(floor + 500, Math.round(anchor * 1.35));
  }, [smartMax, suggested, value, floor]);

  const clamp = useCallback(
    (n: number) => {
      let x = Math.max(floor, Math.round(n));
      if (cap > floor) x = Math.min(cap, x);
      return x;
    },
    [floor, cap],
  );

  const sliderStep = useMemo(() => sliderStepForRange(floor, cap), [floor, cap]);

  useEffect(() => {
    if (prevValue.current === value) return;
    prevValue.current = value;
    pulse.setValue(1);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 90, useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 1, friction: 7, tension: 140, useNativeDriver: true }),
    ]).start();
  }, [value, pulse]);

  const apply = useCallback(
    (n: number) => {
      const c = clamp(n);
      const step = bidAdjustStep(c);
      const prev = lastHapticBid.current;
      if (Math.floor(c / step) !== Math.floor(prev / step) && Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }
      lastHapticBid.current = c;
      onChange(c);
    },
    [clamp, onChange],
  );

  const hapticLight = () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const suggestedRatio =
    suggested != null && suggested >= floor && suggested <= cap && cap > floor
      ? (suggested - floor) / (cap - floor)
      : null;

  if (value <= 0 && (suggested ?? 0) <= 0) return null;

  const sliderValue = clamp(value > 0 ? value : suggested ?? floor);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Your bid</Text>

      <Animated.View style={[styles.priceRow, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.price} accessibilityLabel={`Your bid ₦${sliderValue.toLocaleString()}`}>
          ₦{sliderValue.toLocaleString()}
        </Text>
      </Animated.View>

      <View style={styles.sliderLabels}>
        <Text style={styles.edge}>₦{floor.toLocaleString()}</Text>
        <Text style={styles.edge}>₦{cap.toLocaleString()}</Text>
      </View>

      <View style={styles.sliderTrackWrap}>
        {suggestedRatio != null ? (
          <View
            style={[styles.suggestedTick, { left: `${Math.round(suggestedRatio * 100)}%` }]}
            pointerEvents="none"
          />
        ) : null}
        <Slider
          style={styles.slider}
          minimumValue={floor}
          maximumValue={cap}
          step={sliderStep}
          value={sliderValue}
          onValueChange={apply}
          onSlidingStart={() => {
            lastHapticBid.current = sliderValue;
            hapticLight();
          }}
          onSlidingComplete={hapticLight}
          minimumTrackTintColor={C.green}
          maximumTrackTintColor={C.track}
          thumbTintColor={C.lime}
          accessibilityLabel="Adjust your bid"
          accessibilityHint="Slide to set how much you will pay"
        />
      </View>

      {suggested != null && suggested > 0 ? (
        <View style={styles.suggestedRow}>
          <Ionicons name="star" size={12} color={C.green} />
          <Text style={styles.suggestedTxt}>
            Suggested ₦{suggested.toLocaleString()}
            {smartMin != null && smartMax != null
              ? ` · Drivers accept ₦${smartMin.toLocaleString()}–₦${smartMax.toLocaleString()}`
              : ''}
          </Text>
        </View>
      ) : (
        <Text style={styles.dragCopy}>Slide to adjust your offer</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(15,20,25,0.5)',
  },
  label: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  priceRow: { alignItems: 'center', paddingVertical: 4 },
  price: {
    color: C.lime,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  edge: { color: C.dim, fontSize: 11, fontWeight: '700' },
  sliderTrackWrap: { position: 'relative', justifyContent: 'center' },
  suggestedTick: {
    position: 'absolute',
    top: '50%',
    marginTop: -11,
    marginLeft: -1,
    width: 3,
    height: 22,
    backgroundColor: C.green,
    borderRadius: 2,
    zIndex: 1,
  },
  slider: { width: '100%', height: 44 },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  suggestedTxt: {
    color: C.dim,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  dragCopy: {
    color: C.dim,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
