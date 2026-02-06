import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [nin, setNin] = useState<string | null>(null);
  const [driverLicense, setDriverLicense] = useState<string | null>(null);
  const [passport, setPassport] = useState<string | null>(null);
  const [vehicleReg, setVehicleReg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const pickImage = async (type: 'nin' | 'license' | 'passport' | 'vehicle') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        
        if (type === 'nin') setNin(uri);
        else if (type === 'license') setDriverLicense(uri);
        else if (type === 'passport') setPassport(uri);
        else if (type === 'vehicle') setVehicleReg(uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleSubmitDocuments = async () => {
    // Validation
    if (!nin) {
      Alert.alert('Missing Document', 'Please upload your National ID (NIN)');
      return;
    }
    if (!driverLicense) {
      Alert.alert('Missing Document', 'Please upload your Driver License');
      return;
    }
    if (!passport) {
      Alert.alert('Missing Document', 'Please upload your Passport or ID Photo');
      return;
    }
    if (!vehicleReg) {
      Alert.alert('Missing Document', 'Please upload your Vehicle Registration');
      return;
    }

    setVerifying(true);
    try {
      // Prepare form data
      const formData = new FormData();
      formData.append('driver_id', params.driver_id as string);
      formData.append('nin', {
        uri: nin,
        type: 'image/jpeg',
        name: 'nin.jpg',
      } as any);
      formData.append('driver_license', {
        uri: driverLicense,
        type: 'image/jpeg',
        name: 'license.jpg',
      } as any);
      formData.append('passport', {
        uri: passport,
        type: 'image/jpeg',
        name: 'passport.jpg',
      } as any);
      formData.append('vehicle_registration', {
        uri: vehicleReg,
        type: 'image/jpeg',
        name: 'vehicle.jpg',
      } as any);

      // Submit to backend for AI verification
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/drivers/verify-documents`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.verification_status === 'approved') {
        Alert.alert(
          'Documents Verified!',
          'Your documents have been approved by our AI verification system. Please complete your profile.',
          [
            {
              text: 'Continue',
              onPress: () => {
                router.push({
                  pathname: '/(auth)/driver-profile',
                  params: {
                    driver_id: params.driver_id || data.driver_id,
                    phone: params.phone,
                    name: params.name,
                    email: params.email,
                  },
                });
              },
            },
          ]
        );
      } else if (data.verification_status === 'pending') {
        Alert.alert(
          'Manual Review Required',
          'Your documents are under review. We\'ll notify you within 24 hours.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(auth)/login'),
            },
          ]
        );
      } else {
        Alert.alert(
          'Verification Failed',
          data.reason || 'Documents could not be verified. Please check and try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Document verification error:', error);
      Alert.alert('Error', 'Could not verify documents. Please try again.');
    } finally {
      setVerifying(false);
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
          <Text style={styles.headerTitle}>Upload Documents</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark" size={48} color={COLORS.accentGreen} />
            <Text style={styles.infoTitle}>AI-Powered Verification</Text>
            <Text style={styles.infoText}>
              Our AI system will automatically verify your documents in seconds. All information is encrypted and secure.
            </Text>
          </View>

          {/* NIN Upload */}
          <TouchableOpacity style={styles.uploadCard} onPress={() => pickImage('nin')}>
            <View style={styles.uploadIcon}>
              <Ionicons name="card" size={32} color={nin ? COLORS.accentGreen : COLORS.lightTextSecondary} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={styles.uploadTitle}>National ID (NIN)</Text>
              <Text style={styles.uploadSubtitle}>
                {nin ? 'Document uploaded ✓' : 'Tap to upload'}
              </Text>
            </View>
            {nin && <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />}
          </TouchableOpacity>

          {/* Driver License Upload */}
          <TouchableOpacity style={styles.uploadCard} onPress={() => pickImage('license')}>
            <View style={styles.uploadIcon}>
              <Ionicons name="car" size={32} color={driverLicense ? COLORS.accentGreen : COLORS.lightTextSecondary} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={styles.uploadTitle}>Driver License</Text>
              <Text style={styles.uploadSubtitle}>
                {driverLicense ? 'Document uploaded ✓' : 'Tap to upload'}
              </Text>
            </View>
            {driverLicense && <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />}
          </TouchableOpacity>

          {/* Passport/ID Photo Upload */}
          <TouchableOpacity style={styles.uploadCard} onPress={() => pickImage('passport')}>
            <View style={styles.uploadIcon}>
              <Ionicons name="person" size={32} color={passport ? COLORS.accentGreen : COLORS.lightTextSecondary} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={styles.uploadTitle}>Passport / ID Photo</Text>
              <Text style={styles.uploadSubtitle}>
                {passport ? 'Document uploaded ✓' : 'Tap to upload'}
              </Text>
            </View>
            {passport && <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />}
          </TouchableOpacity>

          {/* Vehicle Registration Upload */}
          <TouchableOpacity style={styles.uploadCard} onPress={() => pickImage('vehicle')}>
            <View style={styles.uploadIcon}>
              <Ionicons name="document-text" size={32} color={vehicleReg ? COLORS.accentGreen : COLORS.lightTextSecondary} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={styles.uploadTitle}>Vehicle Registration</Text>
              <Text style={styles.uploadSubtitle}>
                {vehicleReg ? 'Document uploaded ✓' : 'Tap to upload'}
              </Text>
            </View>
            {vehicleReg && <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />}
          </TouchableOpacity>

          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={16} color={COLORS.accentGreen} />
            <Text style={styles.securityText}>
              Your documents are encrypted and only used for verification
            </Text>
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={[
              styles.submitButton,
              (!nin || !driverLicense || !passport || !vehicleReg) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmitDocuments}
            disabled={!nin || !driverLicense || !passport || !vehicleReg || verifying}
          >
            <LinearGradient
              colors={(!nin || !driverLicense || !passport || !vehicleReg) 
                ? [COLORS.lightBorder, COLORS.lightBorder] 
                : [COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {verifying ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={[
                  styles.submitText,
                  (!nin || !driverLicense || !passport || !vehicleReg) && styles.submitTextDisabled
                ]}>
                  Submit for Verification
                </Text>
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
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  infoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  uploadIcon: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  uploadInfo: {
    flex: 1,
  },
  uploadTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  uploadSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
  },
  securityText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
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
  submitButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  submitGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  submitText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  submitTextDisabled: {
    color: COLORS.lightTextMuted,
  },
});
