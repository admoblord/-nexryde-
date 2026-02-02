import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function AIsuggestions() {
  const router = useRouter();
  
  const suggestions = [
    { icon: 'time', color: '#FF6B6B', title: 'Drive during Peak Hours', desc: '7-9 AM & 5-7 PM for 40% more earnings', impact: '+₦12,000/week' },
    { icon: 'location', color: '#4ECDC4', title: 'Hot Zone Alert', desc: 'Victoria Island has 2x demand right now', impact: '+₦8,000/day' },
    { icon: 'flash', color: '#FFD93D', title: 'Accept Rate Boost', desc: 'Increase from 75% to 90% for bonuses', impact: '+₦5,000/week' },
    { icon: 'car', color: '#6C5CE7', title: 'Vehicle Maintenance', desc: 'Oil change due in 500km', impact: 'Prevent ₦50,000 damage' },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Suggestions</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          <LinearGradient colors={['#667eea', '#764ba2']} style={styles.heroCard}>
            <Ionicons name="bulb" size={48} color="#FFF" />
            <Text style={styles.heroTitle}>Smart Tips for You</Text>
            <Text style={styles.heroSubtitle}>AI-powered insights to boost your earnings</Text>
          </LinearGradient>

          {suggestions.map((suggestion, index) => (
            <TouchableOpacity key={index} style={styles.suggestionCard}>
              <View style={[styles.iconCircle, { backgroundColor: suggestion.color + '20' }]}>
                <Ionicons name={suggestion.icon} size={28} color={suggestion.color} />
              </View>
              <View style={styles.suggestionContent}>
                <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                <Text style={styles.suggestionDesc}>{suggestion.desc}</Text>
                <View style={styles.impactBadge}>
                  <Text style={styles.impactText}>{suggestion.impact}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
            </TouchableOpacity>
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
    backgroundColor: '#667eea',
  },
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  placeholder: { width: 40 },
  content: { flex: 1 },
  heroCard: {
    margin: SPACING.lg,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
  },
  heroTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '700', color: COLORS.white, marginTop: SPACING.md },
  heroSubtitle: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)', marginTop: SPACING.xs },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionContent: { flex: 1 },
  suggestionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.gray900, marginBottom: 4 },
  suggestionDesc: { fontSize: FONT_SIZE.sm, color: COLORS.gray600, marginBottom: SPACING.xs },
  impactBadge: {
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  impactText: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.accentGreen },
});