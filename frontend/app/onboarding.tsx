import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: 'car-sport' as const,
    iconColor: '#22C55E',
    title: 'Book Your Ride',
    description: 'Set your pickup and destination, choose your vehicle type, and get matched with a nearby driver in seconds.',
  },
  {
    id: '2',
    icon: 'shield-checkmark' as const,
    iconColor: '#3B82F6',
    title: 'Ride Safely',
    description: 'Look for approved driver badges, share your trip with family, use SOS alerts, and verify your driver with a security code.',
  },
  {
    id: '3',
    icon: 'heart' as const,
    iconColor: '#EF4444',
    title: 'Save Your Favorites',
    description: 'Had a great ride? Save your driver to favorites and request them directly next time. Build your trusted driver network.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      await AsyncStorage.setItem('onboarding_complete', 'true');
      router.replace('/(auth)/login');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    router.replace('/(auth)/login');
  };

  const renderSlide = ({ item }: { item: typeof SLIDES[0] }) => (
    <View style={styles.slide}>
      <View style={[styles.iconCircle, { backgroundColor: item.iconColor + '20' }]}>
        <Ionicons name={item.icon} size={80} color={item.iconColor} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#020617', '#0F172A', '#020617']} style={StyleSheet.absoluteFillObject} />

      <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} accessibilityLabel="Skip onboarding" accessibilityRole="button">
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, currentIndex === i && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} accessibilityLabel={currentIndex === SLIDES.length - 1 ? "Get started" : "Next slide"} accessibilityRole="button">
          <LinearGradient colors={['#4ADE80', '#22C55E', '#3B82F6']} style={styles.nextGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={styles.nextText}>{currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}</Text>
            <Ionicons name="arrow-forward" size={20} color="#0F172A" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  skipBtn: { position: 'absolute', top: 60, right: 24, zIndex: 10, padding: 8 },
  skipText: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },
  slide: { width, flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  iconCircle: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  title: { fontSize: 28, fontWeight: '900', color: '#FFF', textAlign: 'center', marginBottom: 16, letterSpacing: 0.5 },
  description: { fontSize: 16, fontWeight: '500', color: '#CBD5E1', textAlign: 'center', lineHeight: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 60, alignItems: 'center', gap: 24 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#334155' },
  dotActive: { width: 24, backgroundColor: '#22C55E' },
  nextBtn: { width: '100%', borderRadius: 20, overflow: 'hidden' },
  nextGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 8 },
  nextText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
});
