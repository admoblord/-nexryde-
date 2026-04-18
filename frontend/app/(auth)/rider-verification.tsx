import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '@/src/store/appStore';
import { completeRiderVerification, verifyFace } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { BiometricScanner } from '@/src/components/tier1';

const COLORS = {
  bg: '#0F172A',
  card: '#1E293B',
  text: '#F8FAFC',
  muted: '#94A3B8',
  accent: '#8B5CF6',
  accent2: '#6D28D9',
  input: '#111827',
  border: '#334155',
};

export default function RiderVerificationScreen() {
  const router = useRouter();
  const { user, token, setUser } = useAppStore();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState((user as any)?.address || '');
  const [nin, setNin] = useState((user as any)?.nin || '');
  const [faceVerified, setFaceVerified] = useState(Boolean((user as any)?.face_verified));
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      name.trim().length > 1 &&
      phone.trim().length >= 10 &&
      address.trim().length > 5 &&
      /^\d{11}$/.test(nin.trim()) &&
      faceVerified &&
      biometricVerified
    );
  }, [name, phone, address, nin, faceVerified, biometricVerified]);

  const handleFaceCapture = async () => {
    if (!user?.id) {
      Alert.alert('Session error', 'Please login again.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required for face verification.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      await verifyFace(user.id, base64);
      setFacePreview(result.assets[0].uri);
      setFaceVerified(true);
      Alert.alert('Face verified', 'Your face scan has been saved for rider verification.');
    } catch (e: any) {
      Alert.alert('Face verification failed', e?.response?.data?.detail || 'Could not verify your face now.');
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      Alert.alert('Session error', 'Please login again.');
      return;
    }
    if (!canSubmit) {
      Alert.alert('Incomplete details', 'Enter your details, complete face verification, and confirm device biometrics.');
      return;
    }
    setLoading(true);
    try {
      const res = await completeRiderVerification(user.id, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        nin: nin.trim(),
      });
      const updatedUser = res.data?.user || { ...user, name, phone, address, nin };
      setUser(updatedUser);
      await saveUserSession({ ...updatedUser, token: token || null });
      Alert.alert('Verification completed', 'Your rider profile is verified.', [
        { text: 'Continue', onPress: () => router.replace('/(rider-tabs)/rider-home') },
      ]);
    } catch (e: any) {
      Alert.alert('Verification failed', e?.response?.data?.detail || 'Could not complete verification now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.bg, '#1E1B4B']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Ionicons name="shield-checkmark" size={34} color={COLORS.accent} />
              <Text style={styles.title}>Complete Rider Verification</Text>
              <Text style={styles.subtitle}>All riders must be fully verified before entering the app.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={COLORS.muted} />

              <Text style={styles.label}>Phone Number</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+234..." placeholderTextColor={COLORS.muted} />

              <Text style={styles.label}>Home Address</Text>
              <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street, city, state" placeholderTextColor={COLORS.muted} />

              <Text style={styles.label}>NIN (11 digits)</Text>
              <TextInput
                style={styles.input}
                value={nin}
                onChangeText={(v) => setNin(v.replace(/\D/g, '').slice(0, 11))}
                keyboardType="number-pad"
                placeholder="12345678901"
                placeholderTextColor={COLORS.muted}
              />

              <Text style={styles.label}>Face Verification</Text>
              <TouchableOpacity style={styles.faceCard} onPress={() => void handleFaceCapture()}>
                <View style={styles.faceIconWrap}>
                  <Ionicons
                    name={faceVerified ? 'checkmark-circle' : 'camera'}
                    size={28}
                    color={faceVerified ? '#22C55E' : COLORS.text}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.faceTitle}>{faceVerified ? 'Face verified' : 'Capture live face photo'}</Text>
                  <Text style={styles.faceText}>
                    {faceVerified
                      ? 'Your rider selfie is linked to this account.'
                      : 'Take a clear live selfie to finish account verification.'}
                  </Text>
                  {facePreview ? <Text style={styles.faceHint}>Latest capture saved</Text> : null}
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <BiometricScanner
                title="Confirm device biometric"
                subtitle="Use fingerprint or face unlock on this device to harden your account."
                confirmLabel={biometricVerified ? 'Biometric confirmed' : 'Verify biometric'}
                onSuccess={() => {
                  setBiometricVerified(true);
                  Alert.alert('Biometric confirmed', 'Device biometric check complete.');
                }}
                onFailure={(msg) => Alert.alert('Biometric check', msg)}
              />
            </View>

            <TouchableOpacity disabled={!canSubmit || loading} onPress={handleSubmit} style={styles.buttonWrap}>
              <LinearGradient
                colors={canSubmit && !loading ? [COLORS.accent, COLORS.accent2] : ['#475569', '#475569']}
                style={styles.button}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify and Continue</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  safeArea: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 18, gap: 8 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  label: { color: COLORS.text, marginTop: 10, marginBottom: 6, fontWeight: '700', fontSize: 13 },
  input: { backgroundColor: COLORS.input, borderColor: COLORS.border, borderWidth: 1, borderRadius: 10, color: COLORS.text, paddingHorizontal: 12, paddingVertical: 12 },
  faceCard: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.input,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  faceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  faceTitle: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
  faceText: { color: COLORS.muted, fontWeight: '600', fontSize: 12, marginTop: 3, lineHeight: 18 },
  faceHint: { color: '#22C55E', fontWeight: '700', fontSize: 11, marginTop: 4 },
  buttonWrap: { marginTop: 18, borderRadius: 12, overflow: 'hidden' },
  button: { paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
