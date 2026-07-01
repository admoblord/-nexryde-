/**
 * Offline / poor connection banner shown at the top of screens when network is unavailable.
 * Animates in/out with a smooth slide + fade.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const OfflineBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);
  const slideY = useRef(new Animated.Value(-52)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bannerH = 44 + Math.max(insets.top, 8);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !state.isConnected || state.isConnected === null;
      setIsOffline(offline);
    });
    return unsub;
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: isOffline ? 0 : -bannerH,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }),
      Animated.timing(opacity, {
        toValue: isOffline ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOffline, slideY, opacity, bannerH]);

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          height: bannerH,
          paddingTop: Math.max(insets.top, 8),
          transform: [{ translateY: slideY }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons name="cloud-offline-outline" size={16} color="#FDE68A" />
      <Text style={styles.text}>No internet connection</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#7C2D12',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 9999,
  },
  text: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '600',
  },
});
