import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export type LegalTermsAcceptFooterProps = {
  checkboxLabel: string;
  acceptLabel: string;
  loading?: boolean;
  onAccept: () => void;
  activeGradient: readonly [string, string, ...string[]];
  disabledGradient: readonly [string, string, ...string[]];
  checkboxBorderColor: string;
  checkboxCheckedColor: string;
  checkmarkColor: string;
  labelColor: string;
  acceptTextColor: string;
  acceptTextDisabledColor: string;
  containerStyle?: StyleProp<ViewStyle>;
  checkboxTextStyle?: StyleProp<TextStyle>;
};

function LegalTermsAcceptFooter({
  checkboxLabel,
  acceptLabel,
  loading = false,
  onAccept,
  activeGradient,
  disabledGradient,
  checkboxBorderColor,
  checkboxCheckedColor,
  checkmarkColor,
  labelColor,
  acceptTextColor,
  acceptTextDisabledColor,
  containerStyle,
  checkboxTextStyle,
}: LegalTermsAcceptFooterProps) {
  const [accepted, setAccepted] = useState(false);

  const toggleAccepted = useCallback(() => {
    setAccepted((prev) => !prev);
  }, []);

  const handleAccept = useCallback(() => {
    if (!accepted || loading) return;
    onAccept();
  }, [accepted, loading, onAccept]);

  const gradientColors = accepted ? activeGradient : disabledGradient;

  return (
    <View style={[styles.bottomSection, containerStyle]}>
      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={toggleAccepted}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: checkboxBorderColor },
            accepted && { backgroundColor: checkboxCheckedColor, borderColor: checkboxCheckedColor },
          ]}
        >
          {accepted ? <Ionicons name="checkmark" size={18} color={checkmarkColor} /> : null}
        </View>
        <Text style={[styles.checkboxText, { color: labelColor }, checkboxTextStyle]}>{checkboxLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.continueButton, !accepted && styles.continueButtonDisabled]}
        onPress={handleAccept}
        disabled={!accepted || loading}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={gradientColors}
          style={styles.continueGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          {loading ? (
            <ActivityIndicator color={checkmarkColor} />
          ) : (
            <Text
              style={[
                styles.continueText,
                { color: acceptTextColor },
                !accepted && { color: acceptTextDisabledColor },
              ]}
            >
              {acceptLabel}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(LegalTermsAcceptFooter);

const styles = StyleSheet.create({
  bottomSection: {
    padding: SPACING.lg,
    borderTopWidth: 1,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueGradient: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  continueText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
});
