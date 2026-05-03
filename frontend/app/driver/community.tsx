/**
 * Driver Community — WhatsApp-style group chat, announcements, city channels
 * Dark themed · Fast · Always shows content even when API is offline
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, RefreshControl, Alert,
  KeyboardAvoidingView, Platform, Modal, StatusBar, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

// ─── Types ─────────────────────────────────────────────────────────────────────
type GroupCategory = 'official' | 'city' | 'topic';

interface CGroup {
  group_id: string; name: string; description: string;
  icon: string; color: string; members: number; recent_messages: number;
  is_official?: boolean; category: GroupCategory;
  latest_msg?: string; latest_msg_time?: string; unread?: number;
}

interface Msg {
  _id: string; group_id: string; user_id: string; user_name: string;
  user_role: string; text: string; likes: number; replies: number;
  liked?: boolean; is_pinned?: boolean; parent_id?: string;
  created_at: string; is_announcement?: boolean;
}

interface Poll {
  poll_id: string; group_id: string; user_name: string; question: string;
  options: { text: string; votes: number }[]; total_votes: number;
  is_active: boolean; expires_at: string;
}

// ─── Seed groups — always shown even when API offline ──────────────────────────
const SEED_GROUPS: CGroup[] = [
  // ── Official Channels ───────────────────────────────────────────────────────
  {
    group_id: 'nx_announcements', name: 'Nexryde Announcements', category: 'official',
    description: 'Official updates, new features, policy changes & promotions from the Nexryde team',
    icon: 'megaphone', color: '#7C3AED', members: 4280, recent_messages: 12, is_official: true,
    latest_msg: 'New feature: Floating driver bubble is live 🎉', latest_msg_time: new Date().toISOString(),
  },
  {
    group_id: 'nx_support', name: 'Driver Support', category: 'official',
    description: 'Get help with your account, payments, trips and technical issues',
    icon: 'shield-checkmark', color: '#0EA5E9', members: 3940, recent_messages: 8, is_official: true,
    latest_msg: 'Wallet top-up issues resolved ✅', latest_msg_time: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    group_id: 'nx_tips', name: 'Driver Tips & Safety', category: 'official',
    description: 'Expert tips on earning more, staying safe, and mastering your market',
    icon: 'star', color: '#F59E0B', members: 5100, recent_messages: 31, is_official: true,
    latest_msg: 'Hot tip: Airport runs on Friday evenings 🛫', latest_msg_time: new Date(Date.now() - 1800000).toISOString(),
  },
  // ── Nigerian City Groups ────────────────────────────────────────────────────
  {
    group_id: 'city_lagos', name: 'Lagos Drivers', category: 'city',
    description: 'Ikeja, VI, Lekki, Surulere, Yaba & all of Lagos — share tips, routes, hot spots',
    icon: 'car', color: '#22C55E', members: 8240, recent_messages: 142,
    latest_msg: 'Traffic on Third Mainland crazy rn 😤', latest_msg_time: new Date(Date.now() - 600000).toISOString(),
  },
  {
    group_id: 'city_abuja', name: 'Abuja Drivers', category: 'city',
    description: 'Maitama, Wuse, Garki, Gwarinpa, Jabi & all FCT drivers',
    icon: 'car', color: '#3B82F6', members: 4130, recent_messages: 78,
    latest_msg: 'Airport pickups picking up at Terminal 1', latest_msg_time: new Date(Date.now() - 900000).toISOString(),
  },
  {
    group_id: 'city_ph', name: 'Port Harcourt Drivers', category: 'city',
    description: 'GRA, Rumuola, Aba Road & all Port Harcourt drivers',
    icon: 'car', color: '#EF4444', members: 2860, recent_messages: 55,
    latest_msg: 'Long queue of riders at Garden City Mall', latest_msg_time: new Date(Date.now() - 1200000).toISOString(),
  },
  {
    group_id: 'city_ibadan', name: 'Ibadan Drivers', category: 'city',
    description: 'Challenge, Ring Road, Bodija, UI area & all Ibadan drivers',
    icon: 'car', color: '#F97316', members: 1920, recent_messages: 34,
    latest_msg: 'Friday market surge activated 🔥', latest_msg_time: new Date(Date.now() - 2400000).toISOString(),
  },
  {
    group_id: 'city_benin', name: 'Benin City Drivers', category: 'city',
    description: 'GRA, Sapele Road, Ring Road & all Benin City drivers',
    icon: 'car', color: '#8B5CF6', members: 1250, recent_messages: 19,
    latest_msg: 'New riders signing up this week 📱', latest_msg_time: new Date(Date.now() - 5400000).toISOString(),
  },
  {
    group_id: 'city_kano', name: 'Kano Drivers', category: 'city',
    description: 'Sabon Gari, Nassarawa, BUK area & all Kano drivers',
    icon: 'car', color: '#06B6D4', members: 1840, recent_messages: 27,
    latest_msg: 'Night shift earnings tip shared below 👇', latest_msg_time: new Date(Date.now() - 3200000).toISOString(),
  },
  {
    group_id: 'city_enugu', name: 'Enugu Drivers', category: 'city',
    description: 'Independence Layout, Trans-Ekulu, New Haven & all Enugu drivers',
    icon: 'car', color: '#10B981', members: 890, recent_messages: 14,
    latest_msg: 'ESUT area busy on weekday mornings', latest_msg_time: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    group_id: 'city_owerri', name: 'Owerri Drivers', category: 'city',
    description: 'New Owerri, Ikenegbu, Aladinma & all Owerri drivers',
    icon: 'car', color: '#EC4899', members: 760, recent_messages: 11,
    latest_msg: 'Busy weekend ahead with Oguta road open 🎉', latest_msg_time: new Date(Date.now() - 9000000).toISOString(),
  },
  {
    group_id: 'city_warri', name: 'Warri Drivers', category: 'city',
    description: 'Effurun, Uvwie, Okere & all Warri and Delta State drivers',
    icon: 'car', color: '#F59E0B', members: 680, recent_messages: 8,
    latest_msg: 'Refinery shift change = peak demand! ⛽', latest_msg_time: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    group_id: 'city_asaba', name: 'Asaba Drivers', category: 'city',
    description: 'Okpanam, Summit, Cable Point & all Asaba drivers',
    icon: 'car', color: '#6366F1', members: 520, recent_messages: 6,
    latest_msg: 'Bridge traffic best avoided 7–9am', latest_msg_time: new Date(Date.now() - 12600000).toISOString(),
  },
  {
    group_id: 'city_onitsha', name: 'Onitsha Drivers', category: 'city',
    description: 'Main Market, Fegge, GRA & all Onitsha drivers',
    icon: 'car', color: '#EF4444', members: 610, recent_messages: 9,
    latest_msg: 'Market surge on Monday mornings 🛍️', latest_msg_time: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    group_id: 'city_abeokuta', name: 'Abeokuta Drivers', category: 'city',
    description: 'Panseke, Oke-Ilewo, Ijeun-Titun & all Abeokuta drivers',
    icon: 'car', color: '#84CC16', members: 430, recent_messages: 5,
    latest_msg: 'Olusegun Obasanjo area busy on weekends', latest_msg_time: new Date(Date.now() - 18000000).toISOString(),
  },
  {
    group_id: 'city_abia', name: 'Aba Drivers', category: 'city',
    description: 'Ariaria, Ogbor Hill, Cemetery Road & all Aba drivers',
    icon: 'car', color: '#0EA5E9', members: 390, recent_messages: 4,
    latest_msg: 'Market day = best earnings of the week 💰', latest_msg_time: new Date(Date.now() - 21600000).toISOString(),
  },
  // ── African Cities ──────────────────────────────────────────────────────────
  {
    group_id: 'city_nairobi', name: 'Nairobi Drivers', category: 'city',
    description: 'Westlands, CBD, Kilimani, Karen & all Nairobi drivers',
    icon: 'car', color: '#22C55E', members: 1240, recent_messages: 23,
    latest_msg: 'CBD surge now — jump online! 🚀', latest_msg_time: new Date(Date.now() - 4800000).toISOString(),
  },
  {
    group_id: 'city_accra', name: 'Accra Drivers', category: 'city',
    description: 'Osu, East Legon, Airport Residential & all Accra drivers',
    icon: 'car', color: '#F97316', members: 980, recent_messages: 17,
    latest_msg: 'Airport pickups very active this morning ✈️', latest_msg_time: new Date(Date.now() - 6000000).toISOString(),
  },
  // ── Discussion Topics ───────────────────────────────────────────────────────
  {
    group_id: 'topic_earnings', name: '💰 Earnings & Pay', category: 'topic',
    description: 'Discuss daily earnings, peak hours, surge pricing, best strategies to maximise your income',
    icon: 'cash', color: '#22C55E', members: 6340, recent_messages: 188,
    latest_msg: 'Thursday night is the best time to go online', latest_msg_time: new Date(Date.now() - 300000).toISOString(),
  },
  {
    group_id: 'topic_maintenance', name: '🔧 Vehicle Maintenance', category: 'topic',
    description: 'Affordable mechanics, service tips, fuel saving hacks & what to do when your car breaks down',
    icon: 'build', color: '#EF4444', members: 3120, recent_messages: 67,
    latest_msg: 'Check tyre pressure every 2 weeks — saves fuel', latest_msg_time: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    group_id: 'topic_routes', name: '🛣️ Best Routes & Traffic', category: 'topic',
    description: 'Share smart shortcuts, avoid known traffic black spots, live road condition updates',
    icon: 'map', color: '#3B82F6', members: 4780, recent_messages: 113,
    latest_msg: 'Lagos-Ibadan expressway clear after 9pm', latest_msg_time: new Date(Date.now() - 1500000).toISOString(),
  },
  {
    group_id: 'topic_passengers', name: '😤 Passenger Stories', category: 'topic',
    description: 'Share experiences — the good, the bad, the funny — and how you handled difficult situations',
    icon: 'people', color: '#F59E0B', members: 5200, recent_messages: 241,
    latest_msg: 'Customer gave me a 5-star after helping with luggage 🌟', latest_msg_time: new Date(Date.now() - 1200000).toISOString(),
  },
  {
    group_id: 'topic_ratings', name: '⭐ Ratings & Reviews', category: 'topic',
    description: 'Tips for maintaining a 5-star rating, responding to unfair reviews, what riders want',
    icon: 'star', color: '#FBBF24', members: 2910, recent_messages: 54,
    latest_msg: 'Always greet riders by name — instant 5 star', latest_msg_time: new Date(Date.now() - 4800000).toISOString(),
  },
  {
    group_id: 'topic_appfeatures', name: '📱 App Features & Updates', category: 'topic',
    description: 'Discuss new Nexryde features, report bugs, suggest improvements, share tips',
    icon: 'phone-portrait', color: '#8B5CF6', members: 1870, recent_messages: 38,
    latest_msg: 'The floating bubble feature is amazing! 🎉', latest_msg_time: new Date(Date.now() - 600000).toISOString(),
  },
  {
    group_id: 'topic_food', name: '🍽️ Food & Breaks', category: 'topic',
    description: 'Best affordable restaurants near hotspots, hydration tips, managing long shifts',
    icon: 'restaurant', color: '#F97316', members: 2140, recent_messages: 45,
    latest_msg: 'Bukateria near Murtala airport — highly recommend', latest_msg_time: new Date(Date.now() - 9000000).toISOString(),
  },
  {
    group_id: 'topic_safety', name: '🛡️ Safety First', category: 'topic',
    description: 'Emergency protocols, dangerous zones, self-defence tips, Nexryde Shield feature guide',
    icon: 'shield', color: '#10B981', members: 3470, recent_messages: 76,
    latest_msg: 'Always verify pickup code before starting 🔐', latest_msg_time: new Date(Date.now() - 2400000).toISOString(),
  },
];

// ─── Seed announcements (shown in Announcements channel if API empty) ──────────
const SEED_ANNOUNCEMENTS: Msg[] = [
  {
    _id: 'ann_001', group_id: 'nx_announcements', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '🎉 We just launched the Floating Driver Bubble! When you minimise the app while online, a Nexryde icon floats on your screen — tap it anytime to jump back in. Update your app to get it.',
    likes: 312, replies: 28, is_pinned: true, is_announcement: true,
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    _id: 'ann_002', group_id: 'nx_announcements', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '💰 EARNINGS GUARANTEE UPDATE: As a Nexryde driver you benefit from our anti-surge protection — your base fare is never reduced by algorithm tricks. You always earn at least the suggested fare, no exceptions. This is our commitment to you.',
    likes: 487, replies: 54, is_announcement: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    _id: 'ann_003', group_id: 'nx_announcements', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '🛡️ NEW: Pick-Up Code Security — every trip now generates a unique 4-digit code shown to your rider. Verify it before starting — this protects both of you and keeps ghost trips at zero. No code = no start.',
    likes: 394, replies: 41, is_announcement: true,
    created_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    _id: 'ann_004', group_id: 'nx_announcements', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '📍 TURN-BY-TURN NAVIGATION is now LIVE — Nexryde gives you real Google Directions voice guidance as you drive. "In 200m, turn left onto Adeola Odeku Street." Better than Bolt, built for Nigerian roads. Enable it from the trip screen.',
    likes: 621, replies: 87, is_announcement: true,
    created_at: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    _id: 'ann_005', group_id: 'nx_announcements', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '✅ VERIFIED DRIVER PERKS: All verified drivers now get priority placement in rider searches, a "Verified" badge on their profile, and access to Nexryde Shield emergency features. Complete your verification today.',
    likes: 278, replies: 33, is_announcement: true,
    created_at: new Date(Date.now() - 345600000).toISOString(),
  },
];

// ─── Seed tip messages for Safety channel ─────────────────────────────────────
const SEED_TIPS: Msg[] = [
  {
    _id: 'tip_001', group_id: 'nx_tips', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '🌙 NIGHT SHIFT TIPS: (1) Always confirm the pickup code before unlocking doors. (2) Keep your doors locked until the code is verified. (3) Share your trip with a trusted contact using Nexryde Shield. (4) Trust your instincts — you can cancel if something feels wrong.',
    likes: 445, replies: 62, is_pinned: true,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    _id: 'tip_002', group_id: 'nx_tips', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '💡 5-STAR RATING SECRETS: (1) Greet riders by first name. (2) Ask if they want music or AC preference. (3) Drive smoothly — no sudden braking. (4) Confirm destination before leaving. (5) Offer to help with luggage. Small gestures = consistent 5 stars.',
    likes: 389, replies: 47,
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    _id: 'tip_003', group_id: 'nx_tips', user_id: 'nexryde_admin',
    user_name: 'Nexryde Team', user_role: 'admin',
    text: '⛽ FUEL EFFICIENCY HACK: Drive at 80–90km/h on highways (not 120+). Avoid rapid acceleration. Check tyre pressure weekly — under-inflated tyres increase fuel use by up to 15%. Switch off AC on short trips under 3km. These habits save ₦15,000+ per month.',
    likes: 523, replies: 71,
    created_at: new Date(Date.now() - 10800000).toISOString(),
  },
];

// ─── Seed earnings messages ────────────────────────────────────────────────────
const SEED_EARNINGS_MSGS: Msg[] = [
  {
    _id: 'earn_001', group_id: 'topic_earnings', user_id: 'seed_driver_1',
    user_name: 'Chukwudi O.', user_role: 'driver',
    text: 'Best times to be online in Lagos: 6–9am (morning rush), 12–2pm (lunch), 5–8pm (evening rush), and 10pm–2am (night life). I make 70% of my earnings in those 4 windows. Rest during the slow periods.',
    likes: 234, replies: 18,
    created_at: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    _id: 'earn_002', group_id: 'topic_earnings', user_id: 'seed_driver_2',
    user_name: 'Adaeze N.', user_role: 'driver',
    text: 'Airport strategy: Park at the free waiting area (not the meter zone). Join Nexryde queue. Airport runs pay ₦8,000–₦15,000 depending on destination. One airport run beats 4 city trips. Worth the wait.',
    likes: 312, replies: 27,
    created_at: new Date(Date.now() - 21600000).toISOString(),
  },
  {
    _id: 'earn_003', group_id: 'topic_earnings', user_id: 'seed_driver_3',
    user_name: 'Emeka P.', user_role: 'driver',
    text: 'Pro tip: Set your vehicle to XL or Premium if it qualifies — you get 30–40% more per trip for the same distance. I switched from Economy to SUV category 3 months ago and my weekly earnings went from ₦45k to ₦78k.',
    likes: 418, replies: 52,
    created_at: new Date(Date.now() - 28800000).toISOString(),
  },
];

// ─── Utility ──────────────────────────────────────────────────────────────────
const timeAgo = (d: string) => {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const timeAgoFull = (d: string) => {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
};

const AVATAR_COLORS = ['#7C3AED', '#0EA5E9', '#22C55E', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4'];
const avatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

// ─── Voice note button (UI-ready, haptic) ─────────────────────────────────────
function VoiceBtn({ onSend }: { onSend: (dur: string) => void }) {
  const [recording, setRecording] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!recording) {
      setRecording(true);
      Animated.spring(scale, { toValue: 1.2, useNativeDriver: true }).start();
    } else {
      setRecording(false);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
      onSend('0:04');
    }
  };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[vbs.btn, recording && vbs.recording]}
        onPress={press}
        activeOpacity={0.8}
      >
        <Ionicons name={recording ? 'stop-circle' : 'mic'} size={20} color={recording ? '#EF4444' : '#9CA3AF'} />
      </TouchableOpacity>
    </Animated.View>
  );
}
const vbs = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  recording: { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
});

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DriverCommunityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAppStore();
  const flatRef = useRef<FlatList>(null);

  const [groups, setGroups] = useState<CGroup[]>(SEED_GROUPS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Selected group / chat
  const [selectedGroup, setSelectedGroup] = useState<CGroup | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);

  // Compose
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'polls' | 'pinned'>('chat');

  // Poll creator
  const [showPoll, setShowPoll] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState(['', '']);

  // Main tab
  const [mainTab, setMainTab] = useState<'groups' | 'announcements'>('groups');

  // Merge API groups with seeds (seeds always win if group_id matches)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/community/groups`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.groups) && data.groups.length > 0) {
          // Merge: API groups that aren't already in seeds get added
          const seedIds = new Set(SEED_GROUPS.map(g => g.group_id));
          const newFromApi = (data.groups as CGroup[]).filter(g => !seedIds.has(g.group_id));
          setGroups([...SEED_GROUPS, ...newFromApi]);
        }
      } catch { /* keep seeds */ }
    })();
  }, []);

  const officialGroups = useMemo(() => groups.filter(g => g.category === 'official'), [groups]);
  const cityGroups     = useMemo(() => groups.filter(g => g.category === 'city'), [groups]);
  const topicGroups    = useMemo(() => groups.filter(g => g.category === 'topic'), [groups]);

  // ─── Open group ─────────────────────────────────────────────────────────────
  const openGroup = useCallback(async (group: CGroup) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGroup(group);
    setChatTab('chat');
    setMessages([]);
    setPolls([]);
    setLoadingMsgs(true);

    // Seed data for specific channels
    const seedMap: Record<string, Msg[]> = {
      nx_announcements: SEED_ANNOUNCEMENTS,
      nx_tips: SEED_TIPS,
      topic_earnings: SEED_EARNINGS_MSGS,
    };

    try {
      const [msgRes, pollRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/community/groups/${group.group_id}/messages?limit=60`).catch(() => null),
        fetch(`${BACKEND_URL}/api/community/groups/${group.group_id}/polls`).catch(() => null),
      ]);
      const msgData  = msgRes  ? await msgRes.json().catch(() => ({}))  : {};
      const pollData = pollRes ? await pollRes.json().catch(() => ({})) : {};

      const apiMsgs: Msg[] = msgData.success ? (msgData.messages ?? []) : [];
      const localFallback = seedMap[group.group_id] ?? [];
      setMessages(apiMsgs.length > 0 ? apiMsgs : localFallback);
      setPolls(pollData.success ? (pollData.polls ?? []) : []);
    } catch {
      setMessages(seedMap[group.group_id] ?? []);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const closeGroup = () => {
    setSelectedGroup(null); setMessages([]); setPolls([]);
    setNewMsg(''); setShowPoll(false);
  };

  // ─── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async (txt: string = newMsg) => {
    const text = txt.trim();
    if (!text || !selectedGroup) return;
    setSending(true);
    const optimistic: Msg = {
      _id: `local_${Date.now()}`, group_id: selectedGroup.group_id,
      user_id: user?.id ?? 'me', user_name: user?.name ?? 'You',
      user_role: user?.role ?? 'driver', text, likes: 0, replies: 0,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setNewMsg('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await fetch(`${BACKEND_URL}/api/community/groups/${selectedGroup.group_id}/messages`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id ?? 'anonymous',
          user_name: user?.name ?? 'Anonymous Driver',
          user_role: user?.role ?? 'driver',
          text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m._id === optimistic._id ? data.message : m));
      }
    } catch { /* keep optimistic */ }
    finally { setSending(false); }
  };

  const sendVoiceNote = (duration: string) => {
    void sendMessage(`🎤 Voice note (${duration})`);
  };

  const likeMsg = (id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessages(prev => prev.map(m => m._id === id ? { ...m, likes: m.liked ? m.likes - 1 : m.likes + 1, liked: !m.liked } : m));
    fetch(`${BACKEND_URL}/api/community/messages/${id}/like`, { method: 'POST' }).catch(() => {});
  };

  // ─── Create poll ─────────────────────────────────────────────────────────────
  const createPoll = async () => {
    if (!pollQ.trim() || !selectedGroup) return;
    const opts = pollOpts.filter(o => o.trim());
    if (opts.length < 2) { Alert.alert('Need at least 2 options'); return; }
    try {
      const res = await fetch(`${BACKEND_URL}/api/community/groups/${selectedGroup.group_id}/polls`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, user_name: user?.name, question: pollQ.trim(), options: opts, duration_hours: 24 }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setPolls(prev => [data.poll, ...prev]);
        setShowPoll(false); setPollQ(''); setPollOpts(['', '']);
      }
    } catch { Alert.alert('Error', 'Could not create poll'); }
  };

  const voteOnPoll = async (pid: string, idx: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPolls(prev => prev.map(p => {
      if (p.poll_id !== pid) return p;
      const opts = [...p.options];
      opts[idx] = { ...opts[idx], votes: opts[idx].votes + 1 };
      return { ...p, options: opts, total_votes: p.total_votes + 1 };
    }));
    try {
      await fetch(`${BACKEND_URL}/api/community/polls/${pid}/vote`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, option_index: idx }),
      });
    } catch { }
  };

  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); };

  // ─── Render helpers ──────────────────────────────────────────────────────────
  const renderGroupRow = (group: CGroup, idx: number) => (
    <TouchableOpacity key={group.group_id} style={s.groupRow} onPress={() => openGroup(group)} activeOpacity={0.85}>
      <View style={[s.groupRowIcon, { backgroundColor: group.color + '22' }]}>
        <Ionicons name={(group.icon || 'chatbubbles') as any} size={24} color={group.color} />
        {(group.unread ?? 0) > 0 ? (
          <View style={s.unreadBadge}><Text style={s.unreadText}>{group.unread}</Text></View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.groupRowName} numberOfLines={1}>{group.name}</Text>
          {group.is_official ? <Ionicons name="checkmark-circle" size={14} color="#0EA5E9" /> : null}
        </View>
        {group.latest_msg ? (
          <Text style={s.groupRowLatest} numberOfLines={1}>{group.latest_msg}</Text>
        ) : (
          <Text style={s.groupRowDesc} numberOfLines={1}>{group.description}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {group.latest_msg_time ? (
          <Text style={s.groupRowTime}>{timeAgo(group.latest_msg_time)}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="people-outline" size={11} color="#4B5563" />
          <Text style={s.groupRowMeta}>{group.members >= 1000 ? `${(group.members / 1000).toFixed(1)}k` : group.members}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMsg = ({ item }: { item: Msg }) => {
    const isMe = item.user_id === (user?.id ?? 'me');
    const isAdmin = item.user_role === 'admin';
    const isAnnouncement = item.is_announcement || isAdmin;
    return (
      <View style={[s.msgWrap, isMe && s.msgWrapMe]}>
        {!isMe ? (
          <View style={[s.msgAvatar, { backgroundColor: avatarColor(item.user_name) }]}>
            <Text style={s.msgAvatarTxt}>{item.user_name.charAt(0).toUpperCase()}</Text>
          </View>
        ) : null}
        <View style={[s.msgBubble, isMe ? s.msgBubbleMe : isAnnouncement ? s.msgBubbleAdmin : s.msgBubbleOther, item.is_pinned && s.msgBubblePinned]}>
          {!isMe ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Text style={[s.msgSender, { color: avatarColor(item.user_name) }]}>{item.user_name}</Text>
              {isAdmin ? <View style={s.adminBadge}><Text style={s.adminBadgeTxt}>ADMIN</Text></View> : null}
              {item.is_pinned ? <Ionicons name="pin" size={10} color="#F59E0B" /> : null}
            </View>
          ) : null}
          <Text style={[s.msgText, isMe && s.msgTextMe]}>{item.text}</Text>
          <View style={s.msgMeta}>
            <Text style={[s.msgTime, isMe && { color: 'rgba(255,255,255,0.6)' }]}>{timeAgoFull(item.created_at)}</Text>
            <TouchableOpacity style={s.likeBtn} onPress={() => likeMsg(item._id)}>
              <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={13} color={item.liked ? '#EF4444' : 'rgba(255,255,255,0.4)'} />
              {item.likes > 0 ? <Text style={[s.likeCount, isMe && { color: 'rgba(255,255,255,0.7)' }]}>{item.likes}</Text> : null}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderPoll = (poll: Poll) => {
    const opts = poll.options ?? [];
    const maxV = opts.length ? Math.max(...opts.map(o => o.votes), 1) : 1;
    return (
      <View key={poll.poll_id} style={s.pollCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Ionicons name="stats-chart" size={16} color="#8B5CF6" />
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#8B5CF6', letterSpacing: 1 }}>POLL</Text>
          {poll.is_active ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22C55E' }} /> : null}
          <Text style={{ fontSize: 11, color: '#4B5563', marginLeft: 'auto' }}>by {poll.user_name}</Text>
        </View>
        <Text style={s.pollQ}>{poll.question}</Text>
        {opts.map((opt, i) => {
          const pct = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0;
          const isTop = opt.votes === maxV && poll.total_votes > 0;
          return (
            <TouchableOpacity key={i} style={s.pollOpt} onPress={() => poll.is_active && voteOnPoll(poll.poll_id, i)} disabled={!poll.is_active}>
              <View style={[s.pollBar, { width: `${pct}%`, backgroundColor: isTop ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)' }]} />
              <View style={s.pollOptContent}>
                <Text style={s.pollOptTxt}>{opt.text}</Text>
                <Text style={s.pollOptPct}>{pct}%</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={{ fontSize: 11, color: '#4B5563', marginTop: 6 }}>{poll.total_votes} votes</Text>
      </View>
    );
  };

  // ─── Group Chat Modal ────────────────────────────────────────────────────────
  const chatModal = (
    <Modal visible={!!selectedGroup} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={selectedGroup?.color ?? '#111827'} />

        {/* Chat header */}
        <LinearGradient colors={[selectedGroup?.color ?? '#1e3a8a', '#0D1420']} style={s.chatHeader}>
          <TouchableOpacity style={s.chatBackBtn} onPress={closeGroup}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.chatTitle} numberOfLines={1}>{selectedGroup?.name}</Text>
              {selectedGroup?.is_official ? <Ionicons name="checkmark-circle" size={14} color="rgba(255,255,255,0.8)" /> : null}
            </View>
            <Text style={s.chatSub}>
              {selectedGroup?.members?.toLocaleString()} members · {messages.length} messages
            </Text>
          </View>
          <TouchableOpacity
            style={s.chatRefreshBtn}
            onPress={() => selectedGroup && openGroup(selectedGroup)}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        {/* Chat sub-tabs */}
        <View style={s.chatTabs}>
          {(['chat', 'polls', 'pinned'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.chatTab, chatTab === tab && s.chatTabActive]}
              onPress={() => setChatTab(tab)}
            >
              <Ionicons
                name={tab === 'chat' ? 'chatbubbles' : tab === 'polls' ? 'stats-chart' : 'pin'}
                size={14}
                color={chatTab === tab ? (selectedGroup?.color ?? '#7C3AED') : '#4B5563'}
              />
              <Text style={[s.chatTabTxt, chatTab === tab && { color: selectedGroup?.color ?? '#7C3AED' }]}>
                {tab === 'chat' ? 'Chat' : tab === 'polls' ? `Polls${polls.length ? ` (${polls.length})` : ''}` : 'Pinned'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          {loadingMsgs ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={selectedGroup?.color ?? '#7C3AED'} />
            </View>
          ) : chatTab === 'polls' ? (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <TouchableOpacity style={s.newPollBtn} onPress={() => setShowPoll(true)}>
                <Ionicons name="add-circle" size={18} color="#8B5CF6" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#8B5CF6' }}>Create New Poll</Text>
              </TouchableOpacity>
              {polls.length === 0 ? (
                <View style={s.emptyChat}>
                  <Ionicons name="stats-chart-outline" size={52} color="#374151" />
                  <Text style={s.emptyChatTitle}>No polls yet</Text>
                  <Text style={s.emptyChatSub}>Create the first poll to get opinions!</Text>
                </View>
              ) : polls.map(renderPoll)}
            </ScrollView>
          ) : chatTab === 'pinned' ? (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {messages.filter(m => m.is_pinned).length === 0 ? (
                <View style={s.emptyChat}>
                  <Ionicons name="pin-outline" size={52} color="#374151" />
                  <Text style={s.emptyChatTitle}>No pinned messages</Text>
                  <Text style={s.emptyChatSub}>Important posts will appear here</Text>
                </View>
              ) : messages.filter(m => m.is_pinned).map(item => (
                <View key={item._id}>{renderMsg({ item })}</View>
              ))}
            </ScrollView>
          ) : (
            <>
              {messages.length === 0 ? (
                <View style={s.emptyChat}>
                  <Ionicons name="chatbubbles-outline" size={52} color="#374151" />
                  <Text style={s.emptyChatTitle}>No messages yet</Text>
                  <Text style={s.emptyChatSub}>Be the first to start the conversation!</Text>
                </View>
              ) : (
                <FlatList
                  ref={flatRef}
                  data={messages}
                  keyExtractor={item => item._id}
                  renderItem={renderMsg}
                  contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
                  onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
                  initialNumToRender={20}
                  maxToRenderPerBatch={15}
                  windowSize={10}
                  removeClippedSubviews
                />
              )}

              {/* Input bar */}
              <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                <VoiceBtn onSend={sendVoiceNote} />
                <TextInput
                  style={s.chatInput}
                  placeholder={`Message ${selectedGroup?.name ?? 'group'}…`}
                  placeholderTextColor="#4B5563"
                  value={newMsg}
                  onChangeText={setNewMsg}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[s.sendBtn, newMsg.trim() && { backgroundColor: selectedGroup?.color ?? '#7C3AED' }]}
                  onPress={() => sendMessage()}
                  disabled={!newMsg.trim() || sending}
                >
                  {sending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="send" size={18} color={newMsg.trim() ? '#fff' : '#4B5563'} />
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  // ─── Poll creator modal ──────────────────────────────────────────────────────
  const pollModal = (
    <Modal visible={showPoll} animationType="slide" transparent onRequestClose={() => setShowPoll(false)}>
      <View style={s.modalOverlay}>
        <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={s.modalHandle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <Text style={s.modalTitle}>Create Poll</Text>
            <TouchableOpacity onPress={() => setShowPoll(false)}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <TextInput style={s.modalInput} placeholder="Ask a question…" placeholderTextColor="#4B5563" value={pollQ} onChangeText={setPollQ} />
          {pollOpts.map((opt, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[s.modalInput, { flex: 1 }]} placeholder={`Option ${i + 1}`} placeholderTextColor="#4B5563" value={opt} onChangeText={t => { const a = [...pollOpts]; a[i] = t; setPollOpts(a); }} />
              {i >= 2 ? <TouchableOpacity onPress={() => setPollOpts(pollOpts.filter((_, j) => j !== i))}><Ionicons name="close-circle" size={22} color="#EF4444" /></TouchableOpacity> : null}
            </View>
          ))}
          {pollOpts.length < 6 ? (
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }} onPress={() => setPollOpts([...pollOpts, ''])}>
              <Ionicons name="add-circle-outline" size={18} color="#8B5CF6" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#8B5CF6' }}>Add option</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.pollCreateBtn} onPress={createPoll}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Create Poll</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─── Main screen ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1420" />

      {/* Header */}
      <LinearGradient colors={['#1e3a8a', '#7C3AED']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Driver Community</Text>
          <Text style={s.headerSub}>{groups.length} groups · {groups.reduce((a, g) => a + g.members, 0).toLocaleString()} members</Text>
        </View>
        <View style={{ width: 44 }} />
      </LinearGradient>

      {/* Main tab bar */}
      <View style={s.mainTabs}>
        {(['groups', 'announcements'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[s.mainTab, mainTab === tab && s.mainTabActive]} onPress={() => setMainTab(tab)}>
            <Ionicons name={tab === 'groups' ? 'people' : 'megaphone'} size={16} color={mainTab === tab ? '#7C3AED' : '#4B5563'} />
            <Text style={[s.mainTabTxt, mainTab === tab && s.mainTabTxtActive]}>
              {tab === 'groups' ? 'Groups' : 'Announcements'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
      >
        {mainTab === 'announcements' ? (
          /* ── Announcements feed ── */
          <>
            <View style={s.announceBanner}>
              <LinearGradient colors={['#1e3a8a', '#7C3AED']} style={s.announceBannerInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="megaphone" size={22} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>Official Announcements</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>From the Nexryde Team</Text>
                </View>
              </LinearGradient>
            </View>
            {SEED_ANNOUNCEMENTS.map(ann => (
              <View key={ann._id} style={s.announceCard}>
                {ann.is_pinned ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <Ionicons name="pin" size={12} color="#F59E0B" />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#F59E0B' }}>PINNED</Text>
                  </View>
                ) : null}
                <Text style={s.announceText}>{ann.text}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <Text style={{ fontSize: 11, color: '#4B5563' }}>{timeAgoFull(ann.created_at)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="heart" size={13} color="#EF4444" />
                      <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>{ann.likes}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="chatbubble-outline" size={13} color="#6B7280" />
                      <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>{ann.replies}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </>
        ) : (
          /* ── Groups list ── */
          <>
            {/* Search hint */}
            <TouchableOpacity style={s.searchBar} activeOpacity={0.8}>
              <Ionicons name="search" size={16} color="#4B5563" />
              <Text style={{ fontSize: 14, color: '#4B5563', flex: 1 }}>Search groups…</Text>
            </TouchableOpacity>

            {/* Official Channels */}
            <Text style={s.sectionLabel}>OFFICIAL CHANNELS</Text>
            {officialGroups.map((g, i) => renderGroupRow(g, i))}

            {/* City Groups */}
            <Text style={[s.sectionLabel, { marginTop: 20 }]}>CITY GROUPS</Text>
            <Text style={s.sectionSub}>Chat with drivers in your city — share hot spots, alerts, routes</Text>
            {cityGroups.map((g, i) => renderGroupRow(g, i))}

            {/* Discussion Topics */}
            <Text style={[s.sectionLabel, { marginTop: 20 }]}>DISCUSSION TOPICS</Text>
            <Text style={s.sectionSub}>Discuss earnings, maintenance, passengers, safety & more</Text>
            {topicGroups.map((g, i) => renderGroupRow(g, i))}
          </>
        )}
      </ScrollView>

      {chatModal}
      {pollModal}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const BG = '#0D1420';
const CARD = '#111827';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  mainTabs: { flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  mainTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  mainTabActive: { borderBottomWidth: 2, borderBottomColor: '#7C3AED' },
  mainTabTxt: { fontSize: 14, fontWeight: '700', color: '#4B5563' },
  mainTabTxtActive: { color: '#7C3AED' },

  content: { padding: 16 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CARD, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },

  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#4B5563', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 },
  sectionSub: { fontSize: 12, color: '#374151', marginBottom: 10, marginTop: -2 },

  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 16, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  groupRowIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  unreadBadge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: '#7C3AED', borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  unreadText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  groupRowName: { fontSize: 14, fontWeight: '800', color: '#fff' },
  groupRowLatest: { fontSize: 12, color: '#4B5563', marginTop: 2 },
  groupRowDesc: { fontSize: 12, color: '#4B5563', marginTop: 2 },
  groupRowTime: { fontSize: 11, color: '#374151' },
  groupRowMeta: { fontSize: 11, color: '#374151' },

  // Announcements
  announceBanner: { borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  announceBannerInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  announceCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderLeftWidth: 3, borderLeftColor: '#7C3AED',
  },
  announceText: { fontSize: 14, color: '#CBD5E1', lineHeight: 22 },

  // Chat header
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  chatBackBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  chatTitle: { fontSize: 16, fontWeight: '900', color: '#fff' },
  chatSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  chatRefreshBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  chatTabs: { flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  chatTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  chatTabActive: {},
  chatTabTxt: { fontSize: 12, fontWeight: '700', color: '#4B5563' },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyChatTitle: { fontSize: 16, fontWeight: '800', color: '#374151' },
  emptyChatSub: { fontSize: 13, color: '#1F2937' },

  // Messages
  msgWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
  msgWrapMe: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  msgAvatarTxt: { fontSize: 13, fontWeight: '900', color: '#fff' },
  msgBubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  msgBubbleOther: { backgroundColor: '#1e293b', borderBottomLeftRadius: 4 },
  msgBubbleMe: { backgroundColor: '#1D4ED8', borderBottomRightRadius: 4 },
  msgBubbleAdmin: { backgroundColor: '#2d1b69', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  msgBubblePinned: { borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  msgSender: { fontSize: 12, fontWeight: '800' },
  adminBadge: { backgroundColor: 'rgba(139,92,246,0.2)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  adminBadgeTxt: { fontSize: 9, fontWeight: '900', color: '#8B5CF6' },
  msgText: { fontSize: 14, color: '#CBD5E1', lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  msgTime: { fontSize: 10, color: 'rgba(203,213,225,0.5)' },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeCount: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  chatInput: {
    flex: 1, backgroundColor: '#1e293b', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: '#fff', maxHeight: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center',
  },

  // Polls
  newPollBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 12, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)', borderStyle: 'dashed',
  },
  pollCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#8B5CF6',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  pollQ: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 12, lineHeight: 22 },
  pollOpt: { borderRadius: 10, marginBottom: 6, overflow: 'hidden', backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  pollBar: { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 10 },
  pollOptContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  pollOptTxt: { fontSize: 13, fontWeight: '600', color: '#CBD5E1' },
  pollOptPct: { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#111827', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  modalInput: { backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#fff', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pollCreateBtn: { backgroundColor: '#8B5CF6', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
});
