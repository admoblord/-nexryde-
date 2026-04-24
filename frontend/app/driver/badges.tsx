import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL } from '@/src/services/api';

type Badge = {
  icon: string;
  color: string;
  title: string;
  desc: string;
  earned: boolean;
};

const BADGE_DEFINITIONS: Badge[] = [
  { icon: 'star', color: '#FFD700', title: '5-Star Hero', desc: '50+ five-star ratings', earned: false },
  { icon: 'flash', color: '#FF6B6B', title: 'Speed Demon', desc: '100 trips completed', earned: false },
  { icon: 'heart', color: '#FF69B4', title: 'Community Favorite', desc: '20+ repeat riders', earned: false },
  { icon: 'trophy', color: '#FFA500', title: 'Top Earner', desc: 'Top 10% monthly earnings', earned: false },
  { icon: 'shield', color: '#4ECDC4', title: 'Safety Champion', desc: 'Zero incidents 30 days', earned: false },
  { icon: 'ribbon', color: '#9B59B6', title: 'Road Warrior', desc: '500 km in a week', earned: false },
];

export default function BadgesScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [badges, setBadges] = useState<Badge[]>(BADGE_DEFINITIONS);
  const [loading, setLoading] = useState(true);
  const [earnedCount, setEarnedCount] = useState(0);

  useEffect(() => {
    const loadBadges = async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const res = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/certification`);
        const data = await res.json();
        const stats = data?.stats || {};
        const trips = Number(stats.total_trips ?? data?.trips_completed ?? user?.total_trips ?? 0);
        const rating = Number(stats.rating ?? data?.rating ?? user?.rating ?? 0);
        const cancelRate = Number(data?.cancellation_rate ?? 0);

        const computed = BADGE_DEFINITIONS.map(b => {
          let earned = false;
          if (b.title === '5-Star Hero' && rating >= 4.8 && trips >= 50) earned = true;
          if (b.title === 'Speed Demon' && trips >= 100) earned = true;
          if (b.title === 'Safety Champion' && cancelRate < 0.05 && trips >= 20) earned = true;
          if (b.title === 'Road Warrior' && trips >= 200) earned = true;
          return { ...b, earned };
        });
        setBadges(computed);
        setEarnedCount(computed.filter(b => b.earned).length);
      } catch {
        setBadges(BADGE_DEFINITIONS);
      } finally {
        setLoading(false);
      }
    };
    loadBadges();
  }, [user?.id]);

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

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        ) : (
          <ScrollView style={styles.content}>
            <LinearGradient colors={['#22E180', '#1BC770']} style={styles.statsCard}>
              <Text style={styles.statsNumber}>{earnedCount}</Text>
              <Text style={styles.statsLabel}>Badges Earned</Text>
            </LinearGradient>

            <Text style={styles.sectionTitle}>Your Achievements</Text>
            <View style={styles.badgeGrid}>
              {badges.map((badge, index) => (
                <View key={index} style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}>
                  <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                    <Ionicons 
                      name={(badge.earned ? badge.icon : 'lock-closed') as any}
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
                      <Ionicons name="checkmark-circle" size={16} color="#22E180" />
                      <Text style={styles.earnedText}>Earned</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  safeArea: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.gray900 },
  placeholder: { width: 40 },
  content: { flex: 1, padding: 20 },
  statsCard: {
    borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24,
  },
  statsNumber: { fontSize: 48, fontWeight: '900', color: '#FFF' },
  statsLabel: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.gray900, marginBottom: 16 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badgeCard: {
    width: '47%' as any, backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  badgeCardLocked: { opacity: 0.5 },
  badgeIcon: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  badgeTitle: { fontSize: 14, fontWeight: '800', color: COLORS.gray900, textAlign: 'center', marginBottom: 4 },
  badgeTitleLocked: { color: COLORS.gray400 },
  badgeDesc: { fontSize: 12, fontWeight: '600', color: COLORS.gray500, textAlign: 'center' },
  earnedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  earnedText: { fontSize: 12, fontWeight: '700', color: '#059669' },
});
