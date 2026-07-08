import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const D = {
  bg: '#0D1420',
  surface: '#19253F',
  surfaceLight: '#243654',
  green: '#00D084',
  greenLight: '#4ADE80',
  greenSoft: 'rgba(0,208,132,0.10)',
  greenSoftBorder: 'rgba(0,208,132,0.30)',
  blue: '#0066FF',
  white: '#FFFFFF',
  textPrimary: '#F0F4F8',
  textSecondary: '#A8B8D0',
  textMuted: '#6B7A94',
  border: 'rgba(255,255,255,0.10)',
  inputBg: 'rgba(13,20,32,0.70)',
};
import { useAppStore } from '@/src/store/appStore';
import { setTokens } from '@/src/lib/tokenStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { autoApplyPendingReferral, resolvePendingReferrer, type ReferrerInfo } from '@/src/services/referralService';
import { markRiderVerificationCached } from '@/src/utils/sessionRouting';
import { NEXRYDE_TERMS_VERSION, NEXRYDE_PRIVACY_VERSION } from '@/src/constants/legal';

export default function RiderNINScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setUser, setIsAuthenticated } = useAppStore();
  
  const [nin, setNin] = useState('');
  const [loading, setLoading] = useState(false);
  const [referrerInfo, setReferrerInfo] = useState<ReferrerInfo | null>(null);

  // Resolve any pending referral so we can show the "invited by" banner
  useEffect(() => {
    resolvePendingReferrer().then((info) => { if (info) setReferrerInfo(info); }).catch(() => {});
  }, []);

  // Get registration data from params
  const phone = params.phone as string;
  const name = params.name as string;
  const email = params.email as string;
  const googleId = params.google_id as string;
  const profileImage = params.picture as string;
  const termsAccepted = params.terms_accepted === 'true';
  const termsAcceptedAt = params.terms_accepted_at as string;
  const termsVersion = (params.terms_version as string) || NEXRYDE_TERMS_VERSION;

  const handleContinue = async () => {
    // Validate NIN (Nigerian NIN is 11 digits)
    if (!nin.trim()) {
      Alert.alert('NIN Required', 'Please enter your National Identification Number');
      return;
    }
    
    if (nin.length !== 11) {
      Alert.alert('Invalid NIN', 'NIN must be exactly 11 digits');
      return;
    }
    
    if (!/^\d+$/.test(nin)) {
      Alert.alert('Invalid NIN', 'NIN must contain only numbers');
      return;
    }

    if (!termsAccepted) {
      Alert.alert('Terms required', 'Please accept the Rider Terms and Conditions first.');
      router.replace({
        pathname: '/(auth)/rider-terms',
        params: { phone, name, email, google_id: googleId, picture: profileImage },
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          phone: phone || null,
          name: name,
          email: email || null,
          role: 'rider',
          google_id: googleId || null,
          profile_image: profileImage || null,
          nin: nin,
          terms_accepted: true,
          terms_accepted_at: termsAcceptedAt || new Date().toISOString(),
          terms_version: termsVersion,
          privacy_accepted: true,
          privacy_accepted_at: termsAcceptedAt || new Date().toISOString(),
          privacy_version: (params.privacy_version as string) || NEXRYDE_PRIVACY_VERSION,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        const resolvedToken = data?.token || data?.user?.token || null;
        await setTokens(resolvedToken || '', data?.refresh_token);
        setIsAuthenticated(true);
        await saveUserSession({ ...data.user, token: resolvedToken });
        // Apply any deep-link referral after account creation (separate step)
        if (resolvedToken) void autoApplyPendingReferral(data.user.id, resolvedToken);
        try {
          const rs = await fetch(`${BACKEND_URL}/api/users/${data.user.id}/rider-verification-status`, {
            headers: {
              'Content-Type': 'application/json',
              ...(resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
            },
          });
          const riderStatus = await rs.json().catch(() => ({}));
          if (rs.ok && riderStatus?.completed) {
            await markRiderVerificationCached(data.user.id);
            router.replace('/(rider-tabs)/rider-home');
          } else {
            router.replace('/(auth)/rider-verification');
          }
        } catch {
          router.replace('/(auth)/rider-verification');
        }
      } else {
        Alert.alert('Error', data.detail || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Connection Error', 'Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatNIN = (text: string) => {
    // Only allow numbers and limit to 11 digits
    const cleaned = text.replace(/\D/g, '');
    return cleaned.substring(0, 11);
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
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={D.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Icon */}
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={[D.green, D.blue]}
                style={styles.iconGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="shield-checkmark" size={48} color={D.white} />
              </LinearGradient>
            </View>

            {/* Title & Description */}
            <Text style={styles.title}>Verify Your Identity</Text>
            <Text style={styles.subtitle}>
              For your safety and security, we require your National Identification Number (NIN)
            </Text>

            {/* ── Invited-by banner ─────────────────────────────────────────── */}
            {referrerInfo ? (
              <View style={styles.invitedByBanner}>
                <LinearGradient
                  colors={['#2E1065', '#4C1D95']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.invitedByGrad}
                >
                  <View style={styles.invitedByIcon}>
                    <Ionicons name="people" size={18} color="#A78BFA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invitedByTitle}>
                      You were invited by{' '}
                      <Text style={{ color: '#A78BFA', fontWeight: '900' }}>
                        {referrerInfo.username || referrerInfo.displayName}
                      </Text>
                    </Text>
                    <Text style={styles.invitedBySub}>
                      Complete your first ride and you both earn ₦500!
                    </Text>
                  </View>
                  <View style={styles.invitedByBadge}>
                    <Text style={styles.invitedByBadgeText}>₦500</Text>
                  </View>
                </LinearGradient>
              </View>
            ) : null}

            {/* Info Cards */}
            <View style={styles.infoCard}>
              <Ionicons name="lock-closed" size={20} color={D.green} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Your data is secure</Text>
                <Text style={styles.infoText}>
                  We use bank-level encryption to protect your personal information
                </Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="checkmark-circle" size={20} color={D.green} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>One-time verification</Text>
                <Text style={styles.infoText}>
                  You only need to provide your NIN once during registration
                </Text>
              </View>
            </View>

            {/* NIN Input */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>National Identification Number (NIN)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="card" size={20} color={D.green} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your 11-digit NIN"
                  placeholderTextColor={D.textMuted}
                  value={nin}
                  onChangeText={(text) => setNin(formatNIN(text))}
                  keyboardType="number-pad"
                  maxLength={11}
                />
              </View>
              <Text style={styles.helperText}>
                Your NIN is printed on your National ID card
              </Text>
            </View>

            {/* Why NIN Section */}
            <View style={styles.whySection}>
              <Text style={styles.whyTitle}>Why do we need your NIN?</Text>
              <View style={styles.whyItem}>
                <Ionicons name="shield-checkmark" size={16} color={D.green} />
                <Text style={styles.whyText}>Verify your identity as a Nigerian citizen</Text>
              </View>
              <View style={styles.whyItem}>
                <Ionicons name="people" size={16} color={D.green} />
                <Text style={styles.whyText}>Build trust in the NEXRYDE community</Text>
              </View>
              <View style={styles.whyItem}>
                <Ionicons name="warning" size={16} color={D.green} />
                <Text style={styles.whyText}>Prevent fraud and enhance security</Text>
              </View>
              <View style={styles.whyItem}>
                <Ionicons name="car" size={16} color={D.green} />
                <Text style={styles.whyText}>Comply with Nigerian ride-hailing regulations</Text>
              </View>
            </View>
          </ScrollView>

          {/* Continue Button */}
          <View style={styles.bottomContainer}>
            <TouchableOpacity 
              style={[styles.continueButton, nin.length !== 11 && styles.continueButtonDisabled]}
              onPress={handleContinue}
              disabled={nin.length !== 11 || loading}
            >
              <LinearGradient
                colors={nin.length !== 11 ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.10)'] : [D.greenLight, D.green, D.blue]}
                style={styles.continueGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.continueText, nin.length !== 11 && styles.continueTextDisabled]}>
                  {loading ? 'Processing...' : 'Continue'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
              <Text style={styles.secureText}>
              <Ionicons name="lock-closed" size={12} color={D.textMuted} />
              {' '}Your information is encrypted and secure
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
    paddingBottom: SPACING.xl,
  },
  header: {
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: D.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: D.border,
  },
  iconContainer: {
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: D.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: D.border,
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: D.textPrimary,
    marginBottom: 2,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: D.textSecondary,
    lineHeight: 18,
  },
  inputSection: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: D.textSecondary,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.inputBg,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    borderWidth: 2,
    borderColor: D.greenSoftBorder,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  textInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: D.textPrimary,
    letterSpacing: 2,
  },
  helperText: {
    fontSize: FONT_SIZE.xs,
    color: D.textMuted,
    marginTop: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  whySection: {
    backgroundColor: D.greenSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: D.greenSoftBorder,
  },
  whyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: D.textPrimary,
    marginBottom: SPACING.md,
  },
  whyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  whyText: {
    fontSize: FONT_SIZE.sm,
    color: D.textSecondary,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    backgroundColor: D.bg,
    borderTopWidth: 1,
    borderTopColor: D.border,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
    shadowColor: D.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  continueButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
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
  continueTextDisabled: {
    color: D.textMuted,
  },
  secureText: {
    fontSize: FONT_SIZE.xs,
    color: D.textMuted,
    textAlign: 'center',
  },
  // Invited-by banner — purple referral, kept as-is (intentional accent)
  invitedByBanner: { marginTop: SPACING.lg, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  invitedByGrad: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  invitedByIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  invitedByTitle: { color: '#E9D5FF', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  invitedBySub: { color: 'rgba(233,213,255,0.6)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  invitedByBadge: { backgroundColor: 'rgba(74,222,128,0.2)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  invitedByBadgeText: { color: '#4ADE80', fontSize: 13, fontWeight: '900' },
});
