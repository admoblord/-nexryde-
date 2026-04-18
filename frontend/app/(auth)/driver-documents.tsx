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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { BiometricScanner } from '@/src/components/tier1';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

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
  { key: 'vehicle_registration', label: 'Vehicle Registration', icon: 'document-text', required: true, hasExpiry: true },
  { key: 'vehicle_license', label: 'Vehicle License', icon: 'receipt', required: true, hasExpiry: true },
  { key: 'hacking_permit', label: 'Hackney Permit / Carriage', icon: 'shield-checkmark', required: true, hasExpiry: true },
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
        quality: 0.8,
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
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]) {
        setDocs(prev => ({ ...prev, [key]: result.assets[0].uri }));
      }
    } catch {
      Alert.alert('Error', 'Could not open gallery.');
    }
  };

  const requiredDocs = DOCUMENTS.filter(d => d.required);
  const allRequiredUploaded = requiredDocs.every(d => !!docs[d.key]);
  const expiryDocsWithDate = DOCUMENTS.filter(d => d.hasExpiry);
  const allExpiriesFilled = expiryDocsWithDate.every(d => !docs[d.key] || (expiry[d.key] && expiry[d.key].length >= 7));

  const handleSubmit = async () => {
    const missing = requiredDocs.filter(d => !docs[d.key]);
    if (missing.length > 0) {
      Alert.alert('Missing Documents', `Please upload: ${missing.map(d => d.label).join(', ')}`);
      return;
    }

    const missingExpiry = expiryDocsWithDate.filter(d => docs[d.key] && (!expiry[d.key] || expiry[d.key].length < 7));
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
        Alert.alert('Documents Approved', 'Your full document set passed validation and has been archived securely. Please complete your driver profile to continue onboarding.', [
          {
            text: 'Continue',
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
        ]);
      } else if (data.verification_status === 'pending') {
        Alert.alert('Submission Received', "Your documents were submitted successfully. We'll notify you when review is complete.", [
          { text: 'OK', onPress: () => router.replace('/(auth)/login') },
        ]);
      } else {
        const msg =
          data?.detail ||
          data?.reason ||
          (typeof data?.message === 'string' ? data.message : null) ||
          'Documents could not be verified. Please check photos and expiry dates, then try again.';
        Alert.alert('Verification Issue', String(msg));
      }
    } catch {
      Alert.alert('Connection Error', 'Could not submit documents. Check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  const uploadedCount = requiredDocs.filter(d => !!docs[d.key]).length;

  return (
    <View style={st.container}>
      <SafeAreaView style={st.safe}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Upload Documents</Text>
          <Text style={st.progress}>{uploadedCount}/{requiredDocs.length}</Text>
        </View>

        <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={st.infoCard}>
            <Ionicons name="shield-checkmark" size={40} color={COLORS.accentGreen} />
            <Text style={st.infoTitle}>Driver Verification Documents</Text>
            <Text style={st.infoText}>
              Upload clear, readable photos in good light. Fill every expiry as MM/YYYY. Submit once when all items show a check — this is usually faster than fixing rejections one by one.
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
                Alert.alert('Biometric confirmed', 'You can now submit your driver verification package.');
              }}
              onFailure={(msg) => Alert.alert('Biometric check', msg)}
            />
          </View>
        </ScrollView>

        <View style={st.bottom}>
          <TouchableOpacity
            style={[st.submitBtn, (!allRequiredUploaded || !allExpiriesFilled || !biometricVerified) && st.submitDisabled]}
            onPress={handleSubmit}
            disabled={!allRequiredUploaded || !allExpiriesFilled || !biometricVerified || verifying}
          >
            <LinearGradient
              colors={allRequiredUploaded && allExpiriesFilled && biometricVerified
                ? [COLORS.accentGreen, COLORS.accentBlue]
                : [COLORS.lightBorder, COLORS.lightBorder]}
              style={st.submitGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {verifying
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={[st.submitText, (!allRequiredUploaded || !allExpiriesFilled || !biometricVerified) && st.submitTextOff]}>
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
