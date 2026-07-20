import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Linking, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, useThemeColors } from '@/src/constants/theme';
import { SURFACE } from '@/src/constants/designSystem';
import * as Location from 'expo-location';
import policeContacts from '@/src/data/policeContacts';
import { getSupportContacts, reportTripIssue } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';

type PoliceContact = {
  state: string;
  aliases: string[];
  phone: string;
};

const POLICE_CONTACTS: PoliceContact[] = policeContacts as PoliceContact[];

const normalizeStateInput = (value: string) =>
  value.toLowerCase().replace(/\bstate\b/g, '').replace(/\s+/g, ' ').trim();

export default function SupportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const storeReady = usePersistStoreReady();
  const { user, currentTrip } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const { colors, isDark } = useThemeColors();
  const screenBg = isDark ? colors.background : COLORS.background;
  const cardBg = isDark ? SURFACE.cardDark : COLORS.white;
  const border = isDark ? SURFACE.hairline : COLORS.gray200;
  const textPrimary = colors.text;
  const textMuted = colors.textMuted;
  const softGreen = isDark ? 'rgba(34,197,94,0.16)' : COLORS.accentGreenSoft;
  const [issueCategory, setIssueCategory] = useState<'safety' | 'fare' | 'behavior' | 'route' | 'payment' | 'general'>('general');
  const [issueText, setIssueText] = useState('');
  const [reportingIssue, setReportingIssue] = useState(false);
  const [supportPhone, setSupportPhone] = useState('+2348089297811');
  const [supportEmail, setSupportEmail] = useState('admin@admoblordgroup.com');
  const [stateQuery, setStateQuery] = useState('');
  const [detectedState, setDetectedState] = useState('');
  const [searchTouched, setSearchTouched] = useState(false);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const res = await getSupportContacts();
        if (res.data?.support_phone) setSupportPhone(res.data.support_phone);
        if (res.data?.support_email) setSupportEmail(res.data.support_email);
      } catch (e) {
        console.log('Failed to load support contacts', e);
      }
    };
    void loadContacts();
  }, []);

  useEffect(() => {
    const detectState = async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const geo = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        const stateRaw = String(geo?.[0]?.region || geo?.[0]?.subregion || '').trim();
        const normalized = normalizeStateInput(stateRaw);
        if (!normalized) return;
        setDetectedState(normalized);
        setStateQuery((prev) => (prev.trim() ? prev : normalized));
      } catch {
        // Best-effort GPS detection only.
      }
    };
    void detectState();
  }, []);

  const normalizedQuery = normalizeStateInput(stateQuery);
  const activeQuery = normalizedQuery || detectedState;
  const matchedPoliceContact = useMemo(() => {
    if (!activeQuery) return null;
    return (
      POLICE_CONTACTS.find((contact) =>
        contact.aliases.some((alias) => alias.includes(activeQuery))
      ) || null
    );
  }, [activeQuery]);

  const contactOptions = [
    { icon: 'call', label: 'Call Support', value: supportPhone, action: () => Linking.openURL(`tel:${supportPhone}`) },
    { icon: 'mail', label: 'Email Us', value: supportEmail, action: () => Linking.openURL(`mailto:${supportEmail}`) },
  ];

  const prefilledTripId = (params.tripId as string) || currentTrip?.id || '';

  const submitIssueReport = async () => {
    if (!userId || !canCallAuthedApi || !user) {
      Alert.alert('Login required', 'Please login and try again.');
      return;
    }
    if (!prefilledTripId) {
      Alert.alert('Trip required', 'Open support from an active/completed trip to report issue.');
      return;
    }
    if (!issueText.trim()) {
      Alert.alert('Describe issue', 'Please describe what happened.');
      return;
    }
    setReportingIssue(true);
    try {
      const role = user.role === 'driver' ? 'driver' : 'rider';
      const res = await reportTripIssue({
        trip_id: prefilledTripId,
        user_id: userId,
        role,
        category: issueCategory,
        description: issueText.trim(),
      });
      if (res.data?.success) {
        Alert.alert('Reported', 'Issue submitted. Support now has your full trip context.');
        setIssueText('');
      } else {
        Alert.alert('Error', 'Could not submit issue report.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit issue report.');
    } finally {
      setReportingIssue(false);
    }
  };

  if (!storeReady) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={screenBg} />
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textPrimary }]}>Help & Support</Text>
            <Text style={[styles.headerSubtitle, { color: textMuted }]}>
              Fast support for trips, payments, safety and disputes.
            </Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: border }]}>
            <View style={[styles.heroIcon, { backgroundColor: softGreen }]}>
              <Ionicons name="headset" size={24} color={COLORS.accentGreen} />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={[styles.heroTitle, { color: textPrimary }]}>Support Center</Text>
              <Text style={[styles.heroText, { color: textMuted }]}>
                Reach support directly, find emergency contacts, or submit a trip issue for human review.
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Direct contact</Text>
          {contactOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.contactCard, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}
              onPress={option.action}
            >
              <View style={[styles.contactIcon, { backgroundColor: softGreen }]}>
                <Ionicons name={option.icon as any} size={24} color={COLORS.accentGreen} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactLabel, { color: textPrimary }]}>{option.label}</Text>
                <Text style={[styles.contactValue, { color: textMuted }]}>{option.value}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={textMuted} />
            </TouchableOpacity>
          ))}

          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Nigerian Police Finder</Text>
          <View style={[styles.messageCard, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}>
            <TextInput
              style={[styles.messageInput, styles.finderInput, { color: textPrimary, borderColor: border }]}
              placeholder="Search state (e.g. Lagos, Abuja, Port Harcourt)"
              placeholderTextColor={textMuted}
              value={stateQuery}
              onChangeText={(value) => {
                setStateQuery(value);
                setSearchTouched(true);
              }}
            />
            {!stateQuery.trim() && detectedState ? (
              <Text style={[styles.issueMeta, { color: textMuted }]}>Auto-detected: {detectedState}</Text>
            ) : null}
            {activeQuery && matchedPoliceContact ? (
              <View style={[styles.contactCard, styles.finderResultCard, { backgroundColor: softGreen }]}>
                <View style={[styles.contactIcon, { backgroundColor: softGreen }]}>
                  <Ionicons name="shield-checkmark" size={24} color={COLORS.accentGreen} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={[styles.contactLabel, { color: textPrimary }]}>{matchedPoliceContact.state}</Text>
                  <Text style={[styles.contactValue, { color: textMuted }]}>Police Command</Text>
                  <Text style={[styles.contactValue, { color: textPrimary, fontWeight: '700', marginTop: 3 }]}>
                    {matchedPoliceContact.phone}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.callNowBtn}
                  onPress={() => Linking.openURL(`tel:${matchedPoliceContact.phone}`)}
                >
                  <Text style={styles.callNowText}>Call Now</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {(searchTouched || !!detectedState) && activeQuery && !matchedPoliceContact ? (
              <Text style={[styles.emptyStateText, { color: textMuted }]}>No state found. Try another name.</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.contactCard, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}
            onPress={() =>
              router.push({
                pathname: '/shield-disputes',
                params: prefilledTripId ? { tripId: prefilledTripId } : {},
              })
            }
          >
            <View style={[styles.contactIcon, { backgroundColor: softGreen }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.accentGreen} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: textPrimary }]}>NEXRYDE Shield — Disputes</Text>
              <Text style={[styles.contactValue, { color: textMuted }]}>
                Fair process: both sides heard before any action
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={textMuted} />
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Report trip issue</Text>
          <View style={[styles.messageCard, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}>
            <Text style={[styles.issueMeta, { color: textMuted }]}>
              Trip: {prefilledTripId || 'No trip selected'}
            </Text>
            <View style={styles.quickPromptWrap}>
              {(['safety', 'fare', 'behavior', 'route', 'payment', 'general'] as const).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.quickPrompt,
                    { backgroundColor: softGreen },
                    issueCategory === cat && styles.selectedCategory,
                  ]}
                  onPress={() => setIssueCategory(cat)}
                >
                  <Text style={[styles.quickPromptText, issueCategory === cat && styles.selectedCategoryText]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.messageInput, { color: textPrimary, borderColor: border }]}
              placeholder="Describe issue with this trip..."
              placeholderTextColor={textMuted}
              multiline
              numberOfLines={4}
              value={issueText}
              onChangeText={setIssueText}
            />
            <TouchableOpacity style={styles.sendButton} onPress={submitIssueReport} disabled={reportingIssue}>
              <Text style={styles.sendButtonText}>{reportingIssue ? 'Submitting...' : 'Submit Issue Report'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  backButton: { padding: SPACING.xs },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900 },
  headerSubtitle: {
    marginTop: 2,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray600,
    fontWeight: '600',
    textAlign: 'center',
  },
  placeholder: { width: 40 },
  content: { flex: 1, padding: SPACING.lg },
  contentContainer: { paddingBottom: SPACING.xl * 2 },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
    marginTop: SPACING.lg,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    marginBottom: SPACING.sm,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray900,
    marginBottom: 4,
  },
  heroText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    fontWeight: '600',
    lineHeight: 20,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInfo: { flex: 1 },
  contactLabel: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.gray900, marginBottom: 4 },
  contactValue: { fontSize: FONT_SIZE.sm, color: COLORS.gray600 },
  messageCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  chipLangLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.gray600,
    marginBottom: SPACING.xs,
    letterSpacing: 0.3,
  },
  quickPromptWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  quickPrompt: {
    backgroundColor: COLORS.accentGreenSoft,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  quickPromptText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.accentGreen,
    fontWeight: '700',
  },
  selectedCategory: {
    backgroundColor: COLORS.accentGreen,
  },
  selectedCategoryText: {
    color: COLORS.white,
  },
  issueMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray600,
    marginBottom: SPACING.sm,
    fontWeight: '600',
  },
  chatBox: {
    maxHeight: 240,
    marginBottom: SPACING.sm,
  },
  bubble: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.xs,
    maxWidth: '92%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.accentGreen,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gray100,
  },
  bubbleText: {
    color: COLORS.gray900,
    fontSize: FONT_SIZE.sm,
  },
  userBubbleText: {
    color: COLORS.white,
  },
  messageInput: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray900,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  finderInput: {
    minHeight: 52,
    textAlignVertical: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  finderResultCard: {
    marginBottom: 0,
  },
  sendButton: {
    backgroundColor: COLORS.accentGreen,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    flex: 1,
  },
  sendButtonText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  callNowBtn: {
    backgroundColor: COLORS.accentGreen,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'center',
  },
  callNowText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
  },
  emptyStateText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    fontWeight: '600',
  },
});