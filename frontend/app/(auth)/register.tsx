import React, { useState } from 'react';
import { useRedirectIfAuthed } from '@/src/hooks/useRedirectIfAuthed';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

// Dark brand palette — consistent with splash/login/onboarding
const D = {
  bg: '#0D1420',
  surface: '#19253F',
  surfaceLight: '#243654',
  green: '#00D084',
  greenLight: '#4ADE80',
  greenSoft: 'rgba(0,208,132,0.10)',
  greenSoftBorder: 'rgba(0,208,132,0.35)',
  blue: '#0066FF',
  gold: '#F59E0B',
  goldSoft: 'rgba(245,158,11,0.10)',
  goldSoftBorder: 'rgba(245,158,11,0.35)',
  white: '#FFFFFF',
  textPrimary: '#F0F4F8',
  textSecondary: '#A8B8D0',
  textMuted: '#6B7A94',
  border: 'rgba(255,255,255,0.10)',
  inputBg: 'rgba(13,20,32,0.70)',
};
import { DriverOnboardingProgress } from '@/src/components/DriverOnboardingProgress';

export default function RegisterScreen() {
  const toast = useErrorToast();
  const router = useRouter();
  const params = useLocalSearchParams();
  const canShowAuth = useRedirectIfAuthed();
  
  // Params from email sign-in or Google auth (phone collected on this screen — no SMS OTP).
  const phone = params.phone as string;
  const googleEmail = params.email as string;
  const googleName = params.name as string;
  const googlePicture = params.picture as string;
  const googleId = params.google_id as string;
  const authType = params.auth_type as string;
  const roleParam = params.role as string | undefined;

  const [selectedRole, setSelectedRole] = useState<'rider' | 'driver'>(() =>
    roleParam === 'driver' || roleParam === 'rider' ? roleParam : 'rider',
  );
  const [name, setName] = useState(googleName || '');
  const [email, setEmail] = useState(googleEmail || '');
  const [phoneNumber, setPhoneNumber] = useState(phone || '');
  const normalizePhone = (value: string) => {
    const cleaned = (value || '').replace(/[\s\-()]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('234') && cleaned.length === 13) return `+${cleaned}`;
    if (cleaned.startsWith('0') && cleaned.length === 11) return `+234${cleaned.slice(1)}`;
    if (cleaned.length === 10 && /^\d+$/.test(cleaned)) return `+234${cleaned}`;
    return cleaned;
  };
  const openLegal = async (path: string) => {
    try {
      const { BACKEND_URL } = await import('@/src/services/api');
      await Linking.openURL(`${BACKEND_URL}${path}`);
    } catch {
      toast.show('Unable to open link. Please try again later.', 'error');
    }
  };

  const isGoogleAuth = authType === 'google';

  const handleContinue = () => {
    if (!name.trim()) {
      toast.show('Please enter your full name.', 'warning');
      return;
    }

    const emailTrim = email.trim();
    if (selectedRole === 'driver' && emailTrim) {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim);
      if (!valid) {
        toast.show('That email address does not look valid. Fix it or clear the field to continue.', 'warning');
        return;
      }
    }
    
    const isEmailAuth = authType === 'email';
    const riderPhone = normalizePhone((phoneNumber || phone || '').trim());

    if (selectedRole === 'rider') {
      if (!/^\+234\d{10}$/.test(riderPhone)) {
        toast.show('Enter a valid Nigerian mobile number (10 digits after +234).', 'warning');
        return;
      }
    } else if (!isGoogleAuth && !isEmailAuth && !riderPhone) {
      toast.show('Enter your Nigerian mobile number so we can reach your account.', 'warning');
      return;
    }

    if (selectedRole === 'driver') {
      if (!/^\+234\d{10}$/.test(riderPhone)) {
        toast.show('Enter a valid Nigerian mobile number (10 digits after +234). This is part of driver registration.', 'warning');
        return;
      }
      router.push({
        pathname: '/(auth)/driver-terms',
        params: {
          phone: riderPhone,
          name: name,
          email: email || '',
          google_id: googleId || '',
          picture: googlePicture || '',
        },
      });
    } else {
      router.push({
        pathname: '/(auth)/rider-terms',
        params: {
          phone: riderPhone,
          name: name,
          email: email || '',
          google_id: googleId || '',
          picture: googlePicture || '',
        },
      });
    }
  };

  if (!canShowAuth) {
    return null;
  }

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
            {/* Header with Google Profile or Logo */}
            <View style={styles.logoContainer}>
              {isGoogleAuth && googlePicture ? (
                <Image 
                  source={{ uri: googlePicture }} 
                  style={styles.profileImage}
                />
              ) : (
                <LinearGradient
                  colors={[D.green, D.blue]}
                  style={styles.logoGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="car-sport" size={32} color={D.white} />
                </LinearGradient>
              )}
            </View>

            <Text style={styles.title}>
              {isGoogleAuth ? 'Complete Your Profile' : 'Join NEXRYDE'}
            </Text>
            <Text style={styles.subtitle}>
              {isGoogleAuth 
                ? `Welcome ${googleName || 'there'}! Choose how you want to use NEXRYDE`
                : 'Choose how you want to use NEXRYDE'
              }
            </Text>

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
                  <Text style={styles.premiumText}>EARN</Text>
                </View>
                <View style={[styles.radioOuter, selectedRole === 'driver' && styles.radioOuterDriver]}>
                  {selectedRole === 'driver' && <View style={[styles.radioInner, styles.radioInnerDriver]} />}
                </View>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleTitle, selectedRole === 'driver' && styles.roleTitleDriver]}>Driver</Text>
                  <Text style={[styles.rolePrice, selectedRole === 'driver' && styles.rolePriceDriver]}>Start Earning</Text>
                </View>
                <View style={styles.roleFeatures}>
                  <Text style={[styles.roleFeature, selectedRole === 'driver' && styles.roleFeatureDriver]}>Keep 100% earnings</Text>
                  <Text style={[styles.roleFeature, selectedRole === 'driver' && styles.roleFeatureDriver]}>Zero commission</Text>
                  <Text style={[styles.roleFeature, selectedRole === 'driver' && styles.roleFeatureDriver]}>Free trial included</Text>
                </View>
              </TouchableOpacity>
            </View>

            {selectedRole === 'driver' ? (
              <DriverOnboardingProgress
                preview
                current="terms"
                subtitle="After Continue: accept driver terms (creates your account), then upload documents and complete your driver profile."
              />
            ) : null}

            {/* Input Fields */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter your full name"
                placeholderTextColor={D.textMuted}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <Text style={styles.phoneHint}>Stored on your account — no SMS code required.</Text>
              <View style={styles.phoneInputContainer}>
                <View style={styles.phonePrefixContainer}>
                  <Text style={styles.phoneFlag}>🇳🇬</Text>
                  <Text style={styles.phonePrefix}>+234</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="801 234 5678"
                  placeholderTextColor={D.textMuted}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>

              {/* Show email only if not from Google */}
              {!isGoogleAuth && (
                <>
                  <Text style={styles.inputLabel}>Email (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter your email"
                    placeholderTextColor={D.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </>
              )}

              {/* Show Google email as read-only */}
              {isGoogleAuth && googleEmail && (
                <>
                  <Text style={styles.inputLabel}>Email</Text>
                  <View style={styles.readOnlyInput}>
                    <Ionicons name="logo-google" size={18} color={D.green} style={{ marginRight: 8 }} />
                    <Text style={styles.readOnlyText}>{googleEmail}</Text>
                    <Ionicons name="checkmark-circle" size={18} color={D.green} />
                  </View>
                </>
              )}
            </View>
          </ScrollView>

          {/* Continue Button */}
          <View style={styles.bottomContainer}>
            <TouchableOpacity 
              style={styles.continueButton}
              onPress={handleContinue}
            >
              <LinearGradient
                colors={[D.greenLight, D.green, D.blue]}
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
              {selectedRole === 'driver'
                ? 'Next step: review and accept Driver Terms before document upload.'
                : 'Next step: review and accept Rider Terms before identity verification.'}
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
    backgroundColor: D.bg,
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
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: D.green,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: D.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: D.textSecondary,
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
    backgroundColor: D.surface,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: D.border,
  },
  roleCardActive: {
    borderColor: D.green,
    backgroundColor: D.greenSoft,
  },
  roleCardDriver: {
    borderColor: D.gold,
    backgroundColor: D.goldSoft,
  },
  premiumBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: D.gold,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  premiumText: {
    fontSize: FONT_SIZE.xxs,
    fontWeight: '700',
    color: '#061A0F',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: D.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  radioOuterActive: {
    borderColor: D.green,
  },
  radioOuterDriver: {
    borderColor: D.gold,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: D.green,
  },
  radioInnerDriver: {
    backgroundColor: D.gold,
  },
  roleInfo: {
    marginBottom: SPACING.sm,
  },
  roleTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: D.textPrimary,
  },
  roleTitleActive: {
    color: D.green,
  },
  roleTitleDriver: {
    color: D.gold,
  },
  rolePrice: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: D.textSecondary,
  },
  rolePriceActive: {
    color: D.green,
  },
  rolePriceDriver: {
    color: D.gold,
  },
  roleFeatures: {
    gap: 4,
  },
  roleFeature: {
    fontSize: FONT_SIZE.xs,
    color: D.textSecondary,
  },
  roleFeatureActive: {
    color: 'rgba(0,208,132,0.85)',
  },
  roleFeatureDriver: {
    color: 'rgba(245,158,11,0.85)',
  },
  inputSection: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: D.textSecondary,
    marginBottom: SPACING.sm,
  },
  phoneHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: D.textMuted,
    marginTop: -4,
    marginBottom: SPACING.sm,
  },
  textInput: {
    backgroundColor: D.inputBg,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: D.textPrimary,
    borderWidth: 1,
    borderColor: D.border,
    marginBottom: SPACING.md,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    backgroundColor: D.inputBg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: D.border,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  phonePrefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRightWidth: 1,
    borderRightColor: D.border,
  },
  phoneFlag: {
    fontSize: 20,
    marginRight: 6,
  },
  phonePrefix: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: D.textSecondary,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: D.textPrimary,
  },
  readOnlyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: D.border,
  },
  readOnlyText: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: D.textPrimary,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    backgroundColor: D.bg,
    borderTopWidth: 1,
    borderTopColor: D.border,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    marginTop: SPACING.md,
    shadowColor: D.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  continueGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  continueText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: '#061A0F',
  },
  termsText: {
    fontSize: FONT_SIZE.sm,
    color: D.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  termsLink: {
    color: D.green,
    fontWeight: '600',
  },
});
