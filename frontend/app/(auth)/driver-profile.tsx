import React, { useState } from 'react';
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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function DriverProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setUser, setIsAuthenticated } = useAppStore();
  
  const [fullName, setFullName] = useState(params.name as string || '');
  const [phone, setPhone] = useState(params.phone as string || '');
  const [email, setEmail] = useState(params.email as string || '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
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
  
  const [submitting, setSubmitting] = useState(false);

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
    if (!emergencyContact.trim()) {
      Alert.alert('Required', 'Please enter emergency contact');
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

    setSubmitting(true);
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/drivers/complete-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: params.driver_id,
          full_name: fullName,
          phone: phone,
          email: email,
          address: address,
          city: city,
          state: state,
          date_of_birth: dateOfBirth,
          emergency_contact: emergencyContact,
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
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Success! Activate 24-hour trial and log them in
        setUser(data.driver);
        setIsAuthenticated(true);
        
        Alert.alert(
          '🎉 Welcome to NEXRYDE!',
          '24-hour FREE trial activated! You can accept 3 trips to test the platform.\n\nAfter trial: Subscribe for ₦18,000/month (Early Adopter Price)',
          [
            {
              text: 'Start Driving',
              onPress: () => router.replace('/(driver-tabs)/driver-home'),
            },
          ]
        );
      } else {
        Alert.alert('Error', data.detail || 'Could not complete profile');
      }
    } catch (error) {
      console.error('Profile completion error:', error);
      Alert.alert('Error', 'Could not complete profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Profile</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Final Step!</Text>
            <Text style={styles.infoText}>
              Complete your profile to activate your 24-hour FREE trial
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
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={submitting}
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
                  <Text style={styles.submitText}>Complete & Start Trial</Text>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
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
});
