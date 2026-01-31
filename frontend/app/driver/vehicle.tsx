import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Card, Button } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { getDriverProfile, updateDriverProfile } from '@/src/services/api';

export default function VehicleScreen() {
  const router = useRouter();
  const { user, driverProfile, setDriverProfile } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (!user?.id) return;
    try {
      const response = await getDriverProfile(user.id);
      setDriverProfile(response.data);
      setVehicleType(response.data.vehicle_type || '');
      setVehicleModel(response.data.vehicle_model || '');
      setVehiclePlate(response.data.vehicle_plate || '');
    } catch (error) {
      console.log('Error loading profile:', error);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await updateDriverProfile(user.id, {
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel,
        vehicle_plate: vehiclePlate,
      });
      setDriverProfile(response.data);
      Alert.alert('Success', 'Vehicle details updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const vehicleTypes = ['Sedan', 'SUV', 'Hatchback', 'Minivan', 'Motorcycle'];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Vehicle Details</Text>
        </View>

        {/* Vehicle Type */}
        <Text style={styles.label}>Vehicle Type</Text>
        <View style={styles.typeContainer}>
          {vehicleTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeOption,
                vehicleType === type && styles.typeOptionSelected
              ]}
              onPress={() => setVehicleType(type)}
            >
              <Text style={[
                styles.typeText,
                vehicleType === type && styles.typeTextSelected
              ]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Vehicle Model */}
        <Text style={styles.label}>Vehicle Model</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Toyota Corolla 2020"
          placeholderTextColor={COLORS.gray400}
          value={vehicleModel}
          onChangeText={setVehicleModel}
        />

        {/* Plate Number */}
        <Text style={styles.label}>Plate Number</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., ABC 123 XY"
          placeholderTextColor={COLORS.gray400}
          value={vehiclePlate}
          onChangeText={setVehiclePlate}
          autoCapitalize="characters"
        />

        {/* Verification Status */}
        <Card style={styles.verificationCard}>
          <Text style={styles.verificationTitle}>Document Verification</Text>
          
          <View style={styles.verificationItem}>
            <Ionicons 
              name={driverProfile?.license_uploaded ? 'checkmark-circle' : 'alert-circle'} 
              size={24} 
              color={driverProfile?.license_uploaded ? COLORS.success : COLORS.warning} 
            />
            <View style={styles.verificationInfo}>
              <Text style={styles.verificationLabel}>Driver's License</Text>
              <Text style={styles.verificationStatus}>
                {driverProfile?.license_uploaded ? 'Uploaded' : 'Not uploaded'}
              </Text>
            </View>
          </View>

          <View style={styles.verificationItem}>
            <Ionicons 
              name={driverProfile?.vehicle_docs_uploaded ? 'checkmark-circle' : 'alert-circle'} 
              size={24} 
              color={driverProfile?.vehicle_docs_uploaded ? COLORS.success : COLORS.warning} 
            />
            <View style={styles.verificationInfo}>
              <Text style={styles.verificationLabel}>Vehicle Documents</Text>
              <Text style={styles.verificationStatus}>
                {driverProfile?.vehicle_docs_uploaded ? 'Uploaded' : 'Not uploaded'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.uploadButton}>
            <Ionicons name="cloud-upload" size={20} color={COLORS.primary} />
            <Text style={styles.uploadButtonText}>Upload Documents</Text>
          </TouchableOpacity>
        </Card>

        <Button
          title={loading ? 'Saving...' : 'Save Changes'}
          onPress={handleSave}
          loading={loading}
          disabled={!vehicleType || !vehicleModel || !vehiclePlate}
          style={styles.saveButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  typeOption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  typeOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeText: {
    fontSize: FONT_SIZE.sm,
    color: '#0F172A',
    fontWeight: '700',
  },
  typeTextSelected: {
    color: COLORS.white,
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
  verificationCard: {
    marginBottom: SPACING.lg,
  },
  verificationTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.md,
    letterSpacing: -0.5,
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  verificationInfo: {
    marginLeft: SPACING.md,
  },
  verificationLabel: {
    fontSize: FONT_SIZE.md,
    color: '#0F172A',
    fontWeight: '700',
  },
  verificationStatus: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    fontWeight: '700',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    marginTop: SPACING.sm,
  },
  uploadButtonText: {
    marginLeft: SPACING.sm,
    color: COLORS.primary,
    fontWeight: '700',
  },
  saveButton: {
    marginTop: 'auto',
  },
});
