import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function VerifyRiderCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const trip_id = params.trip_id as string;
  const driver_id = params.driver_id as string;
  
  const [code, setCode] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleCodeInput = (value: string, index: number) => {
    if (value.length > 1) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when code is complete
    if (index === 3 && value) {
      verifyCode(newCode.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyCode = async (enteredCode: string) => {
    if (enteredCode.length !== 4) {
      Alert.alert('Error', 'Please enter all 4 digits');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/trips/${trip_id}/verify-security-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driver_id: driver_id,
            security_code: enteredCode,
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.verified) {
        Alert.alert(
          '✅ Verified!',
          'Security code matches! Rider identity confirmed. You can now start the ride.',
          [
            {
              text: 'Start Ride',
              onPress: () => {
                // Navigate to tracking or ride started screen
                router.push(`/driver/tracking?trip_id=${trip_id}`);
              },
            },
          ]
        );
      } else {
        // Wrong code
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setCode(['', '', '', '']);
        inputRefs.current[0]?.focus();

        const remaining = 3 - newAttempts;
        Alert.alert(
          '❌ Wrong Code',
          data.detail || `Code does not match. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
          [{ text: 'Try Again' }]
        );

        if (newAttempts >= 3) {
          Alert.alert(
            '🚨 Safety Alert',
            'Too many wrong attempts. Trip will be cancelled for safety.',
            [
              {
                text: 'OK',
                onPress: () => router.back(),
              },
            ]
          );
        }
      }
    } catch (error) {
      console.error('Verification error:', error);
      Alert.alert(
        'Error',
        'Failed to verify code. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[COLORS.accentGreen, COLORS.accentBlue]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={56} color={COLORS.accentGreen} />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>🔐 Verify Rider</Text>
          <Text style={styles.subtitle}>
            Ask the rider for their 4-digit security code
          </Text>

          {/* Code Input */}
          <View style={styles.codeContainer}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputRefs.current[index] = ref)}
                style={styles.codeInput}
                value={digit}
                onChangeText={(value) => handleCodeInput(value, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={index === 0}
              />
            ))}
          </View>

          {/* Info Cards */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color={COLORS.accentGreen} />
            <Text style={styles.infoText}>
              The rider has a 4-digit code on their screen. They will show it to you.
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="warning" size={20} color={COLORS.warning} />
            <Text style={styles.infoText}>
              If codes don't match, do NOT start the ride. Contact support immediately.
            </Text>
          </View>

          {/* Attempts Counter */}
          {attempts > 0 && (
            <View style={styles.attemptsBadge}>
              <Text style={styles.attemptsText}>
                Attempts: {attempts}/3
              </Text>
            </View>
          )}

          {/* Verify Button */}
          <TouchableOpacity
            style={[styles.verifyButton, loading && styles.verifyButtonDisabled]}
            onPress={() => verifyCode(code.join(''))}
            disabled={loading || code.join('').length !== 4}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.verifyButtonText}>Verify Code</Text>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
              </View>
            )}
          </TouchableOpacity>

          {/* Help Text */}
          <TouchableOpacity style={styles.helpButton} onPress={() => router.push('/support')}>
            <Ionicons name="help-circle-outline" size={18} color={COLORS.white} />
            <Text style={styles.helpText}>Need help? Contact Support</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: SPACING.lg,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingTop: 100,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: SPACING.xl,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    gap: SPACING.md,
  },
  codeInput: {
    width: 64,
    height: 72,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.accentGreen,
    textAlign: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    width: '100%',
  },
  infoText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextPrimary,
    lineHeight: 20,
  },
  attemptsBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
  },
  attemptsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  verifyButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    alignItems: 'center',
    marginTop: SPACING.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  verifyButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xl,
    gap: SPACING.xs,
  },
  helpText: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    textDecoration: 'underline',
  },
});
