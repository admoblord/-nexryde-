/**
 * V2 cancel section — large outlined red "Cancel request" button with
 * reassurance copy underneath. Lives at the very bottom of the screen.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FV2 } from '@/src/components/finding/findingV2Theme';

type Props = { onCancel: () => void; phase?: 'searching' | 'error' | 'matched' };

export function CancelRequestCardV2({ onCancel, phase = 'searching' }: Props) {
  const isError = phase === 'error';
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, isError && styles.btnNeutral]}
        onPress={() => {
          if (Platform.OS !== 'web') {
            void Haptics.impactAsync(
              isError ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
            );
          }
          onCancel();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={isError ? 'Go back to booking' : 'Cancel ride request'}
      >
        <Ionicons
          name={isError ? 'arrow-back-circle-outline' : 'close-circle-outline'}
          size={20}
          color={isError ? FV2.sub : FV2.red}
        />
        <Text style={[styles.btnTxt, isError && styles.btnTxtNeutral]}>
          {isError ? 'Go Back' : 'Cancel request'}
        </Text>
      </TouchableOpacity>
      {!isError && (
        <Text style={styles.hint}>You can cancel anytime before a driver accepts.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9, alignItems: 'center' },
  btn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 16,
    borderRadius: FV2.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,90,90,0.55)',
    backgroundColor: FV2.redSoft,
  },
  btnNeutral: {
    borderColor: 'rgba(154,175,200,0.30)',
    backgroundColor: 'rgba(154,175,200,0.07)',
  },
  btnTxt: { fontSize: 15.5, fontWeight: '900', color: FV2.red, letterSpacing: 0.2 },
  btnTxtNeutral: { color: FV2.sub },
  hint: { fontSize: 11.5, fontWeight: '600', color: FV2.faint },
});
