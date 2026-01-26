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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { FallingRoses, RosePetalsStatic } from '@/src/components/FallingRoses';

const { width, height } = Dimensions.get('window');

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
        colors={['#1A0A0F', '#0D0508', '#1A0A0F']}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Static Rose Background */}
      <RosePetalsStatic count={15} />
      
      {/* Falling Roses - Light on login for better UX */}
      <FallingRoses intensity="light" />
      
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
                <View style={styles.logoOuter}>
                  <View style={styles.logoInner}>
                    <Text style={styles.logoText}>K</Text>
                  </View>
                </View>
              </View>
              
              <Text style={styles.welcomeText}>Welcome to</Text>
              <Text style={styles.brandText}>KODA</Text>
              <Text style={styles.subtitleText}>Nigeria's Premium Ride Experience</Text>
              
              {/* Rose divider */}
              <View style={styles.roseDivider}>
                <View style={styles.dividerLine} />
                <View style={styles.dividerPetal} />
                <View style={styles.dividerLine} />
              </View>
            </View>

            {/* Login Form */}
            <View style={styles.formSection}>
              <Text style={styles.formTitle}>Enter your phone number</Text>
              
              <View style={styles.inputContainer}>
                <View style={styles.prefixContainer}>
                  <Text style={styles.flag}>🇳🇬</Text>
                  <Text style={styles.prefix}>+234</Text>
                  <View style={styles.prefixDivider} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="801 234 5678"
                  placeholderTextColor={COLORS.gray500}
                  value={phone}
                  onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>

              <TouchableOpacity
                style={[styles.continueButton, phone.length < 10 && styles.continueButtonDisabled]}
                onPress={handleContinue}
                disabled={phone.length < 10 || loading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={phone.length >= 10 ? [COLORS.accent, COLORS.accentDark] : [COLORS.gray700, COLORS.gray700]}
                  style={styles.continueGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={[styles.continueText, phone.length < 10 && styles.continueTextDisabled]}>
                    {loading ? 'Sending...' : 'Continue'}
                  </Text>
                  <View style={[styles.continueArrow, phone.length < 10 && styles.continueArrowDisabled]}>
                    <Ionicons name="arrow-forward" size={18} color={phone.length >= 10 ? COLORS.accent : COLORS.gray500} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.termsText}>
                By continuing, you agree to our{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </View>

            {/* Features Section */}
            <View style={styles.featuresSection}>
              <FeatureCard
                icon="ribbon"
                title="Zero Commission"
                description="Drivers keep 100% of earnings"
                color={COLORS.rosePetal2}
              />
              <FeatureCard
                icon="shield-checkmark"
                title="Premium Safety"
                description="Verified drivers & live tracking"
                color={COLORS.rosePetal3}
              />
              <FeatureCard
                icon="diamond"
                title="Luxury Experience"
                description="Premium rides, exceptional service"
                color={COLORS.rosePetal4}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const FeatureCard = ({ icon, title, description, color }: any) => (
  <View style={styles.featureCard}>
    <View style={[styles.featureIcon, { backgroundColor: `${color}20` }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <View style={styles.featureContent}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{description}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    marginBottom: SPACING.lg,
  },
  logoOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.rose,
  },
  logoInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.accentLight,
  },
  logoText: {
    fontSize: 44,
    fontWeight: '900',
    color: COLORS.accent,
  },
  welcomeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  brandText: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 10,
  },
  subtitleText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    letterSpacing: 1,
  },
  roseDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  dividerLine: {
    width: 40,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.3,
  },
  dividerPetal: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
    opacity: 0.6,
  },
  formSection: {
    marginBottom: SPACING.xl,
  },
  formTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surfaceLight,
  },
  flag: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  prefix: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.accent,
  },
  prefixDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.gray600,
    marginLeft: SPACING.md,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    letterSpacing: 2,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    ...SHADOWS.rose,
  },
  continueButtonDisabled: {
    ...SHADOWS.sm,
  },
  continueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  continueText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  continueTextDisabled: {
    color: COLORS.gray500,
  },
  continueArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueArrowDisabled: {
    backgroundColor: COLORS.gray800,
  },
  termsText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  featuresSection: {
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray800,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
});
