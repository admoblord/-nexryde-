import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
  Image, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { DriverOnboardingProgress } from '@/src/components/DriverOnboardingProgress';
import { BiometricScanner } from '@/src/components/tier1';
import { BACKEND_URL, getAuthHeaders, formatApiDetail } from '@/src/services/api';

type DocKey = 'nin' | 'drivers_license' | 'passport_photo' | 'vehicle_registration'
  | 'vehicle_license' | 'hacking_permit' | 'road_worthiness' | 'insurance'
  | 'vehicle_front' | 'vehicle_interior' | 'vehicle_ac';

interface DocItem {
  key: DocKey;
  label: string;
  icon: string;
  required: boolean;
  hasExpiry: boolean;
}

const DOCUMENTS: DocItem[] = [
  { key: 'nin', label: 'National ID (NIN)', icon: 'card', required: true, hasExpiry: false },
  { key: 'drivers_license', label: "Driver's License", icon: 'car', required: true, hasExpiry: true },
  { key: 'passport_photo', label: 'Passport Photo', icon: 'person', required: true, hasExpiry: false },
  { key: 'vehicle_registration', label: 'Plate Number Upload', icon: 'document-text', required: true, hasExpiry: false },
  { key: 'vehicle_license', label: 'Vehicle License Document', icon: 'receipt', required: true, hasExpiry: true },
  { key: 'hacking_permit', label: 'Hackney Permit / Carriage (Optional)', icon: 'shield-checkmark', required: false, hasExpiry: true },
  { key: 'road_worthiness', label: 'Road Worthiness Certificate', icon: 'construct', required: true, hasExpiry: true },
  { key: 'insurance', label: 'Vehicle Insurance', icon: 'umbrella', required: true, hasExpiry: true },
  { key: 'vehicle_front', label: 'Vehicle Photo (Front)', icon: 'camera', required: true, hasExpiry: false },
  { key: 'vehicle_interior', label: 'Vehicle Interior Photo (LIVE camera only)', icon: 'image', required: true, hasExpiry: false },
  { key: 'vehicle_ac', label: 'AC System Photo (LIVE camera only)', icon: 'snow', required: true, hasExpiry: false },
];

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [docs, setDocs] = useState<Record<string, string | null>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [ninNumber, setNinNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);

  const CAMERA_ONLY_KEYS: DocKey[] = ['vehicle_interior', 'vehicle_ac', 'vehicle_front'];

  const pickImage = (key: DocKey) => {
    if (CAMERA_ONLY_KEYS.includes(key)) {
      Alert.alert(
        'Live Photo Required',
        'Vehicle photos must be taken NOW with your camera to verify the current condition of your vehicle.',
        [
          { text: 'Open Camera', onPress: () => openCamera(key) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    Alert.alert('Upload Document', `Choose source for ${DOCUMENTS.find(d => d.key === key)?.label}`, [
      { text: 'Camera', onPress: () => openCamera(key) },
      { text: 'Gallery', onPress: () => openGallery(key) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = async (key: DocKey) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take document photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.85,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setDocs(prev => ({ ...prev, [key]: result.assets[0].uri }));
      }
    } catch {
      Alert.alert('Error', 'Could not open camera.');
    }
  };

  const openGallery = async (key: DocKey) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery access is required to select documents.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setDocs(prev => ({ ...prev, [key]: result.assets[0].uri }));
      }
    } catch {
      Alert.alert('Error', 'Could not open gallery.');
    }
  };

  const requiredDocs = DOCUMENTS.filter(d => d.required);
  const cleanNinNumber = ninNumber.replace(/\D/g, '');
  const ninSatisfied = Boolean(docs.nin) || cleanNinNumber.length === 11;
  const allRequiredUploaded = requiredDocs.every((d) => {
    if (d.key === 'nin') return ninSatisfied;
    return !!docs[d.key];
  });
  // Only required docs should block submission.
  const requiredExpiryDocs = DOCUMENTS.filter((d) => d.required && d.hasExpiry);
  const missingRequiredExpiryDocs = requiredExpiryDocs.filter(
    (d) => docs[d.key] && (!expiry[d.key] || expiry[d.key].length < 7)
  );
  const allRequiredExpiriesFilled = missingRequiredExpiryDocs.length === 0;
  const canSubmit = allRequiredUploaded && biometricVerified;

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
      Alert.alert('Missing Documents', `Please upload: ${missingWithNinFallback.map(d => d.label).join(', ')}`);
      return;
    }

    const missingExpiry = missingRequiredExpiryDocs;
    if (missingExpiry.length > 0) {
      Alert.alert('Expiry Dates Required', `Please enter expiry date for: ${missingExpiry.map(d => d.label).join(', ')}`);
      return;
    }
    if (!biometricVerified) {
      Alert.alert('Biometric confirmation required', 'Confirm your device biometrics before submitting driver verification.');
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
      let data: any = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (response.ok && data.verification_status === 'approved') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Documents approved',
          'Your files passed automated checks and are stored securely. Next, complete your driver profile (vehicle, guarantor, payout details).',
          [
            {
              text: 'Continue to profile',
              onPress: () => {
                router.push({
                  pathname: '/(auth)/driver-profile',
                  params: {
                    driver_id: params.driver_id || data.driver_id,
                    phone: params.phone as string,
                    name: params.name as string,
                    email: params.email as string,
                  },
                });
              },
            },
          ],
        );
      } else if (data.verification_status === 'pending') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Submitted for review',
          'Your package is with the NEXRYDE team. You will get an in-app update when review finishes. You can sign in later to check status.',
          [{ text: 'Back to sign in', onPress: () => router.replace('/(auth)/login') }],
        );
      } else {
        const msg =
          formatApiDetail(data?.detail) ||
          (typeof data?.reason === 'string' ? data.reason : '') ||
          (typeof data?.message === 'string' ? data.message : '') ||
          'Something did not pass validation. Check photo clarity, expiry dates (MM/YYYY), and required fields, then try again.';
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not submit documents', msg);
      }
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Connection error', 'Could not submit documents. Check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  const requiredCompleteCount = requiredDocs.filter((d) => {
    if (d.key === 'nin') return ninSatisfied;
    return !!docs[d.key];
  }).length;

  return (
    <View style={st.container}>
      <SafeAreaView style={st.safe}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Driver verification</Text>
          <Text style={st.progress}>
            {requiredCompleteCount}/{requiredDocs.length}
          </Text>
        </View>

        <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
          <DriverOnboardingProgress
            current="documents"
            subtitle="Upload clear photos. You can enter NIN where shown. Vehicle interior and AC must be live camera shots."
          />
          <View style={st.infoCard}>
            <Ionicons name="shield-checkmark" size={40} color={COLORS.accentGreen} />
            <Text style={st.infoTitle}>Documents and checks</Text>
            <Text style={st.infoText}>
              Use bright, glare-free light. Expiry fields use MM/YYYY for required documents that have expiry.
              Once required rows are complete and biometrics are confirmed, submit.
            </Text>
          </View>

          {DOCUMENTS.map((doc) => (
            <View key={doc.key} style={st.docCard}>
              <TouchableOpacity style={st.docRow} onPress={() => pickImage(doc.key)}>
                <View style={[st.docIcon, docs[doc.key] ? st.docIconDone : null]}>
                  {docs[doc.key] ? (
                    <Image source={{ uri: docs[doc.key]! }} style={st.docThumb} />
                  ) : (
                    <Ionicons name={doc.icon as any} size={28} color={COLORS.lightTextSecondary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.docLabel}>
                    {doc.label} {doc.required && <Text style={{ color: '#EF4444' }}>*</Text>}
                  </Text>
                  <Text style={st.docStatus}>
                    {docs[doc.key]
                      ? 'Uploaded — tap to retake'
                      : CAMERA_ONLY_KEYS.includes(doc.key)
                        ? 'Tap to take a LIVE photo (camera only)'
                        : 'Tap to upload (camera or gallery)'}
                  </Text>
                </View>
                {docs[doc.key] ? (
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.accentGreen} />
                ) : (
                  <Ionicons name="cloud-upload" size={22} color={COLORS.lightTextSecondary} />
                )}
              </TouchableOpacity>

              {doc.hasExpiry && docs[doc.key] && (
                <View style={st.expiryRow}>
                  <Ionicons name="calendar" size={16} color={COLORS.lightTextSecondary} />
                  <TextInput
                    style={st.expiryInput}
                    placeholder="Expiry date (MM/YYYY)"
                    placeholderTextColor={COLORS.lightTextMuted || '#94A3B8'}
                    value={expiry[doc.key] || ''}
                    onChangeText={(text) => setExpiry(prev => ({ ...prev, [doc.key]: text }))}
                    keyboardType="numeric"
                    maxLength={7}
                  />
                  {expiry[doc.key] && expiry[doc.key].length >= 7 && (
                    <Ionicons name="checkmark" size={16} color={COLORS.accentGreen} />
                  )}
                </View>
              )}
              {doc.key === 'nin' && !docs.nin && (
                <View style={st.expiryRow}>
                  <Ionicons name="keypad" size={16} color={COLORS.lightTextSecondary} />
                  <TextInput
                    style={st.expiryInput}
                    placeholder="Or enter 11-digit NIN number"
                    placeholderTextColor={COLORS.lightTextMuted || '#94A3B8'}
                    value={ninNumber}
                    onChangeText={(text) => setNinNumber(text.replace(/\D/g, '').slice(0, 11))}
                    keyboardType="number-pad"
                    maxLength={11}
                  />
                  {cleanNinNumber.length === 11 && (
                    <Ionicons name="checkmark" size={16} color={COLORS.accentGreen} />
                  )}
                </View>
              )}
            </View>
          ))}

          <View style={st.note}>
            <Ionicons name="lock-closed" size={14} color={COLORS.accentGreen} />
            <Text style={st.noteText}>Your documents are encrypted and only used for verification</Text>
          </View>

          <View style={st.biometricCard}>
            <BiometricScanner
              title="Confirm biometrics before submission"
              subtitle="This reduces fraudulent onboarding and protects your driver account setup."
              confirmLabel={biometricVerified ? 'Biometric confirmed' : 'Verify biometric'}
              onSuccess={() => {
                setBiometricVerified(true);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              onFailure={(msg) => Alert.alert('Biometric check', msg)}
            />
          </View>
        </ScrollView>

        <View style={st.bottom}>
          {!allRequiredExpiriesFilled && (
            <View style={st.submitHint}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.warning} />
              <Text style={st.submitHintText}>
                Add expiry date (MM/YYYY) for: {missingRequiredExpiryDocs.map((d) => d.label).join(', ')}.
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[st.submitBtn, (!canSubmit || !allRequiredExpiriesFilled) && st.submitDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || verifying}
          >
            <LinearGradient
              colors={canSubmit
                ? [COLORS.accentGreen, COLORS.accentBlue]
                : [COLORS.lightBorder, COLORS.lightBorder]}
              style={st.submitGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {verifying
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={[st.submitText, !canSubmit && st.submitTextOff]}>
                    Submit for Verification
                  </Text>
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightBorder,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.lightTextPrimary },
  progress: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.accentGreen },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 40 },
  infoCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, alignItems: 'center', marginBottom: SPACING.lg,
  },
  infoTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.lightTextPrimary, marginTop: SPACING.sm },
  infoText: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary, textAlign: 'center', lineHeight: 20, marginTop: SPACING.xs },
  docCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.sm, overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md,
  },
  docIcon: {
    width: 52, height: 52, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.lightBorder, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  docIconDone: { borderWidth: 2, borderColor: COLORS.accentGreen },
  docThumb: { width: '100%', height: '100%', borderRadius: BORDER_RADIUS.lg },
  docLabel: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.lightTextPrimary },
  docStatus: { fontSize: FONT_SIZE.xs, color: COLORS.lightTextSecondary, marginTop: 2 },
  expiryRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.lightBorder,
    marginHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  expiryInput: {
    flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.lightTextPrimary,
    borderWidth: 1, borderColor: COLORS.lightBorder, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
  },
  note: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.lg, gap: SPACING.xs,
  },
  noteText: { fontSize: FONT_SIZE.xs, color: COLORS.lightTextSecondary },
  biometricCard: {
    marginTop: SPACING.lg,
  },
  bottom: {
    backgroundColor: COLORS.white, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
    borderTopWidth: 1, borderTopColor: COLORS.lightBorder,
  },
  submitHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  submitHintText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: '#92400E',
    lineHeight: 18,
    fontWeight: '600',
  },
  submitBtn: {
    borderRadius: BORDER_RADIUS.xl, overflow: 'hidden',
    shadowColor: COLORS.accentGreen, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  submitDisabled: { shadowOpacity: 0, elevation: 0 },
  submitGrad: { paddingVertical: SPACING.lg, alignItems: 'center' },
  submitText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
  submitTextOff: { color: COLORS.lightTextMuted },
});
