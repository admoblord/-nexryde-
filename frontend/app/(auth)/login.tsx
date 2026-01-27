import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { RisingParticles, StaticOrbs } from '@/src/components/FallingRoses';

const { width, height } = Dimensions.get('window');
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_affd49f8-f851-4509-aa94-b5f7631db9ce/artifacts/k4t25xoz_%20NEXRYDE.jpeg';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { setPhone: storePhone } = useAppStore();

  const handleContinue = async () => {
    if (phone.length < 10) return;
    setLoading(true);
    storePhone(phone);
    
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+234${phone}` }),
      });
      
      if (response.ok) {
        router.push({ pathname: '/(auth)/verify', params: { phone } });
      }
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0D1420', '#19253F', '#0D1420']}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Background Effects */}
      <StaticOrbs count={8} />
      <RisingParticles intensity="light" />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Section */}
            <View style={styles.header}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <Image
                  source={{ uri: LOGO_URL }}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              
              <Text style={styles.welcomeText}>Welcome to</Text>
              <Text style={styles.brandText}>NEXRYDE</Text>
              <Text style={styles.subtitleText}>Nigeria's Premium Ride Experience</Text>
              
              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <View style={[styles.dividerDot, { backgroundColor: COLORS.accentGreen }]} />
                <View style={styles.dividerLine} />
              </View>
            </View>

            {/* Login Form */}
            <View style={styles.formSection}>
              <Text style={styles.formTitle}>Enter your phone number</Text>
              
              <View style={styles.inputContainer}>
                <View style={styles.prefixContainer}>
                  <Text style={styles.flag}>🇳🇬</Text>
                  <Text style={styles.prefixText}>+234</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="801 234 5678"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                  maxLength={11}
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.continueButton,
                  phone.length >= 10 && styles.continueButtonActive
                ]}
                onPress={handleContinue}
                disabled={phone.length < 10 || loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={phone.length >= 10 
                    ? [COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]
                    : [COLORS.gray700, COLORS.gray700]
                  }
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={[
                    styles.continueButtonText,
                    phone.length >= 10 && styles.continueButtonTextActive
                  ]}>
                    {loading ? 'Sending OTP...' : 'Continue'}
                  </Text>
                  {phone.length >= 10 && (
                    <View style={styles.buttonOrb} />
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.termsText}>
                By continuing, you agree to our{' '}
                <Text style={styles.linkText}>Terms of Service</Text> and{' '}
                <Text style={styles.linkText}>Privacy Policy</Text>
              </Text>
            </View>

            {/* Features */}
            <View style={styles.features}>
              <FeatureCard
                icon="shield-checkmark"
                title="Zero Commission"
                subtitle="Drivers keep 100% of earnings"
                color={COLORS.accentGreen}
              />
              <FeatureCard
                icon="location"
                title="Premium Safety"
                subtitle="Verified drivers & live tracking"
                color={COLORS.accentBlue}
              />
              <FeatureCard
                icon="star"
                title="Luxury Experience"
                subtitle="Premium rides, exceptional service"
                color={COLORS.accentGreenLight}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const FeatureCard = ({ 
  icon, 
  title, 
  subtitle, 
  color 
}: { 
  icon: string; 
  title: string; 
  subtitle: string;
  color: string;
}) => (
  <View style={styles.featureCard}>
    <View style={[styles.featureIconContainer, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <View style={styles.featureContent}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: width * 0.5,
    height: 80,
    marginBottom: SPACING.md,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  welcomeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  brandText: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 4,
    marginBottom: SPACING.xs,
  },
  subtitleText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '60%',
    marginTop: SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  dividerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: SPACING.md,
  },
  formSection: {
    marginBottom: SPACING.xl,
  },
  formTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surfaceLight,
    borderRightWidth: 1,
    borderRightColor: COLORS.surface,
  },
  flag: {
    fontSize: 24,
    marginRight: SPACING.sm,
  },
  prefixText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  input: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    fontSize: FONT_SIZE.lg,
    color: COLORS.white,
    letterSpacing: 1,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  continueButtonActive: {
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg + 2,
    paddingHorizontal: SPACING.xl,
  },
  continueButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  continueButtonTextActive: {
    color: COLORS.primary,
  },
  buttonOrb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginLeft: SPACING.md,
  },
  termsText: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  linkText: {
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  features: {
    gap: SPACING.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
});
