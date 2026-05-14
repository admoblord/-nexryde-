/**
 * PrayerStripWidget — inline prayer times card for driver home screen.
 * Reads from AsyncStorage cache instantly (no GPS/network on mount).
 * Shows next prayer name + time + live countdown + 5-prayer progress dots.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

type PrayerItem = { name: string; time: string; timestamp: number };

const PRAYER_META: Record<string, { color: string; arabic: string; icon: string }> = {
  Fajr:    { color: '#60A5FA', arabic: 'الفجر',  icon: 'sunny-outline' },
  Dhuhr:   { color: '#FCD34D', arabic: 'الظهر',  icon: 'sunny' },
  Asr:     { color: '#FB923C', arabic: 'العصر',  icon: 'partly-sunny' },
  Maghrib: { color: '#F87171', arabic: 'المغرب', icon: 'moon-outline' },
  Isha:    { color: '#C084FC', arabic: 'العشاء', icon: 'moon' },
};

function msToCountdown(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PrayerStripWidget() {
  const [prayers, setPrayers] = useState<PrayerItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  // Load cache instantly on mount
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem(`prayer_times_cache_${todayKey}`).then(raw => {
      if (raw) {
        try { setPrayers(JSON.parse(raw)); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  // Tick every second for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Subtle glow pulse on the active prayer dot
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [glowAnim]);

  if (prayers.length === 0) return null; // Don't render until cache loaded

  const nextPrayer = prayers.find(p => p.timestamp > now) || prayers[0];
  const currentPrayer = prayers.find((p, i) => {
    const next = prayers[i + 1];
    return p.timestamp <= now && (!next || next.timestamp > now);
  });
  const msToNext = Math.max(0, nextPrayer.timestamp - now);
  const meta = PRAYER_META[nextPrayer.name] || PRAYER_META.Isha;
  const isPrayingNow = !!currentPrayer && (now - currentPrayer.timestamp) < 30 * 60 * 1000;

  return (
    <TouchableOpacity
      onPress={() => router.push('/driver/prayer-times')}
      activeOpacity={0.88}
      style={s.wrapper}
    >
      <LinearGradient
        colors={['#1a0533', '#2d1b69', '#1e1b4b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.card}
      >
        {/* Left: next prayer info */}
        <View style={s.left}>
          <View style={s.topRow}>
            <Ionicons name={meta.icon as any} size={14} color={meta.color} />
            <Text style={s.label}>
              {isPrayingNow ? 'PRAYING NOW' : 'NEXT PRAYER'}
            </Text>
          </View>
          <View style={s.nameRow}>
            <Text style={[s.prayerName, { color: meta.color }]}>
              {isPrayingNow ? (currentPrayer?.name ?? nextPrayer.name) : nextPrayer.name}
            </Text>
            <Text style={s.arabicName}>
              {PRAYER_META[isPrayingNow ? (currentPrayer?.name ?? nextPrayer.name) : nextPrayer.name]?.arabic}
            </Text>
          </View>
          <Text style={s.prayerTime}>
            {isPrayingNow ? currentPrayer?.time : nextPrayer.time}
          </Text>
        </View>

        {/* Center: 5-prayer dots */}
        <View style={s.dotsCol}>
          {prayers.map((p) => {
            const m = PRAYER_META[p.name] || PRAYER_META.Isha;
            const isActive = currentPrayer?.name === p.name && isPrayingNow;
            const isPassed = p.timestamp < now && !isActive;
            const isNext = nextPrayer.name === p.name && !isPrayingNow;
            return (
              <View key={p.name} style={s.dotRow}>
                {isActive ? (
                  <Animated.View style={[s.dot, s.dotActive, { backgroundColor: m.color, opacity: glowAnim }]} />
                ) : (
                  <View style={[
                    s.dot,
                    isPassed ? [s.dotPassed, { backgroundColor: m.color + '55' }] :
                    isNext   ? [s.dotNext,   { borderColor: m.color, backgroundColor: m.color + '22' }] :
                               s.dotFuture,
                  ]} />
                )}
                <Text style={[s.dotLabel, isPassed && s.dotLabelPassed, (isActive || isNext) && { color: m.color }]}>
                  {p.name.slice(0, 3).toUpperCase()}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Right: countdown */}
        <View style={s.right}>
          {!isPrayingNow ? (
            <>
              <Text style={s.inLabel}>IN</Text>
              <Text style={[s.countdown, { color: meta.color }]}>{msToCountdown(msToNext)}</Text>
            </>
          ) : (
            <View style={s.nowPill}>
              <Text style={s.nowText}>NOW</Text>
            </View>
          )}
          <View style={s.arrowRow}>
            <Text style={s.viewAll}>View all</Text>
            <Ionicons name="chevron-forward" size={13} color="#7c3aed" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrapper: { marginHorizontal: 16, marginBottom: 12 },
  card: { borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)' },

  // Left
  left: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  prayerName: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  arabicName: { fontSize: 15, color: 'rgba(196,181,253,0.7)', fontWeight: '600' },
  prayerTime: { fontSize: 13, color: '#64748b', fontWeight: '700' },

  // Dots col
  dotsCol: { gap: 5, alignItems: 'center', paddingHorizontal: 12 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 10, height: 10, borderRadius: 5 },
  dotPassed: {},
  dotNext:   { borderWidth: 1.5 },
  dotFuture: { backgroundColor: '#1e293b' },
  dotLabel:  { fontSize: 9, fontWeight: '700', color: '#334155', width: 28 },
  dotLabelPassed: { color: '#475569' },

  // Right
  right: { alignItems: 'flex-end', gap: 4 },
  inLabel: { fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.8 },
  countdown: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] as any },
  nowPill: { backgroundColor: 'rgba(124,58,237,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(124,58,237,0.5)' },
  nowText: { fontSize: 13, fontWeight: '900', color: '#c4b5fd' },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  viewAll: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
});
