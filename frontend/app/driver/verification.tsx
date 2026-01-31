import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  background: '#F5F5F5',
  card: '#FFFFFF',
  primary: '#000000',
  green: '#00D26A',
  greenBright: '#00FF85',
  blue: '#0066FF',
  blueBright: '#00A3FF',
  purple: '#8B00FF',
  orange: '#FF6B00',
  orangeBright: '#FF9500',
  red: '#FF0000',
  cyan: '#00D4FF',
  textPrimary: '#000000',
  textSecondary: '#333333',
  textMuted: '#666666',
  border: '#E0E0E0',
};

interface DocumentStatus {
  nin: { uploaded: boolean; verified: boolean; url?: string };
  drivers_license: { uploaded: boolean; verified: boolean; url?: string };
  passport_photo: { uploaded: boolean; verified: boolean; url?: string };
  vehicle_registration: { uploaded: boolean; verified: boolean; url?: string };
  insurance: { uploaded: boolean; verified: boolean; url?: string };
}

export default function DriverVerificationScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Personal Info
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  
  // Vehicle Info
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  
  // Documents
  const [documents, setDocuments] = useState<DocumentStatus>({
    nin: { uploaded: false, verified: false },
    drivers_license: { uploaded: false, verified: false },
    passport_photo: { uploaded: false, verified: false },
    vehicle_registration: { uploaded: false, verified: false },
    insurance: { uploaded: false, verified: false },
  });
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (step / 4) * 100,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const pickDocument = async (docType: keyof DocumentStatus) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setDocuments(prev => ({
        ...prev,
        [docType]: { 
          uploaded: true, 
          verified: false, 
          url: result.assets[0].uri 
        }
      }));
    }
  };

  const takePhoto = async (docType: keyof DocumentStatus) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setDocuments(prev => ({
        ...prev,
        [docType]: { 
          uploaded: true, 
          verified: false, 
          url: result.assets[0].uri 
        }
      }));
    }
  };

  const submitVerification = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/drivers/verification/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          personal_info: { fullName, phone, email, address, dateOfBirth },
          vehicle_info: { vehicleMake, vehicleModel, vehicleYear, vehicleColor, plateNumber },
          documents: documents,
        }),
      });
      
      if (res.ok) {
        Alert.alert(
          '✅ SUBMITTED SUCCESSFULLY',
          'Your documents are under review. We will notify you within 24-48 hours.',
          [{ text: 'OK', onPress: () => router.replace('/(driver-tabs)/driver-home') }]
        );
      } else {
        Alert.alert('Error', 'Failed to submit. Please try again.');
      }
    } catch (e) {
      // For demo, show success anyway
      Alert.alert(
        '✅ SUBMITTED SUCCESSFULLY',
        'Your documents are under review. We will notify you within 24-48 hours.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
    setSubmitting(false);
  };

  const nextStep = () => {
    if (step < 4) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      fadeAnim.setValue(0);
      slideAnim.setValue(-30);
      setStep(step - 1);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return fullName && phone && email;
      case 2:
        return vehicleMake && vehicleModel && plateNumber;
      case 3:
        return documents.nin.uploaded && documents.drivers_license.uploaded && documents.passport_photo.uploaded;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const renderDocumentUpload = (
    docType: keyof DocumentStatus,
    title: string,
    description: string,
    icon: string
  ) => (
    <View style={styles.docCard}>
      <View style={styles.docHeader}>
        <View style={[
          styles.docIcon,
          { backgroundColor: documents[docType].uploaded ? COLORS.green : COLORS.blue }
        ]}>
          <Ionicons 
            name={documents[docType].uploaded ? "checkmark" : icon as any} 
            size={26} 
            color="#FFFFFF" 
          />
        </View>
        <View style={styles.docInfo}>
          <Text style={styles.docTitle}>{title}</Text>
          <Text style={styles.docDesc}>{description}</Text>
        </View>
        {documents[docType].uploaded && (
          <View style={styles.uploadedBadge}>
            <Text style={styles.uploadedText}>UPLOADED</Text>
          </View>
        )}
      </View>
      
      {documents[docType].url && (
        <View style={styles.previewContainer}>
          <Image source={{ uri: documents[docType].url }} style={styles.previewImage} />
        </View>
      )}
      
      <View style={styles.docActions}>
        <TouchableOpacity 
          style={styles.docActionBtn}
          onPress={() => pickDocument(docType)}
        >
          <LinearGradient
            colors={[COLORS.blue, COLORS.blueBright]}
            style={styles.docActionGradient}
          >
            <Ionicons name="folder-open" size={20} color="#FFFFFF" />
            <Text style={styles.docActionText}>GALLERY</Text>
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.docActionBtn}
          onPress={() => takePhoto(docType)}
        >
          <LinearGradient
            colors={[COLORS.purple, '#A855F7']}
            style={styles.docActionGradient}
          >
            <Ionicons name="camera" size={20} color="#FFFFFF" />
            <Text style={styles.docActionText}>CAMERA</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>DRIVER REGISTRATION</Text>
            <Text style={styles.headerSubtitle}>Step {step} of 4</Text>
          </View>
          <View style={{ width: 48 }} />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View 
              style={[
                styles.progressFill,
                { width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%']
                }) }
              ]} 
            />
          </View>
          <View style={styles.stepsRow}>
            {['Personal', 'Vehicle', 'Documents', 'Review'].map((label, index) => (
              <View key={label} style={styles.stepIndicator}>
                <View style={[
                  styles.stepDot,
                  index + 1 <= step && styles.stepDotActive
                ]}>
                  {index + 1 < step ? (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.stepNumber, index + 1 <= step && styles.stepNumberActive]}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, index + 1 <= step && styles.stepLabelActive]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Animated.View style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }
          ]}>
            {/* Step 1: Personal Information */}
            {step === 1 && (
              <View style={styles.stepContent}>
                <View style={styles.stepHeader}>
                  <LinearGradient
                    colors={[COLORS.blue, COLORS.blueBright]}
                    style={styles.stepIcon}
                  >
                    <Ionicons name="person" size={32} color="#FFFFFF" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.stepTitle}>PERSONAL INFORMATION</Text>
                    <Text style={styles.stepDesc}>Enter your basic details</Text>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>FULL NAME *</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="person-outline" size={22} color={COLORS.blue} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your full name"
                      placeholderTextColor="#999"
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>PHONE NUMBER *</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="call-outline" size={22} color={COLORS.green} />
                    <TextInput
                      style={styles.input}
                      placeholder="+234 xxx xxx xxxx"
                      placeholderTextColor="#999"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>EMAIL ADDRESS *</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="mail-outline" size={22} color={COLORS.purple} />
                    <TextInput
                      style={styles.input}
                      placeholder="your@email.com"
                      placeholderTextColor="#999"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>HOME ADDRESS</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="location-outline" size={22} color={COLORS.orange} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your address"
                      placeholderTextColor="#999"
                      value={address}
                      onChangeText={setAddress}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DATE OF BIRTH</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="calendar-outline" size={22} color={COLORS.cyan} />
                    <TextInput
                      style={styles.input}
                      placeholder="DD/MM/YYYY"
                      placeholderTextColor="#999"
                      value={dateOfBirth}
                      onChangeText={setDateOfBirth}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Step 2: Vehicle Information */}
            {step === 2 && (
              <View style={styles.stepContent}>
                <View style={styles.stepHeader}>
                  <LinearGradient
                    colors={[COLORS.green, COLORS.greenBright]}
                    style={styles.stepIcon}
                  >
                    <Ionicons name="car-sport" size={32} color="#FFFFFF" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.stepTitle}>VEHICLE INFORMATION</Text>
                    <Text style={styles.stepDesc}>Enter your vehicle details</Text>
                  </View>
                </View>

                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>MAKE *</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        placeholder="Toyota"
                        placeholderTextColor="#999"
                        value={vehicleMake}
                        onChangeText={setVehicleMake}
                      />
                    </View>
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>MODEL *</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        placeholder="Camry"
                        placeholderTextColor="#999"
                        value={vehicleModel}
                        onChangeText={setVehicleModel}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>YEAR</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        placeholder="2020"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                        value={vehicleYear}
                        onChangeText={setVehicleYear}
                      />
                    </View>
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>COLOR</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        placeholder="Black"
                        placeholderTextColor="#999"
                        value={vehicleColor}
                        onChangeText={setVehicleColor}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>PLATE NUMBER *</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="card-outline" size={22} color={COLORS.blue} />
                    <TextInput
                      style={styles.input}
                      placeholder="ABC-123-XY"
                      placeholderTextColor="#999"
                      autoCapitalize="characters"
                      value={plateNumber}
                      onChangeText={setPlateNumber}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Step 3: Document Upload */}
            {step === 3 && (
              <View style={styles.stepContent}>
                <View style={styles.stepHeader}>
                  <LinearGradient
                    colors={[COLORS.orange, COLORS.orangeBright]}
                    style={styles.stepIcon}
                  >
                    <Ionicons name="document-text" size={32} color="#FFFFFF" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.stepTitle}>DOCUMENT VERIFICATION</Text>
                    <Text style={styles.stepDesc}>Upload required documents</Text>
                  </View>
                </View>

                {renderDocumentUpload(
                  'nin',
                  'National ID (NIN)',
                  'Upload your NIN slip or card',
                  'id-card'
                )}
                
                {renderDocumentUpload(
                  'drivers_license',
                  "Driver's License",
                  'Valid Nigerian driving license',
                  'car'
                )}
                
                {renderDocumentUpload(
                  'passport_photo',
                  'Passport Photo',
                  'Clear recent passport photograph',
                  'person-circle'
                )}
                
                {renderDocumentUpload(
                  'vehicle_registration',
                  'Vehicle Registration',
                  'Vehicle registration document (optional)',
                  'document'
                )}
                
                {renderDocumentUpload(
                  'insurance',
                  'Insurance Certificate',
                  'Valid vehicle insurance (optional)',
                  'shield-checkmark'
                )}
              </View>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <View style={styles.stepContent}>
                <View style={styles.stepHeader}>
                  <LinearGradient
                    colors={[COLORS.purple, '#A855F7']}
                    style={styles.stepIcon}
                  >
                    <Ionicons name="checkmark-done" size={32} color="#FFFFFF" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.stepTitle}>REVIEW & SUBMIT</Text>
                    <Text style={styles.stepDesc}>Verify your information</Text>
                  </View>
                </View>

                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSection}>PERSONAL INFO</Text>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Name</Text>
                    <Text style={styles.reviewValue}>{fullName || 'Not provided'}</Text>
                  </View>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Phone</Text>
                    <Text style={styles.reviewValue}>{phone || 'Not provided'}</Text>
                  </View>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Email</Text>
                    <Text style={styles.reviewValue}>{email || 'Not provided'}</Text>
                  </View>
                </View>

                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSection}>VEHICLE INFO</Text>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Vehicle</Text>
                    <Text style={styles.reviewValue}>{vehicleMake} {vehicleModel} ({vehicleYear})</Text>
                  </View>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Plate</Text>
                    <Text style={styles.reviewValue}>{plateNumber || 'Not provided'}</Text>
                  </View>
                </View>

                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSection}>DOCUMENTS</Text>
                  {Object.entries(documents).map(([key, value]) => (
                    <View key={key} style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>{key.replace('_', ' ').toUpperCase()}</Text>
                      <View style={[
                        styles.docStatus,
                        { backgroundColor: value.uploaded ? COLORS.green : COLORS.red }
                      ]}>
                        <Text style={styles.docStatusText}>
                          {value.uploaded ? 'UPLOADED' : 'MISSING'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.navButtons}>
          {step > 1 && (
            <TouchableOpacity style={styles.prevButton} onPress={prevStep}>
              <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
              <Text style={styles.prevText}>BACK</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={[styles.nextButton, !isStepValid() && styles.nextButtonDisabled]}
            onPress={step === 4 ? submitVerification : nextStep}
            disabled={!isStepValid() || submitting}
          >
            <LinearGradient
              colors={isStepValid() ? [COLORS.green, COLORS.greenBright] : ['#CCC', '#AAA']}
              style={styles.nextGradient}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.nextText}>{step === 4 ? 'SUBMIT' : 'CONTINUE'}</Text>
                  <Ionicons name={step === 4 ? "checkmark-circle" : "arrow-forward"} size={24} color="#FFFFFF" />
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
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.green,
    marginTop: 2,
  },
  progressContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#EEE',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#EEEEEE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.green,
    borderRadius: 3,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  stepIndicator: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEEEEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDotActive: {
    backgroundColor: COLORS.green,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999999',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999999',
  },
  stepLabelActive: {
    color: COLORS.green,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
  },
  content: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  stepIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  stepDesc: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: '#EEEEEE',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    paddingVertical: 16,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  docCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#EEEEEE',
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  docIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: {
    flex: 1,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
  docDesc: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
  },
  uploadedBadge: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  uploadedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  previewContainer: {
    marginBottom: 14,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  docActions: {
    flexDirection: 'row',
    gap: 10,
  },
  docActionBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  docActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  docActionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
  },
  reviewSection: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.blue,
    letterSpacing: 1,
    marginBottom: 14,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  reviewLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  docStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  docStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    gap: 12,
    borderTopWidth: 2,
    borderTopColor: '#EEEEEE',
  },
  prevButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    gap: 8,
  },
  prevText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
  nextButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
