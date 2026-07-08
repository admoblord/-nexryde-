import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { NEXRYDE_TERMS_VERSION, NEXRYDE_PRIVACY_VERSION } from '@/src/constants/legal';
import { BACKEND_URL } from '@/src/services/api';
import { submitTermsAcceptanceUpdate } from '@/src/services/termsAcceptance';
import { useAppStore } from '@/src/store/appStore';
import { saveUserSession } from '@/utils/authStorage';
import { useAuthFlowRouteRegistration } from '@/src/hooks/useAuthFlowRouteRegistration';
import LegalTermsAcceptFooter from '@/src/components/legal/LegalTermsAcceptFooter';

const D = {
  bg: '#0D1420',
  green: '#00D084',
  greenLight: '#4ADE80',
  blue: '#0066FF',
  white: '#FFFFFF',
  textPrimary: '#F0F4F8',
  textSecondary: '#A8B8D0',
  textMuted: '#6B7A94',
  border: 'rgba(255,255,255,0.10)',
  card: '#19253F',
} as const;

const RiderTermsScrollBody = React.memo(function RiderTermsScrollBody() {
  const openLegal = useCallback(async (path: string) => {
    try {
      await Linking.openURL(`${BACKEND_URL}${path}`);
    } catch {
      Alert.alert('Unable to open link', 'Please try again later.');
    }
  }, []);

  return (
    <View style={styles.termsCard}>
      <Text style={styles.sectionTitle}>NEXRYDE Rider Terms and Conditions</Text>
      <Text style={styles.lastUpdated}>Version {NEXRYDE_TERMS_VERSION} · Last updated July 2026</Text>

      <Text style={styles.sectionHeader}>1. Agreement</Text>
      <Text style={styles.paragraph}>
        By using NEXRYDE as a rider, you agree to these Terms, our Privacy Policy, and all policies referenced
        here. NEXRYDE connects you with independent driver partners — we are a technology platform, not a
        transport carrier.
      </Text>

      <Text style={styles.sectionHeader}>2. Your account</Text>
      <Text style={styles.paragraph}>
        • Provide accurate name, phone, and NIN{'\n'}
        • Keep login credentials secure{'\n'}
        • One account per person{'\n'}
        • You are responsible for activity on your account
      </Text>

      <Text style={styles.sectionHeader}>3. Booking & payments</Text>
      <Text style={styles.paragraph}>
        • Fares shown before or during booking may adjust for route, wait time, or traffic{'\n'}
        • Wallet, card, or cash payments follow in-app rules and partner policies{'\n'}
        • Chargebacks or fraudulent payment disputes may lead to account suspension
      </Text>

      <Text style={styles.sectionHeader}>4. Cancellations & no-shows</Text>
      <Text style={styles.paragraph}>
        Repeated cancellations, no-shows, or abuse of the matching system may result in fees, temporary booking
        restrictions, or permanent account closure.
      </Text>

      <Text style={styles.sectionHeader}>5. Safety</Text>
      <Text style={styles.paragraph}>
        • Use pickup security codes, live tracking, and SOS tools as provided{'\n'}
        • Share trip details with trusted contacts when appropriate{'\n'}
        • Report safety incidents promptly through the app or support channels
      </Text>

      <Text style={styles.sectionHeader}>6. Conduct</Text>
      <Text style={styles.paragraph}>
        Harassment, discrimination, violence, illegal activity, or misuse of driver or rider data is prohibited
        and may be reported to authorities.
      </Text>

      <Text style={styles.sectionHeader}>7. Data & privacy</Text>
      <Text style={styles.paragraph}>
        We process location, trip, payment, and identity data to operate the service. See our Privacy Policy for
        full details on retention, sharing, and your rights under Nigerian law (including NDPR).
      </Text>

      <Text style={styles.sectionHeader}>8. Limitation of liability</Text>
      <Text style={styles.paragraph}>
        NEXRYDE is not liable for acts or omissions of drivers, other users, third parties, or events outside our
        reasonable control, except where liability cannot be excluded by applicable law.
      </Text>

      <Text style={styles.sectionHeader}>9. Changes to these Terms</Text>
      <Text style={styles.paragraph}>
        We may update these Terms at any time. Material changes will be communicated in-app or by email.
        Continued use after the effective date constitutes acceptance of the updated Terms.
      </Text>

      <Text style={styles.sectionHeader}>10. Contact</Text>
      <Text style={styles.paragraph}>
        admin@admoblordgroup.com · +234 808 929 7811 · In-app Support
      </Text>

      <TouchableOpacity onPress={() => void openLegal('/terms-of-service')}>
        <Text style={styles.fullDocLink}>Read full Terms of Service online →</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void openLegal('/privacy-policy')}>
        <Text style={styles.fullDocLink}>Read Privacy Policy online →</Text>
      </TouchableOpacity>
    </View>
  );
});

function RiderTermsScreen() {
  useAuthFlowRouteRegistration('rider-terms');
  const router = useRouter();
  const params = useLocalSearchParams();
  const isUpdate = params.mode === 'update';
  const userId = useAppStore((s) => s.user?.id);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
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
          router.replace('/(rider-tabs)/rider-home');
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

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(auth)/rider-nin',
      params: {
        phone: signupParams.phone,
        name: signupParams.name,
        email: signupParams.email,
        google_id: signupParams.googleId,
        picture: signupParams.profileImage,
        terms_accepted: 'true',
        terms_accepted_at: termsAcceptedAt,
        terms_version: NEXRYDE_TERMS_VERSION,
        privacy_accepted: 'true',
        privacy_accepted_at: termsAcceptedAt,
        privacy_version: NEXRYDE_PRIVACY_VERSION,
      },
    });
  }, [isUpdate, loading, router, setUser, signupParams, user, userId]);

  const footerProps = useMemo(
    () => ({
      checkboxLabel: `I have read and agree to the NEXRYDE Rider Terms and Privacy Policy (v${NEXRYDE_TERMS_VERSION})`,
      acceptLabel: isUpdate ? 'Accept updated terms' : 'Accept and continue',
      activeGradient: [D.greenLight, D.green, D.blue] as const,
      disabledGradient: [D.textMuted, D.textMuted] as const,
      checkboxBorderColor: D.green,
      checkboxCheckedColor: D.green,
      checkmarkColor: D.white,
      labelColor: D.textPrimary,
      acceptTextColor: D.bg,
      acceptTextDisabledColor: D.textMuted,
      containerStyle: [styles.bottomSection, { borderTopColor: D.border, backgroundColor: D.bg }],
    }),
    [isUpdate],
  );

  const onAcceptFooter = useCallback(() => {
    void handleAccept();
  }, [handleAccept]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          {!isUpdate ? (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={D.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text style={styles.headerTitle}>Rider Terms</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
          <RiderTermsScrollBody />
        </ScrollView>

        <LegalTermsAcceptFooter {...footerProps} loading={loading} onAccept={onAcceptFooter} />
      </SafeAreaView>
    </View>
  );
}

export default React.memo(RiderTermsScreen);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: D.textPrimary },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  termsCard: {
    backgroundColor: D.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: D.border,
  },
  sectionTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: D.textPrimary, marginBottom: 4 },
  lastUpdated: { fontSize: FONT_SIZE.sm, color: D.textMuted, marginBottom: SPACING.lg },
  sectionHeader: { fontSize: FONT_SIZE.md, fontWeight: '700', color: D.green, marginTop: SPACING.md, marginBottom: SPACING.sm },
  paragraph: { fontSize: FONT_SIZE.sm, color: D.textSecondary, lineHeight: 22 },
  fullDocLink: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: D.green, marginTop: SPACING.md },
  bottomSection: {
    padding: SPACING.lg,
    borderTopWidth: 1,
  },
});
