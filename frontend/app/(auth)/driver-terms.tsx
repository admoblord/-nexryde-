import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { DriverOnboardingProgress } from '@/src/components/DriverOnboardingProgress';
import { BACKEND_URL, getAuthHeaders, formatApiDetail } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';
import { saveUserSession } from '@/utils/authStorage';

export default function DriverTermsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setUser, setToken, setIsAuthenticated } = useAppStore();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Get registration data from params
  const phone = params.phone as string;
  const name = params.name as string;
  const email = params.email as string;
  const googleId = params.google_id as string;
  const profileImage = params.picture as string;

  const requestPhoneVerification = async () => {
    if (!phone) {
      router.replace({ pathname: '/(auth)/login', params: { flow: 'login', role: 'driver' } });
      return;
    }

    const otpResponse = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ phone }),
    });
    const otpData = await otpResponse.json().catch(() => ({}));
    if (!otpResponse.ok) {
      const msg = formatApiDetail(otpData?.detail) || 'Could not send verification code. Please try again.';
      Alert.alert('Phone verification needed', msg);
      return;
    }

    router.replace({
      pathname: '/(auth)/verify',
      params: {
        phone,
        provider: otpData?.provider || 'sms',
      },
    });
  };

  const handleAcceptAndContinue = async () => {
    if (!accepted) {
      Alert.alert('Terms Required', 'Please accept the Terms and Conditions to continue');
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
          role: 'driver',
          google_id: googleId || null,
          profile_image: profileImage || null,
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const driverUser = data?.user;
        const resolvedToken = data?.token || driverUser?.token || null;
        if (!driverUser?.id || !resolvedToken) {
          Alert.alert('Could not finish signup', 'Your driver account was created, but the login session was not returned. Please sign in and continue documents.');
          router.replace({ pathname: '/(auth)/login', params: { flow: 'login', role: 'driver' } });
          return;
        }
        setUser(driverUser);
        setToken(resolvedToken);
        setIsAuthenticated(true);
        await saveUserSession({ ...driverUser, token: resolvedToken });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace({
          pathname: '/(auth)/driver-documents',
          params: {
            driver_id: driverUser.id,
            phone: driverUser.phone || phone,
            name: driverUser.name || name,
            email: driverUser.email || email,
          },
        });
      } else {
        const detail = data?.detail;
        const code = detail && typeof detail === 'object' ? detail.code : undefined;
        if (response.status === 409 && code === 'PHONE_EXISTS_VERIFY_REQUIRED') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert(
            'Continue existing registration',
            'This phone already started driver signup. Verify the phone and we will take you back to the unfinished step.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Verify phone',
                onPress: () => {
                  void requestPhoneVerification();
                },
              },
            ],
          );
          return;
        }
        const msg = formatApiDetail(data?.detail) || 'Registration failed. Please try again.';
        Alert.alert('Could not finish signup', msg);
      }
    } catch {
      Alert.alert('Connection error', 'Could not reach the server. Check your network and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver Terms & Conditions</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Terms Content */}
        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <DriverOnboardingProgress
            current="terms"
            subtitle="Read the driver partnership terms, accept below, then continue to document upload."
          />
          <View style={styles.termsCard}>
            <Text style={styles.sectionTitle}>NEXRYDE Driver Terms and Conditions</Text>
            <Text style={styles.lastUpdated}>Last Updated: June 2025</Text>

            <Text style={styles.sectionHeader}>1. Driver Partnership Agreement</Text>
            <Text style={styles.paragraph}>
              By registering as a NEXRYDE driver, you enter into a working agreement with NEXRYDE. You are a valued NEXRYDE worker using our platform to connect with riders and earn income.
            </Text>

            <Text style={styles.sectionHeader}>2. Subscription Model</Text>
            <Text style={styles.paragraph}>
              • Launch pricing: ₦15,000/month (first 500 drivers){'\n'}
              • Standard pricing: ₦18,000/month (after launch){'\n'}
              • Free 20-trip activity trial for newly verified drivers{'\n'}
              • Zero commission on rides — keep 100% of your earnings{'\n'}
              • Subscription must be active to accept ride requests{'\n'}
              • Payment proof must be submitted for verification
            </Text>

            <Text style={styles.sectionHeader}>3. Driver Requirements</Text>
            <Text style={styles.paragraph}>
              • Valid Nigerian driver's license{'\n'}
              • National Identification Number (NIN){'\n'}
              • Registered vehicle with valid insurance{'\n'}
              • Clean driving record{'\n'}
              • Pass background verification check{'\n'}
              • Smartphone with internet access
            </Text>

            <Text style={styles.sectionHeader}>4. Vehicle Standards</Text>
            <Text style={styles.paragraph}>
              Your vehicle must:{'\n'}
              • Be registered and roadworthy{'\n'}
              • Have valid insurance coverage{'\n'}
              • Be clean and well-maintained{'\n'}
              • Pass NEXRYDE vehicle inspection{'\n'}
              • Meet minimum year requirements for your city
            </Text>

            <Text style={styles.sectionHeader}>5. Service Quality Standards</Text>
            <Text style={styles.paragraph}>
              You must:{'\n'}
              • Maintain a minimum 4.5-star rating{'\n'}
              • Accept at least 75% of assigned ride requests{'\n'}
              • Complete rides professionally and safely{'\n'}
              • Follow traffic laws and regulations{'\n'}
              • Treat all riders with respect{'\n'}
              • Keep your vehicle clean and presentable
            </Text>

            <Text style={styles.sectionHeader}>6. Earnings & Payment</Text>
            <Text style={styles.paragraph}>
              • You keep 100% of ride fares{'\n'}
              • Riders pay directly to you via cash or NEXRYDE wallet{'\n'}
              • Tips are optional and go directly to you{'\n'}
              • No hidden deductions or commissions{'\n'}
              • Weekly earnings reports available in-app
            </Text>

            <Text style={styles.sectionHeader}>7. Safety & Insurance</Text>
            <Text style={styles.paragraph}>
              • You must maintain valid vehicle insurance{'\n'}
              • NEXRYDE provides ₦1M ride insurance coverage{'\n'}
              • Report all accidents within 24 hours{'\n'}
              • Never drive under influence of alcohol/drugs{'\n'}
              • Use in-app emergency features when needed
            </Text>

            <Text style={styles.sectionHeader}>8. Account Suspension & Termination</Text>
            <Text style={styles.paragraph}>
              NEXRYDE may suspend or terminate your account for:{'\n'}
              • Fraudulent activity or document forgery{'\n'}
              • Consistent poor ratings (below 4.0){'\n'}
              • Safety violations or criminal activity{'\n'}
              • Harassment of riders or other drivers{'\n'}
              • Expired subscription without renewal{'\n'}
              • Violation of these terms
            </Text>

            <Text style={styles.sectionHeader}>9. Data & Privacy</Text>
            <Text style={styles.paragraph}>
              • We collect trip data, location, and performance metrics{'\n'}
              • Your data is protected per our Privacy Policy{'\n'}
              • Rider information must be kept confidential{'\n'}
              • We may use anonymized data for platform improvement
            </Text>

            <Text style={styles.sectionHeader}>10. Dispute Resolution</Text>
            <Text style={styles.paragraph}>
              • Report issues through in-app support{'\n'}
              • Disputes resolved within 7 business days{'\n'}
              • Governed by Nigerian law{'\n'}
              • Lagos State courts have jurisdiction
            </Text>

            <Text style={styles.sectionHeader}>11. Changes to Terms</Text>
            <Text style={styles.paragraph}>
              We may update these terms at any time. Continued use of the platform after changes constitutes acceptance of new terms. Major changes will be communicated via email or in-app notification.
            </Text>

            <Text style={styles.sectionHeader}>12. Contact & Support</Text>
            <Text style={styles.paragraph}>
              For questions or support:{'\n'}
              • Email: support@nexryde.com{'\n'}
              • Phone: +234 808 929 7811{'\n'}
              • In-app chat support available 24/7{'\n'}
              • Visit: https://nexryde-backend-993913300770.us-central1.run.app/support-page
            </Text>
          </View>
        </ScrollView>

        {/* Acceptance Section */}
        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setAccepted(!accepted)}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted && <Ionicons name="checkmark" size={18} color={COLORS.white} />}
            </View>
            <Text style={styles.checkboxText}>
              I have read and agree to the Driver Terms and Conditions
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.continueButton, !accepted && styles.continueButtonDisabled]}
            onPress={handleAcceptAndContinue}
            disabled={!accepted || loading}
          >
            <LinearGradient
              colors={!accepted ? [COLORS.lightBorder, COLORS.lightBorder] : [COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.continueGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={[styles.continueText, !accepted && styles.continueTextDisabled]}>
                  Accept and continue to documents
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 40,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  termsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  lastUpdated: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accentGreen,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  paragraph: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    lineHeight: 20,
  },
  bottomSection: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  checkboxChecked: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  checkboxText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextPrimary,
    lineHeight: 18,
  },
  continueButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
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
});
