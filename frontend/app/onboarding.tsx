import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
  type ImageSourcePropType,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingPhotoHero } from '@/src/components/onboarding/OnboardingPhotoHero';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

const { width, height } = Dimensions.get('window');

type Slide = {
  id: string;
  image: ImageSourcePropType;
  kicker: string;
  title: string;
  description: string;
};

/** Real lifestyle photography — Nigerian people + cars (e-hailing at a glance), not AI. */
const SLIDES: Slide[] = [
  {
    id: '1',
    image: require('../assets/images/onboarding/book-ride.jpg'),
    kicker: 'YOUR CITY. YOUR TIME.',
    title: 'A ride that feels right',
    description:
      'Tell us where you’re going — a nearby NEXRYDE driver picks you up, and you’re moving in minutes.',
  },
  {
    id: '2',
    image: require('../assets/images/onboarding/ride-safe.jpg'),
    kicker: 'PEOPLE YOU CAN TRUST',
    title: 'Safety that feels personal',
    description:
      'Verified NEXRYDE drivers, live tracking, trip sharing, and SOS — so every trip feels looked after.',
  },
  {
    id: '3',
    image: require('../assets/images/onboarding/favorites.jpg'),
    kicker: 'RIDE WITH FAMILIAR FACES',
    title: 'Save drivers you love',
    description:
      'Had a great trip? Favorite that driver and request them again — one tap, same comfort.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasHydrated = usePersistStoreReady();
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const copyFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user?.id || !isAuthenticated) return;
    router.replace(
      (user.role === 'driver' ? '/(driver-tabs)/driver-home' : '/(rider-tabs)/rider-home') as any,
    );
  }, [hasHydrated, user?.id, user?.role, isAuthenticated, router]);

  useEffect(() => {
    copyFade.setValue(0.4);
    Animated.timing(copyFade, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
  }, [currentIndex, copyFade]);

  const handleNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrentIndex(next);
    } else {
      await AsyncStorage.setItem('onboarding_complete', 'true');
      router.replace('/(auth)/login');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    router.replace('/(auth)/login');
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const renderSlide = ({ item, index }: ListRenderItemInfo<Slide>) => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const copyTranslateY = scrollX.interpolate({
      inputRange,
      outputRange: [28, 0, 28],
      extrapolate: 'clamp',
    });
    const copyOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.35, 1, 0.35],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.slide}>
        <OnboardingPhotoHero source={item.image} animate={index === currentIndex} />
        <Animated.View
          style={[
            styles.copyBlock,
            {
              paddingBottom: 120 + Math.max(insets.bottom, 16),
              opacity: copyOpacity,
              transform: [{ translateY: copyTranslateY }],
            },
          ]}
        >
          <Text style={styles.brand}>NEXRYDE</Text>
          <Text style={styles.kicker}>{item.kicker}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </Animated.View>
      </View>
    );
  };

  if (!hasHydrated || (user?.id && isAuthenticated)) {
    return null;
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        bounces={false}
        decelerationRate="fast"
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
      />

      <TouchableOpacity
        style={[styles.skipBtn, { top: insets.top + 10 }]}
        onPress={handleSkip}
        accessibilityLabel="Skip onboarding"
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 20), opacity: copyFade },
        ]}
      >
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const w = scrollX.interpolate({
              inputRange,
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });
            return <Animated.View key={i} style={[styles.dot, { width: w, opacity }]} />;
          })}
        </View>

        <TouchableOpacity
          style={styles.nextBtn}
          onPress={handleNext}
          accessibilityLabel={isLast ? 'Get started' : 'Next slide'}
          accessibilityRole="button"
          activeOpacity={0.92}
        >
          <LinearGradient
            colors={['#4ADE80', '#22E180', '#0066FF']}
            style={styles.nextGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.nextText}>{isLast ? 'Get started' : 'Next'}</Text>
            <Ionicons name="arrow-forward" size={20} color="#061A0F" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1420' },
  skipBtn: {
    position: 'absolute',
    right: 18,
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(7,12,22,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  skipText: { color: '#F8FAFC', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  slide: {
    width,
    height,
    justifyContent: 'flex-end',
  },
  copyBlock: {
    paddingHorizontal: 28,
    zIndex: 2,
  },
  brand: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(248,250,252,0.95)',
    letterSpacing: 6,
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6DFFC3',
    letterSpacing: 1.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.8,
    marginBottom: 14,
    lineHeight: 42,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  description: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(241,245,249,0.9)',
    lineHeight: 25,
    maxWidth: 340,
    letterSpacing: 0.15,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: 'center',
    gap: 18,
    zIndex: 10,
  },
  dots: { flexDirection: 'row', gap: 7, alignItems: 'center', height: 12 },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22E180',
  },
  nextBtn: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#22E180',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  nextGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    gap: 10,
  },
  nextText: { fontSize: 17, fontWeight: '900', color: '#061A0F', letterSpacing: 0.2 },
});
