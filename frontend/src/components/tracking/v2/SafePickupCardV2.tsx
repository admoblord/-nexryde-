/**
 * V2 safe pickup card — always mounted at fixed height; placeholders until data loads.
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SkeletonBlock } from '@/src/components/tracking/v2/SkeletonBlock';
import { TV2, glassCardSecure } from '@/src/components/tracking/v2/trackingV2Theme';
import { TV2_LAYOUT } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  active: boolean;
  code: string | null;
  vehicle: string;
  color: string | null;
  plate: string | null;
  onPressCode?: () => void;
};

const PLACEHOLDER = '—';

function SafePickupCardV2Inner({ active, code, vehicle, color, plate, onPressCode }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, active]);

  const handleCodePress = () => {
    if (!onPressCode || !active) return;
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    onPressCode();
  };

  const displayVehicle = vehicle.trim() && vehicle !== 'Vehicle' ? vehicle : PLACEHOLDER;
  const displayColor = color || PLACEHOLDER;
  const displayPlate = plate ? plate.toUpperCase() : PLACEHOLDER;

  return (
    <View style={[styles.card, !active && styles.cardIdle]} pointerEvents={active ? 'auto' : 'none'}>
      <TouchableOpacity
        style={styles.codeCol}
        onPress={handleCodePress}
        disabled={!active || !onPressCode}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={code ? `Pickup code ${code.split('').join(' ')}` : 'Pickup code pending'}
      >
        <View style={styles.shieldRow}>
          <Ionicons name="shield-checkmark" size={15} color={TV2.green} />
          <Text style={styles.shieldTxt}>SAFE PICKUP</Text>
        </View>
        <Text style={styles.codeLabel}>Pickup Code</Text>
        {active && code ? (
          <Animated.Text
            style={[
              styles.code,
              { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {code}
          </Animated.Text>
        ) : (
          <SkeletonBlock width={88} height={40} radius={8} style={styles.codeSkeleton} />
        )}
        <Text style={styles.codeHint} numberOfLines={2}>
          {active
            ? 'Show this code to driver before entering the vehicle.'
            : 'Pickup verification appears when your driver is near.'}
        </Text>
      </TouchableOpacity>

      <View style={styles.detailCol}>
        <DetailRow icon="car-sport" label="Vehicle" value={displayVehicle} />
        <DetailRow icon="color-palette-outline" label="Color" value={displayColor} />
        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <MaterialCommunityIcons name="card-text-outline" size={14} color={TV2.green} />
          </View>
          <View style={styles.detailBody}>
            <Text style={styles.detailLabel}>Plate Number</Text>
            <Text style={styles.detailPlate} numberOfLines={1}>{displayPlate}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const SafePickupCardV2 = memo(SafePickupCardV2Inner);

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={14} color={TV2.green} />
      </View>
      <View style={styles.detailBody}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...glassCardSecure,
    flexDirection: 'row',
    height: TV2_LAYOUT.safePickupCard,
    padding: TV2.pad,
    gap: 12,
    overflow: 'hidden',
  },
  cardIdle: { opacity: 0.55 },
  codeCol: { flex: 1.15, minWidth: 0 },
  shieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, height: 16 },
  shieldTxt: { fontSize: 11.5, fontWeight: '900', color: TV2.green, letterSpacing: 1.1 },
  codeLabel: { fontSize: 12, fontWeight: '700', color: TV2.sub, height: 16 },
  code: {
    fontSize: 40,
    fontWeight: '900',
    color: TV2.greenBright,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
    height: 46,
    marginVertical: 0,
  },
  codeSkeleton: { marginVertical: 4 },
  codeHint: { fontSize: 10.5, fontWeight: '600', color: TV2.faint, lineHeight: 14, height: 28 },
  detailCol: {
    flex: 1,
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: TV2.hairline,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  detailIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: TV2.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBody: { flex: 1, minWidth: 0 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: TV2.faint, height: 12 },
  detailValue: { fontSize: 12.5, fontWeight: '800', color: TV2.text, height: 16 },
  detailPlate: {
    fontSize: 13.5,
    fontWeight: '900',
    color: TV2.greenBright,
    letterSpacing: 0.8,
    height: 18,
    minWidth: 72,
  },
});
