import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import * as ImagePicker from 'expo-image-picker';
import {
  createNexrydeStory,
  formatApiDetail,
  getNexrydeStories,
  getNexrydeStoryGroups,
  likeNexrydeStory,
  markNexrydeStorySeen,
} from '@/src/services/api';

type Story = {
  id: string;
  user_id: string;
  user_name: string;
  user_role: 'rider' | 'driver';
  text: string;
  media_type?: 'text' | 'image' | 'video';
  media_data?: string | null;
  media_url?: string | null;
  duration_ms?: number;
  trip_mood?: string | null;
  story_type?: string;
  likes: number;
  created_at: string;
};

type StoryGroup = {
  user_id: string;
  user_name: string;
  user_role: 'rider' | 'driver';
  latest_story_at: string;
  unseen_count: number;
  total_count: number;
};

const STORY_TYPES = [
  { id: 'moment', label: 'Funny Moment', icon: 'happy-outline' as const },
  { id: 'helpful_driver', label: 'Helpful Driver', icon: 'heart-outline' as const },
  { id: 'good_conversation', label: 'Good Conversation', icon: 'chatbubbles-outline' as const },
  { id: 'road_vibes', label: 'Road Vibes', icon: 'car-outline' as const },
];

export default function NexrydeStoriesScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState('');
  const [storyType, setStoryType] = useState('moment');
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [mediaData, setMediaData] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video'>('text');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStories, setViewerStories] = useState<Story[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerPaused, setViewerPaused] = useState(false);
  const progressRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStories = useCallback(async () => {
    try {
      const [res, groupsRes] = await Promise.all([getNexrydeStories(80), getNexrydeStoryGroups()]);
      setStories(res.data?.stories || []);
      setGroups(groupsRes.data?.groups || []);
    } catch (error) {
      console.log('Failed to load stories:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStories();
  }, [loadStories]);

  const handlePost = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Login required', 'Please sign in to post a story.');
      return;
    }
    if (!mediaData && draft.trim().length < 8) {
      Alert.alert('Story too short', 'Write a short real moment from a trip.');
      return;
    }
    setPosting(true);
    try {
      const res = await createNexrydeStory({
        text: draft.trim(),
        story_type: storyType,
        media_type: mediaType,
        media_data: mediaData || undefined,
      });
      if (res.data?.story) {
        setStories((prev) => [res.data.story, ...prev]);
        setDraft('');
        setMediaData(null);
        setMediaType('text');
        void loadStories();
      }
    } catch (error: any) {
      const detail = formatApiDetail(error?.response?.data?.detail);
      const fallback = error?.message || 'Please try again.';
      Alert.alert('Could not post', detail || fallback);
    } finally {
      setPosting(false);
    }
  }, [draft, storyType, user?.id, mediaData, mediaType, loadStories]);

  const pickStoryMedia = useCallback(async (kind: 'image' | 'video') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'image' ? ['images'] : ['videos'],
      quality: 0.6,
      base64: true,
      videoMaxDuration: 30,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mimePrefix = kind === 'image' ? 'data:image/jpeg;base64,' : 'data:video/mp4;base64,';
    if (!asset.base64) {
      Alert.alert('Media Error', 'Could not prepare selected media.');
      return;
    }
    setMediaData(`${mimePrefix}${asset.base64}`);
    setMediaType(kind);
  }, []);

  const handleLike = useCallback(async (storyId: string) => {
    try {
      await likeNexrydeStory(storyId);
      setStories((prev) => prev.map((story) => (story.id === storyId ? { ...story, likes: story.likes + 1 } : story)));
    } catch (error: any) {
      Alert.alert('Like unavailable', error?.response?.data?.detail || 'You may have already liked this story.');
    }
  }, []);

  const feedTitle = useMemo(
    () => (user?.role === 'driver' ? 'Share road moments riders will love' : 'See real stories from riders and drivers'),
    [user?.role]
  );

  const timeAgo = (value: string) => {
    const diff = Date.now() - new Date(value).getTime();
    const hours = Math.max(0, Math.floor(diff / 3600000));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const openViewerForGroup = useCallback((groupUserId: string) => {
    const bucket = stories
      .filter((s) => s.user_id === groupUserId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (bucket.length === 0) return;
    setViewerStories(bucket);
    setViewerIndex(0);
    setViewerOpen(true);
  }, [stories]);

  useEffect(() => {
    if (!viewerOpen || viewerPaused || viewerStories.length === 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    progressRef.current = 0;
    timerRef.current = setInterval(() => {
      progressRef.current += 0.1;
      if (progressRef.current >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        setViewerIndex((prev) => {
          const next = prev + 1;
          if (next >= viewerStories.length) {
            setViewerOpen(false);
            return prev;
          }
          return next;
        });
      }
    }, 450);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [viewerIndex, viewerOpen, viewerPaused, viewerStories.length]);

  useEffect(() => {
    if (!viewerOpen || viewerStories.length === 0) return;
    const active = viewerStories[viewerIndex];
    if (!active?.id) return;
    void markNexrydeStorySeen(active.id).catch(() => {});
  }, [viewerIndex, viewerOpen, viewerStories]);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#7C3AED', '#4338CA']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Nexryde Stories</Text>
          <Text style={styles.headerSubtitle}>{feedTitle}</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ringsRow}>
            {groups.map((group) => {
              const unseen = group.unseen_count > 0;
              return (
                <TouchableOpacity key={group.user_id} style={styles.ringItem} onPress={() => openViewerForGroup(group.user_id)}>
                  <LinearGradient
                    colors={unseen ? ['#A855F7', '#F43F5E'] : ['#CBD5E1', '#CBD5E1']}
                    style={styles.ringBorder}
                  >
                    <View style={styles.ringInner}>
                      <Ionicons
                        name={group.user_role === 'driver' ? 'car-sport-outline' : 'person-outline'}
                        size={20}
                        color={group.user_role === 'driver' ? '#1D4ED8' : '#7C3AED'}
                      />
                    </View>
                  </LinearGradient>
                  <Text numberOfLines={1} style={styles.ringLabel}>{group.user_name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.composeCard}>
            <Text style={styles.composeTitle}>Share a trip story</Text>
            <Text style={styles.composeHint}>
              Funny moments, helpful drivers, kind riders, or the best conversations on the road.
            </Text>
            <TextInput
              style={styles.composeInput}
              placeholder="What happened on your trip?"
              placeholderTextColor={COLORS.gray400}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={280}
            />
            {mediaData ? (
              <View style={styles.mediaPreview}>
                <Ionicons name={mediaType === 'video' ? 'videocam' : 'image'} size={16} color={COLORS.primary} />
                <Text style={styles.mediaPreviewText}>{mediaType === 'video' ? 'Video attached' : 'Image attached'}</Text>
                <TouchableOpacity onPress={() => { setMediaData(null); setMediaType('text'); }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.gray500} />
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={styles.charCount}>{draft.length}/280</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {STORY_TYPES.map((type) => {
                const active = storyType === type.id;
                return (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setStoryType(type.id)}
                  >
                    <Ionicons name={type.icon} size={16} color={active ? COLORS.white : COLORS.primary} />
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{type.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.mediaActions}>
              <TouchableOpacity style={styles.mediaBtn} onPress={() => pickStoryMedia('image')}>
                <Ionicons name="image-outline" size={16} color={COLORS.primary} />
                <Text style={styles.mediaBtnText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaBtn} onPress={() => pickStoryMedia('video')}>
                <Ionicons name="videocam-outline" size={16} color={COLORS.primary} />
                <Text style={styles.mediaBtnText}>Video</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.postButton} onPress={handlePost} disabled={posting}>
              {posting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={18} color={COLORS.white} />
                  <Text style={styles.postButtonText}>Post Story</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Community Feed</Text>
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : stories.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="book-outline" size={42} color={COLORS.gray400} />
              <Text style={styles.emptyTitle}>No stories yet</Text>
              <Text style={styles.emptyText}>Be the first to share a trip experience.</Text>
            </View>
          ) : (
            stories.map((story) => (
              <View key={story.id} style={styles.storyCard}>
                <View style={styles.storyHeader}>
                  <View style={[styles.avatar, story.user_role === 'driver' ? styles.avatarDriver : styles.avatarRider]}>
                    <Ionicons
                      name={story.user_role === 'driver' ? 'car-sport-outline' : 'person-outline'}
                      size={18}
                      color={story.user_role === 'driver' ? '#1D4ED8' : '#7C3AED'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storyAuthor}>{story.user_name}</Text>
                    <Text style={styles.storyMeta}>
                      {story.user_role === 'driver' ? 'Driver' : 'Rider'} . {timeAgo(story.created_at)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.storyText}>{story.text}</Text>
                {story.media_type === 'image' && (story.media_data || story.media_url) ? (
                  <Image source={{ uri: story.media_data || story.media_url || '' }} style={styles.storyMedia} />
                ) : null}
                {story.media_type === 'video' ? (
                  <View style={styles.storyVideoPlaceholder}>
                    <Ionicons name="videocam" size={18} color={COLORS.primary} />
                    <Text style={styles.storyVideoText}>Video story</Text>
                  </View>
                ) : null}
                <View style={styles.storyFooter}>
                  <View style={styles.storyBadge}>
                    <Text style={styles.storyBadgeText}>
                      {STORY_TYPES.find((type) => type.id === story.story_type)?.label || 'Trip Story'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.likeButton} onPress={() => handleLike(story.id)}>
                    <Ionicons name="heart-outline" size={18} color={COLORS.error} />
                    <Text style={styles.likeText}>{story.likes}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={viewerOpen} animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerRoot}>
          <View style={styles.viewerProgressRow}>
            {viewerStories.map((s, idx) => (
              <View key={s.id} style={styles.viewerProgressTrack}>
                <View style={[styles.viewerProgressFill, idx < viewerIndex ? { width: '100%' } : idx === viewerIndex ? { width: `${Math.round(progressRef.current * 100)}%` } : { width: '0%' }]} />
              </View>
            ))}
          </View>
          {viewerStories[viewerIndex] ? (
            <View style={styles.viewerBody}>
              <Text style={styles.viewerName}>{viewerStories[viewerIndex].user_name}</Text>
              <Text style={styles.viewerText}>{viewerStories[viewerIndex].text || 'Story update'}</Text>
              {viewerStories[viewerIndex].media_type === 'image' && (viewerStories[viewerIndex].media_data || viewerStories[viewerIndex].media_url) ? (
                <Image
                  source={{ uri: viewerStories[viewerIndex].media_data || viewerStories[viewerIndex].media_url || '' }}
                  style={styles.viewerImage}
                  resizeMode="cover"
                />
              ) : null}
              {viewerStories[viewerIndex].media_type === 'video' ? (
                <View style={styles.viewerVideoFake}>
                  <Ionicons name="videocam" size={24} color={COLORS.white} />
                  <Text style={styles.viewerVideoFakeText}>Video story</Text>
                </View>
              ) : null}
              <View style={styles.viewerActions}>
                <TouchableOpacity onPress={() => setViewerPaused((v) => !v)} style={styles.viewerActionBtn}>
                  <Ionicons name={viewerPaused ? 'play' : 'pause'} size={18} color={COLORS.white} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setViewerOpen(false)} style={styles.viewerActionBtn}>
                  <Ionicons name="close" size={18} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={styles.viewerTapZones}>
            <TouchableOpacity
              style={styles.viewerTap}
              onPressIn={() => setViewerPaused(true)}
              onPressOut={() => setViewerPaused(false)}
              onPress={() => setViewerIndex((prev) => Math.max(0, prev - 1))}
            />
            <TouchableOpacity
              style={styles.viewerTap}
              onPressIn={() => setViewerPaused(true)}
              onPressOut={() => setViewerPaused(false)}
              onPress={() =>
                setViewerIndex((prev) => {
                  if (prev + 1 >= viewerStories.length) {
                    setViewerOpen(false);
                    return prev;
                  }
                  return prev + 1;
                })
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.white },
  headerSubtitle: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: 'rgba(255,255,255,0.84)', marginTop: 2 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl * 2 },
  ringsRow: { gap: SPACING.md, marginBottom: SPACING.md, paddingRight: SPACING.md },
  ringItem: { width: 72, alignItems: 'center' },
  ringBorder: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { marginTop: 6, fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.gray700 },
  composeCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg },
  composeTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.gray900 },
  composeHint: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray500, marginTop: 4, lineHeight: 20 },
  composeInput: {
    minHeight: 120,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    padding: SPACING.md,
    color: COLORS.gray900,
    textAlignVertical: 'top',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  charCount: { marginTop: 8, textAlign: 'right', color: COLORS.gray500, fontSize: FONT_SIZE.xs, fontWeight: '700' },
  mediaPreview: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mediaPreviewText: { flex: 1, marginLeft: 8, fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.primary },
  typeRow: { gap: SPACING.sm, marginTop: SPACING.md, paddingRight: SPACING.md },
  mediaActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mediaBtnText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.primary },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
  },
  typeChipActive: { backgroundColor: COLORS.primary },
  typeChipText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.primary },
  typeChipTextActive: { color: COLORS.white },
  postButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  postButtonText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: '800' },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.gray900, marginBottom: SPACING.md },
  emptyCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
  emptyTitle: { marginTop: SPACING.md, fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray900 },
  emptyText: { marginTop: 6, fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray500 },
  storyCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  storyHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarDriver: { backgroundColor: 'rgba(59,130,246,0.14)' },
  avatarRider: { backgroundColor: 'rgba(124,58,237,0.12)' },
  storyAuthor: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray900 },
  storyMeta: { marginTop: 2, fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.gray500 },
  storyText: { marginTop: SPACING.md, fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.gray800, lineHeight: 22 },
  storyMedia: { width: '100%', height: 180, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.sm },
  storyVideoPlaceholder: { marginTop: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.gray100, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm },
  storyVideoText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray700 },
  storyFooter: { marginTop: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storyBadge: { backgroundColor: COLORS.primarySoft, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 6 },
  storyBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.primary },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.gray700 },
  viewerRoot: { flex: 1, backgroundColor: '#0B1020' },
  viewerProgressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: SPACING.md, paddingTop: 52 },
  viewerProgressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: BORDER_RADIUS.full },
  viewerProgressFill: { height: '100%', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.full },
  viewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  viewerName: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.white },
  viewerText: { marginTop: SPACING.sm, fontSize: FONT_SIZE.md, color: 'rgba(255,255,255,0.92)', textAlign: 'center' },
  viewerImage: { marginTop: SPACING.md, width: Dimensions.get('window').width - 40, height: 360, borderRadius: BORDER_RADIUS.lg },
  viewerVideoFake: { marginTop: SPACING.md, width: Dimensions.get('window').width - 40, height: 360, borderRadius: BORDER_RADIUS.lg, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewerVideoFakeText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: '800' },
  viewerActions: { marginTop: SPACING.md, flexDirection: 'row', gap: SPACING.md },
  viewerActionBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  viewerTapZones: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  viewerTap: { flex: 1 },
});
