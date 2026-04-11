import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function CarTypePreferenceScreen() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState('economy');

  const carTypes = [
    { id: 'economy', name: 'Standard', description: 'Affordable everyday rides', icon: 'car', price: 'Best value' },
    { id: 'comfort', name: 'Comfort', description: 'Spacious & comfortable', icon: 'car-sport', price: 'More space' },
    { id: 'premium', name: 'Premium', description: 'Luxury vehicles', icon: 'car-sport-outline', price: 'VIP experience' },
    { id: 'xl', name: 'XL', description: 'For groups (6+ seats)', icon: 'bus', price: '6+ passengers' },
    { id: 'female_only', name: 'Women Only', description: 'Female drivers for female riders', icon: 'woman', price: 'Safe rides' },
  ];

  const handleSave = () => {
    Alert.alert('Saved', `Your default ride type is now set to ${carTypes.find(c => c.id === selectedType)?.name}`);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride Preferences</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Select Default Ride Type</Text>
        <Text style={styles.sectionSubtext}>
          This will be your default selection when booking rides
        </Text>

        {carTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeCard,
              selectedType === type.id && styles.typeCardSelected
            ]}
            onPress={() => setSelectedType(type.id)}
          >
            <View style={[
              styles.typeIcon,
              selectedType === type.id && styles.typeIconSelected
            ]}>
              <Ionicons 
                name={type.icon as any} 
                size={28} 
                color={selectedType === type.id ? COLORS.white : COLORS.primary} 
              />
            </View>
            <View style={styles.typeInfo}>
              <Text style={styles.typeName}>{type.name}</Text>
              <Text style={styles.typeDesc}>{type.description}</Text>
              <Text style={styles.typePrice}>{type.price}</Text>
            </View>
            <View style={[
              styles.radioOuter,
              selectedType === type.id && styles.radioOuterSelected
            ]}>
              {selectedType === type.id && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Preference</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  content: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.xs,
  },
  sectionSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    marginBottom: SPACING.lg,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.gray100,
    ...SHADOWS.sm,
  },
  typeCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  typeIcon: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconSelected: {
    backgroundColor: COLORS.primary,
  },
  typeInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  typeName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  typeDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    marginTop: 2,
  },
  typePrice: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  saveButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
