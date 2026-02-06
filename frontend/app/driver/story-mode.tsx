import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Story {
  _id: string;
  driver_id: string;
  driver_name: string;
  text: string;
  mood: string;
  location: string;
  likes: number;
  created_at: string;
}

const MOODS = [
  { id: 'happy', emoji: '\uD83D\uDE0A', label: 'Happy' },
  { id: 'grateful', emoji: '\uD83D\uDE4F', label: 'Grateful' },
  { id: 'hustle', emoji: '\uD83D\uDCAA', label: 'Hustle' },
  { id: 'tired', emoji: '\uD83D\uDE34', label: 'Long Day' },
  { id: 'blessed', emoji: '\u2728', label: 'Blessed' },
  { id: 'vibes', emoji: '\uD83C\uDFB6', label: 'Good Vibes' },
];

export default function DriverStoryModeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [storyText, setStoryText] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/driver/stories?limit=20`);
      const data = await res.json();
      if (data.success) {
        setStories(data.stories || []);
      }
    } catch (e) {
      console.error('Fetch stories error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStories();
  }, []);

  const postStory = async () => {
    if (!storyText.trim()) {
      Alert.alert('Oops', 'Write something to share with fellow drivers!');
      return;
    }
    if (!selectedMood) {
      Alert.alert('Pick a mood', 'Select how you are feeling today');
      return;
    }

    setPosting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/driver/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: user?.id || 'anonymous',
          text: storyText.trim(),
          mood: selectedMood,
          location: 'Lagos',
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Posted!', 'Your story is now visible to riders and drivers');
        setStoryText('');
        setSelectedMood(null);
        fetchStories(); // Refresh
      }
    } catch (e) {
      Alert.alert('Error', 'Could not post story');
    } finally {
      setPosting(false);
    }
  };

  const likeStory = async (storyId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/driver/stories/${storyId}/like`, {
        method: 'POST',
      });
      // Optimistic update
      setStories((prev) =>
        prev.map((s) => (s._id === storyId ? { ...s, likes: s.likes + 1 } : s))
      );
    } catch (e) {
      console.error('Like error:', e);
    }
  };

  const getMoodEmoji = (mood: string) => {
    const found = MOODS.find((m) => m.id === mood);
    return found?.emoji || '\uD83D\uDE0A';
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    return '1 day ago';
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#7C3AED', '#4F46E5']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Driver Stories</Text>
          <Text style={styles.headerSub}>Share your journey with riders</Text>
        </View>
        <View style={{ width: 44 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Compose Story */}
          <View style={styles.composeCard}>
            <Text style={styles.composeLabel}>What's happening on the road?</Text>
            <TextInput
              style={styles.composeInput}
              placeholder="Share your driving story, tips, or road vibes..."
              placeholderTextColor="#94A3B8"
              value={storyText}
              onChangeText={setStoryText}
              multiline
              maxLength={280}
            />
            <Text style={styles.charCount}>{storyText.length}/280</Text>

            <Text style={styles.moodLabel}>How are you feeling?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodRow}>
              {MOODS.map((mood) => (
                <TouchableOpacity
                  key={mood.id}
                  style={[styles.moodChip, selectedMood === mood.id && styles.moodChipActive]}
                  onPress={() => setSelectedMood(mood.id)}
                >
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text style={[styles.moodText, selectedMood === mood.id && styles.moodTextActive]}>
                    {mood.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.postBtn, (!storyText.trim() || !selectedMood || posting) && styles.postBtnDisabled]}
              onPress={postStory}
              disabled={!storyText.trim() || !selectedMood || posting}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#FFF" />
                  <Text style={styles.postBtnText}>Post Story</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Stories Feed */}
          <Text style={styles.sectionTitle}>
            Latest Stories {stories.length > 0 ? `(${stories.length})` : ''}
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.accentBlue} style={{ marginTop: 40 }} />
          ) : stories.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No stories yet</Text>
              <Text style={styles.emptyText}>Be the first to share your driving story!</Text>
            </View>
          ) : (
            stories.map((story) => (
              <View key={story._id} style={styles.storyCard}>
                <View style={styles.storyHeader}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{getMoodEmoji(story.mood)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storyDriver}>{story.driver_name}</Text>
                    <View style={styles.storyMeta}>
                      <Text style={styles.storyTime}>{getTimeAgo(story.created_at)}</Text>
                      <Text style={styles.storyDot}> {'\u2022'} </Text>
                      <Text style={styles.storyLocation}>{story.location}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.storyText}>{story.text}</Text>
                <View style={styles.storyFooter}>
                  <TouchableOpacity
                    style={styles.likeBtn}
                    onPress={() => likeStory(story._id)}
                  >
                    <Ionicons name="heart-outline" size={20} color="#EF4444" />
                    <Text style={styles.likeCount}>{story.likes}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', textAlign: 'center' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 2 },
  content: { padding: SPACING.lg },
  composeCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: SPACING.lg, marginBottom: SPACING.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  composeLabel: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: SPACING.md },
  composeInput: {
    backgroundColor: '#F1F5F9', borderRadius: 16, padding: SPACING.md, minHeight: 100,
    fontSize: 15, color: '#0F172A', textAlignVertical: 'top', lineHeight: 22,
  },
  charCount: { fontSize: 12, color: '#94A3B8', textAlign: 'right', marginTop: 4, fontWeight: '600' },
  moodLabel: { fontSize: 14, fontWeight: '700', color: '#64748B', marginTop: SPACING.md, marginBottom: 8 },
  moodRow: { gap: 8, paddingBottom: 4 },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#F1F5F9', borderWidth: 2, borderColor: 'transparent',
  },
  moodChipActive: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  moodEmoji: { fontSize: 18 },
  moodText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  moodTextActive: { color: '#7C3AED' },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7C3AED', paddingVertical: 14, borderRadius: 16, marginTop: SPACING.md,
  },
  postBtnDisabled: { backgroundColor: '#CBD5E1' },
  postBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: SPACING.md },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#64748B', marginTop: SPACING.md },
  emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  storyCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: SPACING.lg, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  storyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md,
  },
  avatarText: { fontSize: 24 },
  storyDriver: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  storyMeta: { flexDirection: 'row', alignItems: 'center' },
  storyTime: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  storyDot: { fontSize: 12, color: '#94A3B8' },
  storyLocation: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  storyText: { fontSize: 15, color: '#334155', lineHeight: 22, marginBottom: SPACING.md },
  storyFooter: { flexDirection: 'row', alignItems: 'center' },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  likeCount: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
});
