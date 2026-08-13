/**
 * V2 finding header — NEXRYDE brand mark, "Finding your driver" hero title
 * with green emphasis, trust subtitle.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NexrydeMark } from '@/src/components/brand/NexrydeMark';
import { FV2 } from '@/src/components/finding/findingV2Theme';

type Props = {
  timeElapsedSec?: number;
  phase?: 'searching' | 'error' | 'matched';
};

export function FindingDriverHeaderV2({ timeElapsedSec, phase = 'searching' }: Props) {
  const title =
    phase === 'error'
      ? 'Couldn\u2019t find a driver'
      : phase === 'matched'
        ? 'Driver found'
        : 'Finding your driver';
  const subtitle =
    phase === 'error'
      ? 'Check your connection and try again'
      : phase === 'matched'
        ? 'Opening live tracking\u2026'
        : 'We\u2019re connecting you with the best driver nearby';

  return (
    <View style={styles.wrap}>
      <View style={styles.brandRow}>
        <NexrydeMark size={28} />
        <Text style={styles.brandTxt}>NEXRYDE</Text>
        {phase === 'searching' && timeElapsedSec != null && timeElapsedSec >= 5 ? (
          <Text
            style={styles.elapsed}
            accessibilityLabel={
              timeElapsedSec >= 60
                ? `${Math.floor(timeElapsedSec / 60)} minutes ${timeElapsedSec % 60} seconds elapsed`
                : `${timeElapsedSec} seconds elapsed`
            }
          >
            {timeElapsedSec >= 60
              ? `${Math.floor(timeElapsedSec / 60)}m ${timeElapsedSec % 60}s`
              : `${timeElapsedSec}s`}
          </Text>
        ) : null}
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {phase === 'searching' ? (
          <>
            Finding <Text style={styles.titleGreen}>your driver</Text>
          </>
        ) : (
          <Text style={phase === 'error' ? styles.titleError : styles.titleGreen}>{title}</Text>
        )}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: FV2.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  brandTxt: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2.5,
    color: FV2.text,
  },
  elapsed: {
    marginLeft: 'auto' as const,
    fontSize: 13,
    fontWeight: '800',
    color: FV2.sub,
    fontVariant: ['tabular-nums'],
  },
  titleError: {
    color: FV2.red,
    fontWeight: '900',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: FV2.text,
    marginTop: 4,
  },
  titleGreen: {
    color: FV2.green,
    textShadowColor: FV2.greenGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  subtitle: { fontSize: 13.5, fontWeight: '600', color: FV2.sub },
});
