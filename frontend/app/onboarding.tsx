import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingCabHero } from '@/src/components/onboarding/OnboardingCabHero';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

const { width } = Dimensions.get('window');

type Slide = {
  id: string;
  variant: 'cab' | 'icon';
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  description: string;
};

const SLIDES: Slide[] = [
  {
    id: '1',
    variant: 'cab',
    iconColor: '#22C55E',
    title: 'Book your ride',
    description:
      'Set pickup and destination, pick your vehicle, and get matched with a nearby driver in seconds.',
  },
  {
    id: '2',
    variant: 'icon',
    icon: 'shield-checkmark',
    iconColor: '#38BDF8',
    title: 'Ride safely',
    description:
      'Verified drivers, live trip sharing, SOS, and a security code so you always know it’s your Nexryde.',
  },
  {
    id: '3',
    variant: 'icon',
    icon: 'heart',
    iconColor: '#F472B6',
    title: 'Save your favorites',
    description:
      'Had a great ride? Save your driver and book them again in one tap from home.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const storeReady = usePersistStoreReady();
  const user = useAppStore((s) => s.user);
  const token = useAppStore((s) => s.token);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!storeReady) return;
    if (!user?.id || !token) return;
    router.replace(
      (user.role === 'driver' ? '/(driver-tabs)/driver-home' : '/(rider-tabs)/rider-home') as any,
    );
  }, [storeReady, user?.id, user?.role, token, router]);

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

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      {item.variant === 'cab' ? (
        <OnboardingCabHero size={200} />
      ) : (
        <LinearGradient
          colors={[item.iconColor + '18', item.iconColor + '06', 'transparent']}
          style={styles.iconHalo}
        >
          <LinearGradient
            colors={['rgba(15,23,42,0.98)', 'rgba(15,23,42,0.88)']}
            style={styles.iconPlate}
          >
            <Ionicons name={item.icon!} size={72} color={item.iconColor} />
          </LinearGradient>
        </LinearGradient>
      )}
      <Text style={styles.kicker}>NEXRYDE</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  if (!storeReady || (user?.id && token)) {
    return <AuthLoadingGate />;
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#020617', '#0B1223', '#020617']} style={StyleSheet.absoluteFillObject} />
      <LinearGradient
        colors={['rgba(52,245,184,0.06)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <TouchableOpacity
        style={[styles.skipBtn, { top: insets.top + 12 }]}
        onPress={handleSkip}
        accessibilityLabel="Skip onboarding"
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
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
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        onMomentumScrollEnd={(e) =>
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, currentIndex === i && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity
          style={styles.nextBtn}
          onPress={handleNext}
          accessibilityLabel={currentIndex === SLIDES.length - 1 ? 'Get started' : 'Next slide'}
          accessibilityRole="button"
          activeOpacity={0.92}
        >
          <LinearGradient
            colors={['#4ADE80', '#22C55E', '#2563EB']}
            style={styles.nextGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.nextText}>
              {currentIndex === SLIDES.length - 1 ? 'Get started' : 'Next'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#022C22" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  skipBtn: { position: 'absolute', right: 20, zIndex: 10, padding: 8 },
  skipText: { color: '#94A3B8', fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingTop: 24,
  },
  iconHalo: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconPlate: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(52,245,184,0.75)',
    letterSpacing: 3.2,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 340,
  },
  footer: { paddingHorizontal: 24, paddingTop: 8, alignItems: 'center', gap: 22 },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#334155' },
  dotActive: { width: 26, backgroundColor: '#22C55E' },
  nextBtn: { width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden' },
  nextGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    gap: 10,
  },
  nextText: { fontSize: 17, fontWeight: '800', color: '#022C22', letterSpacing: 0.2 },
});
