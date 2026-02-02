import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/AuthContext';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

// CAR CATEGORIES WITH REQUIREMENTS
const CAR_CATEGORIES = [
  {
    id: 'economy',
    name: 'ECONOMY',
    emoji: '🚗',
    color: '#4CAF50',
    description: 'Affordable rides for everyday trips',
    requirements: [
      'Car must be 2015 or newer',
      'Must have working AC',
      'Clean interior & exterior',
      '4 doors minimum',
    ],
    examples: 'Toyota Corolla, Honda Civic, Hyundai Elantra',
    earnings: '₦150/km',
  },
  {
    id: 'comfort',
    name: 'COMFORT',
    emoji: '🚙',
    color: '#2196F3',
    description: 'Spacious & comfortable rides',
    requirements: [
      'Car must be 2018 or newer',
      'Leather or premium fabric seats',
      'Strong AC (front & rear)',
      'Spacious legroom',
      'No visible scratches or dents',
    ],
    examples: 'Toyota Camry, Honda Accord, Mazda 6',
    earnings: '₦200/km',
  },
  {
    id: 'premium',
    name: 'PREMIUM',
    emoji: '🚘',
    color: '#9C27B0',
    description: 'Luxury vehicles for VIP riders',
    requirements: [
      'Car must be 2020 or newer',
      'Luxury brand only',
      'Leather seats required',
      'Premium sound system',
      'Excellent condition inside & out',
      'Tinted windows',
    ],
    examples: 'Mercedes Benz, BMW, Lexus, Audi',
    earnings: '₦350/km',
  },
  {
    id: 'xl',
    name: 'SUV / XL',
    emoji: '🚐',
    color: '#FF9800',
    description: '6+ seats for groups & families',
    requirements: [
      'Car must be 2017 or newer',
      'Minimum 6 passenger seats',
      'SUV or Minivan only',
      'Working AC for all rows',
      'Spacious cargo area',
    ],
    examples: 'Toyota Highlander, Honda Pilot, Sienna',
    earnings: '₦250/km',
  },
];

// CAR BRANDS
const CAR_BRANDS = [
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Nissan', 'Mazda',
  'Mercedes Benz', 'BMW', 'Lexus', 'Audi', 'Volkswagen',
  'Ford', 'Chevrolet', 'Peugeot', 'Mitsubishi', 'Suzuki',
];

export default function VehicleRegistrationScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState({
    make: '',
    model: '',
    year: '',
    color: '',
    plateNumber: '',
  });
  const [agreedToRequirements, setAgreedToRequirements] = useState(false);

  const currentYear = new Date().getFullYear();

  const validateVehicle = () => {
    const category = CAR_CATEGORIES.find(c => c.id === selectedCategory);
    if (!category) return false;

    const year = parseInt(vehicleInfo.year);
    
    // Check year requirements
    if (selectedCategory === 'economy' && year < 2015) {
      Alert.alert('VEHICLE TOO OLD', 'Economy cars must be 2015 or newer. Your car does not qualify.');
      return false;
    }
    if (selectedCategory === 'comfort' && year < 2018) {
      Alert.alert('VEHICLE TOO OLD', 'Comfort cars must be 2018 or newer. Please select Economy instead.');
      return false;
    }
    if (selectedCategory === 'premium' && year < 2020) {
      Alert.alert('VEHICLE TOO OLD', 'Premium cars must be 2020 or newer. Please select Comfort instead.');
      return false;
    }
    if (selectedCategory === 'xl' && year < 2017) {
      Alert.alert('VEHICLE TOO OLD', 'XL vehicles must be 2017 or newer.');
      return false;
    }

    // Check luxury brands for premium
    if (selectedCategory === 'premium') {
      const luxuryBrands = ['Mercedes Benz', 'BMW', 'Lexus', 'Audi', 'Porsche', 'Range Rover', 'Jaguar'];
      if (!luxuryBrands.some(brand => vehicleInfo.make.toLowerCase().includes(brand.toLowerCase()))) {
        Alert.alert('NOT A LUXURY BRAND', 'Premium category is only for luxury brands like Mercedes, BMW, Lexus, Audi. Please select Comfort instead.');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = () => {
    if (!vehicleInfo.make || !vehicleInfo.model || !vehicleInfo.year || !vehicleInfo.color || !vehicleInfo.plateNumber) {
      Alert.alert('INCOMPLETE INFORMATION', 'Please fill in all vehicle details.');
      return;
    }

    if (!validateVehicle()) return;

    if (!agreedToRequirements) {
      Alert.alert('AGREEMENT REQUIRED', 'You must agree to maintain your vehicle to the category standards.');
      return;
    }

    Alert.alert(
      '✅ VEHICLE REGISTERED!',
      `Your ${vehicleInfo.make} ${vehicleInfo.model} has been registered in the ${selectedCategory?.toUpperCase()} category.\n\nOur team will verify your vehicle within 24-48 hours.`,
      [{ text: 'OK', onPress: () => router.push('/(driver-tabs)/driver-home') }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => step > 1 ? setStep(step - 1) : router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>🚗 VEHICLE REGISTRATION</Text>
          <Text style={styles.headerSubtitle}>STEP {step} OF 3</Text>
        </View>
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
          <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
          <View style={[styles.stepLine, step >= 3 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= 3 && styles.stepDotActive]} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {/* STEP 1: SELECT CATEGORY */}
        {step === 1 && (
          <>
            <Text style={styles.sectionTitle}>SELECT YOUR CATEGORY</Text>
            <Text style={styles.sectionSubtitle}>
              Choose the category that matches your vehicle. Each category has specific requirements.
            </Text>

            {CAR_CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryCard,
                  selectedCategory === category.id && { borderColor: category.color, borderWidth: 4 }
                ]}
                onPress={() => setSelectedCategory(category.id)}
              >
                <View style={styles.categoryHeader}>
                  <View style={[styles.categoryIcon, { backgroundColor: category.color + '20' }]}>
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                  </View>
                  <View style={styles.categoryInfo}>
                    <Text style={[styles.categoryName, { color: category.color }]}>{category.name}</Text>
                    <Text style={styles.categoryDesc}>{category.description}</Text>
                  </View>
                  {selectedCategory === category.id && (
                    <View style={[styles.checkBadge, { backgroundColor: category.color }]}>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </View>
                  )}
                </View>

                <View style={styles.categoryDetails}>
                  <Text style={styles.requirementsTitle}>📋 REQUIREMENTS:</Text>
                  {category.requirements.map((req, idx) => (
                    <View key={idx} style={styles.requirementRow}>
                      <Ionicons name="checkmark-circle" size={16} color={category.color} />
                      <Text style={styles.requirementText}>{req}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.categoryFooter}>
                  <Text style={styles.examplesText}>Examples: {category.examples}</Text>
                  <View style={[styles.earningsBadge, { backgroundColor: category.color }]}>
                    <Text style={styles.earningsText}>{category.earnings}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.nextButton, !selectedCategory && styles.nextButtonDisabled]}
              onPress={() => selectedCategory && setStep(2)}
              disabled={!selectedCategory}
            >
              <Text style={styles.nextButtonText}>CONTINUE</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </>
        )}

        {/* STEP 2: VEHICLE DETAILS */}
        {step === 2 && (
          <>
            <Text style={styles.sectionTitle}>VEHICLE INFORMATION</Text>
            <Text style={styles.sectionSubtitle}>
              Enter your vehicle details. This information will be verified.
            </Text>

            <View style={styles.formCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CAR MAKE / BRAND *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Toyota, Mercedes Benz"
                  placeholderTextColor="#888"
                  value={vehicleInfo.make}
                  onChangeText={(text) => setVehicleInfo({...vehicleInfo, make: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CAR MODEL *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Camry, C-Class"
                  placeholderTextColor="#888"
                  value={vehicleInfo.model}
                  onChangeText={(text) => setVehicleInfo({...vehicleInfo, model: text})}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>YEAR *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2022"
                    placeholderTextColor="#888"
                    keyboardType="number-pad"
                    maxLength={4}
                    value={vehicleInfo.year}
                    onChangeText={(text) => setVehicleInfo({...vehicleInfo, year: text})}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: SPACING.md }]}>
                  <Text style={styles.inputLabel}>COLOR *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Black"
                    placeholderTextColor="#888"
                    value={vehicleInfo.color}
                    onChangeText={(text) => setVehicleInfo({...vehicleInfo, color: text})}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PLATE NUMBER *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. LAG 123 XY"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                  value={vehicleInfo.plateNumber}
                  onChangeText={(text) => setVehicleInfo({...vehicleInfo, plateNumber: text.toUpperCase()})}
                />
              </View>
            </View>

            {/* Selected Category Summary */}
            {selectedCategory && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>SELECTED CATEGORY</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryEmoji}>
                    {CAR_CATEGORIES.find(c => c.id === selectedCategory)?.emoji}
                  </Text>
                  <Text style={styles.summaryText}>
                    {CAR_CATEGORIES.find(c => c.id === selectedCategory)?.name}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => setStep(3)}
            >
              <Text style={styles.nextButtonText}>CONTINUE</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </>
        )}

        {/* STEP 3: REVIEW & CONFIRM */}
        {step === 3 && (
          <>
            <Text style={styles.sectionTitle}>REVIEW & CONFIRM</Text>
            <Text style={styles.sectionSubtitle}>
              Please review your vehicle details and confirm.
            </Text>

            {/* Vehicle Summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewEmoji}>
                  {CAR_CATEGORIES.find(c => c.id === selectedCategory)?.emoji}
                </Text>
                <View>
                  <Text style={styles.reviewCarName}>
                    {vehicleInfo.make} {vehicleInfo.model}
                  </Text>
                  <Text style={styles.reviewCategory}>
                    {CAR_CATEGORIES.find(c => c.id === selectedCategory)?.name} CATEGORY
                  </Text>
                </View>
              </View>

              <View style={styles.reviewDetails}>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>YEAR</Text>
                  <Text style={styles.reviewValue}>{vehicleInfo.year}</Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>COLOR</Text>
                  <Text style={styles.reviewValue}>{vehicleInfo.color}</Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>PLATE NUMBER</Text>
                  <Text style={styles.reviewValue}>{vehicleInfo.plateNumber}</Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>EARNINGS</Text>
                  <Text style={[styles.reviewValue, { color: COLORS.accentGreen }]}>
                    {CAR_CATEGORIES.find(c => c.id === selectedCategory)?.earnings}
                  </Text>
                </View>
              </View>
            </View>

            {/* Agreement Checkbox */}
            <TouchableOpacity
              style={styles.agreementRow}
              onPress={() => setAgreedToRequirements(!agreedToRequirements)}
            >
              <View style={[styles.checkbox, agreedToRequirements && styles.checkboxChecked]}>
                {agreedToRequirements && <Ionicons name="checkmark" size={18} color="#fff" />}
              </View>
              <Text style={styles.agreementText}>
                I confirm that my vehicle meets all the requirements for the selected category and I agree to maintain it to NEXRYDE standards.
              </Text>
            </TouchableOpacity>

            {/* Warning */}
            <View style={styles.warningCard}>
              <Ionicons name="warning" size={24} color="#FF9800" />
              <Text style={styles.warningText}>
                Providing false information may result in account suspension. Our team will verify your vehicle.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, !agreedToRequirements && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!agreedToRequirements}
            >
              <LinearGradient
                colors={agreedToRequirements ? ['#00C853', '#00E676'] : ['#888', '#888']}
                style={styles.submitButtonGradient}
              >
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.submitButtonText}>SUBMIT FOR VERIFICATION</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: {
    paddingBottom: SPACING.lg,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  backBtn: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: SPACING.xxl + 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginTop: SPACING.xs,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    gap: 4,
  },
  stepDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stepDotActive: {
    backgroundColor: '#00E676',
  },
  stepLine: {
    width: 40,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stepLineActive: {
    backgroundColor: '#00E676',
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1a1a2e',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  // Category Card
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  categoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 32,
  },
  categoryInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  categoryName: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  categoryDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginTop: 2,
  },
  checkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryDetails: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#444',
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 6,
  },
  requirementText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    flex: 1,
  },
  categoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  examplesText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    flex: 1,
  },
  earningsBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  earningsText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  },
  // Form
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#444',
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#f5f7fa',
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#eee',
  },
  inputRow: {
    flexDirection: 'row',
  },
  summaryCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2E7D32',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  summaryEmoji: {
    fontSize: 28,
  },
  summaryText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2E7D32',
  },
  // Review
  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: '#f0f0f0',
  },
  reviewEmoji: {
    fontSize: 50,
  },
  reviewCarName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  reviewCategory: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accentGreen,
    marginTop: 2,
  },
  reviewDetails: {},
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  reviewLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  // Agreement
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  agreementText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    lineHeight: 20,
  },
  // Warning
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#E65100',
    lineHeight: 20,
  },
  // Buttons
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.md,
  },
  nextButtonDisabled: {
    backgroundColor: '#ccc',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  submitButton: {
    marginTop: SPACING.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
});
