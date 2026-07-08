import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { DriverOnboardingProgress } from '@/src/components/DriverOnboardingProgress';
import { BACKEND_URL, getAuthHeaders, formatApiDetail } from '@/src/services/api';
import { submitTermsAcceptanceUpdate } from '@/src/services/termsAcceptance';
import { useAppStore } from '@/src/store/appStore';
import { setTokens } from '@/src/lib/tokenStore';
import { saveUserSession } from '@/utils/authStorage';
import { useOnboardingSurfaces } from '@/src/hooks/useOnboardingSurfaces';
import { useAuthFlowRouteRegistration } from '@/src/hooks/useAuthFlowRouteRegistration';
import { routeAuthedUser } from '@/src/utils/routeAuthedUser';
import { NEXRYDE_TERMS_VERSION, NEXRYDE_PRIVACY_VERSION } from '@/src/constants/legal';
import LegalTermsAcceptFooter from '@/src/components/legal/LegalTermsAcceptFooter';

const DriverTermsScrollBody = React.memo(function DriverTermsScrollBody() {
  return (
    <View style={styles.termsCard}>
      <Text style={styles.sectionTitle}>NEXRYDE Driver Terms and Conditions</Text>
      <Text style={styles.lastUpdated}>Version {NEXRYDE_TERMS_VERSION} · Last updated July 2026</Text>

      <Text style={styles.sectionHeader}>1. Driver Partnership Agreement</Text>
      <Text style={styles.paragraph}>
        By registering as a NEXRYDE driver, you enter into a working agreement with NEXRYDE. You are a valued NEXRYDE worker using our platform to connect with riders and earn income.
      </Text>

      <Text style={styles.sectionHeader}>2. Subscription Model</Text>
      <Text style={styles.paragraph}>
        • Launch pricing: ₦15,000/month (first 500 drivers){'\n'}
        • Standard pricing: ₦18,000/month (after launch){'\n'}
        • Free trial for newly verified drivers: 15 completed trips or 14 days from first go-online (whichever comes first){'\n'}
        • Subscribe during trial and save ₦3,000 on your first month (₦15,000){'\n'}
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
        • Email: admin@admoblordgroup.com{'\n'}
        • Phone: +234 808 929 7811{'\n'}
        • In-app chat support available 24/7{'\n'}
        • Visit: https://nexryde-backend-993913300770.us-central1.run.app/support-page
      </Text>
    </View>
  );
});

const DriverOnboardingHeader = React.memo(function DriverOnboardingHeader({
  isUpdate,
  appearance,
}: {
  isUpdate: boolean;
  appearance: 'light' | 'dark';
}) {
  const subtitle = isUpdate
    ? 'Review the updated driver terms and privacy policy, then accept to continue.'
    : 'Read the driver partnership terms, accept below, then continue to document upload.';

  return (
    <DriverOnboardingProgress current="terms" appearance={appearance} subtitle={subtitle} />
  );
});

function DriverTermsScreen() {
  useAuthFlowRouteRegistration('driver-terms');
  const router = useRouter();
  const params = useLocalSearchParams();
  const isUpdate = params.mode === 'update';
  const surf = useOnboardingSurfaces();
  const userId = useAppStore((s) => s.user?.id);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);
  const [loading, setLoading] = useState(false);

  const signupParams = useMemo(
    () => ({
      phone: (params.phone as string) || '',
      name: (params.name as string) || '',
      email: (params.email as string) || '',
      googleId: (params.google_id as string) || '',
      profileImage: (params.picture as string) || '',
    }),
    [params.email, params.google_id, params.name, params.phone, params.picture],
  );

  const handleAccept = useCallback(async () => {
    const termsAcceptedAt = new Date().toISOString();

    if (isUpdate) {
      if (loading) return;
      const uid = userId || user?.id;
      setLoading(true);
      try {
        const result = await submitTermsAcceptanceUpdate({
          userId: uid || '',
          user,
          termsVersion: NEXRYDE_TERMS_VERSION,
          privacyVersion: NEXRYDE_PRIVACY_VERSION,
        });

        if (result.ok) {
          setUser(result.user);
          await saveUserSession({ ...result.user, token: result.token });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/(driver-tabs)/driver-home');
          return;
        }

        if (result.reason === 'redirect_login') {
          router.replace('/(auth)/login');
          return;
        }

        if (result.reason === 'api_error') {
          Alert.alert('Could not save acceptance', result.message);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          phone: signupParams.phone || null,
          name: signupParams.name,
          email: signupParams.email || null,
          role: 'driver',
          google_id: signupParams.googleId || null,
          profile_image: signupParams.profileImage || null,
          terms_accepted: true,
          terms_accepted_at: termsAcceptedAt,
          terms_version: NEXRYDE_TERMS_VERSION,
          privacy_accepted: true,
          privacy_accepted_at: termsAcceptedAt,
          privacy_version: NEXRYDE_PRIVACY_VERSION,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const driverUser = data?.user;
        const resolvedToken = data?.token || driverUser?.token || null;
        if (!driverUser?.id || !resolvedToken) {
          Alert.alert(
            'Could not finish signup',
            'Your driver account was created, but the login session was not returned. Please sign in and continue documents.',
          );
          router.replace({ pathname: '/(auth)/login', params: { flow: 'login', role: 'driver' } });
          return;
        }
        setUser(driverUser);
        await setTokens(resolvedToken, data?.refresh_token);
        setIsAuthenticated(true);
        await saveUserSession({ ...driverUser, token: resolvedToken });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await routeAuthedUser(router, driverUser, resolvedToken);
      } else {
        const msg = formatApiDetail(data?.detail) || 'Registration failed. Please try again.';
        Alert.alert('Could not finish signup', msg);
      }
    } catch {
      Alert.alert('Connection error', 'Could not reach the server. Check your network and try again.');
    } finally {
      setLoading(false);
    }
  }, [
    isUpdate,
    router,
    setIsAuthenticated,
    setUser,
    signupParams,
    loading,
    user,
    userId,
  ]);

  const footerProps = useMemo(
    () => ({
      checkboxLabel: `I have read and agree to the Driver Terms and Privacy Policy (v${NEXRYDE_TERMS_VERSION})`,
      acceptLabel: isUpdate ? 'Accept updated terms' : 'Accept and continue to documents',
      activeGradient: [COLORS.accentGreen, COLORS.accentBlue] as const,
      disabledGradient: [COLORS.lightBorder, COLORS.lightBorder] as const,
      checkboxBorderColor: COLORS.lightBorder,
      checkboxCheckedColor: COLORS.accentGreen,
      checkmarkColor: COLORS.white,
      labelColor: COLORS.lightTextPrimary,
      acceptTextColor: COLORS.white,
      acceptTextDisabledColor: COLORS.lightTextMuted,
      containerStyle: styles.bottomSection,
    }),
    [isUpdate],
  );

  const headerStyle = useMemo(
    () => [styles.header, { backgroundColor: surf.header, borderBottomColor: surf.border }],
    [surf.border, surf.header],
  );

  const onAcceptFooter = useCallback(() => {
    void handleAccept();
  }, [handleAccept]);

  return (
    <View style={[styles.container, { backgroundColor: surf.screen }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={headerStyle}>
          {!isUpdate ? (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={surf.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text style={[styles.headerTitle, { color: surf.text }]}>Driver Terms & Conditions</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
          <DriverOnboardingHeader isUpdate={isUpdate} appearance={surf.isDark ? 'dark' : 'light'} />
          <DriverTermsScrollBody />
        </ScrollView>

        <LegalTermsAcceptFooter {...footerProps} loading={loading} onAccept={onAcceptFooter} />
      </SafeAreaView>
    </View>
  );
}

export default React.memo(DriverTermsScreen);

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
});
