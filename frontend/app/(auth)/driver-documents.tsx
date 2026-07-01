import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { DriverOnboardingProgress } from '@/src/components/DriverOnboardingProgress';
import { BACKEND_URL, getAuthHeaders, formatApiDetail } from '@/src/services/api';
import { apiErrorMessage } from '@/src/utils/apiErrorMessage';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useThemeColors } from '@/src/constants/theme';

const MINT = '#34D399';
const MINT_DARK = '#059669';
const BG_TOP = '#020617';
const BG_MID = '#0F172A';
const CARD = 'rgba(15,23,42,0.92)';
const TEXT = '#F8FAFC';
const MUTED = '#94A3B8';
const BORDER = 'rgba(52,211,153,0.2)';
const INPUT_BG = 'rgba(2,6,23,0.55)';

type DocKey =
  | 'nin'
  | 'drivers_license'
  | 'passport_photo'
  | 'vehicle_registration'
  | 'vehicle_license'
  | 'hacking_permit'
  | 'road_worthiness'
  | 'insurance'
  | 'vehicle_front'
  | 'vehicle_interior'
  | 'vehicle_ac';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface DocItem {
  key: DocKey;
  label: string;
  icon: IconName;
  /** Gradient behind icon */
  iconGrad: readonly [string, string];
  required: boolean;
  hasExpiry: boolean;
}

const DOCUMENTS: DocItem[] = [
  { key: 'nin', label: 'National ID (NIN)', icon: 'id-card-outline', iconGrad: ['#34D399', '#0D9488'], required: true, hasExpiry: false },
  { key: 'drivers_license', label: "Driver's License", icon: 'speedometer-outline', iconGrad: ['#38BDF8', '#2563EB'], required: true, hasExpiry: true },
  { key: 'passport_photo', label: 'Passport Photo', icon: 'person-circle-outline', iconGrad: ['#A78BFA', '#6366F1'], required: true, hasExpiry: false },
  { key: 'vehicle_registration', label: 'Plate Number Upload', icon: 'document-attach-outline', iconGrad: ['#2DD4BF', '#0D9488'], required: true, hasExpiry: false },
  { key: 'vehicle_license', label: 'Vehicle License Document', icon: 'reader-outline', iconGrad: ['#FBBF24', '#D97706'], required: true, hasExpiry: true },
  {
    key: 'hacking_permit',
    label: 'Hackney Permit / Carriage',
    icon: 'ribbon-outline',
    iconGrad: ['#94A3B8', '#64748B'],
    required: false,
    hasExpiry: true,
  },
  { key: 'road_worthiness', label: 'Road Worthiness Certificate', icon: 'construct-outline', iconGrad: ['#FB923C', '#EA580C'], required: true, hasExpiry: true },
  { key: 'insurance', label: 'Vehicle Insurance', icon: 'umbrella-outline', iconGrad: ['#60A5FA', '#4F46E5'], required: true, hasExpiry: true },
  { key: 'vehicle_front', label: 'Vehicle Photo (Front)', icon: 'car-sport-outline', iconGrad: ['#4ADE80', '#15803D'], required: true, hasExpiry: false },
  { key: 'vehicle_interior', label: 'Vehicle Interior (live)', icon: 'images-outline', iconGrad: ['#22D3EE', '#0891B2'], required: true, hasExpiry: false },
  { key: 'vehicle_ac', label: 'AC System Photo (live)', icon: 'snow-outline', iconGrad: ['#7DD3FC', '#0284C7'], required: true, hasExpiry: false },
];

const CAMERA_RESUME_TTL_MS = 10 * 60 * 1000;
const DRAFT_VERSION = 1;
const CAMERA_RESUME_KEY = '@driver_documents_camera_resume';

const formatExpiryInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length === 4) return `${digits.slice(0, 2)}/20${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const getExpiryValidationMessage = (value?: string) => {
  const formatted = formatExpiryInput(value || '');
  if (formatted.length < 7) return 'missing';

  const [monthText, yearText] = formatted.split('/');
  const month = Number(monthText);
  const year = Number(yearText);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000) {
    return 'invalid';
  }

  const now = new Date();
  const expiryEndOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  return expiryEndOfMonth >= now ? null : 'expired';
};

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { storeReady, canCallAuthedApi } = useAuthedApiReady();
  const { colors, isDark } = useThemeColors();

  const palette = useMemo(
    () => ({
      text: isDark ? TEXT : colors.text,
      muted: isDark ? MUTED : colors.textMuted,
      card: isDark ? CARD : colors.card,
      cardBorder: isDark ? 'rgba(148,163,184,0.12)' : colors.border,
      border: isDark ? BORDER : colors.border,
      inputBg: isDark ? INPUT_BG : colors.surface,
      insetBg: isDark ? 'rgba(2,6,23,0.65)' : colors.background,
      placeholder: isDark ? '#64748B' : colors.textMuted,
      headerBorder: isDark ? 'rgba(148,163,184,0.15)' : colors.border,
      backBtnBg: isDark ? 'rgba(15,23,42,0.6)' : colors.surface,
      bottomBg: isDark ? 'rgba(15,23,42,0.96)' : colors.surface,
      bottomBorder: isDark ? 'rgba(52,211,153,0.15)' : colors.border,
      heroGrad: isDark
        ? (['rgba(52,211,153,0.12)', 'rgba(15,23,42,0.95)'] as const)
        : (['rgba(34,197,94,0.08)', colors.card] as const),
      iconInnerBg: isDark ? 'rgba(15,23,42,0.92)' : colors.surface,
      progressAppearance: (isDark ? 'dark' : 'light') as 'dark' | 'light',
    }),
    [isDark, colors],
  );

  const [docs, setDocs] = useState<Record<string, string | null>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [ninNumber, setNinNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [activePickerKey, setActivePickerKey] = useState<DocKey | null>(null);

  const CAMERA_ONLY_KEYS: DocKey[] = ['vehicle_interior', 'vehicle_ac', 'vehicle_front'];
  const driverId = String(params.driver_id || '');
  const draftCacheKey = useMemo(
    () => `@driver_documents_draft_${driverId || String(params.phone || 'unknown')}`,
    [driverId, params.phone],
  );
  const pendingPickerKey = useMemo(
    () => `@driver_documents_pending_picker_${driverId || String(params.phone || 'unknown')}`,
    [driverId, params.phone],
  );

  const persistableDocUri = async (key: DocKey, uri: string) => {
    if (!uri || !FileSystem.documentDirectory) return uri;
    if (uri.startsWith(FileSystem.documentDirectory)) return uri;

    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return uri;

      const dir = `${FileSystem.documentDirectory}driver-document-drafts/${driverId || 'unknown'}/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const extMatch = uri.split('?')[0].match(/\.(jpe?g|png|webp)$/i);
      const ext = extMatch?.[1]?.toLowerCase() || 'jpg';
      const target = `${dir}${key}-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: uri, to: target });
      return target;
    } catch {
      return uri;
    }
  };

  const saveDocUri = async (key: DocKey, uri: string) => {
    const stableUri = await persistableDocUri(key, uri);
    setDocs((prev) => ({ ...prev, [key]: stableUri }));
  };

  const markCameraResume = async (key: DocKey) => {
    try {
      await AsyncStorage.setItem(
        CAMERA_RESUME_KEY,
        JSON.stringify({
          driverId,
          docKey: key,
          expiresAt: Date.now() + CAMERA_RESUME_TTL_MS,
        }),
      );
    } catch {
      /* best-effort */
    }
  };

  const clearCameraResume = async () => {
    try {
      await AsyncStorage.removeItem(CAMERA_RESUME_KEY);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    let mounted = true;
    const restoreDraft = async () => {
      try {
        const raw = await AsyncStorage.getItem(draftCacheKey);
        if (!raw) return;
        const draft = JSON.parse(raw) as {
          version?: number;
          docs?: Record<string, string | null>;
          expiry?: Record<string, string>;
          ninNumber?: string;
        };
        if (!mounted || draft.version !== DRAFT_VERSION) return;
        const restored = { ...(draft.docs || {}) };
        delete restored.nin;
        setDocs(restored);
        const ex = { ...(draft.expiry || {}) };
        delete ex.nin;
        setExpiry(ex);
        setNinNumber(draft.ninNumber || '');
      } catch {
        /* draft recovery best-effort */
      } finally {
        if (mounted) setDraftLoaded(true);
      }
    };
    void restoreDraft();
    return () => {
      mounted = false;
    };
  }, [draftCacheKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    const draft = JSON.stringify({
      version: DRAFT_VERSION,
      docs,
      expiry,
      ninNumber,
      savedAt: Date.now(),
    });
    void AsyncStorage.setItem(draftCacheKey, draft);
  }, [docs, draftCacheKey, draftLoaded, expiry, ninNumber]);

  useEffect(() => {
    let mounted = true;
    const recoverPendingImagePickerResult = async () => {
      const getPendingResultAsync = (ImagePicker as { getPendingResultAsync?: () => Promise<ImagePicker.ImagePickerResult> })
        .getPendingResultAsync;
      if (typeof getPendingResultAsync !== 'function') return;
      try {
        const pendingKey = (await AsyncStorage.getItem(pendingPickerKey)) as DocKey | null;
        if (!pendingKey) return;
        const result = await getPendingResultAsync();
        if (!mounted || !result || result.canceled || !result.assets?.[0]?.uri) return;
        await saveDocUri(pendingKey, result.assets[0].uri);
      } catch {
        /* Android pending result optional */
      } finally {
        await AsyncStorage.removeItem(pendingPickerKey);
      }
    };
    void recoverPendingImagePickerResult();
    return () => {
      mounted = false;
    };
  }, [pendingPickerKey]);

  const pickImage = (key: DocKey) => {
    if (key === 'nin') return;
    if (CAMERA_ONLY_KEYS.includes(key)) {
      Alert.alert(
        'Live photo required',
        'This shot must be taken now with your camera so we can verify your vehicle’s current condition.',
        [
          { text: 'Open camera', onPress: () => void openCamera(key) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    Alert.alert('Add document', `Choose how to add ${DOCUMENTS.find((d) => d.key === key)?.label}`, [
      { text: 'Camera', onPress: () => void openCamera(key) },
      { text: 'Gallery', onPress: () => void openGallery(key) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = async (key: DocKey) => {
    try {
      setActivePickerKey(key);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take document photos.');
        return;
      }
      await markCameraResume(key);
      await AsyncStorage.setItem(pendingPickerKey, key);
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.85,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        await saveDocUri(key, result.assets[0].uri);
      }
      await AsyncStorage.removeItem(pendingPickerKey);
      await clearCameraResume();
    } catch {
      Alert.alert('Camera', 'Could not open the camera. Try again.');
    } finally {
      setActivePickerKey(null);
    }
  };

  const openGallery = async (key: DocKey) => {
    try {
      setActivePickerKey(key);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library access is required to pick a document.');
        return;
      }
      await AsyncStorage.setItem(pendingPickerKey, key);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        await saveDocUri(key, result.assets[0].uri);
      }
      await AsyncStorage.removeItem(pendingPickerKey);
    } catch {
      Alert.alert('Gallery', 'Could not open your photos. Try again.');
    } finally {
      setActivePickerKey(null);
    }
  };

  const requiredDocs = DOCUMENTS.filter((d) => d.required);
  const cleanNinNumber = ninNumber.replace(/\D/g, '');
  const ninSatisfied = cleanNinNumber.length === 11;
  const allRequiredUploaded = requiredDocs.every((d) => {
    if (d.key === 'nin') return ninSatisfied;
    return !!docs[d.key];
  });
  const requiredExpiryDocs = DOCUMENTS.filter((d) => d.required && d.hasExpiry);
  const missingRequiredExpiryDocs = requiredExpiryDocs.filter((d) => {
    if (!docs[d.key]) return false;
    return Boolean(getExpiryValidationMessage(expiry[d.key]));
  });
  const allRequiredExpiriesFilled = missingRequiredExpiryDocs.length === 0;
  const canSubmit = allRequiredUploaded && allRequiredExpiriesFilled;

  const handleSubmit = async () => {
    const missing = requiredDocs.filter((d) => {
      if (d.key === 'nin') return !ninSatisfied;
      return !docs[d.key];
    });
    const missingWithNinFallback = missing.filter((d) => d.key !== 'nin');
    if (!ninSatisfied) {
      missingWithNinFallback.unshift(DOCUMENTS.find((d) => d.key === 'nin') as DocItem);
    }
    if (missingWithNinFallback.length > 0) {
      Alert.alert('Almost there', `Still needed: ${missingWithNinFallback.map((d) => d.label).join(', ')}`);
      return;
    }

    const missingExpiry = missingRequiredExpiryDocs;
    if (missingExpiry.length > 0) {
      Alert.alert(
        'Expiry dates',
        `Enter a valid future expiry (MM/YYYY) for: ${missingExpiry.map((d) => d.label).join(', ')}`,
      );
      return;
    }
    if (!canCallAuthedApi) {
      Alert.alert('Session expired', 'Please sign in again to upload documents.', [
        { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }
    const { getValidToken } = await import('@/src/lib/tokenStore');
    const liveToken = await getValidToken();
    if (!liveToken) {
      Alert.alert('Session expired', 'Please sign in again to upload documents.', [
        { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }

    setVerifying(true);
    try {
      const formData = new FormData();
      formData.append('driver_id', (params.driver_id as string) || '');
      if (cleanNinNumber.length === 11) {
        formData.append('nin_number', cleanNinNumber);
      }
      for (const doc of DOCUMENTS) {
        if (doc.key === 'nin') continue;
        if (docs[doc.key]) {
          formData.append(doc.key, {
            uri: docs[doc.key],
            type: 'image/jpeg',
            name: `${doc.key}.jpg`,
          } as any);
        }
        if (expiry[doc.key]) {
          formData.append(`${doc.key}_expiry`, expiry[doc.key]);
        }
      }

      const authHeaders = { ...getAuthHeaders() };
      delete (authHeaders as Record<string, string>)['Content-Type'];

      const response = await fetch(`${BACKEND_URL}/api/drivers/verify-documents`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        data = {};
      }

      if (response.ok && data.verification_status === 'approved') {
        await AsyncStorage.removeItem(draftCacheKey);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Documents approved',
          'Your files passed automated checks and are stored securely. Next, complete your driver profile.',
          [
            {
              text: 'Continue to profile',
              onPress: () => {
                router.push({
                  pathname: '/(auth)/driver-profile',
                  params: {
                    driver_id: String(params.driver_id || data.driver_id || ''),
                    phone: params.phone as string,
                    name: params.name as string,
                    email: params.email as string,
                  },
                });
              },
            },
          ],
        );
      } else if (data.verification_status === 'pending' || data.verification_status === 'pending_review') {
        await AsyncStorage.removeItem(draftCacheKey);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Documents submitted',
          'Complete profile while we review your documents.',
          [
            {
              text: 'Continue to profile',
              onPress: () => {
                router.push({
                  pathname: '/(auth)/driver-profile',
                  params: {
                    driver_id: String(params.driver_id || data.driver_id || ''),
                    phone: params.phone as string,
                    name: params.name as string,
                    email: params.email as string,
                  },
                });
              },
            },
          ],
        );
      } else {
        const msg =
          formatApiDetail(data?.detail) ||
          (typeof data?.reason === 'string' ? data.reason : '') ||
          (typeof data?.message === 'string' ? data.message : '') ||
          apiErrorMessage({ response: { data } }, '') ||
          'Check photo clarity, expiry dates (MM/YYYY), and required fields, then try again.';
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not submit', msg.trim() || 'Something did not pass validation.');
      }
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Connection', apiErrorMessage(e, 'Could not submit documents. Check your connection and try again.'));
    } finally {
      setVerifying(false);
    }
  };

  const requiredCompleteCount = requiredDocs.filter((d) => {
    if (d.key === 'nin') return ninSatisfied;
    return !!docs[d.key];
  }).length;

  const ninDigits = cleanNinNumber.length;

  if (!storeReady) {
    return null;
  }

  return (
    <View style={[st.root, !isDark && { backgroundColor: colors.background }]}>
      {isDark ? (
        <LinearGradient colors={[BG_TOP, BG_MID, '#0c1222']} style={StyleSheet.absoluteFill} />
      ) : null}

      <SafeAreaView style={st.safe} edges={['top']}>
        <View style={[st.header, { borderBottomColor: palette.headerBorder }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[st.backBtn, { backgroundColor: palette.backBtnBg }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={26} color={palette.text} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: palette.text }]}>Driver verification</Text>
          <View style={st.progressPill}>
            <Text style={st.progressPillTxt}>
              {requiredCompleteCount}/{requiredDocs.length}
            </Text>
          </View>
        </View>

        <ScrollView
          style={st.scroll}
          contentContainerStyle={[st.scrollContent, { paddingBottom: 120 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <DriverOnboardingProgress
            current="documents"
            appearance={palette.progressAppearance}
            subtitle="Enter your 11-digit NIN (no photo, no expiry). Upload sharp photos for other documents; add MM/YYYY expiry only where shown."
          />

          <LinearGradient colors={palette.heroGrad} style={[st.heroCard, { borderColor: palette.border }]}>
            <View style={st.heroIconWrap}>
              <Ionicons name="shield-checkmark" size={26} color={MINT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.heroTitle, { color: palette.text }]}>Trust & compliance</Text>
              <Text style={[st.heroBody, { color: palette.muted }]}>
                Documents are encrypted in transit and at rest. Only authorised reviewers can access them.
              </Text>
            </View>
          </LinearGradient>

          {DOCUMENTS.map((doc, index) => {
            if (doc.key === 'nin') {
              const ninDoc = doc;
              return (
                <View
                  key="nin"
                  style={[
                    st.docCard,
                    { backgroundColor: palette.card, borderColor: palette.cardBorder },
                    index === 0 ? { marginTop: 4 } : null,
                  ]}
                >
                  <View style={st.docRow}>
                    <LinearGradient
                      colors={ninDoc.iconGrad}
                      style={st.iconRing}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={[st.iconInner, { backgroundColor: palette.iconInnerBg }]}>
                        <Ionicons name={ninDoc.icon} size={26} color={palette.text} />
                      </View>
                    </LinearGradient>
                    <View style={st.docTextCol}>
                      <View style={st.titleRow}>
                        <Text style={[st.docLabel, { color: palette.text }]} numberOfLines={2}>
                          {ninDoc.label}
                        </Text>
                        <View style={st.reqDot}>
                          <Text style={st.reqDotTxt}>Required</Text>
                        </View>
                      </View>
                      <Text style={[st.docStatus, { color: palette.muted }]} numberOfLines={3}>
                        NIN does not expire. Enter your 11-digit number only — no photo upload.
                      </Text>
                    </View>
                    <View style={st.trailing}>
                      {ninSatisfied ? (
                        <Ionicons name="checkmark-circle" size={28} color={MINT} />
                      ) : (
                        <Ionicons name="keypad-outline" size={24} color={palette.muted} />
                      )}
                    </View>
                  </View>
                  <View style={[st.insetBlock, st.ninInset, { backgroundColor: palette.inputBg }]}>
                    <Ionicons name="keypad-outline" size={18} color={MINT} />
                    <TextInput
                      style={[st.insetInput, { backgroundColor: palette.insetBg, color: palette.text }]}
                      placeholder="11-digit NIN"
                      placeholderTextColor={palette.placeholder}
                      value={ninNumber}
                      onChangeText={(text) => setNinNumber(text.replace(/\D/g, '').slice(0, 11))}
                      keyboardType="number-pad"
                      maxLength={11}
                      accessibilityLabel="National Identification Number, 11 digits"
                    />
                    {ninDigits === 11 ? <Ionicons name="checkmark-circle" size={20} color={MINT} /> : null}
                    <Text style={[st.ninMeta, { color: palette.muted }]}>{ninDigits}/11</Text>
                  </View>
                </View>
              );
            }

            const uploaded = !!docs[doc.key];
            const liveOnly = CAMERA_ONLY_KEYS.includes(doc.key);
            const expiryMsg = doc.hasExpiry && uploaded ? getExpiryValidationMessage(expiry[doc.key]) : null;
            const showExpiryRow = doc.hasExpiry && uploaded;

            return (
              <View
                key={doc.key}
                style={[
                  st.docCard,
                  { backgroundColor: palette.card, borderColor: palette.cardBorder },
                  index === 0 ? { marginTop: 4 } : null,
                ]}
              >
                <TouchableOpacity
                  style={st.docRow}
                  onPress={() => pickImage(doc.key)}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={`${doc.label}, ${uploaded ? 'uploaded' : 'tap to upload'}`}
                >
                  <LinearGradient colors={doc.iconGrad} style={st.iconRing} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={[st.iconInner, { backgroundColor: palette.iconInnerBg }]}>
                      {uploaded ? (
                        <Image source={{ uri: docs[doc.key]! }} style={st.docThumb} />
                      ) : (
                        <Ionicons name={doc.icon} size={26} color={palette.text} />
                      )}
                    </View>
                  </LinearGradient>

                  <View style={st.docTextCol}>
                    <View style={st.titleRow}>
                      <Text style={[st.docLabel, { color: palette.text }]} numberOfLines={2}>
                        {doc.label}
                      </Text>
                      {doc.required ? (
                        <View style={st.reqDot}>
                          <Text style={st.reqDotTxt}>Required</Text>
                        </View>
                      ) : (
                        <View style={st.optPill}>
                          <Text style={st.optPillTxt}>Optional</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[st.docStatus, { color: palette.muted }]} numberOfLines={2}>
                      {uploaded
                        ? 'Uploaded — tap to replace'
                        : liveOnly
                          ? 'Live camera only — tap to capture'
                          : 'Camera or gallery — tap to add'}
                    </Text>
                  </View>

                  <View style={st.trailing}>
                    {activePickerKey === doc.key ? (
                      <ActivityIndicator color={MINT} />
                    ) : uploaded ? (
                      <Ionicons name="checkmark-circle" size={28} color={MINT} />
                    ) : (
                      <View style={st.uploadCue}>
                        <Ionicons name="cloud-upload-outline" size={22} color={palette.muted} />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                {showExpiryRow ? (
                  <View style={[st.insetBlock, { backgroundColor: palette.inputBg }]}>
                    <Ionicons name="calendar-outline" size={18} color={MINT} />
                    <TextInput
                      style={[
                        st.insetInput,
                        { backgroundColor: palette.insetBg, color: palette.text },
                        expiryMsg && expiryMsg !== 'missing' ? st.insetInputErr : null,
                      ]}
                      placeholder="Expiry MM/YYYY"
                      placeholderTextColor={palette.placeholder}
                      value={expiry[doc.key] || ''}
                      onChangeText={(text) => setExpiry((prev) => ({ ...prev, [doc.key]: formatExpiryInput(text) }))}
                      keyboardType="number-pad"
                      maxLength={7}
                    />
                    {expiry[doc.key] && !expiryMsg ? (
                      <Ionicons name="checkmark-circle" size={20} color={MINT} />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          <View style={st.trustRow}>
            <Ionicons name="lock-closed-outline" size={16} color={MINT} />
            <Text style={[st.trustTxt, { color: palette.muted }]}>
              Your files are used only for verification and platform safety.
            </Text>
          </View>
        </ScrollView>

        <View
          style={[
            st.bottom,
            {
              paddingBottom: Math.max(SPACING.lg, 12 + insets.bottom),
              backgroundColor: palette.bottomBg,
              borderTopColor: palette.bottomBorder,
            },
          ]}
        >
          {!allRequiredExpiriesFilled && missingRequiredExpiryDocs.length > 0 ? (
            <View style={st.submitHint}>
              <Ionicons name="alert-circle-outline" size={18} color="#FBBF24" />
              <Text style={st.submitHintText}>
                Valid future expiry (MM/YYYY) still needed for:{' '}
                {missingRequiredExpiryDocs.map((d) => d.label).join(', ')}.
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[st.submitWrap, (!canSubmit || verifying) && st.submitWrapOff]}
            onPress={() => void handleSubmit()}
            disabled={verifying}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || verifying }}
          >
            {canSubmit && !verifying ? (
              <LinearGradient colors={[MINT, MINT_DARK]} style={st.submitGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={st.submitText}>Submit for verification</Text>
                <Ionicons name="arrow-forward" size={20} color="#022C22" style={{ marginLeft: 8 }} />
              </LinearGradient>
            ) : (
              <View style={[st.submitGrad, st.submitGradMuted]}>
                {verifying ? (
                  <ActivityIndicator color={MINT} />
                ) : (
                  <>
                    <Text style={st.submitTextMuted}>Submit for verification</Text>
                    <Ionicons name="lock-closed-outline" size={18} color="#64748B" style={{ marginLeft: 8 }} />
                  </>
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_TOP },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.3,
  },
  progressPill: {
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  progressPillTxt: { fontSize: 13, fontWeight: '900', color: MINT },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 18,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(52,211,153,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.25)',
  },
  heroTitle: { color: TEXT, fontSize: 16, fontWeight: '900' },
  heroBody: { color: MUTED, fontSize: 13, fontWeight: '600', marginTop: 6, lineHeight: 19 },
  docCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    marginBottom: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 14,
  },
  iconRing: {
    width: 58,
    height: 58,
    borderRadius: 18,
    padding: 2,
  },
  iconInner: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  docThumb: { width: '100%', height: '100%' },
  docTextCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  docLabel: { color: TEXT, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  reqDot: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  reqDotTxt: { fontSize: 10, fontWeight: '800', color: '#FCA5A5', textTransform: 'uppercase', letterSpacing: 0.5 },
  optPill: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  optPillTxt: { fontSize: 10, fontWeight: '800', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  docStatus: { color: MUTED, fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 17 },
  trailing: { width: 36, alignItems: 'center', justifyContent: 'center' },
  uploadCue: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: INPUT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  insetBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.08)',
  },
  insetInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(2,6,23,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  insetInputErr: { borderColor: 'rgba(248,113,113,0.5)' },
  ninInset: { paddingTop: 10 },
  ninMeta: { fontSize: 11, fontWeight: '800', color: MUTED, width: 36, textAlign: 'right' },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  trustTxt: { flex: 1, fontSize: 12, fontWeight: '600', color: '#64748B', lineHeight: 18 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: 'rgba(15,23,42,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(52,211,153,0.15)',
  },
  submitHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  submitHintText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FDE68A', lineHeight: 18 },
  submitWrap: { borderRadius: 16, overflow: 'hidden' },
  submitWrapOff: { opacity: 1 },
  submitGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  submitGradMuted: {
    backgroundColor: 'rgba(51,65,85,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  submitText: { fontSize: 16, fontWeight: '900', color: '#022C22' },
  submitTextMuted: { fontSize: 16, fontWeight: '800', color: '#94A3B8' },
});
