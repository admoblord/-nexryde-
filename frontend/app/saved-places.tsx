import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface SavedPlace {
  id: string;
  name: string;
  address: string;
  type: 'home' | 'work' | 'favorite';
}

export default function SavedPlacesScreen() {
  const router = useRouter();
  const [places] = useState<SavedPlace[]>([
    { id: '1', name: 'Home', address: '123 Lekki Phase 1, Lagos', type: 'home' },
    { id: '2', name: 'Office', address: '45 Victoria Island, Lagos', type: 'work' },
  ]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'home': return 'home';
      case 'work': return 'briefcase';
      default: return 'location';
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Saved Places</Text>
          <TouchableOpacity style={styles.addButton}>
            <Ionicons name="add" size={24} color={COLORS.accentGreen} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {places.map((place) => (
            <TouchableOpacity key={place.id} style={styles.placeCard}>
              <View style={styles.placeIcon}>
                <Ionicons name={getIcon(place.type)} size={24} color={COLORS.accentGreen} />
              </View>
              <View style={styles.placeInfo}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.placeAddress}>{place.address}</Text>
              </View>
              <TouchableOpacity>
                <Ionicons name="ellipsis-vertical" size={20} color={COLORS.gray500} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity style={styles.addPlaceCard}>
            <Ionicons name="add-circle-outline" size={32} color={COLORS.accentGreen} />
            <Text style={styles.addPlaceText}>Add New Place</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900 },
  addButton: { padding: SPACING.xs },
  content: { flex: 1, padding: SPACING.lg },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  placeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeInfo: { flex: 1 },
  placeName: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.gray900, marginBottom: 4 },
  placeAddress: { fontSize: FONT_SIZE.sm, color: COLORS.gray600 },
  addPlaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    borderStyle: 'dashed',
  },
  addPlaceText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.accentGreen },
});