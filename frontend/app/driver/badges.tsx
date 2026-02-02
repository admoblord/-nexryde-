import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function BadgesScreen() {
  const router = useRouter();
  
  const badges = [
    { icon: 'star', color: '#FFD700', title: '5-Star Hero', desc: '100 five-star ratings', earned: true },
    { icon: 'flash', color: '#FF6B6B', title: 'Speed Demon', desc: '500 trips in 30 days', earned: true },
    { icon: 'heart', color: '#FF69B4', title: 'Community Favorite', desc: '50 repeat riders', earned: false },
    { icon: 'trophy', color: '#FFA500', title: 'Top Earner', desc: 'Top 10% this month', earned: false },
    { icon: 'shield', color: '#4ECDC4', title: 'Safety Champion', desc: 'Zero accidents 6 months', earned: true },
    { icon: 'ribbon', color: '#9B59B6', title: 'Road Warrior', desc: '1000 km in a week', earned: false },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Badges</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          <LinearGradient colors={['#f093fb', '#f5576c']} style={styles.statsCard}>
            <Text style={styles.statsNumber}>3</Text>
            <Text style={styles.statsLabel}>Badges Earned</Text>
          </LinearGradient>

          <Text style={styles.sectionTitle}>Your Achievements</Text>
          <View style={styles.badgeGrid}>
            {badges.map((badge, index) => (
              <TouchableOpacity key={index} style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}>
                <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                  <Ionicons 
                    name={badge.earned ? badge.icon : 'lock-closed'} 
                    size={32} 
                    color={badge.earned ? badge.color : COLORS.gray400} 
                  />
                </View>
                <Text style={[styles.badgeTitle, !badge.earned && styles.badgeTitleLocked]}>
                  {badge.title}
                </Text>
                <Text style={styles.badgeDesc}>{badge.desc}</Text>
                {badge.earned && (
                  <View style={styles.earnedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.accentGreen} />
                    <Text style={styles.earnedText}>Earned</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
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
  content: { flex: 1 },
  statsCard: {
    margin: SPACING.lg,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
  },
  statsNumber: { fontSize: 48, fontWeight: '700', color: COLORS.white },
  statsLabel: { fontSize: FONT_SIZE.md, color: 'rgba(255,255,255,0.9)', marginTop: SPACING.xs },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900, marginHorizontal: SPACING.lg, marginBottom: SPACING.md },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  badgeCard: {
    width: '47%',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  badgeCardLocked: {
    opacity: 0.5,
  },
  badgeIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  badgeTitle: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray900, textAlign: 'center', marginBottom: 4 },
  badgeTitleLocked: { color: COLORS.gray500 },
  badgeDesc: { fontSize: FONT_SIZE.xs, color: COLORS.gray600, textAlign: 'center', marginBottom: SPACING.sm },
  earnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  earnedText: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.accentGreen },
});