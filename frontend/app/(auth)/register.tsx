import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Button } from '@/src/components/UI';
import { register } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

export default function RegisterScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { setUser, setIsAuthenticated } = useAppStore();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      const response = await register({
        phone: phone!,
        name: name.trim(),
        email: email.trim() || undefined,
        role,
      });
      
      setUser(response.data.user);
      setIsAuthenticated(true);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join KODA and start your journey</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor={COLORS.gray400}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Email (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={COLORS.gray400}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>I want to join as</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === 'rider' && styles.roleOptionActive
                ]}
                onPress={() => setRole('rider')}
              >
                <View style={[
                  styles.roleIconContainer,
                  role === 'rider' && styles.roleIconContainerActive
                ]}>
                  <Ionicons 
                    name="person" 
                    size={28} 
                    color={role === 'rider' ? COLORS.white : COLORS.gray500} 
                  />
                </View>
                <Text style={[
                  styles.roleTitle,
                  role === 'rider' && styles.roleTitleActive
                ]}>Rider</Text>
                <Text style={styles.roleDescription}>Book rides easily</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === 'driver' && styles.roleOptionActive
                ]}
                onPress={() => setRole('driver')}
              >
                <View style={[
                  styles.roleIconContainer,
                  role === 'driver' && styles.roleIconContainerActive
                ]}>
                  <Ionicons 
                    name="car" 
                    size={28} 
                    color={role === 'driver' ? COLORS.white : COLORS.gray500} 
                  />
                </View>
                <Text style={[
                  styles.roleTitle,
                  role === 'driver' && styles.roleTitleActive
                ]}>Driver</Text>
                <Text style={styles.roleDescription}>Earn with KODA</Text>
              </TouchableOpacity>
            </View>

            {role === 'driver' && (
              <View style={styles.driverInfo}>
                <Ionicons name="information-circle" size={20} color={COLORS.info} />
                <Text style={styles.driverInfoText}>
                  As a driver, you'll pay a flat ₦25,000/month subscription. No commissions on rides!
                </Text>
              </View>
            )}
          </View>

          <Button
            title={loading ? 'Creating Account...' : 'Create Account'}
            onPress={handleRegister}
            loading={loading}
            disabled={!name.trim()}
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  form: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  roleOption: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    padding: SPACING.md,
    alignItems: 'center',
  },
  roleOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  roleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  roleIconContainerActive: {
    backgroundColor: COLORS.primary,
  },
  roleTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  roleTitleActive: {
    color: COLORS.primary,
  },
  roleDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.info + '20',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  driverInfoText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.info,
    lineHeight: 20,
  },
  button: {
    marginTop: 'auto',
  },
});
