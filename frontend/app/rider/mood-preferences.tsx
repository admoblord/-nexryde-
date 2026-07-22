import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { getAuthHeaders, BACKEND_URL } from '@/src/services/api';

// ── types ─────────────────────────────────────────────────
type Conv = 'quiet' | 'chatty' | 'any';
type Music = 'on' | 'off' | 'any';
type Temp = 'cold' | 'moderate' | 'any';
type Style = 'smooth' | 'fast' | 'any';

interface MoodState {
  conversation: Conv;
  music: Music;
  temperature: Temp;
  driving_style: Style;
}

// ── constants ─────────────────────────────────────────────
const BG = '#0D1420';
const CARD = '#141E2E';
const BORDER = '#1E2D45';
const GREEN = '#22C55E';
const GREEN_SOFT = 'rgba(34,197,94,0.12)';
const BLUE = '#3B82F6';
const TEXT = '#F1F5F9';
const MUTED = '#64748B';
const YELLOW = '#F59E0B';

interface MoodOption {
  id: string;
  label: string;
  icon: string;
  color: string;
  desc: string;
}

const CONV_OPTIONS: MoodOption[] = [
  { id: 'quiet', label: 'Quiet Ride', icon: 'volume-mute', color: BLUE, desc: 'No talking please' },
  { id: 'chatty', label: 'Chatty Driver', icon: 'chatbubbles', color: GREEN, desc: "Let's talk!" },
  { id: 'any', label: 'No Preference', icon: 'shuffle', color: MUTED, desc: 'Either is fine' },
];

const MUSIC_OPTIONS: MoodOption[] = [
  { id: 'on', label: 'Music On', icon: 'musical-notes', color: YELLOW, desc: 'Play some music' },
  { id: 'off', label: 'Silence', icon: 'musical-notes-outline', color: MUTED, desc: 'Keep it quiet' },
  { id: 'any', label: 'No Preference', icon: 'shuffle', color: MUTED, desc: 'Either works' },
];

const TEMP_OPTIONS: MoodOption[] = [
  { id: 'cold', label: 'AC Must Be Cold', icon: 'snow', color: BLUE, desc: 'Full blast cold' },
  { id: 'moderate', label: 'Moderate', icon: 'partly-sunny', color: YELLOW, desc: 'Comfortable cool' },
  { id: 'any', label: 'No Preference', icon: 'shuffle', color: MUTED, desc: 'Whatever is on' },
];

const STYLE_OPTIONS: MoodOption[] = [
  { id: 'smooth', label: 'Smooth Drive', icon: 'car', color: GREEN, desc: 'Easy and calm' },
  { id: 'fast', label: 'Quick Drive', icon: 'speedometer', color: '#EF4444', desc: 'As fast as safe' },
  { id: 'any', label: 'No Preference', icon: 'shuffle', color: MUTED, desc: 'Driver decides' },
];

const DEFAULT_MOOD: MoodState = {
  conversation: 'any',
  music: 'any',
  temperature: 'any',
  driving_style: 'any',
};

// ── component ─────────────────────────────────────────────
export default function MoodPreferencesScreen() {
  const router = useRouter();
  const { userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const [mood, setMood] = useState<MoodState>(DEFAULT_MOOD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savedAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!riderId || !canCallAuthedApi) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`${BACKEND_URL}/api/users/${riderId}/preferences`, { headers });
        const data = await res.json();
        const saved = data?.ride_mood;
        if (saved) setMood({ ...DEFAULT_MOOD, ...saved });
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, [riderId, canCallAuthedApi]);

  const handleSave = async () => {
    if (!riderId || !canCallAuthedApi) return;
    setSaving(true);
    try {
      await fetch(`${BACKEND_URL}/api/users/${riderId}/preferences`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ride_mood: mood }),
      });
      // show brief "Saved!" animation then go back
      Animated.sequence([
        Animated.timing(savedAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(savedAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => router.back());
    } catch {
      Alert.alert('Error', 'Could not save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasMoodSet = (
    mood.conversation !== 'any' ||
    mood.music !== 'any' ||
    mood.temperature !== 'any' ||
    mood.driving_style !== 'any'
  );

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={GREEN} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[BG, '#0A1628']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={TEXT} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Ride Mood</Text>
            <Text style={styles.headerSub}>Tell the driver how you want the ride to feel</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* Active badge */}
          {hasMoodSet && (
            <View style={styles.activeBadge}>
              <Ionicons name="checkmark-circle" size={16} color={GREEN} />
              <Text style={styles.activeBadgeText}>Your mood is active — drivers will see this</Text>
            </View>
          )}

          <Section
            title="Conversation"
            icon="chatbubble-ellipses"
            options={CONV_OPTIONS}
            selected={mood.conversation}
            onSelect={(v) => setMood(p => ({ ...p, conversation: v as Conv }))}
          />

          <Section
            title="Music"
            icon="musical-notes"
            options={MUSIC_OPTIONS}
            selected={mood.music}
            onSelect={(v) => setMood(p => ({ ...p, music: v as Music }))}
          />

          <Section
            title="Temperature"
            icon="thermometer"
            options={TEMP_OPTIONS}
            selected={mood.temperature}
            onSelect={(v) => setMood(p => ({ ...p, temperature: v as Temp }))}
          />

          <Section
            title="Driving Style"
            icon="car-sport"
            options={STYLE_OPTIONS}
            selected={mood.driving_style}
            onSelect={(v) => setMood(p => ({ ...p, driving_style: v as Style }))}
          />

          {/* Info note */}
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={15} color={MUTED} />
            <Text style={styles.infoText}>
              Only drivers with compatible preferences will be highlighted. Others can still accept your trip.
            </Text>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={styles.saveWrap}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[GREEN, '#16A34A']}
              style={styles.saveGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveText}>Save Preferences</Text>}
            </LinearGradient>
          </TouchableOpacity>

          {/* Reset */}
          <TouchableOpacity
            onPress={() => setMood(DEFAULT_MOOD)}
            style={styles.resetBtn}
          >
            <Text style={styles.resetText}>Reset to No Preference</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Saved toast */}
        <Animated.View
          style={[styles.savedToast, {
            opacity: savedAnim,
            transform: [{ translateY: savedAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }]}
          pointerEvents="none"
        >
          <Ionicons name="checkmark-circle" size={18} color={GREEN} />
          <Text style={styles.savedToastText}>Preferences saved!</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ── Section sub-component ──────────────────────────────────
function Section({
  title, icon, options, selected, onSelect,
}: {
  title: string;
  icon: string;
  options: MoodOption[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={MUTED} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.pillRow}>
        {options.map((opt) => {
          const active = selected === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.pill, active && { borderColor: opt.color, backgroundColor: `${opt.color}18` }]}
              onPress={() => onSelect(opt.id)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={opt.icon as any}
                size={16}
                color={active ? opt.color : MUTED}
                style={{ marginRight: 6 }}
              />
              <View>
                <Text style={[styles.pillLabel, active && { color: opt.color }]}>{opt.label}</Text>
                {active && <Text style={[styles.pillDesc, { color: opt.color }]}>{opt.desc}</Text>}
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={14} color={opt.color} style={{ marginLeft: 'auto' }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  loader: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: TEXT, fontSize: 17, fontWeight: '800' },
  headerSub: { color: MUTED, fontSize: 11, marginTop: 1 },

  scroll: { padding: 20, paddingBottom: 48 },

  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GREEN_SOFT, borderRadius: 10,
    padding: 12, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  activeBadgeText: { color: GREEN, fontSize: 13, fontWeight: '700', flex: 1 },

  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { color: MUTED, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

  pillRow: { gap: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  pillLabel: { color: TEXT, fontSize: 14, fontWeight: '700' },
  pillDesc: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: CARD, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    padding: 12, marginBottom: 24,
  },
  infoText: { color: MUTED, fontSize: 12, lineHeight: 18, flex: 1 },

  saveWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  saveGrad: { paddingVertical: 16, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  resetBtn: { alignItems: 'center', paddingVertical: 10 },
  resetText: { color: MUTED, fontSize: 13, fontWeight: '600' },

  savedToast: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
    borderWidth: 1, borderColor: GREEN_SOFT,
    shadowColor: GREEN, shadowOpacity: 0.2, shadowRadius: 8,
  },
  savedToastText: { color: GREEN, fontSize: 14, fontWeight: '700' },
});
