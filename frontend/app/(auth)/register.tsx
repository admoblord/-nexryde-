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
            <Text style={styles.subtitle}>Nigeria's Premium Ride Platform</Text>
          </View>

          {/* Trust Badges */}
          <View style={styles.trustBadges}>
            <View style={styles.trustBadge}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.success} />
              <Text style={styles.trustBadgeText}>Verified</Text>
            </View>
            <View style={styles.trustBadge}>
              <Ionicons name="lock-closed" size={14} color={COLORS.info} />
              <Text style={styles.trustBadgeText}>Secure</Text>
            </View>
            <View style={styles.trustBadge}>
              <Ionicons name="star" size={14} color={COLORS.accent} />
              <Text style={styles.trustBadgeText}>Trusted</Text>
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={COLORS.gray400} />
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor={COLORS.gray500}
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
                placeholderTextColor={COLORS.gray500}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Role Selection */}
            <Text style={styles.roleLabel}>Choose Your Experience</Text>
            
            <View style={styles.roleContainer}>
              {/* Rider Option */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'rider' && styles.roleCardActiveRider
                ]}
                onPress={() => setRole('rider')}
                activeOpacity={0.8}
              >
                {role === 'rider' && (
                  <View style={styles.selectedIndicator}>
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.info} />
                  </View>
                )}
                
                <View style={[
                  styles.roleIconWrap,
                  role === 'rider' ? styles.roleIconWrapActiveRider : null
                ]}>
                  <Ionicons 
                    name="person" 
                    size={36} 
                    color={role === 'rider' ? COLORS.info : COLORS.gray400} 
                  />
                </View>
                
                <Text style={[
                  styles.roleTitle,
                  role === 'rider' && styles.roleTitleActiveRider
                ]}>Rider</Text>
                <Text style={styles.roleTagline}>Book rides & travel safely</Text>
                
                <View style={styles.roleDivider} />
                
                <View style={styles.roleFeatures}>
                  <View style={styles.roleFeature}>
                    <View style={styles.featureCheck}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Book rides in seconds</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <View style={styles.featureCheck}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Live trip tracking</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <View style={styles.featureCheck}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Share rides with family</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <View style={styles.featureCheck}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Pay cash or transfer</Text>
                  </View>
                </View>
                
                <View style={[styles.rolePriceTag, { backgroundColor: COLORS.infoSoft }]}>
                  <Text style={[styles.rolePriceText, { color: COLORS.info }]}>FREE</Text>
                </View>
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
                {role === 'driver' && (
                  <View style={styles.selectedIndicator}>
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.accent} />
                  </View>
                )}
                
                <View style={styles.popularBadge}>
                  <Ionicons name="trending-up" size={12} color={COLORS.primary} />
                  <Text style={styles.popularBadgeText}>Popular</Text>
                </View>
                
                <View style={[
                  styles.roleIconWrap,
                  role === 'driver' ? styles.roleIconWrapActiveDriver : null
                ]}>
                  <Ionicons 
                    name="car-sport" 
                    size={36} 
                    color={role === 'driver' ? COLORS.primary : COLORS.gray400} 
                  />
                </View>
                
                <Text style={[
                  styles.roleTitle,
                  role === 'driver' && styles.roleTitleActiveDriver
                ]}>Driver</Text>
                <Text style={styles.roleTagline}>Earn money, be your own boss</Text>
                
                <View style={styles.roleDivider} />
                
                <View style={styles.roleFeatures}>
                  <View style={styles.roleFeature}>
                    <View style={[styles.featureCheck, { backgroundColor: COLORS.success }]}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Keep 100% of fares</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <View style={[styles.featureCheck, { backgroundColor: COLORS.success }]}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Zero commission forever</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <View style={[styles.featureCheck, { backgroundColor: COLORS.success }]}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Flexible working hours</Text>
                  </View>
                  <View style={styles.roleFeature}>
                    <View style={[styles.featureCheck, { backgroundColor: COLORS.success }]}>
                      <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </View>
                    <Text style={styles.roleFeatureText}>Weekly challenges & rewards</Text>
                  </View>
                </View>
                
                <View style={[styles.rolePriceTag, { backgroundColor: COLORS.accentSoft }]}>
                  <Text style={[styles.rolePriceText, { color: COLORS.accent }]}>₦25K/month</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Driver Note */}
            {role === 'driver' && (
              <View style={styles.driverNote}>
                <Ionicons name="information-circle" size={20} color={COLORS.accent} />
                <Text style={styles.driverNoteText}>
                  Flat ₦25,000/month subscription. No percentage cuts. You keep every naira you earn!
                </Text>
              </View>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!name.trim() || !role) && styles.submitButtonDisabled,
              role === 'driver' && name.trim() && styles.submitButtonDriver
            ]}
            onPress={handleRegister}
            disabled={loading || !name.trim() || !role}
            activeOpacity={0.8}
          >
            {loading ? (
              <Text style={styles.submitButtonText}>Creating Account...</Text>
            ) : (
              <>
                <Text style={styles.submitButtonText}>
                  {role === 'driver' ? 'Become a Driver' : role === 'rider' ? 'Start Riding' : 'Create Account'}
                </Text>
                <View style={styles.submitArrow}>
                  <Ionicons name="arrow-forward" size={20} color={role === 'driver' ? COLORS.accent : COLORS.primary} />
                </View>
              </>
            )}
          </TouchableOpacity>

          {/* Terms */}
          <Text style={styles.termsText}>
            By creating an account, you agree to our{' '}
            <Text style={styles.termsLink}>Terms</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
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
    marginBottom: SPACING.md,
  },
  header: {
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '900',
    color: COLORS.white,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
  trustBadges: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  trustBadgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray300,
    fontWeight: '600',
  },
  form: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray300,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
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
  roleLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  roleContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  roleCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    alignItems: 'center',
  },
  roleCardActiveRider: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.info,
  },
  roleCardActiveDriver: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  selectedIndicator: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: 4,
  },
  popularBadgeText: {
    fontSize: FONT_SIZE.xxs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  roleIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  roleIconWrapActiveRider: {
    backgroundColor: COLORS.infoSoft,
  },
  roleIconWrapActiveDriver: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  roleTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  roleTitleActiveRider: {
    color: COLORS.primary,
  },
  roleTitleActiveDriver: {
    color: COLORS.primary,
  },
  roleTagline: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
    marginTop: 2,
    textAlign: 'center',
  },
  roleDivider: {
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: SPACING.sm,
  },
  roleFeatures: {
    width: '100%',
    gap: SPACING.xs,
  },
  roleFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleFeatureText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
    flex: 1,
  },
  rolePriceTag: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  rolePriceText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  driverNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  driverNoteText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    lineHeight: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray600,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonDriver: {
    backgroundColor: COLORS.accent,
    ...SHADOWS.gold,
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
  termsText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.accent,
    fontWeight: '600',
  },
});
