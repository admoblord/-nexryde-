import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { completeRiderVerification } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';

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
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return name.trim().length > 1 && phone.trim().length >= 10 && address.trim().length > 5 && /^\d{11}$/.test(nin.trim());
  }, [name, phone, address, nin]);

  const handleSubmit = async () => {
    if (!user?.id) {
      Alert.alert('Session error', 'Please login again.');
      return;
    }
    if (!canSubmit) {
      Alert.alert('Incomplete details', 'Enter full name, phone, address and a valid 11-digit NIN.');
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
  buttonWrap: { marginTop: 18, borderRadius: 12, overflow: 'hidden' },
  button: { paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
