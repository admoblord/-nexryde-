import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function CarTypePreferenceScreen() {
  const router = useRouter();
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['standard']);

  const carTypes = [
    {
      id: 'standard',
      name: 'Standard',
      icon: 'car',
      description: 'Affordable rides for everyone',
      baseFare: '₦500',
      perKm: '₦100',
      features: ['Sedans', 'Hatchbacks', '4 seats'],
      color: COLORS.accentBlue,
      popular: true,
    },
    {
      id: 'comfort',
      name: 'Comfort',
      icon: 'car-sport',
      description: 'Extra space and comfort',
      baseFare: '₦800',
      perKm: '₦150',
      features: ['SUVs', 'Large sedans', 'Spacious'],
      color: COLORS.accentGreen,
      popular: false,
    },
    {
      id: 'premium',
      name: 'Premium',
      icon: 'diamond',
      description: 'Luxury vehicles for special occasions',
      baseFare: '₦1,500',
      perKm: '₦250',
      features: ['Mercedes', 'BMW', 'Audi', 'Luxury'],
      color: COLORS.accentOrange,
      popular: false,
    },
    {
      id: 'xl',
      name: 'NexRyde XL',
      icon: 'people',
      description: 'For groups up to 6 people',
      baseFare: '₦1,000',
      perKm: '₦180',
      features: ['6-7 seats', 'SUVs', 'Group rides'],
      color: COLORS.accentPurple,
      popular: false,
    },
  ];

  const toggleCarType = (id: string) => {
    if (selectedTypes.includes(id)) {
      setSelectedTypes(selectedTypes.filter(t => t !== id));
    } else {
      setSelectedTypes([...selectedTypes, id]);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Ionicons name="car-sport" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Car Type Preference</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={COLORS.accentBlue} />
            <Text style={styles.infoText}>
              Select your preferred car types. You can choose multiple options.
            </Text>
          </View>

          {carTypes.map((type) => {
            const isSelected = selectedTypes.includes(type.id);
            return (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.carTypeCard,
                  isSelected && styles.carTypeCardSelected,
                ]}
                onPress={() => toggleCarType(type.id)}
              >
                {type.popular && (
                  <View style={styles.popularBadge}>
                    <Ionicons name="star" size={12} color={COLORS.white} />
                    <Text style={styles.popularText}>POPULAR</Text>
                  </View>
                )}

                <View style={styles.carTypeHeader}>
                  <View style={[styles.carTypeIcon, { backgroundColor: type.color }]}>
                    <Ionicons name={type.icon as any} size={32} color={COLORS.white} />
                  </View>
                  <View style={styles.carTypeInfo}>
                    <Text style={styles.carTypeName}>{type.name}</Text>
                    <Text style={styles.carTypeDescription}>{type.description}</Text>
                  </View>
                  <View style={[
                    styles.checkbox,
                    isSelected && styles.checkboxSelected,
                    { borderColor: type.color, backgroundColor: isSelected ? type.color : 'transparent' }
                  ]}>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={COLORS.white} />
                    )}
                  </View>
                </View>

                <View style={styles.pricingRow}>
                  <View style={styles.pricingItem}>
                    <Text style={styles.pricingLabel}>Base Fare</Text>
                    <Text style={styles.pricingValue}>{type.baseFare}</Text>
                  </View>
                  <View style={styles.pricingSeparator} />
                  <View style={styles.pricingItem}>
                    <Text style={styles.pricingLabel}>Per KM</Text>
                    <Text style={styles.pricingValue}>{type.perKm}</Text>
                  </View>
                </View>

                <View style={styles.featuresRow}>
                  {type.features.map((feature, index) => (
                    <View key={index} style={styles.featureTag}>
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={styles.saveButton}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
              style={styles.saveButtonGradient}
            >
              <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
              <Text style={styles.saveButtonText}>Save Preferences</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
    lineHeight: 20,
  },
  carTypeCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  carTypeCardSelected: {
    borderColor: COLORS.accentGreen,
  },
  popularBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentOrange,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  popularText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  carTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  carTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  carTypeInfo: {
    flex: 1,
  },
  carTypeName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  carTypeDescription: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderWidth: 0,
  },
  pricingRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  pricingItem: {
    flex: 1,
    alignItems: 'center',
  },
  pricingSeparator: {
    width: 1,
    backgroundColor: COLORS.lightBorder,
  },
  pricingLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pricingValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#0F172A',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  featureTag: {
    backgroundColor: COLORS.lightSurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  featureText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#334155',
  },
  saveButton: {
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  saveButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
});
