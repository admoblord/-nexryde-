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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { register } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function RegisterScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { setUser, setIsAuthenticated } = useAppStore();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'rider' | 'driver' | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!role) {
      Alert.alert('Error', 'Please select how you want to use KODA');
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
      
      // Navigate to the appropriate app based on role
      if (role === 'driver') {
        router.replace('/(driver-tabs)/driver-home');
      } else {
        router.replace('/(rider-tabs)/rider-home');
      }
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
        <ScrollView 
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Join KODA</Text>
            <Text style={styles.subtitle}>Create your account to get started</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={COLORS.gray400} />
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor={COLORS.gray400}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.label}>Email (Optional)</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={COLORS.gray400} />
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor={COLORS.gray400}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Role Selection */}
            <Text style={styles.label}>How will you use KODA?</Text>
            <Text style={styles.roleHint}>Choose one - this determines your app experience</Text>
            
            <View style={styles.roleContainer}>
              {/* Rider Option */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'rider' && styles.roleCardActive
                ]}
                onPress={() => setRole('rider')}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.roleIconWrap,
                  role === 'rider' && styles.roleIconWrapActive
                ]}>
                  <Ionicons 
                    name="person" 
                    size={32} 
                    color={role === 'rider' ? COLORS.primary : COLORS.gray400} 
                  />
                </View>
                <Text style={[
                  styles.roleTitle,
                  role === 'rider' && styles.roleTitleActive
                ]}>I'm a Rider</Text>
                <Text style={styles.roleDesc}>Book rides & travel safely</Text>
                
                <View style={styles.roleFeatures}>
                  <View style={styles.roleFeature}>
                    <Ionicons name="checkmark" size={14} color={COLORS.success} />
                    <Text style={styles.roleFeatureText}>Book rides instantly</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <Ionicons name="checkmark" size={14} color={COLORS.success} />
                    <Text style={styles.roleFeatureText}>Track your trip live</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <Ionicons name="checkmark" size={14} color={COLORS.success} />
                    <Text style={styles.roleFeatureText}>Pay with cash or transfer</Text>
                  </View>
                </View>
                
                {role === 'rider' && (
                  <View style={styles.selectedBadge}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Driver Option */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'driver' && styles.roleCardActiveDriver
                ]}
                onPress={() => setRole('driver')}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.roleIconWrap,
                  role === 'driver' && styles.roleIconWrapActiveDriver
                ]}>
                  <Ionicons 
                    name="car-sport" 
                    size={32} 
                    color={role === 'driver' ? COLORS.white : COLORS.gray400} 
                  />
                </View>
                <Text style={[
                  styles.roleTitle,
                  role === 'driver' && styles.roleTitleActiveDriver
                ]}>I'm a Driver</Text>
                <Text style={styles.roleDesc}>Earn money on your terms</Text>
                
                <View style={styles.roleFeatures}>
                  <View style={styles.roleFeature}>
                    <Ionicons name="checkmark" size={14} color={COLORS.success} />
                    <Text style={styles.roleFeatureText}>Keep 100% of earnings</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <Ionicons name="checkmark" size={14} color={COLORS.success} />
                    <Text style={styles.roleFeatureText}>₦25,000/month flat fee</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <Ionicons name="checkmark" size={14} color={COLORS.success} />
                    <Text style={styles.roleFeatureText}>Zero commission forever</Text>
                  </View>
                </View>
                
                {role === 'driver' && (
                  <View style={styles.selectedBadge}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!name.trim() || !role) && styles.submitButtonDisabled
            ]}
            onPress={handleRegister}
            disabled={loading || !name.trim() || !role}
            activeOpacity={0.8}
          >
            {loading ? (
              <Text style={styles.submitButtonText}>Creating Account...</Text>
            ) : (
              <>
                <Text style={styles.submitButtonText}>Create Account</Text>
                <View style={styles.submitArrow}>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
                </View>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray400,
  },
  form: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.white,
  },
  roleHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    marginBottom: SPACING.md,
  },
  roleContainer: {
    gap: SPACING.md,
  },
  roleCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  roleCardActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.accent,
  },
  roleCardActiveDriver: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  roleIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  roleIconWrapActive: {
    backgroundColor: COLORS.accentSoft,
  },
  roleIconWrapActiveDriver: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  roleTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  roleTitleActive: {
    color: COLORS.primary,
  },
  roleTitleActiveDriver: {
    color: COLORS.primary,
  },
  roleDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginBottom: SPACING.md,
  },
  roleFeatures: {
    gap: SPACING.sm,
  },
  roleFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  roleFeatureText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  selectedBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    ...SHADOWS.gold,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.gray600,
    shadowOpacity: 0,
  },
  submitButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  submitArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
