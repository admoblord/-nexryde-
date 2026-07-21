/**
 * NEXRYDE Prayer Times & Daily Readings
 * Beautiful Islamic companion screen for drivers.
 * Opens instantly from cache, refreshes in background.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Linking,
  Animated,
  Easing,
  RefreshControl,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { usePrayerTimes, Mosque } from '@/src/services/prayerTimes';

// ── Islamic content ──────────────────────────────────────────────────────────

const QURAN_VERSES = [
  { arabic: 'وَأَقِيمُوا الصَّلَاةَ وَآتُوا الزَّكَاةَ وَارْكَعُوا مَعَ الرَّاكِعِينَ', translation: 'Establish prayer, give zakah, and bow with those who bow.', ref: 'Al-Baqarah 2:43' },
  { arabic: 'إِنَّ الصَّلَاةَ تَنْهَى عَنِ الْفَحْشَاءِ وَالْمُنكَرِ', translation: 'Indeed, prayer prohibits immorality and wrongdoing.', ref: 'Al-Ankabut 29:45' },
  { arabic: 'وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ', translation: 'Seek help through patience and prayer.', ref: 'Al-Baqarah 2:45' },
  { arabic: 'فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ', translation: 'So remember Me; I will remember you. Be grateful to Me and do not deny Me.', ref: 'Al-Baqarah 2:152' },
  { arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', translation: 'Indeed, with hardship will be ease.', ref: 'Ash-Sharh 94:6' },
  { arabic: 'وَعَلَى اللَّهِ فَتَوَكَّلُوا إِن كُنتُم مُّؤْمِنِينَ', translation: 'And upon Allah rely, if you are believers.', ref: 'Al-Ma\'idah 5:23' },
  { arabic: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً', translation: 'Our Lord, give us in this world good and in the hereafter good.', ref: 'Al-Baqarah 2:201' },
  { arabic: 'وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا', translation: 'And whoever fears Allah — He will make for him a way out.', ref: 'At-Talaq 65:2' },
  { arabic: 'وَلَا تَيْأَسُوا مِن رَّوْحِ اللَّهِ', translation: 'And do not despair of relief from Allah.', ref: 'Yusuf 12:87' },
  { arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', translation: 'Allah is sufficient for us, and He is the best disposer of affairs.', ref: 'Aal-Imran 3:173' },
];

const HADITH_OF_DAY = [
  { text: '"The best of you are those who learn the Quran and teach it."', source: 'Bukhari' },
  { text: '"Whoever believes in Allah and the Last Day should speak good or keep silent."', source: 'Bukhari & Muslim' },
  { text: '"A smile on your brother\'s face is an act of charity."', source: 'Tirmidhi' },
  { text: '"The strong person is not the one who can overpower others; rather, the strong person is one who controls himself when he is angry."', source: 'Bukhari & Muslim' },
  { text: '"Make things easy, do not make them difficult. Give glad tidings and do not drive people away."', source: 'Bukhari' },
  { text: '"The most beloved deeds to Allah are those done consistently, even if they are small."', source: 'Bukhari & Muslim' },
  { text: '"Whoever removes a worldly grief from a believer, Allah will remove one of the griefs of the Day of Resurrection from him."', source: 'Muslim' },
  { text: '"Feed the hungry, visit the sick, and free the captive."', source: 'Bukhari' },
  { text: '"Cleanliness is half of faith."', source: 'Muslim' },
  { text: '"Every act of goodness is charity."', source: 'Muslim' },
];

const MORNING_ADHKAR = [
  { arabic: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ', transliteration: 'Asbahna wa asbahal mulku lillah', translation: 'We have reached the morning, and the entire dominion belongs to Allah.', count: 1 },
  { arabic: 'اللَّهُمَّ بِكَ أَصْبَحْنَا', transliteration: 'Allahumma bika asbahna', translation: 'O Allah, by You we have reached the morning.', count: 1 },
  { arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', transliteration: 'SubhanAllahi wa bihamdih', translation: 'Glory be to Allah and praise be to Him.', count: 100 },
  { arabic: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ', transliteration: 'La ilaha illallahu wahdahu la sharika lah', translation: 'There is no god but Allah, alone, with no partner.', count: 10 },
  { arabic: 'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ وَأَتُوبُ إِلَيْهِ', transliteration: 'Astaghfirullah al-Azeem wa atubu ilaih', translation: 'I seek forgiveness from Allah the Great and repent to Him.', count: 3 },
];

const EVENING_ADHKAR = [
  { arabic: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ', transliteration: 'Amsayna wa amsal mulku lillah', translation: 'We have reached the evening, and the entire dominion belongs to Allah.', count: 1 },
  { arabic: 'اللَّهُمَّ بِكَ أَمْسَيْنَا', transliteration: 'Allahumma bika amsayna', translation: 'O Allah, by You we have reached the evening.', count: 1 },
  { arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', transliteration: 'SubhanAllahi wa bihamdih', translation: 'Glory be to Allah and praise be to Him.', count: 100 },
  { arabic: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', transliteration: "A'udhu bikalimatihi tammat min sharri ma khalaq", translation: 'I seek refuge in the perfect words of Allah from the evil of what He created.', count: 3 },
  { arabic: 'حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ', transliteration: 'Hasbiyallahu la ilaha illa huwa alayhi tawakkaltu', translation: 'Allah is sufficient for me; there is no god but Him. Upon Him I rely.', count: 7 },
];

const DRIVER_DUAS = [
  { title: 'Dua Before Driving', arabic: 'بِسْمِ اللَّهِ، تَوَكَّلْتُ عَلَى اللَّهِ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', transliteration: 'Bismillah, tawakkaltu alallah, wa la hawla wa la quwwata illa billah', translation: 'In the name of Allah, I rely on Allah, and there is no might or power except with Allah.' },
  { title: 'For Safe Journey', arabic: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ', transliteration: "SubHanaladhi sakhkhara lana hadha wa ma kunna lahu muqrinin", translation: 'Glory be to the One who has subjected this to us, for we could not have done it by ourselves.' },
  { title: 'For Rizq (Sustenance)', arabic: 'اللَّهُمَّ ارْزُقْنِي رِزْقًا حَلَالًا طَيِّبًا', transliteration: 'Allahumma urzuqni rizqan halalan tayyiban', translation: 'O Allah, provide me with lawful and wholesome sustenance.' },
  { title: 'For Protection', arabic: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ', transliteration: 'Bismillahilladhi la yadurru ma asmihi shay', translation: 'In the name of Allah with whose name nothing can cause harm.' },
];

// ── Prayer config ────────────────────────────────────────────────────────────

const PRAYER_META: Record<string, { color: string; gradient: [string, string]; icon: string; period: string }> = {
  Fajr:    { color: '#60A5FA', gradient: ['#1e3a8a', '#1e40af'], icon: 'sunny-outline',   period: 'Dawn' },
  Dhuhr:   { color: '#FCD34D', gradient: ['#78350f', '#92400e'], icon: 'sunny',            period: 'Midday' },
  Asr:     { color: '#FB923C', gradient: ['#7c2d12', '#9a3412'], icon: 'partly-sunny',     period: 'Afternoon' },
  Maghrib: { color: '#F87171', gradient: ['#7f1d1d', '#991b1b'], icon: 'moon-outline',     period: 'Sunset' },
  Isha:    { color: '#C084FC', gradient: ['#3b0764', '#4c1d95'], icon: 'moon',             period: 'Night' },
};

const PRAYER_ARABIC: Record<string, { arabic: string; hausa: string }> = {
  Fajr:    { arabic: 'الفجر',  hausa: 'Asuba' },
  Dhuhr:   { arabic: 'الظهر',  hausa: 'Azahar' },
  Asr:     { arabic: 'العصر',  hausa: "La'asar" },
  Maghrib: { arabic: 'المغرب', hausa: 'Magariba' },
  Isha:    { arabic: 'العشاء', hausa: "Isha'i" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function msToCountdown(ms: number): string {
  if (ms <= 0) return '0:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getDayIndex(): number {
  return Math.floor(Date.now() / 86400000);
}

// ── Tasbih Counter ───────────────────────────────────────────────────────────

function TasbihCounter() {
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState(33);
  const [label, setLabel] = useState('SubhanAllah');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  const PRESETS = [
    { label: 'SubhanAllah', arabic: 'سُبْحَانَ اللَّهِ', target: 33 },
    { label: 'Alhamdulillah', arabic: 'الْحَمْدُ لِلَّهِ', target: 33 },
    { label: 'Allahu Akbar', arabic: 'اللَّهُ أَكْبَرُ', target: 34 },
    { label: 'Astaghfirullah', arabic: 'أَسْتَغْفِرُ اللَّهَ', target: 100 },
  ];

  const current = PRESETS.find(p => p.label === label) || PRESETS[0];

  const tap = () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 60, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.back(3)) }),
    ]).start();
    setCount(prev => {
      const next = prev + 1;
      if (next === target) {
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.timing(ringAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start(() => {
          ringAnim.setValue(0);
        });
      }
      return next;
    });
  };

  const progress = Math.min(count / target, 1);
  const circumference = 2 * Math.PI * 70;

  return (
    <View style={ts.tasbihWrap}>
      {/* Preset selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.label}
            style={[ts.presetChip, label === p.label && ts.presetChipActive]}
            onPress={() => { setLabel(p.label); setTarget(p.target); setCount(0); }}
          >
            <Text style={[ts.presetText, label === p.label && ts.presetTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Arabic */}
      <Text style={ts.tasbihArabic}>{current.arabic}</Text>
      <Text style={ts.tasbihTarget}>Target: {target}</Text>

      {/* Big tap button */}
      <View style={ts.tasbihCircleWrap}>
        {/* Progress ring (SVG-free approximation with border) */}
        <View style={[ts.tasbihRing, { borderColor: `rgba(167,139,250,${0.15 + progress * 0.6})` }]} />
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity onPress={tap} activeOpacity={1}>
            <LinearGradient colors={['#4c1d95', '#7c3aed']} style={ts.tasbihBtn}>
              <Text style={ts.tasbihCount}>{count}</Text>
              <Text style={ts.tasbihCountLabel}>/ {target}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Text style={ts.tasbihHint}>Tap the circle to count</Text>

      <TouchableOpacity style={ts.resetBtn} onPress={() => setCount(0)}>
        <Ionicons name="refresh" size={14} color="#7c3aed" />
        <Text style={ts.resetText}>Reset</Text>
      </TouchableOpacity>

      {/* Dhikr list */}
      <Text style={ts.sectionLabel}>Morning Adhkar</Text>
      {MORNING_ADHKAR.map((a, i) => (
        <AdhkarCard key={i} item={a} />
      ))}
      <Text style={[ts.sectionLabel, { marginTop: 16 }]}>Evening Adhkar</Text>
      {EVENING_ADHKAR.map((a, i) => (
        <AdhkarCard key={i} item={a} />
      ))}
    </View>
  );
}

function AdhkarCard({ item }: { item: typeof MORNING_ADHKAR[0] }) {
  const [done, setDone] = useState(false);
  return (
    <TouchableOpacity
      style={[ts.adhkarCard, done && ts.adhkarDone]}
      onPress={() => setDone(d => !d)}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={ts.adhkarArabic}>{item.arabic}</Text>
        <Text style={ts.adhkarTrans}>{item.transliteration}</Text>
        <Text style={ts.adhkarMeaning}>{item.translation}</Text>
      </View>
      <View style={[ts.adhkarCount, done && ts.adhkarCountDone]}>
        {done
          ? <Ionicons name="checkmark" size={16} color="#22c55e" />
          : <Text style={ts.adhkarCountText}>×{item.count}</Text>
        }
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

const TABS = ['Today', 'Reading', 'Dhikr', 'Settings'] as const;
type TabType = typeof TABS[number];

export default function PrayerTimesScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabType>('Today');
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const tabAnim = useRef(new Animated.Value(0)).current;

  const { prayerTimes, settings, nearbyMosques, isPraying, loading, saveSettings, fetchPrayerTimes, findNearbyMosques } = usePrayerTimes();

  // Live clock for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPrayerTimes();
    await findNearbyMosques();
    setRefreshing(false);
  }, [fetchPrayerTimes, findNearbyMosques]);

  const switchTab = (t: TabType) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    setTab(t);
    Animated.timing(tabAnim, { toValue: TABS.indexOf(t), duration: 180, useNativeDriver: false }).start();
  };

  // Daily rotating content
  const dayIdx = getDayIndex();
  const verse = QURAN_VERSES[dayIdx % QURAN_VERSES.length];
  const hadith = HADITH_OF_DAY[dayIdx % HADITH_OF_DAY.length];

  // Next prayer
  const nextPrayer = useMemo(() => {
    if (!prayerTimes) return null;
    return prayerTimes.prayers.find(p => p.timestamp > now) || prayerTimes.prayers[0];
  }, [prayerTimes, now]);

  const msToNext = nextPrayer ? Math.max(0, nextPrayer.timestamp - now) : 0;
  const nextMeta = nextPrayer ? (PRAYER_META[nextPrayer.name] || PRAYER_META.Isha) : null;

  const handleOpenMap = (mosque: Mosque) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${mosque.latitude},${mosque.longitude}`,
      android: `geo:0,0?q=${mosque.latitude},${mosque.longitude}(${mosque.name})`,
    });
    if (url) Linking.openURL(url).catch(() => {});
  };

  // ── TODAY TAB ──────────────────────────────────────────────────────────────
  const renderToday = () => (
    <>
      {/* Hero: next prayer countdown */}
      {nextPrayer && nextMeta && (
        <LinearGradient colors={[...nextMeta.gradient, '#0D1420']} style={s.hero}>
          <Text style={s.heroLabel}>NEXT PRAYER</Text>
          <Text style={s.heroName}>{nextPrayer.name}</Text>
          <Text style={s.heroArabic}>{PRAYER_ARABIC[nextPrayer.name]?.arabic}</Text>
          <Text style={s.heroPeriod}>{nextMeta.period}</Text>
          <View style={s.heroCountdown}>
            <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={s.heroCountdownText}>{msToCountdown(msToNext)}</Text>
          </View>
          <Text style={s.heroTime}>at {nextPrayer.time}</Text>
        </LinearGradient>
      )}

      {/* Prayer status banner */}
      {isPraying && (
        <View style={s.prayingBanner}>
          <Ionicons name="hand-right" size={22} color="#c4b5fd" />
          <View style={{ flex: 1 }}>
            <Text style={s.prayingTitle}>Prayer time is now active</Text>
            <Text style={s.prayingSub}>
              {settings.autoPauseRides ? `Rides paused for ${settings.pauseDuration} min` : 'May your prayers be accepted · آمين'}
            </Text>
          </View>
        </View>
      )}

      {/* Today's prayer times list */}
      {prayerTimes && (
        <View style={s.prayerBlock}>
          <Text style={s.blockTitle}>Today's Prayers</Text>
          <Text style={s.blockSub}>{prayerTimes.date}</Text>
          {prayerTimes.prayers.map((prayer) => {
            const meta = PRAYER_META[prayer.name] || PRAYER_META.Isha;
            const ar = PRAYER_ARABIC[prayer.name] || { arabic: '', hausa: '' };
            const isNext = nextPrayer?.name === prayer.name && !prayer.isActive;
            const passed = prayer.isPassed && !prayer.isActive;
            return (
              <View
                key={prayer.name}
                style={[s.prayerRow, prayer.isActive && s.prayerRowActive, passed && s.prayerRowPassed]}
              >
                <View style={[s.prayerDot, { backgroundColor: meta.color + (passed ? '44' : 'cc') }]}>
                  <Ionicons name={meta.icon as any} size={20} color={passed ? '#64748b' : meta.color} />
                </View>
                <View style={s.prayerInfo}>
                  <Text style={[s.prayerName, passed && s.textMuted]}>{prayer.name}</Text>
                  <Text style={[s.prayerArabicSmall, { color: passed ? '#334155' : meta.color }]}>{ar.arabic}</Text>
                  <Text style={[s.prayerHausa, passed && { color: '#334155' }]}>{ar.hausa}</Text>
                </View>
                <View style={s.prayerTimeWrap}>
                  <Text style={[s.prayerTime, passed && s.textMuted]}>{prayer.time}</Text>
                  {prayer.isActive && <View style={s.nowBadge}><Text style={s.nowText}>NOW</Text></View>}
                  {isNext && <View style={s.nextBadge}><Text style={s.nextText}>NEXT</Text></View>}
                  {passed && <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 4 }} />}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {!prayerTimes && loading && (
        <View style={s.loadingBlock}>
          <Text style={s.loadingText}>Fetching prayer times…</Text>
        </View>
      )}

      {/* Driver duas */}
      <View style={s.duaBlock}>
        <Text style={s.blockTitle}>Driver Duas</Text>
        {DRIVER_DUAS.map((dua, i) => (
          <View key={i} style={s.duaCard}>
            <Text style={s.duaTitle}>{dua.title}</Text>
            <Text style={s.duaArabic}>{dua.arabic}</Text>
            <Text style={s.duaTrans}>{dua.transliteration}</Text>
            <Text style={s.duaMeaning}>{dua.translation}</Text>
          </View>
        ))}
      </View>
    </>
  );

  // ── READING TAB ────────────────────────────────────────────────────────────
  const renderReading = () => (
    <>
      {/* Quran verse of the day */}
      <LinearGradient colors={['#1e1b4b', '#2e1065', '#0D1420']} style={s.verseHero}>
        <View style={s.verseHeaderRow}>
          <Ionicons name="book" size={18} color="#c4b5fd" />
          <Text style={s.verseHeaderLabel}>Quran Verse of the Day</Text>
        </View>
        <Text style={s.verseArabic}>{verse.arabic}</Text>
        <Text style={s.verseTranslation}>"{verse.translation}"</Text>
        <Text style={s.verseRef}>{verse.ref}</Text>
      </LinearGradient>

      {/* Hadith */}
      <View style={s.hadithCard}>
        <View style={s.hadithHeader}>
          <LinearGradient colors={['#78350f', '#92400e']} style={s.hadithIcon}>
            <Ionicons name="library" size={18} color="#FCD34D" />
          </LinearGradient>
          <View>
            <Text style={s.hadithLabel}>Hadith of the Day</Text>
            <Text style={s.hadithSource}>— {hadith.source}</Text>
          </View>
        </View>
        <Text style={s.hadithText}>{hadith.text}</Text>
      </View>

      {/* All Quran verses */}
      <Text style={[s.blockTitle, { paddingHorizontal: 16, marginTop: 8 }]}>More Quranic Reflections</Text>
      {QURAN_VERSES.filter((_, i) => i !== dayIdx % QURAN_VERSES.length).map((v, i) => (
        <View key={i} style={s.verseCard}>
          <Text style={s.verseCardArabic}>{v.arabic}</Text>
          <Text style={s.verseCardTrans}>"{v.translation}"</Text>
          <Text style={s.verseCardRef}>{v.ref}</Text>
        </View>
      ))}
    </>
  );

  // ── SETTINGS TAB ───────────────────────────────────────────────────────────
  const renderSettings = () => (
    <>
      <View style={s.settingsBlock}>
        <ToggleRow
          icon="notifications"
          title="Prayer Alerts"
          sub="Get notified before prayer times"
          value={settings.enabled}
          onChange={v => saveSettings({ enabled: v })}
        />
        <ToggleRow
          icon="pause-circle"
          title="Auto-Pause Rides"
          sub="Pause requests during prayer"
          value={settings.autoPauseRides}
          onChange={v => saveSettings({ autoPauseRides: v })}
        />
        <ToggleRow
          icon="location"
          title="Nearby Mosques"
          sub="Show mosques near you"
          value={settings.showMosqueLocations}
          onChange={v => saveSettings({ showMosqueLocations: v })}
        />
        <ToggleRow
          icon="volume-high"
          title="Alert Sound"
          sub="Play sound for prayer alerts"
          value={settings.notificationSound === 'default'}
          onChange={v => saveSettings({ notificationSound: v ? 'default' : 'silent' })}
        />
        <ToggleRow
          icon="phone-portrait"
          title="Vibration"
          sub="Vibrate for prayer alerts"
          value={settings.vibration}
          onChange={v => saveSettings({ vibration: v })}
        />
      </View>

      {settings.enabled && (
        <>
          <View style={s.settingsBlock}>
            <Text style={s.settingGroupLabel}>ALERT BEFORE PRAYER</Text>
            <View style={s.chipRow}>
              {[5, 10, 15, 20].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.settingChip, settings.alertBefore === m && s.settingChipActive]}
                  onPress={() => saveSettings({ alertBefore: m })}
                >
                  <Text style={[s.settingChipText, settings.alertBefore === m && s.settingChipTextActive]}>{m} min</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {settings.autoPauseRides && (
            <View style={s.settingsBlock}>
              <Text style={s.settingGroupLabel}>PAUSE DURATION</Text>
              <View style={s.chipRow}>
                {[10, 15, 20, 30].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[s.settingChip, settings.pauseDuration === m && s.settingChipActive]}
                    onPress={() => saveSettings({ pauseDuration: m })}
                  >
                    <Text style={[s.settingChipText, settings.pauseDuration === m && s.settingChipTextActive]}>{m} min</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {/* Nearby mosques */}
      {settings.showMosqueLocations && nearbyMosques.length > 0 && (
        <View style={s.settingsBlock}>
          <Text style={s.blockTitle}>Nearby Mosques</Text>
          {nearbyMosques.map((mosque, i) => (
            <TouchableOpacity key={mosque.id ?? i} style={s.mosqueCard} onPress={() => handleOpenMap(mosque)}>
              <View style={s.mosqueIcon}>
                <Text style={{ fontSize: 22 }}>🕌</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.mosqueName}>{mosque.name}</Text>
                <Text style={s.mosqueAddr} numberOfLines={1}>{mosque.address}</Text>
                <View style={s.mosqueChips}>
                  {mosque.hasWudu && <View style={s.chip}><Text style={s.chipTxt}>Wudu</Text></View>}
                  {mosque.hasParking && <View style={s.chip}><Text style={s.chipTxt}>Parking</Text></View>}
                </View>
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={s.mosqueDist}>{mosque.distance.toFixed(1)}km</Text>
                <Ionicons name="navigate" size={18} color="#7c3aed" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient colors={['#1a0533', '#2d1b69']} style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Prayer & Dhikr</Text>
          <Text style={s.headerSub}>Your daily spiritual companion</Text>
        </View>
        <TouchableOpacity onPress={() => void handleRefresh()} style={s.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#c4b5fd" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={s.tabBtn} onPress={() => switchTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
            {tab === t && <View style={s.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor="#7c3aed" />}
      >
        {tab === 'Today'    && renderToday()}
        {tab === 'Reading'  && renderReading()}
        {tab === 'Dhikr'    && <TasbihCounter />}
        {tab === 'Settings' && renderSettings()}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerVerse}>"{verse.arabic}"</Text>
          <Text style={s.footerRef}>{verse.ref}</Text>
          <Text style={s.footerBlessing}>May Allah accept your prayers and bless your work · آمين</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ToggleRow({ icon, title, sub, value, onChange }: { icon: string; title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggleRow}>
      <View style={s.toggleIcon}><Ionicons name={icon as any} size={20} color="#a78bfa" /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleTitle}>{title}</Text>
        <Text style={s.toggleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#1e293b', true: '#7c3aed' }}
        thumbColor={value ? '#c4b5fd' : '#475569'}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0D1420' },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 0 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: 8, gap: 8 },
  backBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  headerSub:   { fontSize: 11, color: '#a78bfa', marginTop: 1 },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#111827', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', position: 'relative' },
  tabText:       { fontSize: 13, fontWeight: '700', color: '#64748b' },
  tabTextActive: { color: '#a78bfa' },
  tabIndicator: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, backgroundColor: '#7c3aed', borderRadius: 2 },

  // Hero countdown
  hero: { margin: 12, borderRadius: 20, padding: 24, alignItems: 'center', gap: 4 },
  heroLabel:  { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' },
  heroName:   { fontSize: 38, fontWeight: '900', color: '#fff', marginTop: 4 },
  heroArabic: { fontSize: 28, color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 2 },
  heroPeriod: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  heroCountdown: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 30, paddingHorizontal: 16, paddingVertical: 8 },
  heroCountdownText: { fontSize: 28, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'] as any },
  heroTime: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 },

  // Praying banner
  prayingBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 8, backgroundColor: 'rgba(124,58,237,0.15)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)' },
  prayingTitle: { fontSize: 14, fontWeight: '800', color: '#c4b5fd' },
  prayingSub:   { fontSize: 12, color: '#7c3aed', marginTop: 2 },

  // Prayer list
  prayerBlock: { marginHorizontal: 12, marginTop: 4 },
  blockTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  blockSub:   { fontSize: 12, color: '#64748b', marginBottom: 12 },
  prayerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1e293b' },
  prayerRowActive: { borderColor: 'rgba(124,58,237,0.6)', backgroundColor: 'rgba(124,58,237,0.08)' },
  prayerRowPassed: { opacity: 0.5 },
  prayerDot: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  prayerInfo: { flex: 1 },
  prayerName:        { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  prayerArabicSmall: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  prayerHausa: { fontSize: 11, color: '#64748b', marginTop: 1 },
  prayerTimeWrap: { alignItems: 'flex-end', gap: 4 },
  prayerTime: { fontSize: 18, fontWeight: '900', color: '#f8fafc', fontVariant: ['tabular-nums'] as any },
  nowBadge:  { backgroundColor: '#7c3aed', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  nowText:   { fontSize: 10, fontWeight: '800', color: '#fff' },
  nextBadge: { backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#f59e0b55' },
  nextText:  { fontSize: 10, fontWeight: '800', color: '#f59e0b' },
  textMuted: { color: '#475569' },

  // Loading
  loadingBlock: { margin: 12, padding: 24, alignItems: 'center', backgroundColor: '#111827', borderRadius: 16 },
  loadingText: { color: '#64748b', fontSize: 14, fontWeight: '600' },

  // Driver duas
  duaBlock: { marginHorizontal: 12, marginTop: 16 },
  duaCard: { backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1e293b' },
  duaTitle: { fontSize: 12, fontWeight: '800', color: '#7c3aed', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  duaArabic: { fontSize: 18, color: '#c4b5fd', fontWeight: '600', textAlign: 'right', marginBottom: 6, lineHeight: 28 },
  duaTrans:  { fontSize: 12, color: '#64748b', marginBottom: 4, fontStyle: 'italic' },
  duaMeaning:{ fontSize: 13, color: '#94a3b8', lineHeight: 19 },

  // Reading tab
  verseHero: { margin: 12, borderRadius: 20, padding: 22 },
  verseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  verseHeaderLabel: { fontSize: 12, fontWeight: '800', color: '#c4b5fd', letterSpacing: 0.8, textTransform: 'uppercase' },
  verseArabic: { fontSize: 22, color: '#fff', fontWeight: '600', textAlign: 'right', lineHeight: 36, marginBottom: 14 },
  verseTranslation: { fontSize: 15, color: 'rgba(255,255,255,0.85)', lineHeight: 23, fontStyle: 'italic', marginBottom: 8 },
  verseRef: { fontSize: 12, fontWeight: '800', color: '#c4b5fd' },
  hadithCard: { margin: 12, marginTop: 4, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#292524' },
  hadithHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  hadithIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hadithLabel: { fontSize: 13, fontWeight: '800', color: '#f8fafc' },
  hadithSource: { fontSize: 11, color: '#78350f', fontWeight: '700' },
  hadithText: { fontSize: 14, color: '#cbd5e1', lineHeight: 22, fontStyle: 'italic' },
  verseCard: { marginHorizontal: 12, marginBottom: 10, backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1e293b' },
  verseCardArabic: { fontSize: 17, color: '#c4b5fd', fontWeight: '600', textAlign: 'right', marginBottom: 8, lineHeight: 28 },
  verseCardTrans: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', lineHeight: 20, marginBottom: 6 },
  verseCardRef: { fontSize: 11, fontWeight: '800', color: '#7c3aed' },

  // Settings
  settingsBlock: { margin: 12, marginBottom: 4, backgroundColor: '#111827', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1e293b' },
  settingGroupLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14, flexWrap: 'wrap' },
  settingChip:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  settingChipActive: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: '#7c3aed' },
  settingChipText:       { fontSize: 13, fontWeight: '700', color: '#64748b' },
  settingChipTextActive: { color: '#c4b5fd' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  toggleIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(124,58,237,0.15)', alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  toggleSub:   { fontSize: 12, color: '#64748b', marginTop: 1 },
  mosqueCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  mosqueIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(124,58,237,0.15)', alignItems: 'center', justifyContent: 'center' },
  mosqueName: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  mosqueAddr: { fontSize: 12, color: '#64748b', marginTop: 2 },
  mosqueChips: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chip: { backgroundColor: 'rgba(14,165,233,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipTxt: { fontSize: 10, fontWeight: '700', color: '#0ea5e9' },
  mosqueDist: { fontSize: 14, fontWeight: '800', color: '#7c3aed' },

  // Footer
  footer: { marginHorizontal: 12, marginTop: 24, padding: 20, backgroundColor: '#111827', borderRadius: 16, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#1e293b' },
  footerVerse:    { fontSize: 16, color: '#c4b5fd', fontWeight: '600', textAlign: 'center', lineHeight: 26 },
  footerRef:      { fontSize: 11, fontWeight: '800', color: '#7c3aed' },
  footerBlessing: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 },
});

// ── Tasbih styles ────────────────────────────────────────────────────────────

const ts = StyleSheet.create({
  tasbihWrap: { paddingBottom: 12 },
  presetChip:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1e293b' },
  presetChipActive: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: '#7c3aed' },
  presetText:       { fontSize: 13, fontWeight: '700', color: '#64748b' },
  presetTextActive: { color: '#c4b5fd' },
  tasbihArabic: { fontSize: 28, color: '#c4b5fd', fontWeight: '700', textAlign: 'center', lineHeight: 42, paddingHorizontal: 20 },
  tasbihTarget: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 12 },
  tasbihCircleWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: 8, height: 180 },
  tasbihRing: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 4 },
  tasbihBtn: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 },
  tasbihCount:      { fontSize: 52, fontWeight: '900', color: '#fff', lineHeight: 56 },
  tasbihCountLabel: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '700' },
  tasbihHint: { fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 12 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 8, backgroundColor: 'rgba(124,58,237,0.12)', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999 },
  resetText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#64748b', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 8, marginTop: 16 },
  adhkarCard: { marginHorizontal: 12, marginBottom: 8, backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1e293b', flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  adhkarDone: { opacity: 0.5, borderColor: 'rgba(34,197,94,0.3)' },
  adhkarArabic: { fontSize: 17, color: '#c4b5fd', fontWeight: '600', textAlign: 'right', marginBottom: 4, lineHeight: 26 },
  adhkarTrans: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginBottom: 4 },
  adhkarMeaning: { fontSize: 12, color: '#94a3b8', lineHeight: 17 },
  adhkarCount: { minWidth: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(124,58,237,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)' },
  adhkarCountDone: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' },
  adhkarCountText: { fontSize: 12, fontWeight: '800', color: '#a78bfa' },
});
