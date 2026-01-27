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
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');

// Colors based on NEXRYDE logo
const COLORS = {
  background: '#0D1420',
  primary: '#19253F',
  surface: '#19253F',
  surfaceLight: '#243654',
  green: '#3AD173',
  greenLight: '#80EE50',
  greenSoft: 'rgba(58, 209, 115, 0.15)',
  blue: '#3A8CD1',
  blueDark: '#1A5AA6',
  blueSoft: 'rgba(58, 140, 209, 0.15)',
  white: '#FFFFFF',
  textSecondary: '#A8B8D0',
  textMuted: '#6B7A94',
  gray700: '#2D3748',
};

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
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 80, left: 30, backgroundColor: COLORS.green }]} />
      <View style={[styles.glow, { top: 200, right: 40, backgroundColor: COLORS.blue, width: 60, height: 60 }]} />
      
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
                <LinearGradient
                  colors={[COLORS.greenLight, COLORS.green]}
                  style={styles.logoLeft}
                />
                <LinearGradient
                  colors={[COLORS.blue, COLORS.blueDark]}
                  style={styles.logoRight}
                />
                <View style={styles.roadLine}>
                  <View style={styles.roadDash} />
                  <View style={styles.roadDash} />
                </View>
              </View>
              
              <Text style={styles.welcomeText}>Welcome to</Text>
              <View style={styles.brandRow}>
                <Text style={styles.brandNex}>NEX</Text>
                <Text style={styles.brandRyde}>RYDE</Text>
              </View>
              <Text style={styles.subtitleText}>Nigeria's Premium Ride Experience</Text>
              
              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <View style={[styles.dividerDot, { backgroundColor: COLORS.green }]} />
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
                    ? [COLORS.greenLight, COLORS.green, COLORS.blue]
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
                    <View style={styles.buttonOrb}>
                      <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
                    </View>
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
                color={COLORS.green}
                bgColor={COLORS.greenSoft}
              />
              <FeatureCard
                icon="location"
                title="Premium Safety"
                subtitle="Verified drivers & live tracking"
                color={COLORS.blue}
                bgColor={COLORS.blueSoft}
              />
              <FeatureCard
                icon="star"
                title="Luxury Experience"
                subtitle="Premium rides, exceptional service"
                color={COLORS.greenLight}
                bgColor={COLORS.greenSoft}
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
  color,
  bgColor,
}: { 
  icon: string; 
  title: string; 
  subtitle: string;
  color: string;
  bgColor: string;
}) => (
  <View style={styles.featureCard}>
    <View style={[styles.featureIconContainer, { backgroundColor: bgColor }]}>
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
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.15,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    marginBottom: 32,
  },
  logoContainer: {
    width: 60,
    height: 60,
    position: 'relative',
    marginBottom: 16,
  },
  logoLeft: {
    position: 'absolute',
    left: 3,
    top: 0,
    width: 24,
    height: 60,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    transform: [{ skewX: '-8deg' }],
  },
  logoRight: {
    position: 'absolute',
    right: 3,
    top: 0,
    width: 24,
    height: 60,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    transform: [{ skewX: '8deg' }],
  },
  roadLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: 10,
    bottom: 10,
    width: 3,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  roadDash: {
    width: 3,
    height: 8,
    backgroundColor: COLORS.white,
    borderRadius: 1,
  },
  welcomeText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNex: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 2,
  },
  brandRyde: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.green,
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
    marginBottom: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '60%',
    marginTop: 8,
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
    marginHorizontal: 16,
  },
  formSection: {
    marginBottom: 32,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: 24,
    overflow: 'hidden',
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: COLORS.surfaceLight,
    borderRightWidth: 1,
    borderRightColor: COLORS.surface,
  },
  flag: {
    fontSize: 24,
    marginRight: 8,
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 17,
    color: COLORS.white,
    letterSpacing: 1,
  },
  continueButton: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  continueButtonActive: {
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  continueButtonTextActive: {
    color: COLORS.primary,
  },
  buttonOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginLeft: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsText: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  linkText: {
    color: COLORS.green,
    fontWeight: '600',
  },
  features: {
    gap: 16,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
