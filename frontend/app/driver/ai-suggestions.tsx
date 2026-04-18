import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

export default function AISuggestions() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      if (!user?.id) return;
      
      const response = await fetch(
        `${BACKEND_URL}/api/ai/coach/get-suggestions`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ driver_id: user.id }),
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.suggestions) {
          setSuggestions(data.suggestions);
        }
      }
    } catch (error) {
      console.error('Failed to load AI suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSuggestions();
  };

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

        <ScrollView 
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#667eea']} />
          }
        >
          <LinearGradient colors={['#667eea', '#764ba2']} style={styles.heroCard}>
            <Ionicons name="bulb" size={48} color="#FFF" />
            <Text style={styles.heroTitle}>AI Coach</Text>
            <Text style={styles.heroSubtitle}>Personalized tips powered by ChatGPT</Text>
          </LinearGradient>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={styles.loadingText}>Analyzing your performance...</Text>
            </View>
          ) : (
            suggestions.map((suggestion, index) => (
              <TouchableOpacity key={index} style={styles.suggestionCard}>
                <View style={[styles.iconCircle, { backgroundColor: suggestion.color + '20' }]}>
                  <Ionicons name={suggestion.icon} size={28} color={suggestion.color} />
                </View>
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                  <Text style={styles.suggestionDesc}>{suggestion.description}</Text>
                  <View style={styles.impactBadge}>
                    <Text style={styles.impactText}>{suggestion.impact}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
              </TouchableOpacity>
            ))
          )}
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
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    textAlign: 'center',
  },
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