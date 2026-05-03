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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { getPendingReferralCode, clearPendingReferralCode, resolvePendingReferrer, type ReferrerInfo } from '@/src/services/referralService';

export default function RiderNINScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setUser, setToken, setIsAuthenticated } = useAppStore();
  
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

    setLoading(true);
    try {
      // Read any deep-link referral code before registering
      const pendingReferral = await getPendingReferralCode();

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
          referral_code: pendingReferral || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        const resolvedToken = data?.token || data?.user?.token || null;
        setToken(resolvedToken);
        setIsAuthenticated(true);
        await saveUserSession({ ...data.user, token: resolvedToken });
        // Referral was embedded in registration; clear the pending code
        if (pendingReferral) await clearPendingReferralCode();
        router.replace('/(rider-tabs)/rider-home');
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
                <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
              </TouchableOpacity>
            </View>

            {/* Icon */}
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.iconGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="shield-checkmark" size={48} color={COLORS.white} />
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
              <Ionicons name="lock-closed" size={20} color={COLORS.accentGreen} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Your data is secure</Text>
                <Text style={styles.infoText}>
                  We use bank-level encryption to protect your personal information
                </Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
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
                <Ionicons name="card" size={20} color={COLORS.accentGreen} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your 11-digit NIN"
                  placeholderTextColor={COLORS.lightTextMuted}
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
                <Ionicons name="shield-checkmark" size={16} color={COLORS.accentGreen} />
                <Text style={styles.whyText}>Verify your identity as a Nigerian citizen</Text>
              </View>
              <View style={styles.whyItem}>
                <Ionicons name="people" size={16} color={COLORS.accentGreen} />
                <Text style={styles.whyText}>Build trust in the NEXRYDE community</Text>
              </View>
              <View style={styles.whyItem}>
                <Ionicons name="warning" size={16} color={COLORS.accentGreen} />
                <Text style={styles.whyText}>Prevent fraud and enhance security</Text>
              </View>
              <View style={styles.whyItem}>
                <Ionicons name="car" size={16} color={COLORS.accentGreen} />
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
                colors={nin.length !== 11 ? [COLORS.lightBorder, COLORS.lightBorder] : [COLORS.accentGreen, COLORS.accentBlue]}
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
              <Ionicons name="lock-closed" size={12} color={COLORS.lightTextSecondary} />
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
    paddingBottom: SPACING.xl,
  },
  header: {
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'flex-start',
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    lineHeight: 18,
  },
  inputSection: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  textInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    letterSpacing: 2,
  },
  helperText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
    marginTop: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  whySection: {
    backgroundColor: COLORS.accentGreenSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
  },
  whyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  whyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  whyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.white,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
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
    fontWeight: '700',
    color: COLORS.white,
  },
  continueTextDisabled: {
    color: COLORS.lightTextMuted,
  },
  secureText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
  },
  // Invited-by banner
  invitedByBanner: { marginTop: SPACING.lg, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  invitedByGrad: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  invitedByIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  invitedByTitle: { color: '#E9D5FF', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  invitedBySub: { color: 'rgba(233,213,255,0.6)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  invitedByBadge: { backgroundColor: 'rgba(74,222,128,0.2)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  invitedByBadgeText: { color: '#4ADE80', fontSize: 13, fontWeight: '900' },
});
