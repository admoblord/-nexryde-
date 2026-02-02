import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Vibration,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function SecurityCodeScreen() {
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '']);
  const [driverCode, setDriverCode] = useState('7842');
  const [isVerified, setIsVerified] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const inputRefs = useRef<TextInput[]>([]);

  useEffect(() => {
    // Generate random 4-digit code for the ride
    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    setDriverCode(newCode);
  }, []);

  const handleCodeInput = (value: string, index: number) => {
    if (value.length > 1) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if code is complete
    if (index === 3 && value) {
      verifyCode(newCode.join(''));
    }
  };

  const verifyCode = (enteredCode: string) => {
    if (enteredCode === driverCode) {
      setIsVerified(true);
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 100, 50, 100]);
      }
      Alert.alert(
        '✅ Verified!',
        'Security code matches. Your ride is confirmed safe.',
        [{ text: 'Start Ride', onPress: () => router.push('/rider/tracking') }]
      );
    } else {
      setAttempts(prev => prev + 1);
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 200, 100, 200]);
      }
      Alert.alert(
        '❌ Wrong Code',
        `Code does not match. ${3 - attempts} attempts remaining.`,
        [{ text: 'Try Again', onPress: () => setCode(['', '', '', '']) }]
      );
      if (attempts >= 2) {
        Alert.alert(
          '🚨 Safety Alert',
          'Too many wrong attempts. Do you want to cancel this ride for safety?',
          [
            { text: 'Cancel Ride', style: 'destructive', onPress: () => router.back() },
            { text: 'Try Again' }
          ]
        );
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, '#1a1a2e']}
        style={styles.gradient}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={64} color={COLORS.accentGreen} />
          </View>

          <Text style={styles.title}>🔐 Security Verification</Text>
          <Text style={styles.subtitle}>
            Ask your driver for the 4-digit security code
          </Text>

          <View style={styles.codeContainer}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputRefs.current[index] = ref!)}
                style={[
                  styles.codeInput,
                  digit && styles.codeInputFilled,
                  isVerified && styles.codeInputVerified
                ]}
                value={digit}
                onChangeText={(value) => handleCodeInput(value, index)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            ))}
          </View>

          {isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />
              <Text style={styles.verifiedText}>Code Verified!</Text>
            </View>
          )}

          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>🛡️ Safety Tips</Text>
            <Text style={styles.tipText}>• Always verify the code before entering the vehicle</Text>
            <Text style={styles.tipText}>• Match the driver's photo with the app</Text>
            <Text style={styles.tipText}>• Check the car plate number</Text>
            <Text style={styles.tipText}>• Share your trip with family</Text>
          </View>

          <Text style={styles.driverCodeLabel}>Driver's Code (Show to Driver):</Text>
          <View style={styles.driverCodeDisplay}>
            <Text style={styles.driverCodeText}>{driverCode}</Text>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  backButton: {
    position: 'absolute',
    top: SPACING.xl,
    left: SPACING.lg,
    zIndex: 10,
    padding: SPACING.sm,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,255,136,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray300,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  codeContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  codeInput: {
    width: 60,
    height: 70,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    textAlign: 'center',
  },
  codeInputFilled: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  codeInputVerified: {
    borderColor: COLORS.accentGreen,
    backgroundColor: 'rgba(0,255,136,0.2)',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(0,255,136,0.2)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.xl,
  },
  verifiedText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.accentGreen,
  },
  tipsCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  tipText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray300,
    marginBottom: SPACING.xs,
    lineHeight: 20,
  },
  driverCodeLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginBottom: SPACING.sm,
  },
  driverCodeDisplay: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  driverCodeText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 8,
  },
});
