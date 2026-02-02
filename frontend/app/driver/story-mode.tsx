import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function DriverStoryModeScreen() {
  const router = useRouter();
  const [storyText, setStoryText] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const moods = [
    { id: 'happy', emoji: '😊', label: 'Happy' },
    { id: 'grateful', emoji: '🙏', label: 'Grateful' },
    { id: 'hustle', emoji: '💪', label: 'Hustle Mode' },
    { id: 'tired', emoji: '😴', label: 'Long Day' },
    { id: 'blessed', emoji: '✨', label: 'Blessed' },
  ];

  const stories = [
    {
      id: '1',
      driver: 'Emeka O.',
      avatar: '👨🏾',
      mood: '💪',
      text: 'Started at 5am today. Already done 8 trips! Lagos no dey sleep, we no dey sleep too 🚀',
      time: '2 hours ago',
      likes: 45,
      location: 'Victoria Island',
    },
    {
      id: '2',
      driver: 'Abdul K.',
      avatar: '👳🏾',
      mood: '🙏',
      text: 'Alhamdulillah! Best day this month. Kind rider gave me extra tip for being on time. God dey!',
      time: '4 hours ago',
      likes: 89,
      location: 'Ikeja',
    },
    {
      id: '3',
      driver: 'Chioma N.',
      avatar: '👩🏾',
      mood: '✨',
      text: 'First female driver on the leaderboard this week! 💃 Women can do anything!',
      time: '6 hours ago',
      likes: 156,
      location: 'Lekki',
    },
  ];

  const handlePostStory = () => {
    if (!storyText.trim()) {
      Alert.alert('Empty Story', 'Please write something to share!');
      return;
    }
    Alert.alert(
      '✅ Story Posted!',
      'Your story is now visible to other drivers.',
      [{ text: 'Great!', onPress: () => setStoryText('') }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[COLORS.primary, '#1a1a2e']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Stories</Text>
        <View style={{ width: 44 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Create Story Card */}
        <View style={styles.createCard}>
          <Text style={styles.createTitle}>📝 Share Your Story</Text>
          <Text style={styles.createSubtitle}>Let other drivers know about your day</Text>
          
          <View style={styles.moodSelector}>
            <Text style={styles.moodLabel}>How are you feeling?</Text>
            <View style={styles.moodRow}>
              {moods.map((mood) => (
                <TouchableOpacity
                  key={mood.id}
                  style={[
                    styles.moodButton,
                    selectedMood === mood.id && styles.moodButtonSelected
                  ]}
                  onPress={() => setSelectedMood(mood.id)}
                >
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text style={styles.moodText}>{mood.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TextInput
            style={styles.storyInput}
            placeholder="What's happening on the road today?..."
            placeholderTextColor={COLORS.gray400}
            multiline
            numberOfLines={4}
            value={storyText}
            onChangeText={setStoryText}
          />

          <TouchableOpacity style={styles.postButton} onPress={handlePostStory}>
            <Ionicons name="send" size={20} color={COLORS.white} />
            <Text style={styles.postButtonText}>Post Story</Text>
          </TouchableOpacity>
        </View>

        {/* Stories Feed */}
        <Text style={styles.sectionTitle}>🔥 Trending Stories</Text>

        {stories.map((story) => (
          <View key={story.id} style={styles.storyCard}>
            <View style={styles.storyHeader}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>{story.avatar}</Text>
              </View>
              <View style={styles.storyInfo}>
                <Text style={styles.driverName}>{story.driver} {story.mood}</Text>
                <Text style={styles.storyMeta}>{story.location} • {story.time}</Text>
              </View>
            </View>

            <Text style={styles.storyText}>{story.text}</Text>

            <View style={styles.storyActions}>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="heart-outline" size={20} color={COLORS.error} />
                <Text style={styles.actionText}>{story.likes}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="chatbubble-outline" size={20} color={COLORS.accentBlue} />
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="share-outline" size={20} color={COLORS.accentGreen} />
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  createCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  createTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  createSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextMuted,
    marginBottom: SPACING.md,
  },
  moodSelector: { marginBottom: SPACING.md },
  moodLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.sm,
  },
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  moodButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.gray100,
  },
  moodButtonSelected: {
    backgroundColor: COLORS.accentGreenSoft,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
  },
  moodEmoji: { fontSize: 24 },
  moodText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginTop: 2,
  },
  storyInput: {
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  postButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  storyCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24 },
  storyInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  driverName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  storyMeta: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextMuted,
  },
  storyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  storyActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  actionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
});
