import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY, SUBSCRIPTION_PRICE } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const phone = params.phone as string;
  const { setUser } = useAppStore();

  const [selectedRole, setSelectedRole] = useState<'rider' | 'driver'>('rider');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleContinue = () => {
    setUser({
      id: Date.now().toString(),
      name: name || 'User',
      phone: phone || '+234 XXX XXX XXXX',
      role: selectedRole,
      email: email,
    });
    
    if (selectedRole === 'driver') {
      router.replace('/driver-home');
    } else {
      router.replace('/rider-home');
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={styles.scrollContent}
          >
            {/* Logo */}
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.logoGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="car-sport" size={32} color={COLORS.white} />
              </LinearGradient>
            </View>

            <Text style={styles.title}>Join NEXRYDE</Text>
            <Text style={styles.subtitle}>Choose how you want to use NEXRYDE</Text>

            {/* Role Selection */}
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleCard, selectedRole === 'rider' && styles.roleCardActive]}
                onPress={() => setSelectedRole('rider')}
              >
                <View style={[styles.radioOuter, selectedRole === 'rider' && styles.radioOuterActive]}>
                  {selectedRole === 'rider' && <View style={styles.radioInner} />}
                </View>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleTitle, selectedRole === 'rider' && styles.roleTitleActive]}>Rider</Text>
                  <Text style={[styles.rolePrice, selectedRole === 'rider' && styles.rolePriceActive]}>FREE</Text>
                </View>
                <View style={styles.roleFeatures}>
                  <Text style={[styles.roleFeature, selectedRole === 'rider' && styles.roleFeatureActive]}>Book rides instantly</Text>
                  <Text style={[styles.roleFeature, selectedRole === 'rider' && styles.roleFeatureActive]}>Live trip tracking</Text>
                  <Text style={[styles.roleFeature, selectedRole === 'rider' && styles.roleFeatureActive]}>AI-powered assistance</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, selectedRole === 'driver' && styles.roleCardDriver]}
                onPress={() => setSelectedRole('driver')}
              >
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumText}>PREMIUM</Text>
                </View>
                <View style={[styles.radioOuter, selectedRole === 'driver' && styles.radioOuterDriver]}>
                  {selectedRole === 'driver' && <View style={[styles.radioInner, styles.radioInnerDriver]} />}
                </View>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleTitle, selectedRole === 'driver' && styles.roleTitleDriver]}>Driver</Text>
                  <Text style={[styles.rolePrice, selectedRole === 'driver' && styles.rolePriceDriver]}>{CURRENCY}25K/month</Text>
                </View>
                <View style={styles.roleFeatures}>
                  <Text style={[styles.roleFeature, selectedRole === 'driver' && styles.roleFeatureDriver]}>Keep 100% earnings</Text>
                  <Text style={[styles.roleFeature, selectedRole === 'driver' && styles.roleFeatureDriver]}>Zero commission</Text>
                  <Text style={[styles.roleFeature, selectedRole === 'driver' && styles.roleFeatureDriver]}>Daily challenges & rewards</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Input Fields */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter your full name"
                placeholderTextColor={COLORS.lightTextMuted}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.inputLabel}>Email (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter your email"
                placeholderTextColor={COLORS.lightTextMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </ScrollView>

          {/* Continue Button */}
          <View style={styles.bottomContainer}>
            <TouchableOpacity 
              style={styles.continueButton}
              onPress={handleContinue}
            >
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.continueGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.continueText}>
                  Continue as {selectedRole === 'rider' ? 'Rider' : 'Driver'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.termsText}>
              By continuing, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoGradient: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  roleCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  roleCardActive: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.accentGreenSoft,
  },
  roleCardDriver: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.warningSoft,
  },
  premiumBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  premiumText: {
    fontSize: FONT_SIZE.xxs,
    fontWeight: '700',
    color: COLORS.white,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  radioOuterActive: {
    borderColor: COLORS.accentGreen,
  },
  radioOuterDriver: {
    borderColor: COLORS.gold,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
  },
  radioInnerDriver: {
    backgroundColor: COLORS.gold,
  },
  roleInfo: {
    marginBottom: SPACING.sm,
  },
  roleTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  roleTitleActive: {
    color: COLORS.accentGreen,
  },
  roleTitleDriver: {
    color: COLORS.gold,
  },
  rolePrice: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextSecondary,
  },
  rolePriceActive: {
    color: COLORS.accentGreen,
  },
  rolePriceDriver: {
    color: COLORS.gold,
  },
  roleFeatures: {
    gap: 4,
  },
  roleFeature: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
  },
  roleFeatureActive: {
    color: COLORS.accentGreenDark,
  },
  roleFeatureDriver: {
    color: COLORS.warning,
  },
  inputSection: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
  },
  textInput: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    marginBottom: SPACING.md,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  continueGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  continueText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  termsText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  termsLink: {
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
});
