import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function RegisterScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { setUser, setUserType, setIsAuthenticated } = useAppStore();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<'rider' | 'driver'>('rider');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: `+234${phone}`,
          name: name.trim(),
          email: email.trim() || undefined,
          role: selectedRole,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setUser({ ...data.user, role: selectedRole });
        setUserType(selectedRole);
        setIsAuthenticated(true);
        
        if (selectedRole === 'driver') {
          router.replace('/(driver-tabs)/driver-home');
        } else {
          router.replace('/(rider-tabs)/rider-home');
        }
      } else {
        Alert.alert('Error', data.message || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      // Demo mode - proceed anyway
      setUser({ name: name.trim(), phone: `+234${phone}`, role: selectedRole });
      setUserType(selectedRole);
      setIsAuthenticated(true);
      
      if (selectedRole === 'driver') {
        router.replace('/(driver-tabs)/driver-home');
      } else {
        router.replace('/(rider-tabs)/rider-home');
      }
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 60, right: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, left: 20, backgroundColor: COLORS.accentBlue, width: 60, height: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            {/* Title Section */}
            <View style={styles.titleSection}>
              <View style={styles.titleIcon}>
                <LinearGradient
                  colors={[COLORS.accentGreenLight, COLORS.accentGreen]}
                  style={styles.titleIconLeft}
                />
                <LinearGradient
                  colors={[COLORS.accentBlue, COLORS.accentBlueDark]}
                  style={styles.titleIconRight}
                />
              </View>
              <Text style={styles.title}>Join NEXRYDE</Text>
              <Text style={styles.subtitle}>Choose how you want to use NEXRYDE</Text>
            </View>

            {/* Role Selection */}
            <View style={styles.roleSection}>
              {/* Rider Option */}
              <TouchableOpacity
                style={[styles.roleCard, selectedRole === 'rider' && styles.roleCardActive]}
                onPress={() => setSelectedRole('rider')}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={selectedRole === 'rider' 
                    ? [COLORS.accentGreen, COLORS.accentGreenDark]
                    : [COLORS.surface, COLORS.surfaceLight]}
                  style={styles.roleGradient}
                >
                  <View style={styles.roleHeader}>
                    <View style={[styles.roleIcon, selectedRole === 'rider' && styles.roleIconActive]}>
                      <Ionicons 
                        name="person" 
                        size={28} 
                        color={selectedRole === 'rider' ? COLORS.primary : COLORS.accentGreen} 
                      />
                    </View>
                    <View style={[styles.radioOuter, selectedRole === 'rider' && styles.radioOuterActive]}>
                      {selectedRole === 'rider' && <View style={styles.radioInner} />}
                    </View>
                  </View>
                  
                  <Text style={[styles.roleName, selectedRole === 'rider' && styles.roleNameActive]}>
                    Rider
                  </Text>
                  <Text style={[styles.rolePrice, selectedRole === 'rider' && styles.rolePriceActive]}>
                    FREE
                  </Text>
                  
                  <View style={styles.roleFeatures}>
                    <RoleFeature text="Book rides instantly" active={selectedRole === 'rider'} />
                    <RoleFeature text="Live trip tracking" active={selectedRole === 'rider'} />
                    <RoleFeature text="AI-powered assistance" active={selectedRole === 'rider'} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* Driver Option */}
              <TouchableOpacity
                style={[styles.roleCard, selectedRole === 'driver' && styles.roleCardActive]}
                onPress={() => setSelectedRole('driver')}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={selectedRole === 'driver' 
                    ? [COLORS.accentBlue, COLORS.accentBlueDark]
                    : [COLORS.surface, COLORS.surfaceLight]}
                  style={styles.roleGradient}
                >
                  {/* Premium Badge */}
                  <View style={styles.premiumBadge}>
                    <Ionicons name="diamond" size={12} color={COLORS.primary} />
                    <Text style={styles.premiumBadgeText}>PREMIUM</Text>
                  </View>
                  
                  <View style={styles.roleHeader}>
                    <View style={[styles.roleIcon, selectedRole === 'driver' && styles.roleIconDriver]}>
                      <Ionicons 
                        name="car-sport" 
                        size={28} 
                        color={selectedRole === 'driver' ? COLORS.white : COLORS.accentBlue} 
                      />
                    </View>
                    <View style={[styles.radioOuter, selectedRole === 'driver' && styles.radioOuterDriver]}>
                      {selectedRole === 'driver' && <View style={styles.radioInnerDriver} />}
                    </View>
                  </View>
                  
                  <Text style={[styles.roleName, selectedRole === 'driver' && styles.roleNameActive]}>
                    Driver
                  </Text>
                  <Text style={[styles.rolePrice, selectedRole === 'driver' && styles.rolePriceActive]}>
                    {CURRENCY}25K/month
                  </Text>
                  
                  <View style={styles.roleFeatures}>
                    <RoleFeature text="Keep 100% earnings" active={selectedRole === 'driver'} />
                    <RoleFeature text="Zero commission" active={selectedRole === 'driver'} />
                    <RoleFeature text="Daily challenges & rewards" active={selectedRole === 'driver'} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Form Section */}
            <View style={styles.formSection}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={20} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your full name"
                    placeholderTextColor={COLORS.textMuted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email (Optional)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor={COLORS.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            {/* Register Button */}
            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
              disabled={loading || !name.trim()}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={name.trim() 
                  ? (selectedRole === 'driver' 
                    ? [COLORS.accentBlue, COLORS.accentBlueDark] 
                    : [COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue])
                  : [COLORS.gray700, COLORS.gray700]}
                style={styles.registerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.registerText, !name.trim() && styles.registerTextDisabled]}>
                  {loading ? 'Creating Account...' : `Continue as ${selectedRole === 'driver' ? 'Driver' : 'Rider'}`}
                </Text>
                <View style={[styles.registerArrow, !name.trim() && styles.registerArrowDisabled]}>
                  <Ionicons 
                    name="arrow-forward" 
                    size={20} 
                    color={name.trim() ? COLORS.primary : COLORS.gray500} 
                  />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Terms */}
            <Text style={styles.termsText}>
              By continuing, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const RoleFeature = ({ text, active }: { text: string; active: boolean }) => (
  <View style={styles.featureRow}>
    <Ionicons 
      name="checkmark-circle" 
      size={16} 
      color={active ? 'rgba(255,255,255,0.9)' : COLORS.textMuted} 
    />
    <Text style={[styles.featureText, active && styles.featureTextActive]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.15,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  header: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  titleIcon: {
    width: 50,
    height: 50,
    position: 'relative',
    marginBottom: SPACING.md,
  },
  titleIconLeft: {
    position: 'absolute',
    left: 3,
    top: 0,
    width: 20,
    height: 50,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
    transform: [{ skewX: '-8deg' }],
  },
  titleIconRight: {
    position: 'absolute',
    right: 3,
    top: 0,
    width: 20,
    height: 50,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    transform: [{ skewX: '8deg' }],
  },
  title: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  roleSection: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  roleCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleCardActive: {
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  roleGradient: {
    padding: SPACING.md,
    minHeight: 220,
  },
  premiumBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    gap: 2,
  },
  premiumBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.primary,
  },
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  roleIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIconActive: {
    backgroundColor: COLORS.primary,
  },
  roleIconDriver: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.gray600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: COLORS.primary,
  },
  radioOuterDriver: {
    borderColor: COLORS.white,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  radioInnerDriver: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.white,
  },
  roleName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  roleNameActive: {
    color: COLORS.white,
  },
  rolePrice: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  rolePriceActive: {
    color: COLORS.white,
  },
  roleFeatures: {
    gap: SPACING.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  featureText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  featureTextActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  formSection: {
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  inputContainer: {},
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.white,
    paddingVertical: SPACING.md,
  },
  registerButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  registerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  registerText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  registerTextDisabled: {
    color: COLORS.gray500,
  },
  registerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerArrowDisabled: {
    backgroundColor: COLORS.gray800,
  },
  termsText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
});
