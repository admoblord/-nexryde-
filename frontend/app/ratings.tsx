import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function RatingsScreen() {
  const router = useRouter();
  const ratings = [
    { id: '1', driver: 'Adebayo O.', rating: 5, date: '2 days ago', comment: 'Great driver!' },
    { id: '2', driver: 'Chioma N.', rating: 4, date: '1 week ago', comment: 'Good service' },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Ratings</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>4.8</Text>
              <Text style={styles.statLabel}>Average Rating</Text>
              <View style={styles.stars}>
                {[1,2,3,4,5].map(i => (
                  <Ionicons key={i} name="star" size={16} color="#FFD700" />
                ))}
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ratings.length}</Text>
              <Text style={styles.statLabel}>Total Ratings</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Recent Ratings</Text>
          {ratings.map((rating) => (
            <View key={rating.id} style={styles.ratingCard}>
              <View style={styles.ratingHeader}>
                <Text style={styles.driverName}>{rating.driver}</Text>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={styles.ratingValue}>{rating.rating}.0</Text>
                </View>
              </View>
              <Text style={styles.comment}>{rating.comment}</Text>
              <Text style={styles.date}>{rating.date}</Text>
            </View>
          ))}
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
  placeholder: { width: 40 },
  content: { flex: 1, padding: SPACING.lg },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.xl,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 32, fontWeight: '700', color: COLORS.gray900, marginBottom: 4 },
  statLabel: { fontSize: FONT_SIZE.sm, color: COLORS.gray600, marginBottom: 8 },
  stars: { flexDirection: 'row', gap: 4 },
  statDivider: { width: 1, backgroundColor: COLORS.gray200, marginHorizontal: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900, marginBottom: SPACING.md },
  ratingCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
  },
  ratingHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  driverName: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.gray900 },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF9E6',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  ratingValue: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#FFD700' },
  comment: { fontSize: FONT_SIZE.sm, color: COLORS.gray700, marginBottom: SPACING.xs },
  date: { fontSize: FONT_SIZE.xs, color: COLORS.gray500 },
});