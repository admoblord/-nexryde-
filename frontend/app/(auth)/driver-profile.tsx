import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { DriverOnboardingProgress } from '@/src/components/DriverOnboardingProgress';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders, formatApiDetail } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { useBottomInset } from '@/src/hooks/useBottomPad';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useOnboardingSurfaces } from '@/src/hooks/useOnboardingSurfaces';
import { setTokens } from '@/src/lib/tokenStore';

export default function DriverProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { storeReady, canCallAuthedApi } = useAuthedApiReady();
  const surf = useOnboardingSurfaces();
  const { setUser, setIsAuthenticated } = useAppStore();
  const { bottom } = useBottomInset();
  
  const [fullName, setFullName] = useState(params.name as string || '');
  const [phone, setPhone] = useState(params.phone as string || '');
  const [email, setEmail] = useState(params.email as string || '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [stateOfOrigin, setStateOfOrigin] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  
  // Guarantor Information
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorAddress, setGuarantorAddress] = useState('');
  const [guarantorRelationship, setGuarantorRelationship] = useState('');

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  
  // Vehicle Information
  const [vehicleType, setVehicleType] = useState('economy');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [hasAC, setHasAC] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Pre-populate any fields already saved (e.g. driver revisits the screen)
  useEffect(() => {
    const driverId = params.driver_id as string || '';
    if (!driverId || !canCallAuthedApi) return;
    setLoadingExisting(true);
    fetch(`${BACKEND_URL}/api/drivers/${driverId}/profile`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.full_name) setFullName(data.full_name);
        if (data.phone) setPhone(data.phone);
        if (data.email) setEmail(data.email);
        if (data.address) setAddress(data.address);
        if (data.city) setCity(data.city);
        if (data.state) setState(data.state);
        if (data.date_of_birth) setDateOfBirth(data.date_of_birth);
        if (data.state_of_origin) setStateOfOrigin(data.state_of_origin);
        if (data.emergency_contact) setEmergencyContact(data.emergency_contact);
        if (data.guarantor?.name) setGuarantorName(data.guarantor.name);
        if (data.guarantor?.phone) setGuarantorPhone(data.guarantor.phone);
        if (data.guarantor?.address) setGuarantorAddress(data.guarantor.address);
        if (data.guarantor?.relationship) setGuarantorRelationship(data.guarantor.relationship);
        if (data.bank_name) setBankName(data.bank_name);
        if (data.account_number) setAccountNumber(data.account_number);
        if (data.account_name) setAccountName(data.account_name);
        if (data.vehicle_type) setVehicleType(data.vehicle_type);
        if (data.vehicle_make) setVehicleMake(data.vehicle_make);
        if (data.vehicle_model) setVehicleModel(data.vehicle_model);
        if (data.vehicle_year) setVehicleYear(data.vehicle_year);
        if (data.vehicle_plate_number) setVehiclePlateNumber(data.vehicle_plate_number);
        if (data.vehicle_color) setVehicleColor(data.vehicle_color);
        if (data.has_ac) setHasAC(true);
      })
      .catch(() => { /* silent — form starts empty */ })
      .finally(() => setLoadingExisting(false));
  }, [canCallAuthedApi, params.driver_id]);

  const VEHICLE_TYPES = [
    { id: 'economy', label: 'Economy', icon: 'car', desc: 'Standard vehicles' },
    { id: 'comfort', label: 'Comfort', icon: 'car-sport', desc: 'Premium comfort' },
    { id: 'xl', label: 'XL', icon: 'bus', desc: '6+ passengers' },
    { id: 'premium', label: 'Premium', icon: 'rocket', desc: 'Luxury vehicles' },
  ];

  const handleSubmit = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number');
      return;
    }
    if (!address.trim()) {
      Alert.alert('Required', 'Please enter your home address');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Required', 'Please enter your city');
      return;
    }
    if (!state.trim()) {
      Alert.alert('Required', 'Please enter your state');
      return;
    }
    if (!dateOfBirth.trim()) {
      Alert.alert('Required', 'Please enter your date of birth');
      return;
    }
    if (!stateOfOrigin.trim()) {
      Alert.alert('Required', 'Please enter your state of origin');
      return;
    }
    if (!emergencyContact.trim()) {
      Alert.alert('Required', 'Please enter emergency contact');
      return;
    }
    if (!guarantorName.trim()) {
      Alert.alert('Required', 'Please enter your guarantor\'s full name');
      return;
    }
    if (!guarantorPhone.trim()) {
      Alert.alert('Required', 'Please enter your guarantor\'s phone number');
      return;
    }
    if (!guarantorAddress.trim()) {
      Alert.alert('Required', 'Please enter your guarantor\'s address');
      return;
    }
    
    // Vehicle validation
    if (!vehicleMake.trim()) {
      Alert.alert('Vehicle Required', 'Please enter your vehicle make (e.g., Toyota)');
      return;
    }
    if (!vehicleModel.trim()) {
      Alert.alert('Vehicle Required', 'Please enter your vehicle model (e.g., Corolla)');
      return;
    }
    if (!vehicleYear.trim()) {
      Alert.alert('Vehicle Required', 'Please enter your vehicle year');
      return;
    }
    if (!vehiclePlateNumber.trim()) {
      Alert.alert('Vehicle Required', 'Please enter your vehicle plate number');
      return;
    }
    if (!vehicleColor.trim()) {
      Alert.alert('Vehicle Required', 'Please enter your vehicle color');
      return;
    }
    if (!hasAC) {
      Alert.alert(
        'AC Required',
        'All NEXRYDE vehicles MUST have a working Air Conditioning (AC) system. Vehicles without AC cannot be registered on the platform.',
        [{ text: 'I Understand' }]
      );
      return;
    }

    const { getValidToken } = await import('@/src/lib/tokenStore');
    const liveToken = await getValidToken();
    if (!liveToken) {
      Alert.alert('Session expired', 'Please sign in again to save your profile.', [
        { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/drivers/complete-profile`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          driver_id: params.driver_id,
          full_name: fullName,
          phone: phone,
          email: email,
          address: address,
          city: city,
          state: state,
          date_of_birth: dateOfBirth,
          state_of_origin: stateOfOrigin,
          emergency_contact: emergencyContact,
          guarantor: {
            name: guarantorName,
            phone: guarantorPhone,
            address: guarantorAddress,
            relationship: guarantorRelationship || 'Not specified',
          },
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
          // Vehicle information
          vehicle_type: vehicleType,
          vehicle_make: vehicleMake,
          vehicle_model: vehicleModel,
          vehicle_year: vehicleYear,
          vehicle_plate_number: vehiclePlateNumber,
          vehicle_color: vehicleColor,
          has_ac: hasAC,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const resolvedToken = data?.token || data?.user?.token || null;
        const loggedInUser = data.user
          ? { ...data.user, profile_completed: true, onboarding_complete: data.awaiting_approval ? false : true }
          : null;

        if (loggedInUser) {
          setUser(loggedInUser);
          if (resolvedToken) await setTokens(resolvedToken, data?.refresh_token);
          await saveUserSession({ ...loggedInUser, token: resolvedToken });
        }
        setIsAuthenticated(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (data.awaiting_approval) {
          Alert.alert(
            'Profile Saved',
            'Your profile has been saved. Your documents are under review by the NEXRYDE team. You will be notified once approved — then your free trial begins (15 trips or 14 days from first go-online).',
            [{ text: 'Go to Dashboard', onPress: () => router.replace('/(driver-tabs)/driver-home') }],
          );
        } else {
          Alert.alert(
            'Profile Updated',
            data.message || 'Profile saved successfully.',
            [{ text: 'Go to Dashboard', onPress: () => router.replace('/(driver-tabs)/driver-home') }],
          );
        }
      } else {
        const msg = formatApiDetail(data?.detail) || 'Could not save profile. Check all required fields and try again.';
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Profile not saved', msg);
      }
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Connection error', 'Could not reach the server. Check your network and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!storeReady) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: surf.screen }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: surf.header, borderBottomColor: surf.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={surf.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: surf.text }]}>Driver profile</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <DriverOnboardingProgress
            current="profile"
            appearance={surf.isDark ? 'dark' : 'light'}
            subtitle="Accurate details speed up approval. Bank fields are optional but recommended for payouts."
          />
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Final step</Text>
            <Text style={styles.infoText}>
              Add your address, guarantor, vehicle, and confirm working AC. Submit once everything is correct.
            </Text>
          </View>

          {/* Personal Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                value={fullName}
                onChangeText={setFullName}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="+234 XXX XXX XXXX"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="your.email@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date of Birth *</Text>
              <TextInput
                style={styles.input}
                placeholder="DD/MM/YYYY"
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>
          </View>

          {/* Address Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Home Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="Street address"
                value={address}
                onChangeText={setAddress}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>City *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Lagos, Abuja"
                value={city}
                onChangeText={setCity}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>State *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Lagos State, FCT"
                value={state}
                onChangeText={setState}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>State of Origin *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Ogun State, Edo State"
                value={stateOfOrigin}
                onChangeText={setStateOfOrigin}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>
          </View>

          {/* Emergency Contact */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Emergency Contact</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Emergency Contact Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="+234 XXX XXX XXXX"
                value={emergencyContact}
                onChangeText={setEmergencyContact}
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>
          </View>

          {/* Guarantor Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Guarantor Information</Text>
            <Text style={styles.sectionSubtitle}>
              A reachable guarantor is required for compliance. Use someone who knows you well.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Guarantor Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter guarantor's full name"
                value={guarantorName}
                onChangeText={setGuarantorName}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Guarantor Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="+234 XXX XXX XXXX"
                value={guarantorPhone}
                onChangeText={setGuarantorPhone}
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Guarantor Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter guarantor's home address"
                value={guarantorAddress}
                onChangeText={setGuarantorAddress}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Relationship to Guarantor</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Father, Uncle, Employer"
                value={guarantorRelationship}
                onChangeText={setGuarantorRelationship}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>
          </View>

          {/* Bank Details (Optional) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bank Details (Optional)</Text>
            <Text style={styles.sectionSubtitle}>For receiving payments from riders</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., GTBank, Access Bank"
                value={bankName}
                onChangeText={setBankName}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={styles.input}
                placeholder="10-digit account number"
                value={accountNumber}
                onChangeText={setAccountNumber}
                keyboardType="number-pad"
                maxLength={10}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Name on bank account"
                value={accountName}
                onChangeText={setAccountName}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>
          </View>

          {/* Vehicle Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehicle Information *</Text>
            <Text style={styles.sectionSubtitle}>Select your vehicle category and provide details</Text>

            {/* Vehicle Type Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Category *</Text>
              <View style={styles.vehicleTypeGrid}>
                {VEHICLE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.vehicleTypeCard,
                      vehicleType === type.id && styles.vehicleTypeCardSelected
                    ]}
                    onPress={() => setVehicleType(type.id)}
                  >
                    <Ionicons 
                      name={type.icon as any} 
                      size={28} 
                      color={vehicleType === type.id ? COLORS.accentGreen : COLORS.lightTextSecondary} 
                    />
                    <Text style={[
                      styles.vehicleTypeName,
                      vehicleType === type.id && styles.vehicleTypeNameSelected
                    ]}>
                      {type.label}
                    </Text>
                    <Text style={styles.vehicleTypeDesc}>{type.desc}</Text>
                    {vehicleType === type.id && (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark" size={16} color={COLORS.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Make *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Toyota, Honda, Lexus"
                value={vehicleMake}
                onChangeText={setVehicleMake}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Model *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Camry, Corolla, Accord"
                value={vehicleModel}
                onChangeText={setVehicleModel}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Year *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2020"
                value={vehicleYear}
                onChangeText={setVehicleYear}
                keyboardType="number-pad"
                maxLength={4}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Plate Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., ABC-123-XY"
                value={vehiclePlateNumber}
                onChangeText={setVehiclePlateNumber}
                autoCapitalize="characters"
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Color *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Black, White, Silver"
                value={vehicleColor}
                onChangeText={setVehicleColor}
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>

            {/* AC Confirmation */}
            <View style={styles.inputGroup}>
              <TouchableOpacity
                style={[styles.acCard, hasAC && styles.acCardConfirmed]}
                onPress={() => setHasAC(!hasAC)}
                activeOpacity={0.7}
              >
                <View style={[styles.acCheckbox, hasAC && styles.acCheckboxChecked]}>
                  {hasAC && <Ionicons name="checkmark" size={18} color={COLORS.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.acTitle, hasAC && { color: COLORS.accentGreen }]}>
                    Vehicle has working AC *
                  </Text>
                  <Text style={styles.acDesc}>
                    All NEXRYDE vehicles MUST have a functional Air Conditioning system. This is mandatory — no exceptions.
                  </Text>
                </View>
                <Ionicons name="snow" size={28} color={hasAC ? COLORS.accentBlue : COLORS.lightTextMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={[styles.bottomSection, { paddingBottom: Math.max(bottom + 12, 16) }]}>
          <TouchableOpacity 
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={submitting || loadingExisting}
            accessibilityLabel="Save profile and continue"
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.submitText}>Save Profile</Text>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.submitNote}>
            Your documents will be reviewed by our team after saving.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 40,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  infoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.accentGreen,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
  },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.md,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.lightBorder,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextPrimary,
  },
  bottomSection: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  submitButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  submitText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  submitNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  vehicleTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  vehicleTypeCard: {
    width: '48%',
    backgroundColor: COLORS.lightBorder,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  vehicleTypeCardSelected: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.accentGreen,
  },
  vehicleTypeName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginTop: SPACING.xs,
  },
  vehicleTypeNameSelected: {
    color: COLORS.accentGreen,
  },
  vehicleTypeDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  acCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.lightSurface,
  },
  acCardConfirmed: {
    borderColor: COLORS.accentGreen,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  acCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acCheckboxChecked: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  acTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  acDesc: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    lineHeight: 18,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
